import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

async function isAdmin(){const v=await getApiViewer();return Boolean(v.user&&v.profile?.role==="admin");}
function lang(value:unknown){return String(value||"").trim().toLowerCase().replace(/_/g,"-").slice(0,12);}

export async function GET(request:NextRequest){
  if(!await isAdmin())return NextResponse.json({error:"Acesso negado."},{status:403});
  const bookId=request.nextUrl.searchParams.get("bookId")?.trim();if(!bookId)return NextResponse.json({error:"Livro obrigatório."},{status:400});
  const {data,error}=await createAdminSupabaseClient().from("book_language_files").select("*").eq("book_id",bookId).order("language").order("format");
  return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({files:data||[]});
}

export async function POST(request:NextRequest){
  if(!await isAdmin())return NextResponse.json({error:"Acesso negado."},{status:403});
  try{
    const body=await request.json();const bookId=String(body.bookId||"").trim();const language=lang(body.language);const format=String(body.format||"").toLowerCase();const driveFileId=String(body.driveFileId||"").trim();const fileName=String(body.fileName||"").trim();
    if(!bookId||language.length<2||!["epub","pdf"].includes(format)||!driveFileId||!fileName)return NextResponse.json({error:"Livro, idioma e arquivo são obrigatórios."},{status:400});
    const mimeType=format==="pdf"?"application/pdf":"application/epub+zip";const now=new Date().toISOString();
    const db=createAdminSupabaseClient();const {data,error}=await db.from("book_language_files").upsert({book_id:bookId,language,format,drive_file_id:driveFileId,file_name:fileName,mime_type:mimeType,updated_at:now},{onConflict:"book_id,language,format"}).select("*").single();
    return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({file:data});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Erro ao salvar arquivo."},{status:400});}
}

export async function DELETE(request:NextRequest){
  if(!await isAdmin())return NextResponse.json({error:"Acesso negado."},{status:403});
  const id=request.nextUrl.searchParams.get("id")?.trim();if(!id)return NextResponse.json({error:"Arquivo obrigatório."},{status:400});
  const {error}=await createAdminSupabaseClient().from("book_language_files").delete().eq("id",id);
  return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({ok:true});
}
