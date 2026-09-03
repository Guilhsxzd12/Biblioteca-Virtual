import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { buildPdfFromEpub } from "@/lib/epub-pdf";
import { deleteDriveFile,fetchDriveFile,uploadUserReadingPdf } from "@/lib/google-drive";
import { ensureKindleVersion } from "@/lib/kindle-service";
import { slugifyTitle } from "@/lib/slugify";

function isPdf(name:string,mime:string){return mime==="application/pdf"||name.toLowerCase().endsWith(".pdf");}
function isEpub(name:string,mime:string){return mime==="application/epub+zip"||name.toLowerCase().endsWith(".epub");}

export async function ensureUserBookFormats(userId:string,bookId:string){
  const admin=createAdminSupabaseClient();
  const {data:item,error}=await admin.from("user_books").select("*").eq("id",bookId).eq("user_id",userId).maybeSingle();
  if(error)throw new Error(error.message);if(!item)throw new Error("Livro pessoal não encontrado.");

  const primaryName=String(item.file_name||"");const primaryMime=String(item.mime_type||"");
  if(isEpub(primaryName,primaryMime)){
    const originalEpubId=String(item.drive_file_id);const originalEpubName=primaryName||`${slugifyTitle(item.title)}.epub`;
    const epubResponse=await fetchDriveFile(originalEpubId);const epubBytes=new Uint8Array(await epubResponse.arrayBuffer());
    const generated=await buildPdfFromEpub(epubBytes,{title:item.title,author:item.author});
    const pdfName=`${slugifyTitle(item.title)}.pdf`;const uploaded=await uploadUserReadingPdf(userId,pdfName,generated.bytes);
    const patch={
      drive_file_id:uploaded.id,
      file_name:pdfName,
      mime_type:"application/pdf",
      kindle_drive_file_id:item.kindle_drive_file_id||originalEpubId,
      kindle_file_name:item.kindle_file_name||originalEpubName,
      kindle_generated_at:item.kindle_generated_at||new Date().toISOString(),
      pages:item.pages||generated.pages,
      updated_at:new Date().toISOString()
    };
    const {data:updated,error:updateError}=await admin.from("user_books").update(patch).eq("id",bookId).eq("user_id",userId).select("*").single();
    if(updateError){try{await deleteDriveFile(uploaded.id);}catch{}throw new Error(updateError.message);}
    return updated;
  }

  if(isPdf(primaryName,primaryMime)){
    if(item.kindle_drive_file_id&&item.kindle_file_name)return item;
    await ensureKindleVersion(admin,userId,"user",bookId);
    const {data:updated,error:updateError}=await admin.from("user_books").select("*").eq("id",bookId).eq("user_id",userId).single();
    if(updateError)throw new Error(updateError.message);return updated;
  }

  throw new Error("O livro precisa estar em PDF ou EPUB.");
}

export function hasPdfAndEpub(book:{file_name?:string|null;mime_type?:string|null;kindle_drive_file_id?:string|null;kindle_file_name?:string|null}){
  return isPdf(String(book.file_name||""),String(book.mime_type||""))&&Boolean(book.kindle_drive_file_id&&book.kindle_file_name);
}
