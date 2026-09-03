import "server-only";
import { createHash } from "crypto";
import { getSiteOrigin } from "@/lib/google-drive";

export const TELEGRAM_MAX_INCOMING_BYTES=20*1024*1024;
export const TELEGRAM_MAX_OUTGOING_BYTES=50*1024*1024;

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

export async function sendTelegramDocument(chatId:number|string,fileName:string,mimeType:string,bytes:Uint8Array,caption?:string){
  if(bytes.byteLength>TELEGRAM_MAX_OUTGOING_BYTES)throw new Error("Este arquivo ultrapassa o limite de envio do Telegram.");
  const form=new FormData();form.set("chat_id",String(chatId));
  const arrayBuffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
  form.set("document",new Blob([arrayBuffer],{type:mimeType||"application/octet-stream"}),fileName||"livro");
  if(caption){form.set("caption",caption);form.set("parse_mode","HTML");}
  const response=await fetch(`https://api.telegram.org/bot${token()}/sendDocument`,{method:"POST",body:form,cache:"no-store"});
  const data=await response.json() as {ok:boolean;result?:unknown;description?:string};
  if(!response.ok||!data.ok)throw new Error(data.description||"Telegram sendDocument falhou.");
  return data.result;
}

export async function getTelegramFile(fileId:string){
  const file=await telegramApi<{file_id:string;file_path?:string;file_size?:number}>("getFile",{file_id:fileId});
  if(!file.file_path)throw new Error("Telegram não retornou o caminho do arquivo.");
  if(file.file_size&&file.file_size>TELEGRAM_MAX_INCOMING_BYTES)throw new Error("O arquivo é maior do que o bot consegue receber pelo Telegram.");
  const response=await fetch(`https://api.telegram.org/file/bot${token()}/${file.file_path}`,{cache:"no-store"});
  if(!response.ok)throw new Error(`Não foi possível baixar o arquivo recebido (${response.status}).`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.byteLength>TELEGRAM_MAX_INCOMING_BYTES)throw new Error("O arquivo é maior do que o bot consegue receber pelo Telegram.");
  return {bytes,filePath:file.file_path,fileSize:file.file_size||bytes.byteLength};
}

export async function answerTelegramCallback(id:string,text?:string){return telegramApi("answerCallbackQuery",{callback_query_id:id,...(text?{text}:{})});}
export async function getTelegramBot(){return telegramApi<{id:number;username?:string;first_name:string}>("getMe");}

export async function setupTelegramWebhook(){
  const url=`${getSiteOrigin()}/api/telegram/webhook`;
  await telegramApi("setWebhook",{url,secret_token:telegramWebhookSecret(),allowed_updates:["message","callback_query"],drop_pending_updates:false});
  await telegramApi("setMyCommands",{commands:[
    {command:"start",description:"Abrir a Biblioteca Virtual"},
    {command:"menu",description:"Abrir o menu principal"},
    {command:"baixar",description:"Pesquisar e baixar um livro"},
    {command:"enviar",description:"Enviar PDF ou EPUB para a biblioteca"},
    {command:"historico",description:"Ver livros baixados pelo bot"},
    {command:"envios",description:"Ver e editar meus livros enviados"},
    {command:"assinatura",description:"Consultar minha assinatura"}
  ]});
  return {url,bot:await getTelegramBot()};
}

export function telegramMainKeyboard(){
  return {inline_keyboard:[
    [{text:"🔎 BAIXAR",callback_data:"action_download"},{text:"➕ ENVIAR",callback_data:"action_upload"}],
    [{text:"🕘 HISTÓRICO",callback_data:"show_history"},{text:"📤 MEUS ENVIOS",callback_data:"show_uploads"}],
    [{text:"💳 MINHA ASSINATURA",callback_data:"show_subscription"}],
    [{text:"🌐 ABRIR BIBLIOTECA",url:`${getSiteOrigin()}/biblioteca`}]
  ]};
}

export function telegramBackToMenuKeyboard(){return {inline_keyboard:[[{text:"↩️ Voltar ao menu",callback_data:"show_menu"}]]};}
export function paymentUrl(){return process.env.SUBSCRIPTION_PAYMENT_URL?.trim()||"";}
export function receiptUsername(){return (process.env.PAYMENT_RECEIPT_USERNAME?.trim()||"guilh2026").replace(/^@/,"");}

export function paymentMessage(){
  const user=receiptUsername();
  return `📚 <b>Biblioteca Virtual</b>\n\nSua assinatura ainda não está ativa.\n\n💳 <b>Plano mensal: R$ 8,90</b>\n📅 <b>Duração: 30 dias</b>\n\n1️⃣ Faça o pagamento pelo botão abaixo.\n2️⃣ Envie o comprovante para <b>@${user}</b>.\n3️⃣ Depois da confirmação manual, seu acesso a downloads e envios será liberado por 30 dias.\n\nSe você já pagou, toque em <b>Já paguei</b>.`;
}

export function paymentKeyboard(){
  const rows:Array<Array<Record<string,string>>> = [];
  const url=paymentUrl();if(url)rows.push([{text:"💳 PAGAR ASSINATURA",url}]);
  rows.push([{text:"✅ JÁ PAGUEI",callback_data:"subscription_paid"}]);
  return {inline_keyboard:rows};
}
