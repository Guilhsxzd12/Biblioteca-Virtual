import { NextRequest,NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { publishBookToTelegramChannels,registerTelegramChannel,resendWelcomeToTelegramChannels,type ChannelRole } from "@/lib/telegram-channels";
import { getTelegramChat,getTelegramWebhookInfo,setupTelegramWebhook,PUBLIC_SITE_URL } from "@/lib/telegram";

export async function GET(){
  try{
    await requireAdmin();
    const db=createAdminSupabaseClient();
    const [{data,error},webhookInfo]=await Promise.all([
      db.from("telegram_channels").select("id,chat_id,title,role,active,welcome_sent_at,updated_at").order("role"),
      getTelegramWebhookInfo()
    ]);
    if(error)throw new Error(error.message);
    const expected=`${PUBLIC_SITE_URL}/api/telegram/webhook`;
    return NextResponse.json({channels:data||[],webhookInfo,healthy:webhookInfo.url===expected&&!webhookInfo.last_error_message,expectedWebhook:expected});
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
    if(action==="register"){
      const target=String(body.target||"").trim();
      const role=(body.role==="official"||body.role==="reserve")?body.role as ChannelRole:null;
      if(!target)return NextResponse.json({error:"Informe @usuario-do-canal, link público ou ID do canal."},{status:400});
      let lookup:string|number=target;
      const usernameMatch=target.match(/(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]+)/i);
      if(usernameMatch)lookup=`@${usernameMatch[1]}`;
      else if(/^-?\d+$/.test(target))lookup=Number(target);
      else if(!target.startsWith("@"))lookup=`@${target}`;
      const chat=await getTelegramChat(lookup);
      if(chat.type!=="channel"&&chat.type!=="supergroup")return NextResponse.json({error:"O destino informado não é um canal ou supergrupo."},{status:400});
      const registered=await registerTelegramChannel(chat,role,true);
      return NextResponse.json({ok:true,channel:registered});
    }
    return NextResponse.json({error:"Ação inválida."},{status:400});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Falha no Telegram."},{status:400});}
}
