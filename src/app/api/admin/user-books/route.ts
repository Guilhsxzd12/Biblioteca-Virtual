import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { driveLetter,slugifyTitle } from "@/lib/slugify";

export async function PATCH(request:NextRequest){
  const viewer=await getApiViewer();
  if(!viewer.user||viewer.profile?.role!=="admin")return NextResponse.json({error:"Acesso negado."},{status:403});
  const body=await request.json();
  const id=String(body.id||"");
  const status=String(body.status||"");
  if(!id||!["pending","private","catalog"].includes(status))return NextResponse.json({error:"Status inválido."},{status:400});

  const admin=createAdminSupabaseClient();
  const {data:item,error:readError}=await admin.from("user_books").select("*").eq("id",id).single();
  if(readError||!item)return NextResponse.json({error:readError?.message||"Envio não encontrado."},{status:404});

  if(status==="catalog"){
    const {data:existing}=await admin.from("books").select("id").eq("drive_file_id",item.drive_file_id).maybeSingle();
    if(!existing){
      const slug=`${slugifyTitle(item.title).toLowerCase()}-${String(item.id).slice(0,8)}`;
      const {error:bookError}=await admin.from("books").insert({
        title:item.title,
        slug,
        author:item.author||"Autor não informado",
        description:item.description||null,
        category_id:item.category_id||null,
        year:item.year||null,
        pages:item.pages||null,
        cover_url:item.cover_url||null,
        drive_file_id:item.drive_file_id,
        drive_folder_letter:driveLetter(item.title),
        file_name:item.file_name,
        mime_type:item.mime_type||"application/epub+zip",
        allow_download:true,
        published:true,
        updated_at:new Date().toISOString()
      });
      if(bookError)return NextResponse.json({error:bookError.message},{status:400});
    }
  }else{
    await admin.from("books").delete().eq("drive_file_id",item.drive_file_id);
  }

  const {data,error}=await admin.from("user_books").update({
    moderation_status:status,
    moderated_at:new Date().toISOString(),
    moderated_by:viewer.user.id,
    updated_at:new Date().toISOString()
  }).eq("id",id).select("*,categories(name)").single();
  return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({book:data});
}
