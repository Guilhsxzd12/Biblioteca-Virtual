import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasOriginalEpub,hasPdfAndEpub } from "@/lib/book-formats";
import { deleteDriveFile } from "@/lib/google-drive";
import { driveLetter,slugifyTitle } from "@/lib/slugify";

async function requireAdmin(){
  const viewer=await getApiViewer();
  return viewer.user&&viewer.profile?.role==="admin"?viewer:null;
}

export async function PATCH(request:NextRequest){
  const viewer=await requireAdmin();
  if(!viewer)return NextResponse.json({error:"Acesso negado."},{status:403});
  const body=await request.json();
  const id=String(body.id||"");
  const status=String(body.status||"");
  if(!id||!["pending","private","catalog"].includes(status))return NextResponse.json({error:"Status inválido."},{status:400});

  const admin=createAdminSupabaseClient();
  const {data:found,error:readError}=await admin.from("user_books").select("*").eq("id",id).single();
  if(readError||!found)return NextResponse.json({error:readError?.message||"Envio não encontrado."},{status:404});
  let item=found;

  if(status==="catalog"){
    const manualPdfId=String(body.readingPdfDriveFileId||"").trim();
    const manualPdfName=String(body.readingPdfFileName||"").trim();
    if(manualPdfId||manualPdfName){
      if(!manualPdfId||!manualPdfName||!manualPdfName.toLowerCase().endsWith(".pdf"))return NextResponse.json({error:"O PDF manual informado é inválido."},{status:400});
      const now=new Date().toISOString();
      const {data:withPdf,error:pdfError}=await admin.from("user_books").update({reading_pdf_drive_file_id:manualPdfId,reading_pdf_file_name:manualPdfName,reading_pdf_generated_at:now,updated_at:now}).eq("id",id).select("*").single();
      if(pdfError||!withPdf)return NextResponse.json({error:pdfError?.message||"Não foi possível vincular o PDF."},{status:400});
      item=withPdf;
    }

    if(!hasOriginalEpub(item))return NextResponse.json({error:"O envio precisa ter um EPUB original."},{status:400});
    if(!hasPdfAndEpub(item))return NextResponse.json({error:"Anexe manualmente o PDF de leitura antes de aprovar este livro."},{status:400});
    if(!String(item.cover_url||"").trim())return NextResponse.json({error:"Adicione uma capa antes de aprovar este livro."},{status:400});
    if(!String(item.author||"").trim()||!String(item.description||"").trim())return NextResponse.json({error:"Autor e sinopse são obrigatórios antes de aprovar para o catálogo."},{status:400});

    const bookPayload={
      title:item.title,
      author:item.author,
      description:item.description,
      language:item.language||null,
      category_id:item.category_id||null,
      year:item.year||null,
      pages:item.pages||null,
      cover_url:item.cover_url||null,
      drive_file_id:item.drive_file_id,
      drive_folder_letter:driveLetter(item.title),
      file_name:item.file_name,
      mime_type:"application/epub+zip",
      reading_pdf_drive_file_id:item.reading_pdf_drive_file_id,
      reading_pdf_file_name:item.reading_pdf_file_name,
      reading_pdf_generated_at:item.reading_pdf_generated_at||new Date().toISOString(),
      kindle_drive_file_id:item.kindle_drive_file_id||null,
      kindle_file_name:item.kindle_file_name||null,
      kindle_generated_at:item.kindle_generated_at||null,
      allow_download:true,
      published:true,
      updated_at:new Date().toISOString()
    };
    const {data:existing}=await admin.from("books").select("id").eq("drive_file_id",item.drive_file_id).maybeSingle();
    if(existing){
      const {error:bookError}=await admin.from("books").update(bookPayload).eq("id",existing.id);
      if(bookError)return NextResponse.json({error:bookError.message},{status:400});
    }else{
      const slug=`${slugifyTitle(item.title).toLowerCase()}-${String(item.id).slice(0,8)}`;
      const {error:bookError}=await admin.from("books").insert({...bookPayload,slug});
      if(bookError)return NextResponse.json({error:bookError.message},{status:400});
    }
  }else{
    await admin.from("books").delete().eq("drive_file_id",item.drive_file_id);
  }

  const {data,error}=await admin.from("user_books").update({moderation_status:status,moderated_at:new Date().toISOString(),moderated_by:viewer.user.id,updated_at:new Date().toISOString()}).eq("id",id).select("*,categories(name)").single();
  return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({book:data});
}

export async function DELETE(request:NextRequest){
  const viewer=await requireAdmin();
  if(!viewer)return NextResponse.json({error:"Acesso negado."},{status:403});
  const id=request.nextUrl.searchParams.get("id");
  if(!id)return NextResponse.json({error:"ID obrigatório."},{status:400});
  const admin=createAdminSupabaseClient();
  const {data:item,error}=await admin.from("user_books").select("drive_file_id,reading_pdf_drive_file_id,kindle_drive_file_id").eq("id",id).maybeSingle();
  if(error)return NextResponse.json({error:error.message},{status:400});
  if(!item)return NextResponse.json({ok:true});
  const ids=[item.drive_file_id,item.reading_pdf_drive_file_id,item.kindle_drive_file_id].filter((v,i,a):v is string=>Boolean(v)&&a.indexOf(v)===i);
  for(const fileId of ids){try{await deleteDriveFile(fileId);}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Falha ao excluir arquivo."},{status:502});}}
  await admin.from("books").delete().eq("drive_file_id",item.drive_file_id);
  const {error:deleteError}=await admin.from("user_books").delete().eq("id",id);
  return deleteError?NextResponse.json({error:deleteError.message},{status:400}):NextResponse.json({ok:true});
}
