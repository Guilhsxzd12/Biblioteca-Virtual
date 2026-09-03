import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";

export async function POST(request:NextRequest){
  const v=await getApiViewer();
  if(!v.user||!v.profile||(v.profile.role!=="admin"&&!v.profile.approved))return NextResponse.json({error:"Acesso negado."},{status:403});
  const b=await request.json();
  const title=String(b.title||"").trim();
  const author=String(b.author||"").trim();
  const description=String(b.description||"").trim();
  const fileName=String(b.fileName||"").trim();
  const mimeType=String(b.mimeType||"").trim().toLowerCase();
  const isEpub=mimeType==="application/epub+zip"||fileName.toLowerCase().endsWith(".epub");
  if(!isEpub)return NextResponse.json({error:"Envie o arquivo original em EPUB."},{status:400});
  const payload={
    user_id:v.user.id,
    title,
    author,
    description,
    language:String(b.language||"").trim().toLowerCase()||null,
    year:b.year?Number(b.year):null,
    pages:b.pages?Number(b.pages):null,
    category_id:b.categoryId||null,
    cover_url:String(b.coverUrl||"").trim()||null,
    drive_file_id:String(b.driveFileId||"").trim(),
    file_name:fileName,
    mime_type:"application/epub+zip",
    source:"kindle",
    moderation_status:"pending",
    kindle_drive_file_id:null,
    kindle_file_name:null,
    kindle_generated_at:null,
    updated_at:new Date().toISOString()
  };
  if(!payload.title||!payload.drive_file_id||!payload.file_name)return NextResponse.json({error:"Título e EPUB são obrigatórios."},{status:400});
  if(!author)return NextResponse.json({error:"Autor é obrigatório."},{status:400});
  if(!description)return NextResponse.json({error:"Sinopse é obrigatória."},{status:400});
  if(!payload.cover_url)return NextResponse.json({error:"Adicione uma capa ao livro."},{status:400});
  const {data,error}=await v.supabase.from("user_books").insert(payload).select("*,categories(name)").single();
  return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({book:data});
}
