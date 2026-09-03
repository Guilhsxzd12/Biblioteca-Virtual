import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { getCoverChoices,type KindleSource } from "@/lib/kindle-service";

export async function GET(request:NextRequest){
  const viewer=await getApiViewer();
  if(!viewer.user||!viewer.profile||(viewer.profile.role!=="admin"&&!viewer.profile.approved))return NextResponse.json({error:"Acesso negado."},{status:403});
  try{
    const source=String(request.nextUrl.searchParams.get("source")||"") as KindleSource;
    const id=String(request.nextUrl.searchParams.get("id")||"");
    if(!id||!["user","catalog"].includes(source))return NextResponse.json({error:"Livro inválido."},{status:400});
    const result=await getCoverChoices(viewer.supabase,source,id);
    return NextResponse.json({title:result.item.title,covers:result.covers});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível carregar as capas."},{status:500});
  }
}
