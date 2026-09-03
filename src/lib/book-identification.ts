import "server-only";
import JSZip from "jszip";
import { getDocument } from "pdfjs-serverless";

export type IdentifiedBook={
  title:string;
  author:string;
  description:string|null;
  year:number|null;
  pages:number|null;
  language:string|null;
  confidence:"metadata"|"catalog"|"lookup"|"filename";
};

type LookupBook={title:string;author:string;description:string|null;year:number|null;pages:number|null;language:string|null};

function decodeXml(value:string){
  return value.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();
}
function stripTags(value?:string|null){return value?decodeXml(value.replace(/<[^>]+>/g," "))||null:null;}
function compact(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"");}
function yearFrom(value?:string|null){const m=value?.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);return m?Number(m[1]):null;}
function normalizeLanguage(value?:string|null){if(!value)return null;const v=value.trim().toLowerCase().replace(/_/g,"-");if(v.startsWith("pt")||v==="por")return "pt";if(v.startsWith("en")||v==="eng")return "en";if(v.startsWith("es")||v==="spa")return "es";return v.split("-")[0]||null;}

function levenshtein(a:string,b:string){
  if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;
  const prev=Array.from({length:b.length+1},(_,i)=>i);const cur=new Array<number>(b.length+1);
  for(let i=1;i<=a.length;i++){
    cur[0]=i;
    for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    for(let j=0;j<=b.length;j++)prev[j]=cur[j];
  }
  return prev[b.length];
}
function titleSimilarity(a:string,b:string){const x=compact(a),y=compact(b);if(!x||!y)return 0;if(x===y)return 1;const longest=Math.max(x.length,y.length);let score=1-levenshtein(x,y)/longest;if(x.includes(y)||y.includes(x))score=Math.max(score,Math.min(x.length,y.length)/longest+.18);return Math.max(0,Math.min(1,score));}

function filenameGuess(fileName:string){
  let stem=fileName.replace(/\.(pdf|epub)$/i,"").replace(/[\[\{][^\]\}]*[\]\}]/g," ").replace(/\((?:[^)]*(?:z-lib|\.org|\.com|ebook|epub|pdf)[^)]*)\)/gi," ");
  stem=stem.replace(/([a-zà-ÿ0-9])([A-ZÁ-Ú])/g,"$1 $2").replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
  let author="Autor não informado";
  const by=stem.match(/^(.*?)\s+by\s+(.+)$/i);
  if(by){stem=by[1].trim();author=by[2].replace(/\([^)]*\)/g," ").replace(/\s+/g," ").trim()||author;}
  stem=stem.replace(/\b(?:z[- ]?lib(?:\.org)?|biblioteca virtual|ebook)\b/gi," ").replace(/\s+/g," ").trim();
  return {title:stem||"Livro enviado pelo Telegram",author};
}

async function epubMetadata(bytes:Uint8Array){
  try{
    const zip=await JSZip.loadAsync(bytes);const container=await zip.file("META-INF/container.xml")?.async("text");
    const opfPath=container?.match(/full-path=["']([^"']+)["']/i)?.[1];if(!opfPath)return null;
    const opf=await zip.file(opfPath)?.async("text");if(!opf)return null;
    const title=opf.match(/<dc:title(?:\s[^>]*)?>([\s\S]*?)<\/dc:title>/i)?.[1];
    const author=opf.match(/<dc:creator(?:\s[^>]*)?>([\s\S]*?)<\/dc:creator>/i)?.[1];
    const language=opf.match(/<dc:language(?:\s[^>]*)?>([\s\S]*?)<\/dc:language>/i)?.[1];
    const description=opf.match(/<dc:description(?:\s[^>]*)?>([\s\S]*?)<\/dc:description>/i)?.[1];
    const date=opf.match(/<dc:date(?:\s[^>]*)?>([\s\S]*?)<\/dc:date>/i)?.[1];
    if(!title&&!author)return null;
    return {title:title?decodeXml(stripTags(title)||title):null,author:author?decodeXml(stripTags(author)||author):null,language:normalizeLanguage(language?decodeXml(language):null),description:stripTags(description||null),year:yearFrom(date?decodeXml(date):null),pages:null as number|null};
  }catch{return null;}
}

