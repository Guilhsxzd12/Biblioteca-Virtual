import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { uploadCoverToDrive } from "@/lib/google-drive";

const MAX_COVER_SIZE=5*1024*1024;

export async function POST(request:NextRequest){
  const viewer=await getApiViewer();
  if(!viewer.user||viewer.profile?.role!=="admin")return NextResponse.json({error:"Acesso negado."},{status:403});

  try{
    const data=await request.formData();
    const file=data.get("file");
    if(!(file instanceof File)||!file.size)return NextResponse.json({error:"Selecione uma imagem de capa."},{status:400});
    if(!file.type.startsWith("image/"))return NextResponse.json({error:"A capa precisa ser uma imagem."},{status:400});
    if(file.size>MAX_COVER_SIZE)return NextResponse.json({error:"A capa pode ter no máximo 5 MB."},{status:400});

    const uploaded=await uploadCoverToDrive(file);
    return NextResponse.json({fileId:uploaded.id,coverUrl:`/api/covers/${encodeURIComponent(uploaded.id)}`});
  }catch(e){
    if(e instanceof Error&&e.message==="GOOGLE_DRIVE_NOT_CONNECTED")return NextResponse.json({error:"Google Drive ainda não conectado.",needsConnection:true},{status:409});
    return NextResponse.json({error:e instanceof Error?e.message:"Não foi possível enviar a capa."},{status:500});
  }
}
