import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";

function validUploadUrl(raw:string){
  try{
    const u=new URL(raw);
    return u.protocol==="https:"&&u.hostname==="www.googleapis.com"&&u.pathname==="/upload/drive/v3/files"&&u.searchParams.get("uploadType")==="resumable"&&Boolean(u.searchParams.get("upload_id"));
  }catch{return false;}
}

export async function POST(request:NextRequest){
  const v=await getApiViewer();
  if(!v.user||!v.profile||(v.profile.role!=="admin"&&!v.profile.approved))return NextResponse.json({error:"Acesso negado."},{status:403});

  const uploadUrl=request.headers.get("x-drive-upload-url")||"";
  const start=Number(request.headers.get("x-upload-start")||"0");
  const total=Number(request.headers.get("x-upload-total")||"0");
  const mime=request.headers.get("x-upload-mime")||"application/octet-stream";
  if(!validUploadUrl(uploadUrl)||!Number.isFinite(start)||!Number.isFinite(total)||total<=0)return NextResponse.json({error:"Sessão de upload inválida."},{status:400});

  const bytes=await request.arrayBuffer();
  if(!bytes.byteLength||bytes.byteLength>3*1024*1024)return NextResponse.json({error:"Bloco de upload inválido."},{status:413});
  const end=start+bytes.byteLength-1;
  if(end>=total)return NextResponse.json({error:"Faixa de upload inválida."},{status:400});

  try{
    const response=await fetch(uploadUrl,{
      method:"PUT",
      headers:{
        "content-type":mime,
        "content-length":String(bytes.byteLength),
        "content-range":`bytes ${start}-${end}/${total}`
      },
      body:bytes,
      cache:"no-store"
    });

    if(response.status===308){
      return NextResponse.json({complete:false,range:response.headers.get("range")||null});
    }
    if(!response.ok){
      const text=await response.text();
      return NextResponse.json({error:`Google Drive recusou o bloco (${response.status}): ${text.slice(0,180)}`},{status:502});
    }
    const file=await response.json();
    return NextResponse.json({complete:true,file});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Falha ao enviar bloco ao Google Drive."},{status:502});
  }
}
