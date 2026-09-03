import { NextRequest,NextResponse } from "next/server";
import { randomUUID,timingSafeEqual } from "crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSubscriptionState,type SubscriptionState } from "@/lib/subscription";
import { identifyBookFromUpload } from "@/lib/book-identification";
import { ensureUserBookFormats } from "@/lib/book-formats";
import { ensureKindleVersion } from "@/lib/kindle-service";
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
import { createUserBookResumableUpload,deleteDriveFile,fetchDriveFile,getSiteOrigin,uploadUserCoverToDrive } from "@/lib/google-drive";

type TgUser={id:number;username?:string;first_name?:string};
type TgDocument={file_id:string;file_unique_id?:string;file_name?:string;mime_type?:string;file_size?:number};
type TgPhoto={file_id:string;file_unique_id?:string;file_size?:number;width?:number;height?:number};
type TgMessage={chat:{id:number;type?:string};from?:TgUser;text?:string;document?:TgDocument;photo?:TgPhoto[]};
type TgCallback={id:string;from:TgUser;data?:string;message?:{chat:{id:number}}};
type TgUpdate={message?:TgMessage;callback_query?:TgCallback};
type BotMode="idle"|"download"|"upload_file"|"upload_cover"|"edit_title"|"edit_author"|"edit_year"|"edit_description"|"edit_cover";
type BotContext={bookId?:string};
type LinkedState={userId:string;isAdmin:boolean;approved:boolean;mode:BotMode;context:BotContext;subscription:SubscriptionState|null};
type Access={userId:string;isAdmin:boolean;mode:BotMode;context:BotContext;activatedAt:string|null;activeUntil:string|null};
type BookSource="user"|"catalog";
type BookFormat="pdf"|"epub";

