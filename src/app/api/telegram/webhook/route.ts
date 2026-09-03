import { NextRequest,NextResponse } from "next/server";
import { randomUUID,timingSafeEqual } from "crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSubscriptionState } from "@/lib/subscription";
import {
  TELEGRAM_MAX_INCOMING_BYTES,
  TELEGRAM_MAX_OUTGOING_BYTES,
  answerTelegramCallback,
  getTelegramFile,
  paymentKeyboard,
  paymentMessage,
  receiptUsername,
  sendTelegramDocument,
  sendTelegramMessage,
  telegramBackToMenuKeyboard,
  telegramMainKeyboard,
  telegramWebhookSecret
} from "@/lib/telegram";
import { createUserBookResumableUpload,deleteDriveFile,fetchDriveFile,getSiteOrigin } from "@/lib/google-drive";

type TgUser={id:number;username?:string;first_name?:string};
type TgDocument={file_id:string;file_unique_id?:string;file_name?:string;mime_type?:string;file_size?:number};
type TgMessage={chat:{id:number;type?:string};from?:TgUser;text?:string;document?:TgDocument};
type TgCallback={id:string;from:TgUser;data?:string;message?:{chat:{id:number}}};
type TgUpdate={message?:TgMessage;callback_query?:TgCallback};
type BotMode="idle"|"download"|"upload";
type Access={userId:string;isAdmin:boolean;mode:BotMode;activeUntil:string|null};

function validSecret(value:string|null){
  if(!value)return false;const expected=telegramWebhookSecret();
  const a=Buffer.from(value);const b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);
}
function escapeHtml(value:string){return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function normalized(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();}
function titleFromFile(fileName:string){return fileName.replace(/\.(pdf|epub)$/i,"").replace(/[_]+/g," ").replace(/\s+/g," ").trim()||"Livro enviado pelo Telegram";}

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

async function requireBotAccess(user:TgUser,chatId:number):Promise<Access|null>{
  const admin=createAdminSupabaseClient();
  const {data:account}=await admin.from("telegram_accounts").select("user_id,bot_mode").eq("telegram_user_id",user.id).maybeSingle();
  if(!account){await sendLink(user,chatId);return null;}
  await admin.from("telegram_accounts").update({chat_id:chatId,username:user.username||null,first_name:user.first_name||null,updated_at:new Date().toISOString()}).eq("telegram_user_id",user.id);
  const {data:profile}=await admin.from("profiles").select("approved,role").eq("id",account.user_id).maybeSingle();
  if(profile?.role==="admin")return {userId:account.user_id,isAdmin:true,mode:(account.bot_mode||"idle") as BotMode,activeUntil:null};
  if(!profile?.approved){
    await sendTelegramMessage(chatId,"⏳ Sua conta está vinculada, mas ainda aguarda liberação do administrador.\n\nSe já realizou o pagamento, envie o comprovante para <b>@"+receiptUsername()+"</b>.",paymentKeyboard());return null;
  }
  const subscription=await getSubscriptionState(account.user_id);
  if(!subscription.isActive){await sendTelegramMessage(chatId,paymentMessage(),paymentKeyboard());return null;}
  return {userId:account.user_id,isAdmin:false,mode:(account.bot_mode||"idle") as BotMode,activeUntil:subscription.activeUntil};
}

async function setMode(telegramUserId:number,mode:BotMode){
  const admin=createAdminSupabaseClient();
  await admin.from("telegram_accounts").update({bot_mode:mode,updated_at:new Date().toISOString()}).eq("telegram_user_id",telegramUserId);
}

async function showMenu(user:TgUser,chatId:number){
  const access=await requireBotAccess(user,chatId);if(!access)return;
  await setMode(user.id,"idle");
  const date=access.activeUntil?new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo"}).format(new Date(access.activeUntil)):"";
  const heading=access.isAdmin?"✅ <b>Conta de administrador vinculada.</b>":`✅ <b>Assinatura ativa</b>${date?` até <b>${date}</b>`:""}.`;
  await sendTelegramMessage(chatId,`${heading}\n\nO que você deseja fazer?`,telegramMainKeyboard());
}

async function promptDownload(user:TgUser,chatId:number){
  const access=await requireBotAccess(user,chatId);if(!access)return;
  await setMode(user.id,"download");
  await sendTelegramMessage(chatId,"⬇️ <b>Baixar livro</b>\n\nDigite o nome do livro que você procura. Se houver mais de uma opção, eu mostro para você escolher.",telegramBackToMenuKeyboard());
}

async function promptUpload(user:TgUser,chatId:number){
  const access=await requireBotAccess(user,chatId);if(!access)return;
  await setMode(user.id,"upload");
  await sendTelegramMessage(chatId,"⬆️ <b>Enviar livro</b>\n\nAgora envie o arquivo <b>PDF ou EPUB</b> aqui na conversa. Ele será salvo no Google Drive e aparecerá em <b>Minha Biblioteca</b> no site.",telegramBackToMenuKeyboard());
}

async function sendBookFile(chatId:number,userId:string,source:"user"|"catalog",id:string){
  const admin=createAdminSupabaseClient();
  const query=source==="user"
    ? admin.from("user_books").select("id,title,drive_file_id,file_name,mime_type").eq("id",id).eq("user_id",userId)
    : admin.from("books").select("id,title,drive_file_id,file_name,mime_type,allow_download,published").eq("id",id).eq("published",true).eq("allow_download",true);
  const {data:book}=await query.maybeSingle();
  if(!book){await sendTelegramMessage(chatId,"Esse livro não está disponível para download pelo bot.",telegramMainKeyboard());return;}
  await sendTelegramMessage(chatId,`⏳ Preparando <b>${escapeHtml(book.title)}</b>...`);
  const response=await fetchDriveFile(book.drive_file_id);
  const declaredSize=Number(response.headers.get("content-length")||0);
  if(declaredSize>TELEGRAM_MAX_OUTGOING_BYTES){await sendTelegramMessage(chatId,"Esse arquivo é maior do que o Telegram permite enviar pelo bot. Você ainda pode acessá-lo pelo site.",telegramMainKeyboard());return;}
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.byteLength>TELEGRAM_MAX_OUTGOING_BYTES){await sendTelegramMessage(chatId,"Esse arquivo é maior do que o Telegram permite enviar pelo bot. Você ainda pode acessá-lo pelo site.",telegramMainKeyboard());return;}
  await sendTelegramDocument(chatId,book.file_name,book.mime_type||"application/octet-stream",bytes,`📚 <b>${escapeHtml(book.title)}</b>`);
  await sendTelegramMessage(chatId,"✅ Arquivo enviado. Quer fazer mais alguma coisa?",telegramMainKeyboard());
}

