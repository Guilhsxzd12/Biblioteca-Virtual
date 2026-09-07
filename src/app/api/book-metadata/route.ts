import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import type { BookMetadataResult } from "@/lib/types";

function yearFrom(v?:string){
  const m=v?.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
  return m?Number(m[1]):null;
}

function cleanText(v?:string|null){
  if(!v)return null;
  return v
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/&aacute;/gi,"á").replace(/&atilde;/gi,"ã").replace(/&acirc;/gi,"â")
    .replace(/&eacute;/gi,"é").replace(/&ecirc;/gi,"ê").replace(/&iacute;/gi,"í")
    .replace(/&oacute;/gi,"ó").replace(/&otilde;/gi,"õ").replace(/&ocirc;/gi,"ô")
    .replace(/&uacute;/gi,"ú").replace(/&ccedil;/gi,"ç")
    .replace(/\s+/g," ")
    .trim()||null;
}

function norm(v:string){
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

function normalizeLanguage(v?:string|null){
  if(!v)return null;
  const x=v.toLowerCase();
  const map:Record<string,string>={por:"pt",ptbr:"pt",pt_br:"pt",eng:"en",spa:"es",fre:"fr",fra:"fr",ita:"it",ger:"de",deu:"de",jpn:"ja",chi:"zh",zho:"zh",rus:"ru"};
  return map[x.replace(/[-]/g,"_")]||x.split(/[-_]/)[0]||null;
}

function compactIsbn(value?:string|null){return String(value||"").replace(/[^0-9X]/gi,"").toUpperCase();}
function isIsbn(value:string){return /^(?:\d{9}[\dX]|\d{13})$/i.test(compactIsbn(value));}

function titleCoverage(itemTitle:string,query:string){
  const t=norm(itemTitle),q=norm(query);if(!q)return 0;if(t===q)return 1;
  const words=q.split(" ").filter(word=>word.length>2);if(!words.length)return t.includes(q)?1:0;
  const hits=words.filter(word=>t.includes(word)).length;return hits/words.length;
}

function score(item:BookMetadataResult,query:string,isbn:string|null){
  const q=norm(query),t=norm(item.title),a=norm(item.author||"");
  let s=0;
  if(isbn&&compactIsbn(item.isbn)===isbn)s+=300;
  if(t===q)s+=150;
  else if(t.startsWith(q))s+=95;
  else if(t.includes(q))s+=70;
  else s+=Math.round(titleCoverage(item.title,query)*45);
  if(a&&a!=="autor nao informado")s+=8;
  if(item.description)s+=16;
  if(item.coverUrl)s+=5;
  if(item.year)s+=2;
  if(item.pages)s+=2;
  if(item.categories?.length)s+=3;
  if(item.isEbook)s+=2;
  if(item.language==="pt")s+=28;
  else if(item.language==="es")s+=5;
  if(item.source==="publisher")s+=22;
  return s;
}

function dedupe(items:BookMetadataResult[],query:string,isbn:string|null){
  const seen=new Set<string>();
  const relevant=isbn?items.filter(item=>compactIsbn(item.isbn)===isbn):items.filter(item=>titleCoverage(item.title,query)>=0.58);
  return relevant
    .sort((a,b)=>score(b,query,isbn)-score(a,query,isbn))
    .filter(item=>{
      const key=item.isbn?`isbn:${compactIsbn(item.isbn)}`:`${norm(item.title)}|${norm(item.author)}|${item.language||""}|${item.year||""}`;
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    })
    .slice(0,30);
}

async function googleBooks(query:string,{ebooks=false,lang}:{ebooks?:boolean;lang?:string}={}){
  const url=new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q",query);
  url.searchParams.set("printType","books");
  url.searchParams.set("maxResults","20");
  url.searchParams.set("orderBy","relevance");
  if(ebooks)url.searchParams.set("filter","ebooks");
  if(lang)url.searchParams.set("langRestrict",lang);
  const key=process.env.GOOGLE_BOOKS_API_KEY?.trim();if(key)url.searchParams.set("key",key);
  const r=await fetch(url,{cache:"no-store"});
  if(!r.ok)return [] as BookMetadataResult[];
  const p=await r.json();
  return (p.items||[]).map((item:any):BookMetadataResult=>{
    const i=item.volumeInfo||{};
    const isbn=(i.industryIdentifiers||[]).find((x:any)=>x.type==="ISBN_13")?.identifier||(i.industryIdentifiers||[]).find((x:any)=>x.type==="ISBN_10")?.identifier||(i.industryIdentifiers||[])[0]?.identifier||null;
    const isEbook=Boolean(ebooks||item.saleInfo?.isEbook||item.accessInfo?.epub?.isAvailable||item.accessInfo?.pdf?.isAvailable);
    return {
      id:`g:${item.id}:${ebooks?"e":"b"}:${lang||"all"}`,
      source:"google-books",
      title:i.title||"Título não informado",
      author:(i.authors||[]).join(", ")||"Autor não informado",
      language:normalizeLanguage(i.language),
      year:yearFrom(i.publishedDate),
      pages:Number.isFinite(i.pageCount)?i.pageCount:null,
      description:cleanText(i.description),
      coverUrl:(i.imageLinks?.extraLarge||i.imageLinks?.large||i.imageLinks?.medium||i.imageLinks?.thumbnail||i.imageLinks?.smallThumbnail||null)?.replace("http://","https://"),
      isbn,
      isEbook,
      categories:Array.isArray(i.categories)?i.categories.slice(0,10):[]
    };
  });
}

async function openLibraryDescription(workKey?:string){
  if(!workKey||!workKey.startsWith("/works/"))return null;
  try{
    const r=await fetch(`https://openlibrary.org${workKey}.json`,{headers:{"User-Agent":"BibliotecaVirtual/1.5"},cache:"no-store"});if(!r.ok)return null;
    const p=await r.json();const raw=typeof p.description==="string"?p.description:p.description?.value;
    return cleanText(raw);
  }catch{return null;}
}

async function openLibrarySearch(title:string,isbn:string|null,exactTitle=false){
  const url=new URL("https://openlibrary.org/search.json");
  if(isbn)url.searchParams.set("isbn",isbn);
  else if(exactTitle)url.searchParams.set("title",title);
  else url.searchParams.set("q",title);
  url.searchParams.set("limit","35");
  url.searchParams.set("fields","key,title,author_name,first_publish_year,cover_i,number_of_pages_median,isbn,ebook_access,public_scan_b,subject,language");
  const r=await fetch(url,{headers:{"User-Agent":"BibliotecaVirtual/1.5"},cache:"no-store"});
  if(!r.ok)return [] as BookMetadataResult[];
  const p=await r.json();const docs=(p.docs||[]) as any[];
  const descriptions=new Map<string,string|null>();
  await Promise.all(docs.slice(0,8).map(async d=>{descriptions.set(d.key,await openLibraryDescription(d.key));}));
  return docs.map((d:any):BookMetadataResult=>({
    id:`o:${d.key}:${d.language?.[0]||""}:${exactTitle?"title":"q"}`,
    source:"open-library",
    title:d.title||title,
    author:(d.author_name||[]).join(", ")||"Autor não informado",
    language:normalizeLanguage(d.language?.includes("por")?"por":d.language?.[0]),
    year:d.first_publish_year||null,
    pages:d.number_of_pages_median||null,
    description:descriptions.get(d.key)||null,
    coverUrl:d.cover_i?`https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`:null,
    isbn:d.isbn?.find((x:string)=>compactIsbn(x).length===13)||d.isbn?.[0]||null,
    isEbook:Boolean(d.public_scan_b||d.ebook_access&&d.ebook_access!=="no_ebook"),
    categories:Array.isArray(d.subject)?d.subject.slice(0,14):[]
  }));
}

async function openLibraryByIsbn(isbn:string){
  try{
    const editionResponse=await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`,{headers:{"User-Agent":"BibliotecaVirtual/1.5"},cache:"no-store"});
    if(!editionResponse.ok)return [] as BookMetadataResult[];
    const edition=await editionResponse.json();
    const authors=await Promise.all((edition.authors||[]).slice(0,6).map(async (author:any)=>{
      try{const r=await fetch(`https://openlibrary.org${author.key}.json`,{headers:{"User-Agent":"BibliotecaVirtual/1.5"},cache:"no-store"});if(!r.ok)return null;const p=await r.json();return p.name||null;}catch{return null;}
    }));
    const workKey=edition.works?.[0]?.key;const description=await openLibraryDescription(workKey);
    const coverId=edition.covers?.[0];
    const pages=Number(edition.number_of_pages)||null;
    return [{
      id:`oi:${edition.key||isbn}`,
      source:"open-library",
      title:edition.title||"Título não informado",
      author:authors.filter(Boolean).join(", ")||"Autor não informado",
      language:normalizeLanguage(edition.languages?.[0]?.key?.split("/").pop()),
      year:yearFrom(edition.publish_date),
      pages:Number.isFinite(pages)?pages:null,
      description,
      coverUrl:coverId?`https://covers.openlibrary.org/b/id/${coverId}-L.jpg`:null,
      isbn,
      isEbook:false,
      categories:Array.isArray(edition.subjects)?edition.subjects.slice(0,14):[]
    } satisfies BookMetadataResult];
  }catch{return [] as BookMetadataResult[];}
}

