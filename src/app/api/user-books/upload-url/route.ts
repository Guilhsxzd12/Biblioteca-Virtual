import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { createUserBookResumableUpload } from "@/lib/google-drive";
import { driveFileName } from "@/lib/slugify";

export async function POST(request:NextRequest){
  const v=await getApiViewer();
  if(!v.user||!v.profile||(v.profile.role!=="admin"&&!v.profile.approved))return NextResponse.json({error:"Acesso negado."},{status:403});
  const b=await request.json();
  const title=String(b.title||"").trim();
  const original=String(b.originalFileName||"livro.epub");
  const mime=String(b.mimeType||"application/epub+zip");
  const size=Number(b.fileSize||0);
  if(!title||!size)return NextResponse.json({error:"Título e arquivo são obrigatórios."},{status:400});
  if(size>200*1024*1024)return NextResponse.json({error:"O arquivo ultrapassa 200 MB, que é o limite do Send to Kindle."},{status:400});
  const fileName=driveFileName(title,original);
  try{
    const {uploadUrl}=await createUserBookResumableUpload({userId:v.user.id,fileName,mimeType:mime,fileSize:size});
    return NextResponse.json({uploadUrl,fileName});
  }catch(e){
    if(e instanceof Error&&e.message==="GOOGLE_DRIVE_NOT_CONNECTED")return NextResponse.json({error:"Google Drive ainda não conectado."},{status:409});
    return NextResponse.json({error:e instanceof Error?e.message:"Falha no Google Drive."},{status:503});
  }
}