async function pdfMetadata(bytes:Uint8Array){
  try{
    const loading=getDocument({data:bytes,useSystemFonts:true});const pdf=await loading.promise;
    const meta=await pdf.getMetadata() as any;const info=meta?.info||{};
    const title=typeof info.Title==="string"?info.Title.trim():"";const author=typeof info.Author==="string"?info.Author.trim():"";
    const creation=typeof info.CreationDate==="string"?info.CreationDate:"";const result={title:title||null,author:author||null,description:null as string|null,year:yearFrom(creation),pages:pdf.numPages||null,language:null as string|null};
    await pdf.destroy();return result;
  }catch{return null;}
}

async function googleBooks(query:string){
  if(query.trim().length<2)return [] as LookupBook[];
  const url=new URL("https://www.googleapis.com/books/v1/volumes");url.searchParams.set("q",query);url.searchParams.set("printType","books");url.searchParams.set("maxResults","40");url.searchParams.set("orderBy","relevance");url.searchParams.set("langRestrict","pt");
  const response=await fetch(url,{cache:"no-store"});if(!response.ok)return [] as LookupBook[];const data=await response.json();
  return (data.items||[]).map((item:any):LookupBook=>{const v=item.volumeInfo||{};return {title:String(v.title||"").trim(),author:Array.isArray(v.authors)&&v.authors.length?v.authors.join(", "):"Autor não informado",description:stripTags(v.description||null),year:yearFrom(v.publishedDate),pages:Number.isFinite(v.pageCount)?Number(v.pageCount):null,language:normalizeLanguage(v.language)};}).filter((x:LookupBook)=>x.title);
}

async function lookupBest(title:string,rawFileName:string){
  const words=title.split(/\s+/).filter(Boolean);const queries=[title];if(words[0]&&words[0].length>=4&&title.length>18)queries.push(words[0]);if(words.length>=2&&words.slice(0,2).join(" ")!==title)queries.push(words.slice(0,2).join(" "));
  const settled=await Promise.allSettled([...new Set(queries)].slice(0,3).map(q=>googleBooks(q)));const candidates:LookupBook[]=[];for(const r of settled)if(r.status==="fulfilled")candidates.push(...r.value);
  const target=filenameGuess(rawFileName).title;let best:LookupBook|null=null;let bestScore=0;
  for(const item of candidates){const score=Math.max(titleSimilarity(item.title,title),titleSimilarity(item.title,target));if(score>bestScore){best=item;bestScore=score;}}
  return bestScore>=.62?{item:best!,score:bestScore}:null;
}

export async function identifyBookFromUpload(fileName:string,mimeType:string,bytes:Uint8Array):Promise<IdentifiedBook>{
  const guess=filenameGuess(fileName);const isEpub=mimeType==="application/epub+zip"||fileName.toLowerCase().endsWith(".epub");const embedded=isEpub?await epubMetadata(bytes):await pdfMetadata(bytes);
  let title=embedded?.title?.trim()||guess.title;let author=embedded?.author?.trim()||guess.author;let description=embedded?.description||null;let year=embedded?.year||null;let pages=embedded?.pages||null;let language=embedded?.language||null;let confidence:IdentifiedBook["confidence"]=embedded?.title?"metadata":"filename";
  const lookup=await lookupBest(title,fileName);
  if(lookup){const found=lookup.item;if(!embedded?.title||lookup.score>=.78){title=found.title||title;confidence="lookup";}if((!author||author==="Autor não informado")&&found.author)author=found.author;if(!description&&found.description)description=found.description;if(!year&&found.year)year=found.year;if(!pages&&found.pages)pages=found.pages;if(!language&&found.language)language=found.language;}
  return {title:title||"Livro enviado pelo Telegram",author:author||"Autor não informado",description,year,pages,language,confidence};
}
