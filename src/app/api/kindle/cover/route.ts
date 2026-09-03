import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { getSubscriptionState } from "@/lib/subscription";
import { uploadUserCoverToDrive } from "@/lib/google-drive";

export const maxDuration=120;

export async function POST(request:NextRequest){
  const viewer=await getApiViewer();
  if(!viewer.user||!viewer.profile)return NextResponse.json({error:"Faça login para continuar."},{status:401});
  if(viewer.profile.role!=="admin"){
    if(!viewer.profile.approved)return NextResponse.json({error:"Sua conta ainda não está liberada."},{status:403});
    const subscription=await getSubscriptionState(viewer.user.id);
    if(!subscription.isActive)return NextResponse.json({error:"Sua assinatura não está ativa."},{status:403});
  }
  try{
    const form=await request.formData();
    const file=form.get("file");
    if(!(file instanceof File))return NextResponse.json({error:"Escolha uma imagem para a capa."},{status:400});
    if(!/^image\/(jpeg|png|webp)$/i.test(file.type))return NextResponse.json({error:"A capa deve ser JPG, PNG ou WEBP."},{status:400});
    if(file.size>10*1024*1024)return NextResponse.json({error:"A capa deve ter no máximo 10 MB."},{status:400});
    const uploaded=await uploadUserCoverToDrive(file,viewer.user.id);
    return NextResponse.json({coverUrl:`/api/covers/${encodeURIComponent(uploaded.id)}`});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível preparar a capa."},{status:500});
  }
}
