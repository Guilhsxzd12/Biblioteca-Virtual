import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { uploadUserCoverToDrive } from "@/lib/google-drive";

export async function POST(request:NextRequest){
  const v=await getApiViewer();
  if(!v.user||!v.profile||(v.profile.role!=="admin"&&!v.profile.approved))return NextResponse.json({error:"Acesso negado."},{status:403});
  try{
    const form=await request.formData();
    const file=form.get("file");
    if(!(file instanceof File)||!file.size)return NextResponse.json({error:"Capa obrigatória."},{status:400});
    if(file.size>10*1024*1024)return NextResponse.json({error:"A capa deve ter no máximo 10 MB."},{status:400});
    if(!/^image\/(jpeg|png|webp|gif)$/i.test(file.type))return NextResponse.json({error:"Formato de capa não suportado."},{status:400});
    const uploaded=await uploadUserCoverToDrive(file,v.user.id);
    return NextResponse.json({coverUrl:`/api/covers/${encodeURIComponent(uploaded.id)}`,fileId:uploaded.id});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Erro ao enviar capa."},{status:500});
  }
}
