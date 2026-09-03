import { NextRequest,NextResponse } from "next/server";
import { randomUUID,timingSafeEqual } from "crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSubscriptionState } from "@/lib/subscription";
import { answerTelegramCallback,paymentKeyboard,paymentMessage,receiptUsername,sendTelegramMessage,telegramWebhookSecret } from "@/lib/telegram";
import { getSiteOrigin } from "@/lib/google-drive";

type TgUser={id:number;username?:string;first_name?:string};
type TgMessage={chat:{id:number;type?:string};from?:TgUser;text?:string};
type TgCallback={id:string;from:TgUser;data?:string;message?:{chat:{id:number}}};
type TgUpdate={message?:TgMessage;callback_query?:TgCallback};

function validSecret(value:string|null){
  if(!value)return false;const expected=telegramWebhookSecret();
  const a=Buffer.from(value);const b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);
}

async function sendLink(user:TgUser,chatId:number){
  const admin=createAdminSupabaseClient();
  await admin.from("telegram_link_codes").delete().eq("telegram_user_id",user.id).is("used_at",null);
  const code=randomUUID();
  const expiresAt=new Date(Date.now()+20*60*1000).toISOString();
  const {error}=await admin.from("telegram_link_codes").insert({code,telegram_user_id:user.id,chat_id:chatId,username:user.username||null,first_name:user.first_name||null,expires_at:expiresAt});
  if(error)throw new Error(error.message);
  const url=`${getSiteOrigin()}/telegram/vincular?code=${encodeURIComponent(code)}`;
  await sendTelegramMessage(chatId,"📚 <b>Biblioteca Virtual</b>\n\nPara usar o bot, vincule sua conta da Biblioteca Virtual. O link expira em 20 minutos.",{inline_keyboard:[[{text:"🔗 Vincular minha conta",url}]]});
}

async function showStatus(user:TgUser,chatId:number){
  const admin=createAdminSupabaseClient();
  const {data:account}=await admin.from("telegram_accounts").select("user_id").eq("telegram_user_id",user.id).maybeSingle();
  if(!account){await sendLink(user,chatId);return;}
  const [{data:profile},subscription]=await Promise.all([
    admin.from("profiles").select("approved,role,full_name").eq("id",account.user_id).maybeSingle(),
    getSubscriptionState(account.user_id)
  ]);
  if(profile?.role==="admin"){
    await sendTelegramMessage(chatId,"✅ <b>Conta de administrador vinculada.</b>\n\nVocê tem acesso administrativo à Biblioteca Virtual.",{inline_keyboard:[[{text:"📚 Abrir Biblioteca",url:`${getSiteOrigin()}/biblioteca`}]]});return;
  }
  if(!profile?.approved){
    await sendTelegramMessage(chatId,"⏳ Sua conta está vinculada, mas ainda aguarda liberação do administrador.\n\nSe já realizou o pagamento, envie o comprovante para <b>@"+receiptUsername()+"</b>.",paymentKeyboard());return;
  }
  if(!subscription.isActive){await sendTelegramMessage(chatId,paymentMessage(),paymentKeyboard());return;}
  const date=subscription.activeUntil?new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo"}).format(new Date(subscription.activeUntil)):"";
  await sendTelegramMessage(chatId,`✅ <b>Assinatura ativa</b>${date?` até <b>${date}</b>`:""}.\n\nVocê já pode acessar todos os recursos da Biblioteca Virtual.`,{inline_keyboard:[[{text:"📚 Abrir Biblioteca",url:`${getSiteOrigin()}/biblioteca`}],[{text:"📱 Kindle",url:`${getSiteOrigin()}/kindle`}]]});
}

export async function POST(request:NextRequest){
  try{
    if(!validSecret(request.headers.get("x-telegram-bot-api-secret-token")))return NextResponse.json({ok:false},{status:401});
    const update=await request.json() as TgUpdate;
    if(update.callback_query){
      const q=update.callback_query;const chatId=q.message?.chat.id;
      if(q.data==="subscription_paid"&&chatId){await answerTelegramCallback(q.id,"Comprovante necessário");await sendTelegramMessage(chatId,`✅ Depois do pagamento, envie o comprovante para <b>@${receiptUsername()}</b> e informe seu @ do Telegram. Assim que for confirmado, seu acesso será liberado por 30 dias.`);}
      else await answerTelegramCallback(q.id);
      return NextResponse.json({ok:true});
    }
    const message=update.message;const from=message?.from;const chatId=message?.chat.id;
    if(!message||!from||!chatId)return NextResponse.json({ok:true});
    const text=(message.text||"").trim().toLowerCase();
    if(text.startsWith("/start")||text.startsWith("/entrar")){await showStatus(from,chatId);return NextResponse.json({ok:true});}
    if(text.startsWith("/status")||text.startsWith("/assinatura")){await showStatus(from,chatId);return NextResponse.json({ok:true});}
    await showStatus(from,chatId);
    return NextResponse.json({ok:true});
  }catch(error){console.error("[telegram-webhook]",error);return NextResponse.json({ok:true});}
}

export async function GET(){return NextResponse.json({ok:true,service:"telegram-webhook"});}
