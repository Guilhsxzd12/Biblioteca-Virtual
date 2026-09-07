import { NextRequest,NextResponse } from "next/server";
import { publishBookToTelegramChannels } from "@/lib/telegram-channels";

function authorized(request:NextRequest){
  const expected=process.env.SUPABASE_SERVICE_ROLE_KEY||"";
  const auth=request.headers.get("authorization")||"";
  return Boolean(expected)&&auth===`Bearer ${expected}`;
}

export async function POST(request:NextRequest){
  if(!authorized(request))return NextResponse.json({error:"Acesso negado."},{status:403});
  try{
    const body=await request.json().catch(()=>({}));
    const bookId=String(body.bookId||"").trim();
    if(!bookId)return NextResponse.json({error:"Livro obrigatório."},{status:400});
    const result=await publishBookToTelegramChannels(bookId,false);
    return NextResponse.json({ok:true,...result});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Falha no Telegram."},{status:400});
  }
}
