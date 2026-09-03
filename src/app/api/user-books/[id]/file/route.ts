import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { fetchDriveFile } from "@/lib/google-drive";

function safeName(v:string){return v.replace(/[\r\n"\\/]/g,"-");}

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const v=await getApiViewer();
  if(!v.user||!v.profile||(v.profile.role!=="admin"&&!v.profile.approved))return NextResponse.json({error:"Acesso negado."},{status:403});
  const {id}=await params;
  const {data,error}=await v.supabase.from("user_books").select("drive_file_id,file_name,mime_type").eq("id",id).maybeSingle();
  if(error||!data)return NextResponse.json({error:"Arquivo não encontrado."},{status:404});
  try{
    const range=request.headers.get("range");
    const upstream=await fetchDriveFile(data.drive_file_id,range);
    const headers=new Headers();
    headers.set("content-type",upstream.headers.get("content-type")||data.mime_type||"application/octet-stream");
    const length=upstream.headers.get("content-length");if(length)headers.set("content-length",length);
    const contentRange=upstream.headers.get("content-range");if(contentRange)headers.set("content-range",contentRange);
    const acceptRanges=upstream.headers.get("accept-ranges");headers.set("accept-ranges",acceptRanges||"bytes");
    const inline=request.nextUrl.searchParams.get("inline")==="1"&&(data.mime_type==="application/pdf"||data.file_name.toLowerCase().endsWith(".pdf"));
    headers.set("content-disposition",`${inline?"inline":"attachment"}; filename="${safeName(data.file_name)}"`);
    headers.set("cache-control","private, no-store");
    return new NextResponse(upstream.body,{status:upstream.status,headers});
  }catch(e){
    console.error("[user-book-file] failed",{id,message:e instanceof Error?e.message:String(e)});
    return NextResponse.json({error:e instanceof Error?e.message:"Falha ao ler arquivo."},{status:502});
  }
}
