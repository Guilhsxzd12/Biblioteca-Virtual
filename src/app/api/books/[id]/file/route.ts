import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { fetchDriveFile } from "@/lib/google-drive";

function isPdf(name:string,mime:string){return mime==="application/pdf"||name.toLowerCase().endsWith(".pdf");}

export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){
  const v=await getApiViewer();
  if(!v.user||!v.profile||(!v.profile.approved&&v.profile.role!=="admin"))return NextResponse.json({error:"Acesso negado."},{status:403});
  const {id}=await context.params;
  const {data:book}=await v.supabase.from("books").select("drive_file_id,file_name,mime_type,reading_pdf_drive_file_id,reading_pdf_file_name,allow_download").eq("id",id).maybeSingle();
  if(!book)return NextResponse.json({error:"Livro não encontrado."},{status:404});

  const wantsDownload=request.nextUrl.searchParams.get("download")==="1";
  if(wantsDownload&&!book.allow_download)return NextResponse.json({error:"Download não permitido para este livro."},{status:403});

  let fileId=String(book.drive_file_id);
  let fileName=String(book.file_name);
  let mimeType=String(book.mime_type||"application/octet-stream");

  if(!wantsDownload&&!isPdf(fileName,mimeType)){
    if(!book.reading_pdf_drive_file_id)return NextResponse.json({error:"A versão de leitura ainda não está pronta."},{status:409});
    fileId=String(book.reading_pdf_drive_file_id);
    fileName=String(book.reading_pdf_file_name||`${book.file_name.replace(/\.epub$/i,"")}.pdf`);
    mimeType="application/pdf";
  }

  try{
    const dr=await fetchDriveFile(fileId,request.headers.get("range"));
    const h=new Headers();
    ["content-type","content-length","content-range","accept-ranges","etag"].forEach(n=>{const x=dr.headers.get(n);if(x)h.set(n,x);});
    h.set("content-type",mimeType||h.get("content-type")||"application/octet-stream");
    h.set("content-disposition",`${wantsDownload?"attachment":"inline"}; filename="${encodeURIComponent(fileName)}"`);
    h.set("cache-control","private, no-store");
    return new NextResponse(dr.body,{status:dr.status,headers:h});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Erro ao abrir livro."},{status:502});
  }
}