function htmlMeta(html:string,key:string){
  const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const patterns=[
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,"i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,"i")
  ];
  for(const pattern of patterns){const match=html.match(pattern);if(match?.[1])return cleanText(match[1]);}
  return null;
}

async function companhiaByIsbn(isbn:string){
  try{
    const response=await fetch(`https://www.companhiadasletras.com.br/livro/${encodeURIComponent(isbn)}/`,{headers:{"User-Agent":"Mozilla/5.0 BibliotecaVirtual/1.5","Accept":"text/html,application/xhtml+xml"},cache:"no-store",redirect:"follow"});
    if(!response.ok)return [] as BookMetadataResult[];
    const html=await response.text();const plain=cleanText(html)||"";
    if(!plain.includes(isbn)&&!plain.includes(isbn.replace(/(\d{3})(\d{2})(\d{3})(\d{4})(\d)/,"$1-$2-$3-$4-$5")))return [] as BookMetadataResult[];
    const documentTitle=cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1])||htmlMeta(html,"og:title")||"";
    const title=(cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1])||documentTitle.split(" - ")[0]||"").trim();
    const titleParts=documentTitle.split(" - ").map(part=>part.trim()).filter(Boolean);
    let author=titleParts.length>=3?titleParts.slice(1,-1).join(" - "):"Autor não informado";
    author=author.replace(/\s+\|\s+Grupo Companhia das Letras.*$/i,"").trim()||"Autor não informado";
    const pagesMatch=plain.match(/P[aá]ginas\s*:?\s*(\d{1,5})/i);
    const launchMatch=plain.match(/Lan[cç]amento\s*:?\s*\d{1,2}\/\d{1,2}\/(\d{4})/i)||plain.match(/Ano(?: de edi[cç][aã]o)?\s*:?\s*(20\d{2}|19\d{2})/i);
    const description=htmlMeta(html,"description")||htmlMeta(html,"og:description");
    const coverUrl=htmlMeta(html,"og:image");
    if(!title)return [] as BookMetadataResult[];
    return [{id:`publisher:companhia:${isbn}`,source:"publisher",title,author,language:"pt",year:launchMatch?Number(launchMatch[1]):null,pages:pagesMatch?Number(pagesMatch[1]):null,description,coverUrl,isbn,isEbook:true,categories:["Fantasia"]} satisfies BookMetadataResult];
  }catch{return [] as BookMetadataResult[];}
}

