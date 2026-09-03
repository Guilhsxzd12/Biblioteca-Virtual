import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { ensureKindleVersion,type KindleSource } from "@/lib/kindle-service";

export const maxDuration=300;

export async function POST(request:NextRequest){
  const viewer=await getApiViewer();
  if(!viewer.user||!viewer.profile||(viewer.profile.role!=="admin"&&!viewer.profile.approved))return NextResponse.json({error:"Acesso negado."},{status:403});
  try{
    const body=await request.json();
    const source=String(body.source||"") as KindleSource;
    const id=String(body.id||"");
    if(!id||!["user","catalog"].includes(source))return NextResponse.json({error:"Livro inválido."},{status:400});
    const result=await ensureKindleVersion(viewer.supabase,viewer.user.id,source,id);
    return NextResponse.json({ok:true,fileName:result.fileName,generated:result.generated});
  }catch(error){
    console.error("[kindle-generate] failed",{message:error instanceof Error?error.message:String(error)});
    return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível gerar o EPUB."},{status:500});
  }
}
