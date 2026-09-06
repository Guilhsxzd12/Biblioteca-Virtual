import { NextRequest,NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { publishBookToTelegramChannels,resendWelcomeToTelegramChannels } from "@/lib/telegram-channels";
import { setupTelegramWebhook } from "@/lib/telegram";

export async function GET(){
  try{
    await requireAdmin();
    const db=createAdminSupabaseClient();
    const {data,error}=await db.from("telegram_channels").select("id,chat_id,title,role,active,welcome_sent_at,updated_at").order("role");
    if(error)throw new Error(error.message);
    return NextResponse.json({channels:data||[]});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Acesso negado."},{status:403});}
}

export async function POST(request:NextRequest){
  try{
    await requireAdmin();
    const body=await request.json().catch(()=>({}));
    const action=String(body.action||"");
    if(action==="publish_book"){
      const bookId=String(body.bookId||"").trim();if(!bookId)return NextResponse.json({error:"Livro obrigatório."},{status:400});
      const result=await publishBookToTelegramChannels(bookId);return NextResponse.json({ok:true,...result});
    }
    if(action==="welcome"){
      const result=await resendWelcomeToTelegramChannels();return NextResponse.json({ok:true,channels:result});
    }
    if(action==="sync"){
      const result=await setupTelegramWebhook();return NextResponse.json({ok:true,...result});
    }
    return NextResponse.json({error:"Ação inválida."},{status:400});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Falha no Telegram."},{status:400});}
}
