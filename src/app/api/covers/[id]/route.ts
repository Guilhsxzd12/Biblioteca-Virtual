import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { fetchDriveFile } from "@/lib/google-drive";

export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const viewer=await getApiViewer();
  if(!viewer.user||!viewer.profile||(viewer.profile.role!=="admin"&&!viewer.profile.approved))return NextResponse.json({error:"Acesso negado."},{status:403});

  const {id}=await params;
  if(!id)return NextResponse.json({error:"Capa inválida."},{status:400});

  try{
    const upstream=await fetchDriveFile(id);
    const headers=new Headers();
    headers.set("content-type",upstream.headers.get("content-type")||"image/jpeg");
    headers.set("cache-control","private, max-age=3600");
    const length=upstream.headers.get("content-length");
    if(length)headers.set("content-length",length);
    return new NextResponse(upstream.body,{status:upstream.status,headers});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Não foi possível carregar a capa."},{status:404});
  }
}
