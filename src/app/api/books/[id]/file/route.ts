import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { fetchDriveFile } from "@/lib/google-drive";
import { getSubscriptionState } from "@/lib/subscription";

function isPdf(name:string,mime:string){return mime==="application/pdf"||name.toLowerCase().endsWith(".pdf");}

export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){
  const v=await getApiViewer();
  if(!v.user||!v.profile||(!v.profile.approved&&v.profile.role!=="admin"))return NextResponse.json({error:"Acesso negado."},{status:403});
  if(v.profile.role!=="admin"){
    const subscription=await getSubscriptionState(v.user.id);
    if(!subscription.isActive)return NextResponse.json({error:"Assinatura inativa."},{status:403});
  }
  const {id}=await context.params;
  const {data:book}=await v.supabase.from("books").select("drive_file_id,file_name,mime_type,reading_pdf_drive_file_id,reading_pdf_file_name,kindle_drive_file_id,kindle_file_name,allow_download").eq("id",id).maybeSingle();
  if(!book)return NextResponse.json({error:"Livro não encontrado."},{status:404});

  if(!book.allow_download)return NextResponse.json({error:"Download não permitido para este livro."},{status:403});
  const format=request.nextUrl.searchParams.get("format")==="pdf"?"pdf":"epub";

  let fileId=String(book.drive_file_id);
  let fileName=String(book.file_name);
  let mimeType=String(book.mime_type||"application/octet-stream");

  if(format==="pdf"){
    if(!isPdf(fileName,mimeType)){
      if(!book.reading_pdf_drive_file_id)return NextResponse.json({error:"PDF indisponível."},{status:404});
      fileId=String(book.reading_pdf_drive_file_id);fileName=String(book.reading_pdf_file_name||`${book.file_name.replace(/\.epub$/i,"")}.pdf`);mimeType="application/pdf";
    }
  }else if(isPdf(fileName,mimeType)){
    if(!book.kindle_drive_file_id)return NextResponse.json({error:"EPUB indisponível."},{status:404});
    fileId=String(book.kindle_drive_file_id);fileName=String(book.kindle_file_name||`${book.file_name.replace(/\.pdf$/i,"")}.epub`);mimeType="application/epub+zip";
  }

  try{
    const dr=await fetchDriveFile(fileId,request.headers.get("range"));
    const h=new Headers();
    ["content-type","content-length","content-range","accept-ranges","etag"].forEach(n=>{const x=dr.headers.get(n);if(x)h.set(n,x);});
    h.set("content-type",mimeType||h.get("content-type")||"application/octet-stream");
    h.set("content-disposition",`attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    h.set("cache-control","private, no-store");
    return new NextResponse(dr.body,{status:dr.status,headers:h});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Erro ao abrir livro."},{status:502});
  }
}
