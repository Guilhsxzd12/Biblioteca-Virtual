import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { prepareKindleBytes,type KindleSource } from "@/lib/kindle-service";

export const maxDuration=300;

function safeName(value:string){return value.replace(/[\r\n"\\/]/g,"-");}

export async function POST(request:NextRequest){
  const viewer=await getApiViewer();
  if(!viewer.user||!viewer.profile||(viewer.profile.role!=="admin"&&!viewer.profile.approved))return NextResponse.json({error:"Acesso negado."},{status:403});
  try{
    const body=await request.json();
    const source=String(body.source||"") as KindleSource;
    const id=String(body.id||"");
    const coverUrl=body.coverUrl?String(body.coverUrl):null;
    if(!id||!["user","catalog"].includes(source))return NextResponse.json({error:"Livro inválido."},{status:400});
    const result=await prepareKindleBytes(viewer.supabase,viewer.user.id,source,id,coverUrl);
    const blob=new Blob([result.bytes],{type:"application/epub+zip"});
    return new NextResponse(blob,{status:200,headers:{"content-type":"application/epub+zip","content-disposition":`attachment; filename="${safeName(result.fileName)}"`,"cache-control":"private, no-store","x-book-title":encodeURIComponent(result.title)}});
  }catch(error){
    console.error("[kindle-prepare] failed",{message:error instanceof Error?error.message:String(error)});
    return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível preparar o EPUB."},{status:500});
  }
}