export async function GET(request:NextRequest){
  const viewer=await getApiViewer();
  if(!viewer.user||!viewer.profile||(viewer.profile.role!=="admin"&&!viewer.profile.approved))return NextResponse.json({error:"Acesso negado."},{status:403});

  const title=request.nextUrl.searchParams.get("title")?.trim();
  if(!title||title.length<2)return NextResponse.json({results:[]});

  const compact=compactIsbn(title);
  const isbn=isIsbn(compact)?compact:null;
  const accentless=norm(title).replace(/\s+/g," ");
  const exactQuery=isbn?`isbn:${isbn}`:`intitle:"${title}"`;
  const broadQuery=isbn?`isbn:${isbn}`:title;
  const quotedQuery=isbn?`isbn:${isbn}`:`"${title}"`;
  const accentlessQuery=!isbn&&accentless&&accentless!==norm(title)?`intitle:"${accentless}"`:null;

  const tasks:Promise<BookMetadataResult[]>[]=[
    googleBooks(exactQuery,{lang:"pt"}),
    googleBooks(broadQuery,{lang:"pt"}),
    googleBooks(quotedQuery,{lang:"pt"}),
    googleBooks(broadQuery,{ebooks:true,lang:"pt"}),
    googleBooks(exactQuery),
    googleBooks(broadQuery),
    googleBooks(quotedQuery),
    openLibrarySearch(title,isbn,true),
    openLibrarySearch(title,isbn,false)
  ];
  if(accentlessQuery)tasks.push(googleBooks(accentlessQuery,{lang:"pt"}),googleBooks(accentlessQuery));
  if(isbn)tasks.push(openLibraryByIsbn(isbn),companhiaByIsbn(isbn));

  const settled=await Promise.allSettled(tasks);
  const all:BookMetadataResult[]=[];
  for(const item of settled)if(item.status==="fulfilled")all.push(...item.value);
  return NextResponse.json({results:dedupe(all,title,isbn)});
}
