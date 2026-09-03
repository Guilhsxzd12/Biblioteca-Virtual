import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { fetchDriveFile } from "@/lib/google-drive";

function safeName(v:string){return v.replace(/[\r\n"\\/]/g,"-");}
function isPdf(name:string,mime:string){return mime==="application/pdf"||name.toLowerCase().endsWith(".pdf");}

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const v=await getApiViewer();
  if(!v.user||!v.profile||(v.profile.role!=="admin"&&!v.profile.approved))return NextResponse.json({error:"Acesso negado."},{status:403});
  const {id}=await params;
  const {data,error}=await v.supabase.from("user_books").select("drive_file_id,file_name,mime_type,reading_pdf_drive_file_id,reading_pdf_file_name").eq("id",id).maybeSingle();
  if(error||!data)return NextResponse.json({error:"Arquivo não encontrado."},{status:404});

  const wantsInline=request.nextUrl.searchParams.get("inline")==="1";
  let fileId=String(data.drive_file_id);
  let fileName=String(data.file_name);
  let mimeType=String(data.mime_type||"application/octet-stream");

  if(wantsInline&&!isPdf(fileName,mimeType)){
    if(!data.reading_pdf_drive_file_id)return NextResponse.json({error:"A versão PDF de leitura ainda não está disponível."},{status:409});
    fileId=String(data.reading_pdf_drive_file_id);
    fileName=String(data.reading_pdf_file_name||fileName.replace(/\.epub$/i,".pdf"));
    mimeType="application/pdf";
  }

  try{
    const upstream=await fetchDriveFile(fileId,request.headers.get("range"));
    const headers=new Headers();
    headers.set("content-type",upstream.headers.get("content-type")||mimeType||"application/octet-stream");
    const length=upstream.headers.get("content-length");if(length)headers.set("content-length",length);
    const contentRange=upstream.headers.get("content-range");if(contentRange)headers.set("content-range",contentRange);
    const acceptRanges=upstream.headers.get("accept-ranges");headers.set("accept-ranges",acceptRanges||"bytes");
    headers.set("content-disposition",`${wantsInline?"inline":"attachment"}; filename="${safeName(fileName)}"`);
    headers.set("cache-control","private, no-store");
    return new NextResponse(upstream.body,{status:upstream.status,headers});
  }catch(e){
    console.error("[user-book-file] failed",{id,message:e instanceof Error?e.message:String(e)});
    return NextResponse.json({error:e instanceof Error?e.message:"Falha ao ler arquivo."},{status:502});
  }
}
