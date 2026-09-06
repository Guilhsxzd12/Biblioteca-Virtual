import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { replaceEpubCover } from "@/lib/kindle-epub";
import { fetchDriveFile,uploadCatalogKindleEpub,uploadUserKindleEpub } from "@/lib/google-drive";
import { driveLetter,slugifyTitle } from "@/lib/slugify";

export type KindleSource="user"|"catalog";
type SourceBook={id:string;user_id?:string;title:string;author:string;description?:string|null;language?:string|null;cover_url:string|null;drive_file_id:string;file_name:string;mime_type:string;drive_folder_letter?:string|null;kindle_drive_file_id?:string|null;kindle_file_name?:string|null;kindle_generated_at?:string|null;pages?:number|null};

function normalize(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function sameBook(a:SourceBook,b:{title:string;author:string}){return normalize(a.title)===normalize(b.title)&&normalize(a.author||"")===normalize(b.author||"");}
function isEpub(item:SourceBook){return item.mime_type==="application/epub+zip"||item.file_name.toLowerCase().endsWith(".epub");}

export async function loadKindleSource(supabase:SupabaseClient,source:KindleSource,id:string){
  if(source==="user"){
    const {data,error}=await supabase.from("user_books").select("*").eq("id",id).maybeSingle();
    if(error)throw new Error(error.message);if(!data)throw new Error("Livro pessoal não encontrado.");return data as SourceBook;
  }
  const {data,error}=await supabase.from("books").select("*").eq("id",id).eq("published",true).maybeSingle();
  if(error)throw new Error(error.message);if(!data)throw new Error("Livro do catálogo não encontrado.");return data as SourceBook;
}

export async function ensureKindleVersion(supabase:SupabaseClient,userId:string,source:KindleSource,id:string){
  const item=await loadKindleSource(supabase,source,id);
  if(item.kindle_drive_file_id&&item.kindle_file_name)return {item,driveFileId:item.kindle_drive_file_id,fileName:item.kindle_file_name,generated:false};
  if(!isEpub(item))throw new Error("Este livro precisa ter um EPUB original para ser enviado ao Kindle.");
  if(!item.cover_url)throw new Error("Escolha ou envie uma capa antes de gerar a versão Kindle.");
  const epubResponse=await fetchDriveFile(item.drive_file_id);const epubBytes=new Uint8Array(await epubResponse.arrayBuffer());const coveredBytes=await replaceEpubCover(epubBytes,item.cover_url);const fileName=`${slugifyTitle(item.title)}-Kindle.epub`;
  const uploaded=source==="user"?await uploadUserKindleEpub(userId,fileName,coveredBytes):await uploadCatalogKindleEpub((item.drive_folder_letter||driveLetter(item.title)).toUpperCase(),fileName,coveredBytes);
  const patch={kindle_drive_file_id:uploaded.id,kindle_file_name:fileName,kindle_generated_at:new Date().toISOString()};const admin=createAdminSupabaseClient();const {error}=await admin.from(source==="user"?"user_books":"books").update(patch).eq("id",item.id);if(error)throw new Error(`Não foi possível registrar a versão Kindle: ${error.message}`);return {item:{...item,...patch},driveFileId:uploaded.id,fileName,generated:true};
}

export async function getCoverChoices(supabase:SupabaseClient,source:KindleSource,id:string){
  const sourceItem=await loadKindleSource(supabase,source,id);const admin=createAdminSupabaseClient();
  const [{data:manual},{data:catalog},{data:users}]=await Promise.all([
    source==="catalog"?admin.from("book_covers").select("cover_url,label,source,created_at").eq("book_id",sourceItem.id).order("created_at",{ascending:true}):Promise.resolve({data:[] as any[]}),
    admin.from("books").select("title,author,cover_url").not("cover_url","is",null),admin.from("user_books").select("title,author,cover_url").not("cover_url","is",null)
  ]);
  const seen=new Set<string>();const result:{url:string;label:string;isDefault:boolean;source?:string}[]=[];const add=(urlValue:string|null|undefined,label:string,isDefault=false,coverSource?:string)=>{const url=String(urlValue||"").trim();if(!url||seen.has(url))return;seen.add(url);result.push({url,label,isDefault,source:coverSource});};
  add(sourceItem.cover_url,"Capa atual",true,"current");for(const item of manual||[])add(item.cover_url,item.label||`Capa alternativa ${result.length}`,false,item.source||"manual");
  const related=[...((catalog||[]) as SourceBook[]),...((users||[]) as SourceBook[])].filter(x=>x.cover_url&&sameBook(x,sourceItem));for(const item of related)add(item.cover_url,`Outra edição`,false,"catalog");return {item:sourceItem,covers:result};
}

async function catalogEpubForLanguage(supabase:SupabaseClient,item:SourceBook,language?:string|null){
  const selected=language?.trim().toLowerCase();
  if(selected){
    const {data}=await supabase.from("book_language_files").select("drive_file_id,file_name").eq("book_id",item.id).eq("language",selected).eq("format","epub").maybeSingle();
    if(data)return {driveFileId:String(data.drive_file_id),fileName:String(data.file_name),language:selected};
    if((item.language||"pt").toLowerCase()!==selected)throw new Error("EPUB indisponível no idioma escolhido.");
  }
  if(isEpub(item))return {driveFileId:item.drive_file_id,fileName:item.file_name,language:selected||item.language||"pt"};
  if(item.kindle_drive_file_id&&item.kindle_file_name)return {driveFileId:item.kindle_drive_file_id,fileName:item.kindle_file_name,language:selected||item.language||"pt"};
  throw new Error("Este livro precisa ter um EPUB original para ser enviado ao Kindle.");
}

export async function prepareKindleBytes(supabase:SupabaseClient,userId:string,source:KindleSource,id:string,coverUrl?:string|null,language?:string|null){
  const selected=coverUrl?.trim()||null;
  if(source==="catalog"&&language){
    const item=await loadKindleSource(supabase,source,id);const variant=await catalogEpubForLanguage(supabase,item,language);const response=await fetchDriveFile(variant.driveFileId);const originalBytes=new Uint8Array(await response.arrayBuffer());const bytes=selected?await replaceEpubCover(originalBytes,selected):originalBytes;const suffix=variant.language?`-${variant.language}`:"";return {bytes,fileName:`${slugifyTitle(item.title)}${suffix}-Kindle.epub`,title:item.title};
  }
  if(selected){
    const item=await loadKindleSource(supabase,source,id);const baseDriveId=item.kindle_drive_file_id||(isEpub(item)?item.drive_file_id:null);if(!baseDriveId)throw new Error("Este livro precisa ter um EPUB original para ser enviado ao Kindle.");const response=await fetchDriveFile(baseDriveId);const originalBytes=new Uint8Array(await response.arrayBuffer());const bytes=await replaceEpubCover(originalBytes,selected);return {bytes,fileName:`${slugifyTitle(item.title)}-Kindle.epub`,title:item.title};
  }
  const ensured=await ensureKindleVersion(supabase,userId,source,id);const epubResponse=await fetchDriveFile(ensured.driveFileId);const baseBytes=new Uint8Array(await epubResponse.arrayBuffer());return {bytes:baseBytes,fileName:ensured.fileName,title:ensured.item.title};
}
