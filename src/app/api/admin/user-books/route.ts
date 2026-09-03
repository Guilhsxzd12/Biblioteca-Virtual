import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ensureUserBookFormats,hasPdfAndEpub } from "@/lib/book-formats";
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
    try{item=await ensureUserBookFormats(item.user_id,id);}catch(error){return NextResponse.json({error:error instanceof Error?`Não foi possível preparar PDF e EPUB: ${error.message}`:"Não foi possível preparar os dois formatos."},{status:400});}
    if(!hasPdfAndEpub(item))return NextResponse.json({error:"O envio precisa ter as versões PDF e EPUB antes de entrar no catálogo."},{status:400});
    if(!String(item.author||"").trim()||!String(item.description||"").trim())return NextResponse.json({error:"Autor e sinopse são obrigatórios antes de aprovar para o catálogo."},{status:400});
    const {data:existing}=await admin.from("books").select("id").eq("drive_file_id",item.drive_file_id).maybeSingle();
    if(!existing){
      const slug=`${slugifyTitle(item.title).toLowerCase()}-${String(item.id).slice(0,8)}`;
      const {error:bookError}=await admin.from("books").insert({
        title:item.title,slug,author:item.author,description:item.description,language:item.language||null,category_id:item.category_id||null,year:item.year||null,pages:item.pages||null,cover_url:item.cover_url||null,
        drive_file_id:item.drive_file_id,drive_folder_letter:driveLetter(item.title),file_name:item.file_name,mime_type:"application/pdf",
        kindle_drive_file_id:item.kindle_drive_file_id,kindle_file_name:item.kindle_file_name,kindle_generated_at:item.kindle_generated_at||new Date().toISOString(),
        allow_download:true,published:true,updated_at:new Date().toISOString()
      });
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
  const {data:item,error}=await admin.from("user_books").select("drive_file_id,kindle_drive_file_id").eq("id",id).maybeSingle();
  if(error)return NextResponse.json({error:error.message},{status:400});
  if(!item)return NextResponse.json({ok:true});
  const ids=[item.drive_file_id,item.kindle_drive_file_id].filter((v,i,a):v is string=>Boolean(v)&&a.indexOf(v)===i);
  for(const fileId of ids){try{await deleteDriveFile(fileId);}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Falha ao excluir arquivo do Drive."},{status:502});}}
  await admin.from("books").delete().eq("drive_file_id",item.drive_file_id);
  const {error:deleteError}=await admin.from("user_books").delete().eq("id",id);
  return deleteError?NextResponse.json({error:deleteError.message},{status:400}):NextResponse.json({ok:true});
}
