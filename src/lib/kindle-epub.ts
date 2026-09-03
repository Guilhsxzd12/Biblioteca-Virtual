import "server-only";
import JSZip from "jszip";
import { getDocument } from "pdfjs-serverless";
import { fetchDriveFile } from "@/lib/google-drive";

type EpubMeta={title:string;author:string;language?:string|null;coverUrl?:string|null};
type CoverData={bytes:Uint8Array;mimeType:string};

function escapeXml(value:string){
  return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}
function normalizeLanguage(value?:string|null){const raw=(value||"pt-BR").trim();return raw||"pt-BR";}
function coverDriveId(url?:string|null){if(!url)return null;const match=url.match(/^\/api\/covers\/([^/?#]+)/);return match?.[1]?decodeURIComponent(match[1]):null;}
function dirname(path:string){const i=path.lastIndexOf("/");return i>=0?path.slice(0,i+1):"";}

export async function loadCoverBytes(url?:string|null):Promise<CoverData>{
  if(!url)throw new Error("Adicione uma capa antes de gerar a versão Kindle.");
  const driveId=coverDriveId(url);let response:Response;
  if(driveId)response=await fetchDriveFile(driveId);
  else{if(!/^https?:\/\//i.test(url))throw new Error("Capa inválida para o Kindle.");response=await fetch(url,{cache:"no-store"});if(!response.ok)throw new Error(`Não foi possível carregar a capa (${response.status}).`);}
  const mime=(response.headers.get("content-type")||"image/jpeg").split(";")[0].toLowerCase();
  if(!["image/jpeg","image/png","image/webp","image/gif"].includes(mime))throw new Error("Use uma capa JPG, PNG, WEBP ou GIF.");
  return {bytes:new Uint8Array(await response.arrayBuffer()),mimeType:mime};
}

function pageParagraphs(items:any[]){
  const paragraphs:string[]=[];let current="";
  for(const item of items){const text=typeof item?.str==="string"?item.str.trim():"";if(text)current+=(current?" ":"")+text;if(item?.hasEOL&&current.trim()){paragraphs.push(current.trim());current="";}}
  if(current.trim())paragraphs.push(current.trim());return paragraphs;
}

export async function buildEpubFromPdf(pdfBytes:Uint8Array,meta:EpubMeta){
  const loading=getDocument({data:pdfBytes,useSystemFonts:true});
  const pdf=await loading.promise;const numPages=pdf.numPages;
  const chapters:{name:string;label:string;html:string}[]=[];let extractedChars=0;const pagesPerChapter=10;
  for(let start=1;start<=numPages;start+=pagesPerChapter){
    const end=Math.min(numPages,start+pagesPerChapter-1);const body:string[]=[];
    for(let pageNumber=start;pageNumber<=end;pageNumber++){
      const page=await pdf.getPage(pageNumber);const content=await page.getTextContent();const paragraphs=pageParagraphs(content.items as any[]);const pageText=paragraphs.join(" ");extractedChars+=pageText.length;
      if(paragraphs.length)body.push(`<section class="pdf-page" data-page="${pageNumber}"><span class="page-number">${pageNumber}</span>${paragraphs.map(p=>`<p>${escapeXml(p)}</p>`).join("")}</section>`);
      page.cleanup();
    }
    const index=Math.floor((start-1)/pagesPerChapter)+1;chapters.push({name:`text/chapter-${String(index).padStart(3,"0")}.xhtml`,label:`Páginas ${start}–${end}`,html:body.join("\n")||`<section class="pdf-page"><p>Página sem texto extraível.</p></section>`});
  }
  if(extractedChars<Math.max(300,numPages*25))throw new Error("Este PDF parece ser escaneado ou não possui texto suficiente para criar um EPUB de boa qualidade. O PDF continua disponível e pode ser enviado diretamente ao Kindle.");

  const cover=await loadCoverBytes(meta.coverUrl);const zip=new JSZip();
  zip.file("mimetype","application/epub+zip",{compression:"STORE"});
  zip.file("META-INF/container.xml",`<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  zip.file("OEBPS/images/cover",cover.bytes);
  zip.file("OEBPS/style.css",`body{font-family:serif;line-height:1.55;margin:5%;color:#171717}p{margin:.45em 0;text-indent:1.1em}.cover{margin:0;text-align:center}.cover img{max-width:100%;max-height:95vh}.pdf-page{break-after:page;margin-bottom:2em}.page-number{display:none}h1{font-size:1.5em}`);
  zip.file("OEBPS/cover.xhtml",`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Capa</title><link rel="stylesheet" href="style.css" type="text/css"/></head><body class="cover"><img src="images/cover" alt="Capa de ${escapeXml(meta.title)}"/></body></html>`);
  chapters.forEach(ch=>zip.file(`OEBPS/${ch.name}`,`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escapeXml(ch.label)}</title><link rel="stylesheet" href="../style.css" type="text/css"/></head><body>${ch.html}</body></html>`));
  const navItems=chapters.map(ch=>`<li><a href="${ch.name}">${escapeXml(ch.label)}</a></li>`).join("");
  zip.file("OEBPS/nav.xhtml",`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Sumário</title></head><body><nav epub:type="toc" id="toc"><h1>Sumário</h1><ol>${navItems}</ol></nav></body></html>`);
  const manifest=chapters.map((ch,i)=>`<item id="ch${i+1}" href="${ch.name}" media-type="application/xhtml+xml"/>`).join("");const spine=chapters.map((_,i)=>`<itemref idref="ch${i+1}"/>`).join("");const id=`urn:uuid:${crypto.randomUUID()}`;
  zip.file("OEBPS/content.opf",`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${id}</dc:identifier><dc:title>${escapeXml(meta.title)}</dc:title><dc:creator>${escapeXml(meta.author||"Autor não informado")}</dc:creator><dc:language>${escapeXml(normalizeLanguage(meta.language))}</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/,"Z")}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="cover-image" href="images/cover" media-type="${cover.mimeType}" properties="cover-image"/><item id="css" href="style.css" media-type="text/css"/>${manifest}</manifest><spine><itemref idref="cover-page" linear="yes"/>${spine}</spine></package>`);
  const bytes=await zip.generateAsync({type:"uint8array",mimeType:"application/epub+zip",compression:"DEFLATE",compressionOptions:{level:6}});
  return {bytes,pages:numPages};
}

function stripOldCoverProperty(opf:string){
  return opf.replace(/<item\b[^>]*>/gi,item=>{
    if(!/\bproperties=["'][^"']*\bcover-image\b/i.test(item))return item;
    return item.replace(/\sproperties=["']([^"']*)["']/i,(_m,props)=>{const next=String(props).split(/\s+/).filter((p:string)=>p&&p!=="cover-image").join(" ");return next?` properties="${next}"`:"";});
  });
}

export async function replaceEpubCover(epubBytes:Uint8Array,coverUrl:string){
  const cover=await loadCoverBytes(coverUrl);const zip=await JSZip.loadAsync(epubBytes);
  const container=await zip.file("META-INF/container.xml")?.async("text");
  const opfPath=container?.match(/full-path=["']([^"']+)["']/i)?.[1];
  if(!opfPath)throw new Error("Não foi possível localizar os metadados deste EPUB.");
  const opfFile=zip.file(opfPath);if(!opfFile)throw new Error("Não foi possível abrir os metadados deste EPUB.");
  let opf=await opfFile.async("text");const base=dirname(opfPath);
  const ext=cover.mimeType==="image/png"?"png":cover.mimeType==="image/webp"?"webp":cover.mimeType==="image/gif"?"gif":"jpg";
  const imageHref=`images/biblioteca-kindle-cover.${ext}`;const pageHref="biblioteca-kindle-cover.xhtml";
  zip.file(`${base}${imageHref}`,cover.bytes);
  zip.file(`${base}${pageHref}`,`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Capa</title><style>html,body{margin:0;padding:0;text-align:center}img{max-width:100%;max-height:100vh}</style></head><body><img src="${imageHref}" alt="Capa"/></body></html>`);

  opf=stripOldCoverProperty(opf);
  opf=opf.replace(/<meta\b[^>]*name=["']cover["'][^>]*\/?\s*>/gi,"");
  const imageItem=`<item id="biblioteca-kindle-cover-image" href="${imageHref}" media-type="${cover.mimeType}" properties="cover-image"/>`;
  const pageItem=`<item id="biblioteca-kindle-cover-page" href="${pageHref}" media-type="application/xhtml+xml"/>`;
  if(/<\/manifest>/i.test(opf))opf=opf.replace(/<\/manifest>/i,`${imageItem}${pageItem}</manifest>`);else throw new Error("EPUB inválido: manifesto não encontrado.");
  if(/<\/metadata>/i.test(opf))opf=opf.replace(/<\/metadata>/i,`<meta name="cover" content="biblioteca-kindle-cover-image"/></metadata>`);
  if(/<spine\b[^>]*>/i.test(opf))opf=opf.replace(/(<spine\b[^>]*>)/i,`$1<itemref idref="biblioteca-kindle-cover-page" linear="yes"/>`);else throw new Error("EPUB inválido: ordem de leitura não encontrada.");
  zip.file(opfPath,opf);
  return zip.generateAsync({type:"uint8array",mimeType:"application/epub+zip",compression:"DEFLATE",compressionOptions:{level:6}});
}
