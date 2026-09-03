import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
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

  try{
    const b=await request.json();
    const title=String(b.title||"").trim();
    const driveFileId=String(b.driveFileId||"").trim();
    const fileName=String(b.fileName||"").trim();
    if(!title||!driveFileId||!fileName)return NextResponse.json({error:"Título e arquivo são obrigatórios."},{status:400});

    const year=b.year?Number(b.year):null;
    const pages=b.pages?Number(b.pages):null;
    const baseSlug=slugifyTitle(title).toLowerCase()||"livro";
    const slug=await uniqueSlug(baseSlug,Number.isFinite(year)?year:null,driveFileId);
    const description=String(b.description||"").trim()||null;
    const coverUrl=String(b.coverUrl||"").trim()||null;

    const payload={
      title,
      slug,
      author:String(b.author||"").trim()||"Autor não informado",
      description,
      category_id:b.categoryId||null,
      year:Number.isFinite(year)?year:null,
      pages:Number.isFinite(pages)?pages:null,
      cover_url:coverUrl,
      drive_file_id:driveFileId,
      drive_folder_letter:driveLetter(title),
      file_name:fileName,
      mime_type:String(b.mimeType||"application/pdf"),
      allow_download:Boolean(b.allowDownload),
      published:b.published!==false,
      updated_at:new Date().toISOString()
    };

    const db=createAdminSupabaseClient();
    const {data,error}=await db.from("books").insert(payload).select("*").single();
    if(error){
      console.error("[admin-books] insert failed",{message:error.message,code:error.code});
      return NextResponse.json({error:error.message},{status:400});
    }
    return NextResponse.json({book:data});
  }catch(e){
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
