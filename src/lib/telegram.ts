import "server-only";
import { createHash } from "crypto";
import { getSiteOrigin } from "@/lib/google-drive";

function token(){const value=process.env.TELEGRAM_BOT_TOKEN?.trim();if(!value)throw new Error("TELEGRAM_BOT_TOKEN não configurado.");return value;}
export function telegramWebhookSecret(){return createHash("sha256").update(`${token()}|${getSiteOrigin()}`).digest("hex");}

async function telegramApi<T>(method:string,body:Record<string,unknown>={}){
  const response=await fetch(`https://api.telegram.org/bot${token()}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
  const data=await response.json() as {ok:boolean;result?:T;description?:string};
  if(!response.ok||!data.ok)throw new Error(data.description||`Telegram ${method} falhou.`);
  return data.result as T;
}

export async function sendTelegramMessage(chatId:number|string,text:string,replyMarkup?:Record<string,unknown>){
  return telegramApi("sendMessage",{chat_id:chatId,text,parse_mode:"HTML",disable_web_page_preview:true,...(replyMarkup?{reply_markup:replyMarkup}:{})});
}

export async function answerTelegramCallback(id:string,text?:string){return telegramApi("answerCallbackQuery",{callback_query_id:id,...(text?{text}:{})});}

export async function getTelegramBot(){return telegramApi<{id:number;username?:string;first_name:string}>("getMe");}

export async function setupTelegramWebhook(){
  const url=`${getSiteOrigin()}/api/telegram/webhook`;
  await telegramApi("setWebhook",{url,secret_token:telegramWebhookSecret(),allowed_updates:["message","callback_query"],drop_pending_updates:false});
  await telegramApi("setMyCommands",{commands:[{command:"start",description:"Abrir a Biblioteca Virtual"},{command:"status",description:"Ver minha assinatura"},{command:"assinatura",description:"Ver pagamento e renovação"}]});
  return {url,bot:await getTelegramBot()};
}

export function paymentUrl(){return process.env.SUBSCRIPTION_PAYMENT_URL?.trim()||"";}
export function receiptUsername(){return (process.env.PAYMENT_RECEIPT_USERNAME?.trim()||"guilh2026").replace(/^@/,"");}

export function paymentMessage(){
  const user=receiptUsername();
  return `💳 <b>Assinatura Biblioteca Virtual — R$ 8,90/mês</b>\n\nPague pelo link abaixo.\n\nDepois do pagamento, envie o comprovante para <b>@${user}</b> e informe seu @ do Telegram.\n\nAssim que o pagamento for confirmado, seu acesso será liberado por <b>30 dias</b>.`;
}

export function paymentKeyboard(){
  const rows:Array<Array<Record<string,string>>> = [];
  const url=paymentUrl();if(url)rows.push([{text:"💳 Pagar assinatura",url}]);
  rows.push([{text:"✅ Já paguei",callback_data:"subscription_paid"}]);
  return {inline_keyboard:rows};
}