async function searchBooks(user:TgUser,chatId:number,queryText:string){
  const access=await requireBotAccess(user,chatId);if(!access)return;
  const term=queryText.replace(/[%_]/g," ").replace(/\s+/g," ").trim();
  if(term.length<2){await sendTelegramMessage(chatId,"Digite pelo menos 2 caracteres do nome do livro.",telegramBackToMenuKeyboard());return;}
  const admin=createAdminSupabaseClient();const pattern=`%${term}%`;
  const [{data:personal},{data:catalog}]=await Promise.all([
    admin.from("user_books").select("id,title,file_name,mime_type").eq("user_id",access.userId).ilike("title",pattern).limit(6),
    admin.from("books").select("id,title,file_name,mime_type,allow_download").eq("published",true).ilike("title",pattern).limit(8)
  ]);
  const own=(personal||[]).map(b=>({source:"user" as const,...b}));
  const allowed=(catalog||[]).filter(b=>b.allow_download).map(b=>({source:"catalog" as const,...b}));
  const blocked=(catalog||[]).filter(b=>!b.allow_download);
  const results=[...own,...allowed];
  if(!results.length){
    const note=blocked.length?" Encontrei título(s) no acervo, mas o download não está liberado para eles.":"";
    await sendTelegramMessage(chatId,`🔎 Não encontrei um arquivo disponível para download com <b>${escapeHtml(term)}</b>.${note}`,telegramBackToMenuKeyboard());return;
  }
  const exact=results.filter(b=>normalized(b.title)===normalized(term));
  if(exact.length===1||results.length===1){const book=exact[0]||results[0];await setMode(user.id,"idle");await sendBookFile(chatId,access.userId,book.source,book.id);return;}
  const rows=results.slice(0,10).map(b=>[{text:`${b.source==="user"?"👤":"📚"} ${b.title}`.slice(0,58),callback_data:`download:${b.source}:${b.id}`}]);
  rows.push([{text:"↩️ Voltar ao menu",callback_data:"show_menu"}]);
  await sendTelegramMessage(chatId,"Encontrei estas opções. Toque no livro que deseja baixar:",{inline_keyboard:rows});
}

