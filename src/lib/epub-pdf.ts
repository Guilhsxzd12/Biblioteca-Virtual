import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir,rm,writeFile } from "node:fs/promises";
import { dirname,isAbsolute,relative,resolve } from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";
import chromium from "@sparticuz/chromium";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import puppeteer from "puppeteer-core";

type PdfMeta={title:string;author?:string|null};
type ManifestItem={href:string;mediaType:string};

function decodeEntities(value:string){
  return value
    .replace(/&#x([0-9a-f]+);/gi,(_,hex)=>String.fromCodePoint(parseInt(hex,16)))
    .replace(/&#(\d+);/g,(_,dec)=>String.fromCodePoint(parseInt(dec,10)))
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&apos;/gi,"'")
    .replace(/&#39;/gi,"'")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">");
}

function normalizeArchivePath(value:string){
  let decoded=value.replace(/\\/g,"/").replace(/^\/+/,"");
  try{decoded=decodeURIComponent(decoded);}catch{}
  const parts:string[]=[];
  for(const part of decoded.split("/")){
    if(!part||part===".")continue;
    if(part===".."){parts.pop();continue;}
    parts.push(part);
  }
  return parts.join("/");
}

function withinRoot(root:string,target:string){
  const rel=relative(root,target);
  return rel===""||(!rel.startsWith("..")&&!isAbsolute(rel));
}

async function writeEpubToTemp(zip:JSZip,root:string){
  for(const [rawName,entry] of Object.entries(zip.files)){
    const safeName=normalizeArchivePath(rawName);
    if(!safeName)continue;
    const target=resolve(root,safeName);
    if(!withinRoot(root,target))throw new Error("EPUB contém um caminho de arquivo inválido.");
    if(entry.dir){await mkdir(target,{recursive:true});continue;}
    await mkdir(dirname(target),{recursive:true});
    const bytes=await entry.async("uint8array");
    await writeFile(target,bytes);
  }
}

async function epubSpineFiles(zip:JSZip){
  const container=await zip.file("META-INF/container.xml")?.async("text");
  const opfRaw=container?.match(/full-path=["']([^"']+)["']/i)?.[1];
  if(!opfRaw)throw new Error("EPUB inválido: pacote principal não encontrado.");
  const opfPath=normalizeArchivePath(decodeEntities(opfRaw));
  const opf=await zip.file(opfPath)?.async("text");
  if(!opf)throw new Error("EPUB inválido: metadados não encontrados.");
  const base=dirname(opfPath).replace(/\\/g,"/");
  const manifest=new Map<string,ManifestItem>();
  for(const match of opf.matchAll(/<item\b([^>]+)>/gi)){
    const attrs=match[1];
    const id=attrs.match(/\bid=["']([^"']+)["']/i)?.[1];
    const href=attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const mediaType=attrs.match(/\bmedia-type=["']([^"']+)["']/i)?.[1]||"";
    if(id&&href)manifest.set(id,{href:decodeEntities(href).split(/[?#]/)[0],mediaType});
  }
  const spine=[...opf.matchAll(/<itemref\b[^>]*\bidref=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
  const files:string[]=[];
  for(const id of spine){
    const item=manifest.get(id);if(!item)continue;
    if(!/xhtml|html|xml/i.test(item.mediaType)&&!/\.(xhtml?|html?)$/i.test(item.href))continue;
    const file=normalizeArchivePath(`${base}${item.href}`);
    if(file&&zip.file(file))files.push(file);
  }
  if(!files.length){
    for(const name of Object.keys(zip.files).sort()){
      const safe=normalizeArchivePath(name);
      if(/\.(xhtml?|html?)$/i.test(safe)&&!/\b(nav|toc)\b/i.test(safe)&&zip.file(name))files.push(safe);
    }
  }
  if(!files.length)throw new Error("EPUB inválido: nenhum capítulo de leitura foi encontrado.");
  return [...new Set(files)];
}

async function launchBrowser(){
  chromium.setGraphicsMode=false;
  const args=await puppeteer.defaultArgs({args:[...chromium.args,"--allow-file-access-from-files"],headless:"shell"});
  return puppeteer.launch({
    args,
    executablePath:await chromium.executablePath(),
    headless:"shell",
    defaultViewport:{width:1200,height:1600,deviceScaleFactor:1,hasTouch:false,isLandscape:false,isMobile:false}
  });
}

export async function buildPdfFromEpub(epubBytes:Uint8Array,meta:PdfMeta){
  const zip=await JSZip.loadAsync(epubBytes);
  const spine=await epubSpineFiles(zip);
  const root=resolve("/tmp",`biblioteca-epub-${randomUUID()}`);
  await mkdir(root,{recursive:true});
  await writeEpubToTemp(zip,root);

  const merged=await PDFDocument.create();
  if(meta.title.trim())merged.setTitle(meta.title.trim());
  if(meta.author?.trim())merged.setAuthor(meta.author.trim());
  merged.setCreator("Biblioteca Virtual");

  let browser:Awaited<ReturnType<typeof launchBrowser>>|null=null;
  let pages=0;
  try{
    browser=await launchBrowser();
    const page=await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request",request=>{
      const url=request.url();
      if(url==="about:blank"||url.startsWith("data:")||url.startsWith("blob:")){void request.continue();return;}
      if(url.startsWith("file:")){
        try{
          const filePath=fileURLToPath(new URL(url));
          if(withinRoot(root,filePath)){void request.continue();return;}
        }catch{}
      }
      void request.abort();
    });
    await page.emulateMediaType("print");

    for(const chapter of spine){
      const chapterPath=resolve(root,chapter);
      if(!withinRoot(root,chapterPath))continue;
      const response=await page.goto(pathToFileURL(chapterPath).href,{waitUntil:"load",timeout:20000});
      if(!response&&!(await page.content()).trim())continue;
      await page.addStyleTag({content:"@media print{html,body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}"});
      await page.evaluate(async()=>{const fonts=(document as Document&{fonts?:FontFaceSet}).fonts;if(fonts)await fonts.ready;});
      const chapterPdf=await page.pdf({
        format:"A4",
        preferCSSPageSize:true,
        printBackground:true,
        displayHeaderFooter:false,
        margin:{top:"0",right:"0",bottom:"0",left:"0"}
      });
      const source=await PDFDocument.load(chapterPdf);
      const copied=await merged.copyPages(source,source.getPageIndices());
      for(const copiedPage of copied)merged.addPage(copiedPage);
      pages+=copied.length;
    }

    if(!pages)throw new Error("Não foi possível renderizar páginas do EPUB.");
    return {bytes:await merged.save({useObjectStreams:true}),pages};
  }finally{
    if(browser)try{await browser.close();}catch{}
    await rm(root,{recursive:true,force:true}).catch(()=>{});
  }
}
