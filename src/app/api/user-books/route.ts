import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";

export async function POST(request:NextRequest){
  const v=await getApiViewer();
  if(!v.user||!v.profile||(v.profile.role!=="admin"&&!v.profile.approved))return NextResponse.json({error:"Acesso negado."},{status:403});
  const b=await request.json();
  const payload={
    user_id:v.user.id,
    title:String(b.title||"").trim(),
    author:String(b.author||"").trim()||"Autor não informado",
    description:String(b.description||"").trim()||null,
    year:b.year?Number(b.year):null,
    pages:b.pages?Number(b.pages):null,
    category_id:b.categoryId||null,
    cover_url:String(b.coverUrl||"").trim()||null,
    drive_file_id:String(b.driveFileId||"").trim(),
    file_name:String(b.fileName||"").trim(),
    mime_type:String(b.mimeType||"application/epub+zip"),
    source:"kindle",
    updated_at:new Date().toISOString()
  };
  if(!payload.title||!payload.drive_file_id||!payload.file_name)return NextResponse.json({error:"Título e arquivo são obrigatórios."},{status:400});
  const {data,error}=await v.supabase.from("user_books").insert(payload).select("*,categories(name)").single();
  return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({book:data});
}
