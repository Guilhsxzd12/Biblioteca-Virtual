import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { ensureUserBookFormats } from "@/lib/book-formats";

export async function POST(request:NextRequest){
  const v=await getApiViewer();
  if(!v.user||!v.profile||(v.profile.role!=="admin"&&!v.profile.approved))return NextResponse.json({error:"Acesso negado."},{status:403});
  const b=await request.json();
  const title=String(b.title||"").trim();
  const author=String(b.author||"").trim();
  const description=String(b.description||"").trim();
  const fileName=String(b.fileName||"").trim();
  const mimeType=String(b.mimeType||"").trim().toLowerCase();
  const isPdf=mimeType==="application/pdf"||fileName.toLowerCase().endsWith(".pdf");
  const isEpub=mimeType==="application/epub+zip"||fileName.toLowerCase().endsWith(".epub");
  if(!isPdf&&!isEpub)return NextResponse.json({error:"Envie um arquivo PDF ou EPUB."},{status:400});
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
    mime_type:isPdf?"application/pdf":"application/epub+zip",
    source:"kindle",
    updated_at:new Date().toISOString()
  };
  if(!payload.title||!payload.drive_file_id||!payload.file_name)return NextResponse.json({error:"Título e arquivo são obrigatórios."},{status:400});
  if(!author)return NextResponse.json({error:"Autor é obrigatório."},{status:400});
  if(!description)return NextResponse.json({error:"Sinopse é obrigatória."},{status:400});
  const {data,error}=await v.supabase.from("user_books").insert(payload).select("*,categories(name)").single();
  if(error)return NextResponse.json({error:error.message},{status:400});
  let formatWarning:string|null=null;
  try{await ensureUserBookFormats(v.user.id,data.id);}catch(e){formatWarning=e instanceof Error?e.message:"Não foi possível preparar a versão de leitura automaticamente.";}
  const {data:book}=await v.supabase.from("user_books").select("*,categories(name)").eq("id",data.id).single();
  return NextResponse.json({book:book||data,formatWarning});
}
