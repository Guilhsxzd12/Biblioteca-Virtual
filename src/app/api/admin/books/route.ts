import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { buildPdfFromEpub } from "@/lib/epub-pdf";
import { deleteDriveFile,fetchDriveFile,uploadUserReadingPdf } from "@/lib/google-drive";
import { slugifyTitle,driveLetter } from "@/lib/slugify";

async function admin(){
  const v=await getApiViewer();
  return v.user&&v.profile?.role==="admin"?v:null;
}

async function uniqueSlug(base:string,year:number|null,driveFileId:string){
  const db=createAdminSupabaseClient();
  const candidates=[base,year?`${base}-${year}`:"",`${base}-${driveFileId.slice(0,8).toLowerCase()}`].filter(Boolean);
  for(const slug of candidates){
    const {data}=await db.from("books").select("id").eq("slug",slug).maybeSingle();
    if(!data)return slug;
  }
  return `${base}-${Date.now()}`;
}

export async function POST(request:NextRequest){
  const v=await admin();
  if(!v)return NextResponse.json({error:"Acesso negado."},{status:403});

  let generatedPdfId:string|null=null;
  try{
    const b=await request.json();
    const title=String(b.title||"").trim();
    const author=String(b.author||"").trim();
    const description=String(b.description||"").trim();
    const language=String(b.language||"").trim().toLowerCase()||null;
    const driveFileId=String(b.driveFileId||"").trim();
    const fileName=String(b.fileName||"").trim();
    const requestedMime=String(b.mimeType||"").toLowerCase();
    const isPdf=requestedMime==="application/pdf"||fileName.toLowerCase().endsWith(".pdf");
    const isEpub=requestedMime==="application/epub+zip"||fileName.toLowerCase().endsWith(".epub");
    if(!title||!driveFileId||!fileName)return NextResponse.json({error:"Título e arquivo são obrigatórios."},{status:400});
    if(!author)return NextResponse.json({error:"Autor é obrigatório."},{status:400});
    if(!description)return NextResponse.json({error:"Sinopse é obrigatória."},{status:400});
    if(!isPdf&&!isEpub)return NextResponse.json({error:"Envie um arquivo PDF ou EPUB."},{status:400});

    const year=b.year?Number(b.year):null;
    let pages=b.pages?Number(b.pages):null;
    const baseSlug=slugifyTitle(title).toLowerCase()||"livro";
    const slug=await uniqueSlug(baseSlug,Number.isFinite(year)?year:null,driveFileId);
    const coverUrl=String(b.coverUrl||"").trim()||null;
    const now=new Date().toISOString();
    let readingPdfDriveFileId:string|null=null;
    let readingPdfFileName:string|null=null;
    let readingPdfGeneratedAt:string|null=null;
    let kindleDriveFileId:string|null=null;
    let kindleFileName:string|null=null;
    let kindleGeneratedAt:string|null=null;

    if(isEpub){
      const sourceResponse=await fetchDriveFile(driveFileId);
      const epubBytes=new Uint8Array(await sourceResponse.arrayBuffer());
      const generated=await buildPdfFromEpub(epubBytes,{title,author});
      readingPdfFileName=`${slugifyTitle(title)}.pdf`;
      const uploaded=await uploadUserReadingPdf(v.user.id,readingPdfFileName,generated.bytes);
      generatedPdfId=uploaded.id;
      readingPdfDriveFileId=uploaded.id;
      readingPdfGeneratedAt=now;
      kindleDriveFileId=driveFileId;
      kindleFileName=fileName;
      kindleGeneratedAt=now;
      pages=generated.pages;
    }

    const payload={
      title,
      slug,
      author,
      description,
      language,
      category_id:b.categoryId||null,
      year:Number.isFinite(year)?year:null,
      pages:Number.isFinite(pages)?pages:null,
      cover_url:coverUrl,
      drive_file_id:driveFileId,
      drive_folder_letter:driveLetter(title),
      file_name:fileName,
      mime_type:isPdf?"application/pdf":"application/epub+zip",
      reading_pdf_drive_file_id:readingPdfDriveFileId,
      reading_pdf_file_name:readingPdfFileName,
      reading_pdf_generated_at:readingPdfGeneratedAt,
      kindle_drive_file_id:kindleDriveFileId,
      kindle_file_name:kindleFileName,
      kindle_generated_at:kindleGeneratedAt,
      allow_download:Boolean(b.allowDownload),
      published:b.published!==false,
      updated_at:now
    };

    const db=createAdminSupabaseClient();
    const {data,error}=await db.from("books").insert(payload).select("*").single();
    if(error){
      if(generatedPdfId)try{await deleteDriveFile(generatedPdfId);}catch{}
      console.error("[admin-books] insert failed",{message:error.message,code:error.code});
      return NextResponse.json({error:error.message},{status:400});
    }
    return NextResponse.json({book:data});
  }catch(e){
    if(generatedPdfId)try{await deleteDriveFile(generatedPdfId);}catch{}
    console.error("[admin-books] unexpected failure",e instanceof Error?e.message:"unknown");
    return NextResponse.json({error:e instanceof Error?e.message:"Erro ao salvar livro."},{status:500});
  }
}

export async function DELETE(request:NextRequest){
  const v=await admin();
  if(!v)return NextResponse.json({error:"Acesso negado."},{status:403});
  const id=request.nextUrl.searchParams.get("id");
  if(!id)return NextResponse.json({error:"ID obrigatório."},{status:400});
  const db=createAdminSupabaseClient();
  const {error}=await db.from("books").delete().eq("id",id);
  return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({ok:true});
}
