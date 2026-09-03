import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { buildEpubFromPdf,replaceEpubCover } from "@/lib/kindle-epub";
import { fetchDriveFile,uploadCatalogKindleEpub,uploadUserKindleEpub } from "@/lib/google-drive";
import { driveLetter,slugifyTitle } from "@/lib/slugify";

export type KindleSource="user"|"catalog";
type SourceBook={id:string;user_id?:string;title:string;author:string;description?:string|null;language?:string|null;cover_url:string|null;drive_file_id:string;file_name:string;mime_type:string;drive_folder_letter?:string|null;kindle_drive_file_id?:string|null;kindle_file_name?:string|null;kindle_generated_at?:string|null;pages?:number|null};

function normalize(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function sameBook(a:SourceBook,b:{title:string;author:string}){return normalize(a.title)===normalize(b.title)&&normalize(a.author||"")===normalize(b.author||"");}

export async function loadKindleSource(supabase:SupabaseClient,source:KindleSource,id:string){
  if(source==="user"){
    const {data,error}=await supabase.from("user_books").select("*").eq("id",id).maybeSingle();
    if(error)throw new Error(error.message);
    if(!data)throw new Error("Livro pessoal não encontrado.");
    return data as SourceBook;
  }
  const {data,error}=await supabase.from("books").select("*").eq("id",id).eq("published",true).maybeSingle();
  if(error)throw new Error(error.message);
  if(!data)throw new Error("Livro do catálogo não encontrado.");
  return data as SourceBook;
}

export async function ensureKindleVersion(supabase:SupabaseClient,userId:string,source:KindleSource,id:string){
  const item=await loadKindleSource(supabase,source,id);
  if(item.kindle_drive_file_id&&item.kindle_file_name)return {item,driveFileId:item.kindle_drive_file_id,fileName:item.kindle_file_name,generated:false};

  const isPdf=item.mime_type==="application/pdf"||item.file_name.toLowerCase().endsWith(".pdf");
  const isEpub=item.mime_type==="application/epub+zip"||item.file_name.toLowerCase().endsWith(".epub");
  const admin=createAdminSupabaseClient();

  if(isEpub){
    const patch={kindle_drive_file_id:item.drive_file_id,kindle_file_name:item.file_name,kindle_generated_at:new Date().toISOString()};
    await admin.from(source==="user"?"user_books":"books").update(patch).eq("id",item.id);
    return {item:{...item,...patch},driveFileId:item.drive_file_id,fileName:item.file_name,generated:false};
  }
  if(!isPdf)throw new Error("A versão Kindle só pode ser gerada a partir de PDF ou EPUB.");
  if(!item.cover_url)throw new Error("Adicione uma capa ao livro antes de gerar a versão Kindle.");

  const pdfResponse=await fetchDriveFile(item.drive_file_id);
  const pdfBytes=new Uint8Array(await pdfResponse.arrayBuffer());
  const generated=await buildEpubFromPdf(pdfBytes,{title:item.title,author:item.author,language:item.language,coverUrl:item.cover_url});
  const fileName=`${slugifyTitle(item.title)}-Kindle.epub`;
  const uploaded=source==="user"
    ?await uploadUserKindleEpub(userId,fileName,generated.bytes)
    :await uploadCatalogKindleEpub((item.drive_folder_letter||driveLetter(item.title)).toUpperCase(),fileName,generated.bytes);
  const patch={kindle_drive_file_id:uploaded.id,kindle_file_name:fileName,kindle_generated_at:new Date().toISOString(),...(item.pages?{}:{pages:generated.pages})};
  const {error}=await admin.from(source==="user"?"user_books":"books").update(patch).eq("id",item.id);
  if(error)throw new Error(`Não foi possível registrar a versão Kindle: ${error.message}`);
  return {item:{...item,...patch},driveFileId:uploaded.id,fileName,generated:true};
}

export async function getCoverChoices(supabase:SupabaseClient,source:KindleSource,id:string){
  const sourceItem=await loadKindleSource(supabase,source,id);
  const admin=createAdminSupabaseClient();
  const [{data:catalog},{data:users}]=await Promise.all([
    admin.from("books").select("title,author,cover_url").not("cover_url","is",null),
    admin.from("user_books").select("title,author,cover_url").not("cover_url","is",null)
  ]);
  const candidates=[sourceItem,...((catalog||[]) as SourceBook[]),...((users||[]) as SourceBook[])].filter(x=>x.cover_url&&sameBook(x,sourceItem));
  const seen=new Set<string>();
  const result:{url:string;label:string;isDefault:boolean}[]=[];
  for(const c of candidates){
    const url=String(c.cover_url||"");
    if(!url||seen.has(url))continue;
    seen.add(url);
    result.push({url,label:`Capa ${result.length+1}`,isDefault:url===sourceItem.cover_url});
  }
  result.sort((a,b)=>Number(b.isDefault)-Number(a.isDefault));
  return {item:sourceItem,covers:result};
}

export async function prepareKindleBytes(supabase:SupabaseClient,userId:string,source:KindleSource,id:string,coverUrl?:string|null){
  const ensured=await ensureKindleVersion(supabase,userId,source,id);
  const epubResponse=await fetchDriveFile(ensured.driveFileId);
  const baseBytes=new Uint8Array(await epubResponse.arrayBuffer());
  const selected=coverUrl?.trim()||ensured.item.cover_url||null;
  if(!selected||selected===ensured.item.cover_url)return {bytes:baseBytes,fileName:ensured.fileName,title:ensured.item.title};
  const bytes=await replaceEpubCover(baseBytes,selected);
  return {bytes,fileName:ensured.fileName,title:ensured.item.title};
}
