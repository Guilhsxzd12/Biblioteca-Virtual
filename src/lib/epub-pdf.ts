import "server-only";
import JSZip from "jszip";

type PdfMeta={title:string;author?:string|null};

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

function textFromHtml(html:string){
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
      .replace(/<(?:br|hr)\b[^>]*\/?\s*>/gi,"\n")
      .replace(/<\/(?:p|div|section|article|h[1-6]|li|blockquote|tr)>/gi,"\n")
      .replace(/<li\b[^>]*>/gi,"• ")
      .replace(/<[^>]+>/g," ")
  )
    .replace(/\r/g,"")
    .replace(/[ \t]+/g," ")
    .replace(/ *\n */g,"\n")
    .replace(/\n{3,}/g,"\n\n")
    .trim();
}

function dirname(path:string){const i=path.lastIndexOf("/");return i>=0?path.slice(0,i+1):"";}
function normalizePath(path:string){
  const parts:string[]=[];
  for(const part of path.split("/")){
    if(!part||part===".")continue;
    if(part==="..")parts.pop();else parts.push(part);
  }
  return parts.join("/");
}

async function extractEpubText(bytes:Uint8Array){
  const zip=await JSZip.loadAsync(bytes);
  const container=await zip.file("META-INF/container.xml")?.async("text");
  const opfPath=container?.match(/full-path=["']([^"']+)["']/i)?.[1];
  if(!opfPath)throw new Error("EPUB inválido: pacote principal não encontrado.");
  const opf=await zip.file(opfPath)?.async("text");
  if(!opf)throw new Error("EPUB inválido: metadados não encontrados.");
  const base=dirname(opfPath);
  const manifest=new Map<string,{href:string;mediaType:string}>();
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
    files.push(normalizePath(base+item.href));
  }
  if(!files.length){
    for(const name of Object.keys(zip.files).sort())if(/\.(xhtml?|html?)$/i.test(name)&&!/nav|toc|cover/i.test(name))files.push(name);
  }
  const chapters:string[]=[];
  for(const name of files){const file=zip.file(name);if(!file)continue;const text=textFromHtml(await file.async("text"));if(text)chapters.push(text);}
  const text=chapters.join("\n\n").trim();
  if(text.length<250)throw new Error("Não encontrei texto suficiente no EPUB para criar o PDF de leitura.");
  return text;
}

const winAnsiExtras:Record<number,number>={
  0x20ac:0x80,0x201a:0x82,0x0192:0x83,0x201e:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,0x02c6:0x88,0x2030:0x89,0x0160:0x8a,0x2039:0x8b,0x0152:0x8c,0x017d:0x8e,
  0x2018:0x91,0x2019:0x92,0x201c:0x93,0x201d:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02dc:0x98,0x2122:0x99,0x0161:0x9a,0x203a:0x9b,0x0153:0x9c,0x017e:0x9e,0x0178:0x9f
};
function toWinAnsi(value:string){
  let out="";
  for(const char of value){const cp=char.codePointAt(0)||32;if(cp>=32&&cp<=255)out+=String.fromCharCode(cp);else if(winAnsiExtras[cp])out+=String.fromCharCode(winAnsiExtras[cp]);else out+="?";}
  return out;
}
function pdfEscape(value:string){return toWinAnsi(value).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)").replace(/[\r\n]+/g," ");}

function wrapParagraph(text:string,max=86){
  const words=text.split(/\s+/).filter(Boolean);const lines:string[]=[];let line="";
  for(const word of words){
    if(word.length>max){if(line){lines.push(line);line="";}for(let i=0;i<word.length;i+=max)lines.push(word.slice(i,i+max));continue;}
    if(!line)line=word;else if(line.length+1+word.length<=max)line+=` ${word}`;else{lines.push(line);line=word;}
  }
  if(line)lines.push(line);return lines;
}

function paginate(text:string,meta:PdfMeta){
  const lines:string[]=[meta.title.trim(),meta.author?.trim()?`Autor: ${meta.author.trim()}`:"",""];
  for(const paragraph of text.split(/\n+/)){
    const p=paragraph.trim();if(!p){if(lines.at(-1)!=="")lines.push("");continue;}
    lines.push(...wrapParagraph(p),"");
  }
  const perPage=47;const pages:string[][]=[];
  for(let i=0;i<lines.length;i+=perPage)pages.push(lines.slice(i,i+perPage));
  return pages.length?pages:[[meta.title]];
}

function buildPdf(pages:string[][]){
  const objects=new Map<number,Buffer>();const pageIds=pages.map((_,i)=>4+i*2);
  objects.set(1,Buffer.from("<< /Type /Catalog /Pages 2 0 R >>","latin1"));
  objects.set(2,Buffer.from(`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,"latin1"));
  objects.set(3,Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>","latin1"));
  pages.forEach((lines,index)=>{
    const pageId=4+index*2,contentId=pageId+1;
    objects.set(pageId,Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,"latin1"));
    const commands=["BT","/F1 11 Tf","15 TL","54 788 Td",...lines.flatMap(line=>[`(${pdfEscape(line)}) Tj`,"T*"]),"ET"].join("\n");
    const stream=Buffer.from(commands,"latin1");
    objects.set(contentId,Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`,"latin1"),stream,Buffer.from("\nendstream","latin1")]));
  });
  const maxId=Math.max(...objects.keys());const parts:Buffer[]=[Buffer.from("%PDF-1.4\n%âãÏÓ\n","latin1")];const offsets=new Array<number>(maxId+1).fill(0);let offset=parts[0].length;
  for(let id=1;id<=maxId;id++){
    const body=objects.get(id);if(!body)continue;offsets[id]=offset;const obj=Buffer.concat([Buffer.from(`${id} 0 obj\n`,`latin1`),body,Buffer.from("\nendobj\n","latin1")]);parts.push(obj);offset+=obj.length;
  }
  const xrefOffset=offset;let xref=`xref\n0 ${maxId+1}\n0000000000 65535 f \n`;
  for(let id=1;id<=maxId;id++)xref+=`${String(offsets[id]).padStart(10,"0")} 00000 n \n`;
  const trailer=`trailer\n<< /Size ${maxId+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  parts.push(Buffer.from(xref+trailer,"latin1"));return new Uint8Array(Buffer.concat(parts));
}

export async function buildPdfFromEpub(epubBytes:Uint8Array,meta:PdfMeta){
  const text=await extractEpubText(epubBytes);const pages=paginate(text,meta);return {bytes:buildPdf(pages),pages:pages.length};
}
