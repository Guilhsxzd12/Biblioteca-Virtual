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
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/\s+/g," ")
    .trim()||null;
}

function norm(v:string){
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

function score(item:BookMetadataResult,query:string){
  const q=norm(query),t=norm(item.title),a=norm(item.author||"");
  let s=0;
  if(t===q)s+=100;
  else if(t.startsWith(q))s+=70;
  else if(t.includes(q))s+=45;
  else for(const part of q.split(" ").filter(x=>x.length>2))if(t.includes(part))s+=8;
  if(a&&a!=="autor nao informado")s+=3;
  if(item.coverUrl)s+=4;
  if(item.year)s+=2;
  if(item.pages)s+=1;
  if(item.isEbook)s+=3;
  return s;
}

function dedupe(items:BookMetadataResult[],query:string){
  const seen=new Set<string>();
  return items
    .sort((a,b)=>score(b,query)-score(a,query))
    .filter(item=>{
      const key=item.isbn?`isbn:${item.isbn}`:`${norm(item.title)}|${norm(item.author)}|${item.year||""}|${item.pages||""}`;
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    })
    .slice(0,30);
}

async function googleBooks(query:string,{ebooks=false}:{ebooks?:boolean}={}){
  const url=new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q",query);
  url.searchParams.set("printType","books");
  url.searchParams.set("maxResults","20");
  url.searchParams.set("orderBy","relevance");
  if(ebooks)url.searchParams.set("filter","ebooks");
  const r=await fetch(url,{cache:"no-store"});
  if(!r.ok)return [] as BookMetadataResult[];
  const p=await r.json();
  return (p.items||[]).map((item:any):BookMetadataResult=>{
    const i=item.volumeInfo||{};
    const isbn=(i.industryIdentifiers||[]).find((x:any)=>x.type==="ISBN_13")?.identifier||(i.industryIdentifiers||[]).find((x:any)=>x.type==="ISBN_10")?.identifier||(i.industryIdentifiers||[])[0]?.identifier||null;
    const isEbook=Boolean(ebooks||item.saleInfo?.isEbook||item.accessInfo?.epub?.isAvailable||item.accessInfo?.pdf?.isAvailable);
    return {
      id:`g:${item.id}:${ebooks?"e":"b"}`,
      source:"google-books",
      title:i.title||"Título não informado",
      author:(i.authors||[]).join(", ")||"Autor não informado",
      year:yearFrom(i.publishedDate),
      pages:Number.isFinite(i.pageCount)?i.pageCount:null,
      description:cleanText(i.description),
      coverUrl:(i.imageLinks?.extraLarge||i.imageLinks?.large||i.imageLinks?.medium||i.imageLinks?.thumbnail||i.imageLinks?.smallThumbnail||null)?.replace("http://","https://"),
      isbn,
      isEbook
    };
  });
}

async function openLibrary(title:string,isbn:string|null){
  const url=new URL("https://openlibrary.org/search.json");
  if(isbn)url.searchParams.set("isbn",isbn);
  else url.searchParams.set("q",title);
  url.searchParams.set("limit","25");
  url.searchParams.set("fields","key,title,author_name,first_publish_year,cover_i,number_of_pages_median,isbn,ebook_access,public_scan_b");
  const r=await fetch(url,{headers:{"User-Agent":"BibliotecaVirtual/1.1"},cache:"no-store"});
  if(!r.ok)return [] as BookMetadataResult[];
  const p=await r.json();
  return (p.docs||[]).map((d:any):BookMetadataResult=>({
    id:`o:${d.key}`,
    source:"open-library",
    title:d.title||title,
    author:(d.author_name||[]).join(", ")||"Autor não informado",
    year:d.first_publish_year||null,
    pages:d.number_of_pages_median||null,
    description:null,
    coverUrl:d.cover_i?`https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`:null,
    isbn:d.isbn?.find((x:string)=>String(x).replace(/[^0-9X]/gi,"").length===13)||d.isbn?.[0]||null,
    isEbook:Boolean(d.public_scan_b||d.ebook_access&&d.ebook_access!=="no_ebook")
  }));
}

export async function GET(request:NextRequest){
  const viewer=await getApiViewer();
  if(!viewer.user||viewer.profile?.role!=="admin")return NextResponse.json({error:"Acesso negado."},{status:403});

  const title=request.nextUrl.searchParams.get("title")?.trim();
  if(!title||title.length<2)return NextResponse.json({results:[]});

  const compact=title.replace(/[^0-9X]/gi,"");
  const isbn=/^(?:\d{9}[\dX]|\d{13})$/i.test(compact)?compact:null;
  const exactQuery=isbn?`isbn:${isbn}`:`intitle:"${title}"`;
  const broadQuery=isbn?`isbn:${isbn}`:title;

  const settled=await Promise.allSettled([
    googleBooks(exactQuery),
    googleBooks(broadQuery),
    googleBooks(broadQuery,{ebooks:true}),
    openLibrary(title,isbn)
  ]);

  const all:BookMetadataResult[]=[];
  for(const item of settled)if(item.status==="fulfilled")all.push(...item.value);
  return NextResponse.json({results:dedupe(all,title)});
}