function validSecret(value:string|null){if(!value)return false;const expected=telegramWebhookSecret();const a=Buffer.from(value);const b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
function escapeHtml(value:string){return String(value||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function normalized(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();}
function formatDate(value?:string|null){if(!value)return "—";return new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(value));}
function sourceChar(source:BookSource){return source==="catalog"?"c":"u";}
function sourceFromChar(value:string):BookSource|null{return value==="c"?"catalog":value==="u"?"user":null;}
function coverDriveId(url?:string|null){const m=String(url||"").match(/^\/api\/covers\/([^/?#]+)/);return m?.[1]?decodeURIComponent(m[1]):null;}
function bookIsPdf(book:any){return book?.mime_type==="application/pdf"||String(book?.file_name||"").toLowerCase().endsWith(".pdf");}
function bookIsEpub(book:any){return book?.mime_type==="application/epub+zip"||String(book?.file_name||"").toLowerCase().endsWith(".epub");}
function bookHasReadingPdf(book:any){return bookIsPdf(book)||Boolean(book?.reading_pdf_drive_file_id);}

async function sendLink(user:TgUser,chatId:number){
  const admin=createAdminSupabaseClient();
  await admin.from("telegram_link_codes").delete().eq("telegram_user_id",user.id).is("used_at",null);
  const code=randomUUID();const expiresAt=new Date(Date.now()+20*60*1000).toISOString();
  const {error}=await admin.from("telegram_link_codes").insert({code,telegram_user_id:user.id,chat_id:chatId,username:user.username||null,first_name:user.first_name||null,expires_at:expiresAt});
  if(error)throw new Error(error.message);
  const url=`${getSiteOrigin()}/telegram/vincular?code=${encodeURIComponent(code)}`;
  await sendTelegramMessage(chatId,`📚 <b>Bem-vindo à Biblioteca Virtual</b>\n\nAntes de baixar ou enviar livros, conecte este Telegram à sua conta do site.\n\n🔐 O link abaixo é individual e expira em <b>20 minutos</b>.`,{inline_keyboard:[[{text:"🔗 VINCULAR MINHA CONTA",url}]]});
}

async function getLinkedState(user:TgUser,chatId:number):Promise<LinkedState|null>{
  const admin=createAdminSupabaseClient();
  const {data:account}=await admin.from("telegram_accounts").select("user_id,bot_mode,bot_context").eq("telegram_user_id",user.id).maybeSingle();
  if(!account)return null;
  await admin.from("telegram_accounts").update({chat_id:chatId,username:user.username||null,first_name:user.first_name||null,updated_at:new Date().toISOString()}).eq("telegram_user_id",user.id);
  const {data:profile}=await admin.from("profiles").select("approved,role").eq("id",account.user_id).maybeSingle();
  const isAdmin=profile?.role==="admin";const subscription=isAdmin?null:await getSubscriptionState(account.user_id);
  return {userId:account.user_id,isAdmin,approved:Boolean(profile?.approved),mode:(account.bot_mode||"idle") as BotMode,context:(account.bot_context||{}) as BotContext,subscription};
}

async function requireBotAccess(user:TgUser,chatId:number):Promise<Access|null>{
  const state=await getLinkedState(user,chatId);
  if(!state){await sendLink(user,chatId);return null;}
  if(state.isAdmin)return {userId:state.userId,isAdmin:true,mode:state.mode,context:state.context,activatedAt:null,activeUntil:null};
  if(!state.approved){await sendTelegramMessage(chatId,`⏳ <b>Aguardando liberação</b>\n\nSua conta já está vinculada, mas o acesso aos livros ainda não foi ativado.\n\nSe você já pagou, envie o comprovante para <b>@${receiptUsername()}</b>. Assim que o pagamento for conferido, seus 30 dias começam.`,paymentKeyboard());return null;}
  if(!state.subscription?.isActive){await sendTelegramMessage(chatId,paymentMessage(),paymentKeyboard());return null;}
  return {userId:state.userId,isAdmin:false,mode:state.mode,context:state.context,activatedAt:state.subscription.activatedAt,activeUntil:state.subscription.activeUntil};
}

async function setState(telegramUserId:number,mode:BotMode,context:BotContext={}){
  const admin=createAdminSupabaseClient();
  await admin.from("telegram_accounts").update({bot_mode:mode,bot_context:context,updated_at:new Date().toISOString()}).eq("telegram_user_id",telegramUserId);
}

async function showMenu(user:TgUser,chatId:number){
  const access=await requireBotAccess(user,chatId);if(!access)return;
  await setState(user.id,"idle",{});
  const name=user.first_name?`, <b>${escapeHtml(user.first_name)}</b>`:"";
  const accessLine=access.isAdmin?"🛡 <b>Acesso administrativo</b>":`✅ <b>Assinatura ativa até ${formatDate(access.activeUntil)}</b>`;
  await sendTelegramMessage(chatId,`📚 <b>Biblioteca Virtual</b>\n\nOlá${name}! ${accessLine}\n\nEscolha o que você quer fazer agora:`,telegramMainKeyboard());
}

async function showSubscription(user:TgUser,chatId:number){
  const state=await getLinkedState(user,chatId);if(!state){await sendLink(user,chatId);return;}
  await setState(user.id,"idle",{});
  if(state.isAdmin){await sendTelegramMessage(chatId,"💳 <b>Minha assinatura</b>\n\n🛡 Sua conta é de <b>administrador</b>.\nVocê tem acesso permanente aos recursos da Biblioteca Virtual e não possui vencimento de assinatura.",telegramMainKeyboard());return;}
  const sub=state.subscription;
  if(state.approved&&sub?.isActive){
    await sendTelegramMessage(chatId,`💳 <b>Minha assinatura</b>\n\n✅ <b>Status:</b> Ativa\n📅 <b>Início:</b> ${formatDate(sub.activatedAt)}\n⏳ <b>Vencimento:</b> ${formatDate(sub.activeUntil)}\n🗓 <b>Período:</b> 30 dias\n\nDurante esse período você pode baixar livros, usar as versões para Kindle e enviar seus próprios arquivos pelo bot.`,telegramMainKeyboard());return;
  }
  await sendTelegramMessage(chatId,paymentMessage(),paymentKeyboard());
}

async function promptDownload(user:TgUser,chatId:number){
  const access=await requireBotAccess(user,chatId);if(!access)return;
  await setState(user.id,"download",{});
  await sendTelegramMessage(chatId,"🔎 <b>Buscar um livro</b>\n\nDigite o <b>nome do livro</b> que você procura.\n\nEu vou pesquisar no acervo e na sua biblioteca pessoal. Depois você poderá escolher entre <b>PDF</b> e <b>EPUB para Kindle</b>, quando disponíveis.",telegramBackToMenuKeyboard());
}

async function promptUpload(user:TgUser,chatId:number){
  const access=await requireBotAccess(user,chatId);if(!access)return;
  await setState(user.id,"upload_file",{});
  await sendTelegramMessage(chatId,"➕ <b>Enviar um livro — etapa 1 de 2</b>\n\nEnvie aqui o arquivo do livro em <b>PDF</b> ou <b>EPUB</b>.\n\n🔎 Vou tentar reconhecer automaticamente o título, autor e outras informações pelo arquivo e pelo nome dele.\n🖼 Depois eu vou pedir a <b>capa do livro</b>.\n\nQuando terminar, ele aparecerá em <b>Minha Biblioteca</b> e você poderá acompanhar o envio em <b>Meus Envios</b>.",telegramBackToMenuKeyboard());
}

async function loadBookForAccess(access:Access,source:BookSource,id:string){
  const admin=createAdminSupabaseClient();
  if(source==="user"){
    const {data}=await admin.from("user_books").select("*").eq("id",id).eq("user_id",access.userId).maybeSingle();return data;
  }
  const {data}=await admin.from("books").select("*").eq("id",id).eq("published",true).eq("allow_download",true).maybeSingle();return data;
}

async function ensureReadingPdf(access:Access,source:BookSource,id:string,book:any){
  if(bookHasReadingPdf(book))return book;
  if(source!=="user"||!bookIsEpub(book))return book;
  try{
    await sendTelegramMessage(access.userId?Number.NaN:0,"");
  }catch{}
  await ensureUserBookFormats(access.userId,id);
  return loadBookForAccess(access,source,id);
}

async function showFormatOptions(user:TgUser,chatId:number,source:BookSource,id:string){
  const access=await requireBotAccess(user,chatId);if(!access)return;
  let book=await loadBookForAccess(access,source,id);if(!book){await sendTelegramMessage(chatId,"🔒 Esse livro não está disponível para download pela sua conta.",telegramMainKeyboard());return;}
  if(source==="user"&&bookIsEpub(book)&&!bookHasReadingPdf(book)){
    try{book=await ensureUserBookFormats(access.userId,id);}catch{}
  }
  const hasPdf=bookHasReadingPdf(book);const hasEpub=bookIsEpub(book)||Boolean(book.kindle_drive_file_id);
  const s=sourceChar(source);const rows:Array<Array<Record<string,string>>> = [];
  if(hasPdf&&hasEpub)rows.push([{text:"📄 BAIXAR PDF",callback_data:`format:${s}:${id}:pdf`},{text:"📱 BAIXAR EPUB (KINDLE)",callback_data:`format:${s}:${id}:epub`}]);
  else if(hasPdf)rows.push([{text:"📄 BAIXAR PDF",callback_data:`format:${s}:${id}:pdf`}]);
  else if(hasEpub)rows.push([{text:"📱 BAIXAR EPUB (KINDLE)",callback_data:`format:${s}:${id}:epub`}]);
  rows.push([{text:"↩️ Voltar ao menu",callback_data:"show_menu"}]);
  await setState(user.id,"idle",{});
  await sendTelegramMessage(chatId,`📖 <b>${escapeHtml(book.title)}</b>\n${book.author?`👤 ${escapeHtml(book.author)}\n`:""}\nComo você quer receber este livro?`,{inline_keyboard:rows});
}

async function sendBookFormat(user:TgUser,chatId:number,source:BookSource,id:string,format:BookFormat){
  const access=await requireBotAccess(user,chatId);if(!access)return;
  let book=await loadBookForAccess(access,source,id);if(!book){await sendTelegramMessage(chatId,"🔒 Esse livro não está mais disponível para download.",telegramMainKeyboard());return;}
  let driveFileId=String(book.drive_file_id);let fileName=String(book.file_name);let mimeType=String(book.mime_type||"application/octet-stream");
  if(format==="pdf"){
    if(!bookHasReadingPdf(book)&&source==="user"&&bookIsEpub(book)){
      try{
        await sendTelegramMessage(chatId,`📄 <b>Preparando a versão de leitura de ${escapeHtml(book.title)}...</b>\n\nIsso pode levar alguns segundos na primeira vez.`);
        book=await ensureUserBookFormats(access.userId,id);
      }catch(error){await sendTelegramMessage(chatId,`⚠️ <b>Não consegui preparar o PDF de leitura.</b>\n\n${escapeHtml(error instanceof Error?error.message:"A conversão não pôde ser concluída.")}`,telegramMainKeyboard());return;}
    }
    if(bookIsPdf(book)){
      driveFileId=String(book.drive_file_id);fileName=String(book.file_name);mimeType="application/pdf";
    }else if(book.reading_pdf_drive_file_id){
      driveFileId=String(book.reading_pdf_drive_file_id);fileName=String(book.reading_pdf_file_name||`${book.title}.pdf`);mimeType="application/pdf";
    }else{await sendTelegramMessage(chatId,"📄 Este livro ainda não possui uma versão PDF de leitura disponível.",telegramMainKeyboard());return;}
  }else{
    try{
      await sendTelegramMessage(chatId,`📱 <b>Preparando o EPUB de ${escapeHtml(book.title)}...</b>\n\nIsso pode levar alguns segundos na primeira vez.`);
      const ensured=await ensureKindleVersion(createAdminSupabaseClient(),access.userId,source,id);driveFileId=ensured.driveFileId;fileName=ensured.fileName;mimeType="application/epub+zip";
    }catch(error){await sendTelegramMessage(chatId,`⚠️ <b>Não consegui preparar o EPUB.</b>\n\n${escapeHtml(error instanceof Error?error.message:"A conversão não pôde ser concluída.")}`,telegramMainKeyboard());return;}
  }
  await sendTelegramMessage(chatId,`⏳ <b>Preparando seu arquivo...</b>\n${escapeHtml(book.title)}`);
  const response=await fetchDriveFile(driveFileId);const declaredSize=Number(response.headers.get("content-length")||0);
  if(declaredSize>TELEGRAM_MAX_OUTGOING_BYTES){await sendTelegramMessage(chatId,"⚠️ Esse arquivo ultrapassa o tamanho que o bot consegue enviar pelo Telegram. Ele continua disponível pelo site.",telegramMainKeyboard());return;}
  const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength>TELEGRAM_MAX_OUTGOING_BYTES){await sendTelegramMessage(chatId,"⚠️ Esse arquivo ultrapassa o tamanho que o bot consegue enviar pelo Telegram. Ele continua disponível pelo site.",telegramMainKeyboard());return;}
  await sendTelegramDocument(chatId,fileName,mimeType,bytes,`📚 <b>${escapeHtml(book.title)}</b>\n${format==="epub"?"📱 EPUB • pronto para Kindle":"📄 PDF • versão de leitura"}`);
  const admin=createAdminSupabaseClient();await admin.from("telegram_download_history").insert({user_id:access.userId,source,book_id:id,title_snapshot:book.title,format,requested_at:new Date().toISOString()});
  await setState(user.id,"idle",{});
  await sendTelegramMessage(chatId,"✅ <b>Pronto! Livro enviado.</b>\n\nEle também foi salvo no seu Histórico, então você consegue pedir o mesmo arquivo novamente sem precisar pesquisar de novo.",telegramMainKeyboard());
}

async function searchBooks(user:TgUser,chatId:number,queryText:string){
  const access=await requireBotAccess(user,chatId);if(!access)return;
  const term=queryText.replace(/[%_]/g," ").replace(/\s+/g," ").trim();
  if(term.length<2){await sendTelegramMessage(chatId,"🔎 Digite pelo menos <b>2 caracteres</b> para eu pesquisar.",telegramBackToMenuKeyboard());return;}
  const admin=createAdminSupabaseClient();const pattern=`%${term}%`;
  const [{data:personal},{data:catalog}]=await Promise.all([
    admin.from("user_books").select("id,title,author,file_name,mime_type").eq("user_id",access.userId).or(`title.ilike.${pattern},author.ilike.${pattern}`).limit(6),
    admin.from("books").select("id,title,author,file_name,mime_type,allow_download").eq("published",true).or(`title.ilike.${pattern},author.ilike.${pattern}`).limit(10)
  ]);
  const own=(personal||[]).map(b=>({source:"user" as const,...b}));const allowed=(catalog||[]).filter(b=>b.allow_download).map(b=>({source:"catalog" as const,...b}));const blocked=(catalog||[]).filter(b=>!b.allow_download);const results=[...own,...allowed];
  if(!results.length){const note=blocked.length?"\n\n🔒 Encontrei título(s) parecido(s), mas eles não estão liberados para download pelo bot.":"";await sendTelegramMessage(chatId,`🔎 <b>Nenhum download encontrado para “${escapeHtml(term)}”.</b>${note}\n\nTente escrever apenas uma parte do título.`,telegramBackToMenuKeyboard());return;}
  const exact=results.filter(b=>normalized(b.title)===normalized(term));if(exact.length===1||results.length===1){const book=exact[0]||results[0];await showFormatOptions(user,chatId,book.source,book.id);return;}
  const rows=results.slice(0,10).map(b=>[{text:`${b.source==="user"?"👤":"📚"} ${b.title}`.slice(0,58),callback_data:`book:${sourceChar(b.source)}:${b.id}`}]);rows.push([{text:"↩️ Voltar ao menu",callback_data:"show_menu"}]);
  await sendTelegramMessage(chatId,`🔎 <b>Encontrei ${results.length} opções</b>\n\nToque no título correto para escolher o formato:`,{inline_keyboard:rows});
}

async function showHistory(user:TgUser,chatId:number){
  const access=await requireBotAccess(user,chatId);if(!access)return;const admin=createAdminSupabaseClient();
  const {data}=await admin.from("telegram_download_history").select("id,source,book_id,title_snapshot,format,requested_at").eq("user_id",access.userId).order("requested_at",{ascending:false}).limit(25);
  const seen=new Set<string>();const rowsData=(data||[]).filter(row=>{const key=`${row.source}:${row.book_id}:${row.format}`;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,10);
  if(!rowsData.length){await sendTelegramMessage(chatId,"🕘 <b>Seu Histórico ainda está vazio.</b>\n\nQuando você baixar um livro pelo bot, ele aparecerá aqui para ser enviado novamente com um toque.",telegramMainKeyboard());return;}
  const rows=rowsData.map(row=>[{text:`${row.format==="epub"?"📱":"📄"} ${row.title_snapshot}`.slice(0,58),callback_data:`history:${row.id}`}]);rows.push([{text:"↩️ Voltar ao menu",callback_data:"show_menu"}]);
  await sendTelegramMessage(chatId,"🕘 <b>Histórico de downloads</b>\n\nToque em um livro para eu enviar novamente no mesmo formato:",{inline_keyboard:rows});
}

async function resendHistory(user:TgUser,chatId:number,historyId:string){
  const access=await requireBotAccess(user,chatId);if(!access)return;const admin=createAdminSupabaseClient();
  const {data}=await admin.from("telegram_download_history").select("source,book_id,format,title_snapshot").eq("id",historyId).eq("user_id",access.userId).maybeSingle();
  if(!data){await sendTelegramMessage(chatId,"Esse item não está mais no seu Histórico.",telegramMainKeyboard());return;}
  await sendBookFormat(user,chatId,data.source as BookSource,data.book_id,data.format as BookFormat);
}

function uploadStatus(status:string){return status==="catalog"?"✅ Disponível":status==="pending"?"🕘 Em análise":"🔒 Privado";}
async function showUploads(user:TgUser,chatId:number){
  const access=await requireBotAccess(user,chatId);if(!access)return;const admin=createAdminSupabaseClient();
  const {data}=await admin.from("user_books").select("id,title,moderation_status,cover_url,mime_type,created_at").eq("user_id",access.userId).order("created_at",{ascending:false}).limit(12);
  if(!data?.length){await sendTelegramMessage(chatId,"📤 <b>Você ainda não enviou nenhum livro.</b>\n\nToque em ENVIAR para adicionar seu primeiro PDF ou EPUB.",telegramMainKeyboard());return;}
  const rows=data.map(book=>[{text:`${book.moderation_status==="pending"?"🕘":book.moderation_status==="catalog"?"✅":"📚"} ${book.title}`.slice(0,58),callback_data:`upload:${book.id}`}]);rows.push([{text:"➕ Enviar novo livro",callback_data:"action_upload"}],[{text:"↩️ Voltar ao menu",callback_data:"show_menu"}]);
  await sendTelegramMessage(chatId,"📤 <b>Meus Envios</b>\n\nAqui ficam os livros enviados por você. Toque em um item para ver o status, trocar a capa ou editar as informações:",{inline_keyboard:rows});
}

async function showUploadDetail(user:TgUser,chatId:number,bookId:string){
  const access=await requireBotAccess(user,chatId);if(!access)return;const admin=createAdminSupabaseClient();
  const {data:book}=await admin.from("user_books").select("id,title,author,description,year,pages,language,cover_url,file_name,mime_type,moderation_status,created_at").eq("id",bookId).eq("user_id",access.userId).maybeSingle();
  if(!book){await sendTelegramMessage(chatId,"Esse envio não foi encontrado.",telegramMainKeyboard());return;}
  const desc=book.description?String(book.description).slice(0,350):"Não informada";
  await sendTelegramMessage(chatId,`📚 <b>${escapeHtml(book.title)}</b>\n\n👤 <b>Autor:</b> ${escapeHtml(book.author||"Autor não informado")}\n📅 <b>Ano:</b> ${book.year||"Não informado"}\n📄 <b>Arquivo:</b> ${escapeHtml(book.file_name)}\n🖼 <b>Capa:</b> ${book.cover_url?"Adicionada":"Ainda não adicionada"}\n📌 <b>Status:</b> ${uploadStatus(book.moderation_status)}\n\n📝 <b>Sinopse:</b> ${escapeHtml(desc)}`,{inline_keyboard:[
    [{text:"🖼 CAPA",callback_data:`editcover:${book.id}`},{text:"✏️ TÍTULO",callback_data:`edittitle:${book.id}`}],
    [{text:"👤 AUTOR",callback_data:`editauthor:${book.id}`},{text:"📅 ANO",callback_data:`edityear:${book.id}`}],
    [{text:"📝 SINOPSE",callback_data:`editdescription:${book.id}`}],
    [{text:"↩️ MEUS ENVIOS",callback_data:"show_uploads"}]
  ]});
}

async function promptEdit(user:TgUser,chatId:number,mode:BotMode,bookId:string,label:string,instruction:string){
  const access=await requireBotAccess(user,chatId);if(!access)return;const admin=createAdminSupabaseClient();const {data}=await admin.from("user_books").select("id").eq("id",bookId).eq("user_id",access.userId).maybeSingle();if(!data)return;
  await setState(user.id,mode,{bookId});await sendTelegramMessage(chatId,`✏️ <b>Editar ${label}</b>\n\n${instruction}`,{inline_keyboard:[[{text:"↩️ Cancelar",callback_data:`upload:${bookId}`}]]});
}

async function resetGeneratedKindle(userId:string,bookId:string){
  const admin=createAdminSupabaseClient();const {data:book}=await admin.from("user_books").select("drive_file_id,kindle_drive_file_id").eq("id",bookId).eq("user_id",userId).maybeSingle();
  if(book?.kindle_drive_file_id&&book.kindle_drive_file_id!==book.drive_file_id)try{await deleteDriveFile(book.kindle_drive_file_id);}catch{}
  await admin.from("user_books").update({kindle_drive_file_id:null,kindle_file_name:null,kindle_generated_at:null}).eq("id",bookId).eq("user_id",userId);
}

async function syncCatalogBook(userId:string,bookId:string,patch:Record<string,unknown>){
  const admin=createAdminSupabaseClient();const {data:book}=await admin.from("user_books").select("drive_file_id,moderation_status").eq("id",bookId).eq("user_id",userId).maybeSingle();if(book?.moderation_status==="catalog")await admin.from("books").update({...patch,updated_at:new Date().toISOString()}).eq("drive_file_id",book.drive_file_id);
}

async function handleEditText(user:TgUser,chatId:number,access:Access,raw:string){
  const bookId=access.context.bookId;if(!bookId){await setState(user.id,"idle",{});await showMenu(user,chatId);return;}
  const admin=createAdminSupabaseClient();const patch:Record<string,unknown>={updated_at:new Date().toISOString()};let catalogPatch:Record<string,unknown>={};let resetKindle=false;
  if(access.mode==="edit_title"){const value=raw.trim().slice(0,220);if(value.length<2){await sendTelegramMessage(chatId,"O título precisa ter pelo menos 2 caracteres.");return;}patch.title=value;catalogPatch.title=value;resetKindle=true;}
  else if(access.mode==="edit_author"){const value=raw.trim().slice(0,220);if(value.length<2){await sendTelegramMessage(chatId,"Informe o nome do autor.");return;}patch.author=value;catalogPatch.author=value;resetKindle=true;}
  else if(access.mode==="edit_year"){const value=raw.trim().toLowerCase();if(["limpar","remover","nenhum"].includes(value)){patch.year=null;catalogPatch.year=null;}else{const year=Number(value);if(!Number.isInteger(year)||year<0||year>2100){await sendTelegramMessage(chatId,"Envie apenas o ano, por exemplo <b>2007</b>, ou escreva <b>limpar</b>.");return;}patch.year=year;catalogPatch.year=year;}}
  else if(access.mode==="edit_description"){const value=raw.trim().slice(0,5000);if(value.length<10){await sendTelegramMessage(chatId,"A sinopse precisa ter pelo menos 10 caracteres.");return;}patch.description=value;catalogPatch.description=value;}
  else return;
  const {error}=await admin.from("user_books").update(patch).eq("id",bookId).eq("user_id",access.userId);if(error){await sendTelegramMessage(chatId,`Não consegui salvar a alteração: ${escapeHtml(error.message)}`);return;}
  if(resetKindle)await resetGeneratedKindle(access.userId,bookId);await syncCatalogBook(access.userId,bookId,catalogPatch);await setState(user.id,"idle",{});
  await sendTelegramMessage(chatId,"✅ <b>Informação atualizada.</b>\nA alteração já foi salva na sua biblioteca.");await showUploadDetail(user,chatId,bookId);
}

async function receiveCover(user:TgUser,chatId:number,fileId:string,fileName:string,mimeType:string){
  const access=await requireBotAccess(user,chatId);if(!access)return;
  if(access.mode!=="upload_cover"&&access.mode!=="edit_cover"){await sendTelegramMessage(chatId,"🖼 Para trocar uma capa, abra <b>Meus Envios</b> e escolha o livro.",telegramMainKeyboard());return;}
  const bookId=access.context.bookId;if(!bookId){await setState(user.id,"idle",{});return;}
  if(!/^image\/(jpeg|png|webp|gif)$/i.test(mimeType)){await sendTelegramMessage(chatId,"Envie a capa como <b>foto, JPG, PNG ou WEBP</b>.");return;}
  await sendTelegramMessage(chatId,"🖼 <b>Recebi a capa.</b> Estou atualizando seu livro...");
  const {bytes}=await getTelegramFile(fileId);const arrayBuffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;const file=new File([arrayBuffer],fileName,{type:mimeType});
  const admin=createAdminSupabaseClient();const {data:before}=await admin.from("user_books").select("cover_url,drive_file_id,kindle_drive_file_id,moderation_status").eq("id",bookId).eq("user_id",access.userId).maybeSingle();if(!before)return;
  const uploaded=await uploadUserCoverToDrive(file,access.userId);const coverUrl=`/api/covers/${encodeURIComponent(uploaded.id)}`;
  if(before.kindle_drive_file_id&&before.kindle_drive_file_id!==before.drive_file_id)try{await deleteDriveFile(before.kindle_drive_file_id);}catch{}
  const {error}=await admin.from("user_books").update({cover_url:coverUrl,kindle_drive_file_id:null,kindle_file_name:null,kindle_generated_at:null,updated_at:new Date().toISOString()}).eq("id",bookId).eq("user_id",access.userId);
  if(error){try{await deleteDriveFile(uploaded.id);}catch{}throw new Error(error.message);}
  const oldCover=coverDriveId(before.cover_url);if(oldCover&&oldCover!==uploaded.id)try{await deleteDriveFile(oldCover);}catch{}
  await syncCatalogBook(access.userId,bookId,{cover_url:coverUrl,kindle_drive_file_id:null,kindle_file_name:null,kindle_generated_at:null});await setState(user.id,"idle",{});
  if(access.mode==="upload_cover"){
    await sendTelegramMessage(chatId,"🎉 <b>Envio concluído!</b>\n\n✅ Arquivo recebido\n✅ Capa adicionada\n✅ Livro disponível em Minha Biblioteca\n🕘 Status: <b>Em análise</b>\n\nVocê pode acompanhar ou editar este livro em <b>Meus Envios</b>.",telegramMainKeyboard());
  }else{await sendTelegramMessage(chatId,"✅ <b>Capa atualizada com sucesso.</b>");await showUploadDetail(user,chatId,bookId);}
}

async function receiveBook(user:TgUser,chatId:number,document:TgDocument){
  const access=await requireBotAccess(user,chatId);if(!access)return;
  if(access.mode!=="upload_file"){await sendTelegramMessage(chatId,"📤 Para adicionar um novo livro, toque primeiro em <b>ENVIAR</b> no menu.",telegramMainKeyboard());return;}
  if(document.file_size&&document.file_size>TELEGRAM_MAX_INCOMING_BYTES){await sendTelegramMessage(chatId,"⚠️ Esse arquivo é grande demais para ser recebido pelo bot. Para arquivos maiores, faça o envio diretamente pelo site.",telegramMainKeyboard());await setState(user.id,"idle",{});return;}
  let fileName=(document.file_name||"").trim();const mime=(document.mime_type||"").toLowerCase();const isPdf=fileName.toLowerCase().endsWith(".pdf")||mime==="application/pdf";const isEpub=fileName.toLowerCase().endsWith(".epub")||mime==="application/epub+zip";
  if(!isPdf&&!isEpub){await sendTelegramMessage(chatId,"📄 Envie um arquivo em <b>PDF</b> ou <b>EPUB</b>. Outros formatos não são aceitos para livros.",telegramBackToMenuKeyboard());return;}
  if(!fileName)fileName=isPdf?"livro.pdf":"livro.epub";const mimeType=isPdf?"application/pdf":"application/epub+zip";
  await sendTelegramMessage(chatId,"⏳ <b>Recebendo seu livro...</b>\n\nVou processar o arquivo e tentar identificar automaticamente os dados do livro.");
  const {bytes}=await getTelegramFile(document.file_id);const identified=await identifyBookFromUpload(fileName,mimeType,bytes);
  const {uploadUrl}=await createUserBookResumableUpload({userId:access.userId,fileName,mimeType,fileSize:bytes.byteLength});const arrayBuffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
  const driveResponse=await fetch(uploadUrl,{method:"PUT",headers:{"content-type":mimeType,"content-length":String(bytes.byteLength)},body:arrayBuffer});if(!driveResponse.ok){const text=await driveResponse.text();throw new Error(`Upload interno falhou (${driveResponse.status}): ${text.slice(0,160)}`);}
  const uploaded=await driveResponse.json() as {id?:string;name?:string};if(!uploaded.id)throw new Error("O armazenamento não retornou o ID do arquivo.");
  const admin=createAdminSupabaseClient();const {data:book,error}=await admin.from("user_books").insert({
    user_id:access.userId,title:identified.title,author:identified.author,description:identified.description,year:identified.year,pages:identified.pages,language:identified.language,drive_file_id:uploaded.id,file_name:uploaded.name||fileName,mime_type:mimeType,source:"upload",moderation_status:"pending",updated_at:new Date().toISOString()
  }).select("id,title,author").single();
  if(error){try{await deleteDriveFile(uploaded.id);}catch{}throw new Error(error.message);}
  await setState(user.id,"upload_cover",{bookId:book.id});
  await sendTelegramMessage(chatId,`📚 <b>Livro identificado!</b>\n\n<b>Título:</b> ${escapeHtml(book.title)}\n<b>Autor:</b> ${escapeHtml(book.author)}\n\n🖼 <b>Etapa 2 de 2 — envie a capa</b>\nAgora mande a capa do livro como <b>foto, JPG, PNG ou WEBP</b>.\n\nSe algum dado tiver sido identificado errado, não tem problema: depois você pode corrigir em <b>Meus Envios</b>.`,{inline_keyboard:[[{text:"⏭ Adicionar capa depois",callback_data:`skipcover:${book.id}`}],[{text:"↩️ Voltar ao menu",callback_data:"show_menu"}]]});
}

export async function POST(request:NextRequest){
  try{
    if(!validSecret(request.headers.get("x-telegram-bot-api-secret-token")))return NextResponse.json({ok:false},{status:401});
    const update=await request.json() as TgUpdate;
    if(update.callback_query){
      const q=update.callback_query;const chatId=q.message?.chat.id;if(!chatId){await answerTelegramCallback(q.id);return NextResponse.json({ok:true});}const data=q.data||"";
      if(data==="subscription_paid"){await answerTelegramCallback(q.id,"Envie seu comprovante");await sendTelegramMessage(chatId,`✅ <b>Pagamento realizado?</b>\n\nEnvie o comprovante para <b>@${receiptUsername()}</b> e informe seu @ do Telegram.\n\nAssim que o pagamento for conferido, seu acesso será ativado por <b>30 dias</b>.`);}
      else if(data==="action_download"){await answerTelegramCallback(q.id);await promptDownload(q.from,chatId);}
      else if(data==="action_upload"){await answerTelegramCallback(q.id);await promptUpload(q.from,chatId);}
      else if(data==="show_menu"){await answerTelegramCallback(q.id);await showMenu(q.from,chatId);}
      else if(data==="show_subscription"){await answerTelegramCallback(q.id);await showSubscription(q.from,chatId);}
      else if(data==="show_history"){await answerTelegramCallback(q.id);await showHistory(q.from,chatId);}
      else if(data==="show_uploads"){await answerTelegramCallback(q.id);await showUploads(q.from,chatId);}
      else if(data.startsWith("book:")){const [,s,id]=data.split(":");const source=sourceFromChar(s);await answerTelegramCallback(q.id);if(source)await showFormatOptions(q.from,chatId,source,id);}
      else if(data.startsWith("format:")){const [,s,id,format]=data.split(":");const source=sourceFromChar(s);await answerTelegramCallback(q.id,"Preparando arquivo...");if(source&&(format==="pdf"||format==="epub"))await sendBookFormat(q.from,chatId,source,id,format);}
      else if(data.startsWith("history:")){await answerTelegramCallback(q.id,"Preparando novamente...");await resendHistory(q.from,chatId,data.split(":")[1]);}
      else if(data.startsWith("upload:")){await answerTelegramCallback(q.id);await showUploadDetail(q.from,chatId,data.split(":")[1]);}
      else if(data.startsWith("edittitle:")){await answerTelegramCallback(q.id);await promptEdit(q.from,chatId,"edit_title",data.split(":")[1],"título","Envie o título correto do livro.");}
      else if(data.startsWith("editauthor:")){await answerTelegramCallback(q.id);await promptEdit(q.from,chatId,"edit_author",data.split(":")[1],"autor","Envie o nome correto do autor.");}
      else if(data.startsWith("edityear:")){await answerTelegramCallback(q.id);await promptEdit(q.from,chatId,"edit_year",data.split(":")[1],"ano","Envie apenas o ano, por exemplo <b>2001</b>. Para remover, escreva <b>limpar</b>.");}
      else if(data.startsWith("editdescription:")){await answerTelegramCallback(q.id);await promptEdit(q.from,chatId,"edit_description",data.split(":")[1],"sinopse","Envie a nova sinopse em uma única mensagem.");}
      else if(data.startsWith("editcover:")){const bookId=data.split(":")[1];const access=await requireBotAccess(q.from,chatId);await answerTelegramCallback(q.id);if(access){await setState(q.from.id,"edit_cover",{bookId});await sendTelegramMessage(chatId,"🖼 <b>Trocar capa</b>\n\nEnvie agora a nova capa como foto, JPG, PNG ou WEBP.",{inline_keyboard:[[{text:"↩️ Cancelar",callback_data:`upload:${bookId}`}]]});}}
      else if(data.startsWith("skipcover:")){const bookId=data.split(":")[1];const access=await requireBotAccess(q.from,chatId);await answerTelegramCallback(q.id);if(access&&access.context.bookId===bookId){await setState(q.from.id,"idle",{});await sendTelegramMessage(chatId,"✅ <b>Livro salvo sem capa por enquanto.</b>\n\nEle já aparece em Minha Biblioteca. Você pode adicionar a capa depois em <b>Meus Envios</b>.",telegramMainKeyboard());}}
      else await answerTelegramCallback(q.id);
      return NextResponse.json({ok:true});
    }

    const message=update.message;const from=message?.from;const chatId=message?.chat.id;if(!message||!from||!chatId)return NextResponse.json({ok:true});
    if(message.photo?.length){const photo=message.photo[message.photo.length-1];await receiveCover(from,chatId,photo.file_id,"capa.jpg","image/jpeg");return NextResponse.json({ok:true});}
    if(message.document){
      const state=await getLinkedState(from,chatId);const mode=state?.mode;
      if((mode==="upload_cover"||mode==="edit_cover")&&/^image\/(jpeg|png|webp|gif)$/i.test(message.document.mime_type||"")){await receiveCover(from,chatId,message.document.file_id,message.document.file_name||"capa.jpg",message.document.mime_type||"image/jpeg");}
      else if(mode==="upload_cover"||mode==="edit_cover"){await sendTelegramMessage(chatId,"🖼 Estou esperando a <b>capa do livro</b>. Envie uma foto, JPG, PNG ou WEBP.");}
      else await receiveBook(from,chatId,message.document);
      return NextResponse.json({ok:true});
    }

    const raw=(message.text||"").trim();const text=raw.toLowerCase();
    if(text.startsWith("/start")||text.startsWith("/entrar")||text.startsWith("/menu")){await showMenu(from,chatId);return NextResponse.json({ok:true});}
    if(text.startsWith("/baixar")){await promptDownload(from,chatId);return NextResponse.json({ok:true});}
    if(text.startsWith("/enviar")){await promptUpload(from,chatId);return NextResponse.json({ok:true});}
    if(text.startsWith("/historico")){await showHistory(from,chatId);return NextResponse.json({ok:true});}
    if(text.startsWith("/envios")){await showUploads(from,chatId);return NextResponse.json({ok:true});}
    if(text.startsWith("/status")||text.startsWith("/assinatura")){await showSubscription(from,chatId);return NextResponse.json({ok:true});}
    const access=await requireBotAccess(from,chatId);if(!access)return NextResponse.json({ok:true});
    if(access.mode==="download"&&raw){await searchBooks(from,chatId,raw);return NextResponse.json({ok:true});}
    if(["edit_title","edit_author","edit_year","edit_description"].includes(access.mode)&&raw){await handleEditText(from,chatId,access,raw);return NextResponse.json({ok:true});}
    if(access.mode==="upload_file"){await sendTelegramMessage(chatId,"📄 Estou esperando o arquivo do livro em <b>PDF ou EPUB</b>. Use o clipe do Telegram para enviar o documento.",telegramBackToMenuKeyboard());return NextResponse.json({ok:true});}
    if(access.mode==="upload_cover"||access.mode==="edit_cover"){await sendTelegramMessage(chatId,"🖼 Estou esperando a <b>capa</b>. Envie uma imagem ou use o botão de voltar.",telegramBackToMenuKeyboard());return NextResponse.json({ok:true});}
    await showMenu(from,chatId);return NextResponse.json({ok:true});
  }catch(error){console.error("[telegram-webhook]",error);return NextResponse.json({ok:true});}
}

export async function GET(){return NextResponse.json({ok:true,service:"telegram-webhook-v2"});}