async function receiveBook(user:TgUser,chatId:number,document:TgDocument){
  const access=await requireBotAccess(user,chatId);if(!access)return;
  if(access.mode!=="upload"){await sendTelegramMessage(chatId,"Para enviar um livro, toque primeiro em <b>ENVIAR</b> no menu.",telegramMainKeyboard());return;}
  if(document.file_size&&document.file_size>TELEGRAM_MAX_INCOMING_BYTES){await sendTelegramMessage(chatId,"Esse arquivo é maior do que o bot consegue receber pelo Telegram. Para arquivos maiores, use o envio pelo site.",telegramMainKeyboard());await setMode(user.id,"idle");return;}
  let fileName=(document.file_name||"").trim();const mime=(document.mime_type||"").toLowerCase();
  const isPdf=fileName.toLowerCase().endsWith(".pdf")||mime==="application/pdf";
  const isEpub=fileName.toLowerCase().endsWith(".epub")||mime==="application/epub+zip";
  if(!isPdf&&!isEpub){await sendTelegramMessage(chatId,"Envie somente um arquivo <b>PDF</b> ou <b>EPUB</b>.",telegramBackToMenuKeyboard());return;}
  if(!fileName)fileName=isPdf?"livro.pdf":"livro.epub";
  const mimeType=isPdf?"application/pdf":"application/epub+zip";
  await sendTelegramMessage(chatId,"⏳ Recebendo o arquivo e salvando na sua biblioteca...");
  const {bytes}=await getTelegramFile(document.file_id);
  const {uploadUrl}=await createUserBookResumableUpload({userId:access.userId,fileName,mimeType,fileSize:bytes.byteLength});
  const arrayBuffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
  const driveResponse=await fetch(uploadUrl,{method:"PUT",headers:{"content-type":mimeType,"content-length":String(bytes.byteLength)},body:arrayBuffer});
  if(!driveResponse.ok){const text=await driveResponse.text();throw new Error(`Upload no Google Drive falhou (${driveResponse.status}): ${text.slice(0,160)}`);}
  const uploaded=await driveResponse.json() as {id?:string;name?:string};
  if(!uploaded.id)throw new Error("Google Drive não retornou o ID do arquivo.");
  const admin=createAdminSupabaseClient();
  const {data:book,error}=await admin.from("user_books").insert({
    user_id:access.userId,
    title:titleFromFile(fileName),
    author:"Autor não informado",
    description:null,
    drive_file_id:uploaded.id,
    file_name:uploaded.name||fileName,
    mime_type:mimeType,
    source:"upload",
    moderation_status:"private",
    updated_at:new Date().toISOString()
  }).select("id,title").single();
  if(error){try{await deleteDriveFile(uploaded.id);}catch{}throw new Error(error.message);}
  await setMode(user.id,"idle");
  await sendTelegramMessage(chatId,`✅ <b>${escapeHtml(book.title)}</b> foi enviado com sucesso.\n\nO arquivo já está salvo no Google Drive e aparece em <b>Minha Biblioteca</b> no site.`,telegramMainKeyboard());
}

export async function POST(request:NextRequest){
  try{
    if(!validSecret(request.headers.get("x-telegram-bot-api-secret-token")))return NextResponse.json({ok:false},{status:401});
    const update=await request.json() as TgUpdate;
    if(update.callback_query){
      const q=update.callback_query;const chatId=q.message?.chat.id;if(!chatId){await answerTelegramCallback(q.id);return NextResponse.json({ok:true});}
      if(q.data==="subscription_paid"){await answerTelegramCallback(q.id,"Comprovante necessário");await sendTelegramMessage(chatId,`✅ Depois do pagamento, envie o comprovante para <b>@${receiptUsername()}</b> e informe seu @ do Telegram. Assim que for confirmado, seu acesso será liberado por 30 dias.`);}
      else if(q.data==="action_download"){await answerTelegramCallback(q.id);await promptDownload(q.from,chatId);}
      else if(q.data==="action_upload"){await answerTelegramCallback(q.id);await promptUpload(q.from,chatId);}
      else if(q.data==="show_menu"){await answerTelegramCallback(q.id);await showMenu(q.from,chatId);}
      else if(q.data==="show_subscription"){await answerTelegramCallback(q.id);await showMenu(q.from,chatId);}
      else if(q.data?.startsWith("download:")){
        const [,source,id]=q.data.split(":");await answerTelegramCallback(q.id,"Preparando arquivo...");
        const access=await requireBotAccess(q.from,chatId);if(access&&(source==="user"||source==="catalog")){await setMode(q.from.id,"idle");await sendBookFile(chatId,access.userId,source,id);}
      }else await answerTelegramCallback(q.id);
      return NextResponse.json({ok:true});
    }
    const message=update.message;const from=message?.from;const chatId=message?.chat.id;
    if(!message||!from||!chatId)return NextResponse.json({ok:true});
    if(message.document){await receiveBook(from,chatId,message.document);return NextResponse.json({ok:true});}
    const raw=(message.text||"").trim();const text=raw.toLowerCase();
    if(text.startsWith("/start")||text.startsWith("/entrar")||text.startsWith("/menu")){await showMenu(from,chatId);return NextResponse.json({ok:true});}
    if(text.startsWith("/baixar")){await promptDownload(from,chatId);return NextResponse.json({ok:true});}
    if(text.startsWith("/enviar")){await promptUpload(from,chatId);return NextResponse.json({ok:true});}
    if(text.startsWith("/status")||text.startsWith("/assinatura")){await showMenu(from,chatId);return NextResponse.json({ok:true});}
    const access=await requireBotAccess(from,chatId);if(!access)return NextResponse.json({ok:true});
    if(access.mode==="download"&&raw){await searchBooks(from,chatId,raw);return NextResponse.json({ok:true});}
    await showMenu(from,chatId);
    return NextResponse.json({ok:true});
  }catch(error){console.error("[telegram-webhook]",error);return NextResponse.json({ok:true});}
}

export async function GET(){return NextResponse.json({ok:true,service:"telegram-webhook"});}
