import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { fetchDriveFile } from "@/lib/google-drive";
import {
  PUBLIC_SITE_URL,
  TELEGRAM_MAX_OUTGOING_BYTES,
  sendTelegramDocument,
  sendTelegramDocumentByFileId,
  sendTelegramMessage
} from "@/lib/telegram";

type ChannelRole="official"|"reserve";
type ChannelChat={id:number;type?:string;title?:string};
type TelegramMessage={message_id?:number;document?:{file_id?:string}};

function escapeHtml(value:unknown){return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");}
function normalize(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function languageName(value?:string|null){return ({pt:"Português",en:"Inglês",es:"Espanhol",fr:"Francês",it:"Italiano",de:"Alemão"} as Record<string,string>)[value||""]||value||"Não informado";}
function bookEpub(book:any){
  const mainIsEpub=book?.mime_type==="application/epub+zip"||String(book?.file_name||"").toLowerCase().endsWith(".epub");
  return mainIsEpub?{id:book.drive_file_id,name:book.file_name}:{id:book.kindle_drive_file_id,name:book.kindle_file_name};
}
function bookPdf(book:any){
  const mainIsPdf=book?.mime_type==="application/pdf"||String(book?.file_name||"").toLowerCase().endsWith(".pdf");
  return mainIsPdf?{id:book.drive_file_id,name:book.file_name}:{id:book.reading_pdf_drive_file_id,name:book.reading_pdf_file_name};
}

export function telegramChannelWelcomeText(){
  return `📚 <b>Sejam bem-vindos ao canal Kindle E-book!</b>\n\nAqui você acompanha os novos livros adicionados ao acervo Kindle Books e recebe as versões disponíveis em <b>EPUB</b> e <b>PDF</b>.\n\n🔔 Ative as notificações para não perder os novos títulos.\n📖 Use o EPUB para Kindle e aplicativos compatíveis.\n📄 Use o PDF para leitura em celular, tablet ou computador.\n\n🌐 <a href="${PUBLIC_SITE_URL}/biblioteca">Acessar o Kindle Books</a>\n\nBoa leitura! 🤍`;
}

async function nextRole(title:string):Promise<ChannelRole|null>{
  const db=createAdminSupabaseClient();
  const preferred:ChannelRole=normalize(title).includes("reserva")||normalize(title).includes("backup")?"reserve":"official";
  const {data:preferredRow}=await db.from("telegram_channels").select("chat_id").eq("role",preferred).maybeSingle();
  if(!preferredRow)return preferred;
  const fallback:ChannelRole=preferred==="official"?"reserve":"official";
  const {data:fallbackRow}=await db.from("telegram_channels").select("chat_id").eq("role",fallback).maybeSingle();
  return fallbackRow?null:fallback;
}

export async function registerTelegramChannel(chat:ChannelChat){
  if(chat.type&&chat.type!=="channel")return null;
  const db=createAdminSupabaseClient();
  const {data:existing}=await db.from("telegram_channels").select("*").eq("chat_id",chat.id).maybeSingle();
  if(existing){
    await db.from("telegram_channels").update({title:chat.title||existing.title,active:true,updated_at:new Date().toISOString()}).eq("id",existing.id);
    if(!existing.welcome_sent_at){
      const message=await sendTelegramMessage(chat.id,telegramChannelWelcomeText());
      await db.from("telegram_channels").update({welcome_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",existing.id);
      return {...existing,title:chat.title||existing.title,welcomeSent:true,message};
    }
    return existing;
  }
  const role=await nextRole(chat.title||"");if(!role)return null;
  const {data,error}=await db.from("telegram_channels").insert({chat_id:chat.id,title:chat.title||null,role,active:true}).select("*").single();
  if(error)throw new Error(error.message);
  const message=await sendTelegramMessage(chat.id,telegramChannelWelcomeText());
  await db.from("telegram_channels").update({welcome_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",data.id);
  return {...data,welcomeSent:true,message};
}

async function readDriveBytes(fileId:string){
  const response=await fetchDriveFile(fileId);const declared=Number(response.headers.get("content-length")||0);
  if(declared>TELEGRAM_MAX_OUTGOING_BYTES)throw new Error("Arquivo maior que o limite de envio do Telegram.");
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.byteLength>TELEGRAM_MAX_OUTGOING_BYTES)throw new Error("Arquivo maior que o limite de envio do Telegram.");
  return bytes;
}

function extractFileId(message:unknown){return (message as TelegramMessage|undefined)?.document?.file_id||null;}
function extractMessageId(message:unknown){return (message as TelegramMessage|undefined)?.message_id||null;}

export async function publishBookToTelegramChannels(bookId:string){
  const db=createAdminSupabaseClient();
  const [{data:book,error:bookError},{data:channels,error:channelError}]=await Promise.all([
    db.from("books").select("*,categories(name)").eq("id",bookId).maybeSingle(),
    db.from("telegram_channels").select("*").eq("active",true).order("role",{ascending:true})
  ]);
  if(bookError||!book)throw new Error(bookError?.message||"Livro não encontrado.");
  if(channelError)throw new Error(channelError.message);
  if(!channels?.length)throw new Error("Os canais do Telegram ainda não foram detectados pelo bot.");

  const epub=bookEpub(book);const pdf=bookPdf(book);
  if(!epub.id&&!pdf.id)throw new Error("O livro não possui EPUB ou PDF disponível para o Telegram.");
  const cachedTelegramFileIds:{epub?:string;pdf?:string}={};
  const results:Array<{channel:string;role:string;status:string;error?:string}> = [];
  const category=book.categories?.name||"Sem categoria";
  const intro=`📚 <b>${escapeHtml(book.title)}</b>\n✍️ ${escapeHtml(book.author)}\n🗂 ${escapeHtml(category)}\n🌎 ${escapeHtml(languageName(book.language))}\n\nOs arquivos disponíveis estão logo abaixo.\n🌐 <a href="${PUBLIC_SITE_URL}/livro/${encodeURIComponent(book.slug)}">Ver no Kindle Books</a>`;

  for(const channel of channels){
    const {data:previous}=await db.from("telegram_channel_publications").select("*").eq("book_id",book.id).eq("channel_id",channel.id).maybeSingle();
    if(previous?.status==="sent"){results.push({channel:channel.title||String(channel.chat_id),role:channel.role,status:"already-sent"});continue;}
    await db.from("telegram_channel_publications").upsert({book_id:book.id,channel_id:channel.id,status:"pending",last_error:null,updated_at:new Date().toISOString()},{onConflict:"book_id,channel_id"});
    let textMessageId:number|null=null,epubMessageId:number|null=null,pdfMessageId:number|null=null;const errors:string[]=[];
    try{
      const introMessage=await sendTelegramMessage(channel.chat_id,intro);textMessageId=extractMessageId(introMessage);
      if(epub.id&&epub.name){
        try{
          const sent=cachedTelegramFileIds.epub
            ? await sendTelegramDocumentByFileId(channel.chat_id,cachedTelegramFileIds.epub,`📱 <b>${escapeHtml(book.title)}</b> • EPUB`)
            : await sendTelegramDocument(channel.chat_id,epub.name,"application/epub+zip",await readDriveBytes(epub.id),`📱 <b>${escapeHtml(book.title)}</b> • EPUB`);
          epubMessageId=extractMessageId(sent);const fileId=extractFileId(sent);if(fileId)cachedTelegramFileIds.epub=fileId;
        }catch(error){errors.push(`EPUB: ${error instanceof Error?error.message:"falha no envio"}`);}
      }
      if(pdf.id&&pdf.name){
        try{
          const sent=cachedTelegramFileIds.pdf
            ? await sendTelegramDocumentByFileId(channel.chat_id,cachedTelegramFileIds.pdf,`📄 <b>${escapeHtml(book.title)}</b> • PDF`)
            : await sendTelegramDocument(channel.chat_id,pdf.name,"application/pdf",await readDriveBytes(pdf.id),`📄 <b>${escapeHtml(book.title)}</b> • PDF`);
          pdfMessageId=extractMessageId(sent);const fileId=extractFileId(sent);if(fileId)cachedTelegramFileIds.pdf=fileId;
        }catch(error){errors.push(`PDF: ${error instanceof Error?error.message:"falha no envio"}`);}
      }
      const expected=(epub.id?1:0)+(pdf.id?1:0);const sent=(epubMessageId?1:0)+(pdfMessageId?1:0);const status=sent===expected&&expected>0?"sent":sent>0?"partial":"failed";
      await db.from("telegram_channel_publications").upsert({book_id:book.id,channel_id:channel.id,status,text_message_id:textMessageId,epub_message_id:epubMessageId,pdf_message_id:pdfMessageId,last_error:errors.join(" | ")||null,sent_at:sent?new Date().toISOString():null,updated_at:new Date().toISOString()},{onConflict:"book_id,channel_id"});
      results.push({channel:channel.title||String(channel.chat_id),role:channel.role,status,error:errors.join(" | ")||undefined});
    }catch(error){
      const reason=error instanceof Error?error.message:"Falha ao publicar no canal.";
      await db.from("telegram_channel_publications").upsert({book_id:book.id,channel_id:channel.id,status:"failed",text_message_id:textMessageId,epub_message_id:epubMessageId,pdf_message_id:pdfMessageId,last_error:reason,updated_at:new Date().toISOString()},{onConflict:"book_id,channel_id"});
      results.push({channel:channel.title||String(channel.chat_id),role:channel.role,status:"failed",error:reason});
    }
  }
  return {book:{id:book.id,title:book.title},results};
}

export async function resendWelcomeToTelegramChannels(){
  const db=createAdminSupabaseClient();const {data:channels,error}=await db.from("telegram_channels").select("*").eq("active",true).order("role");
  if(error)throw new Error(error.message);if(!channels?.length)throw new Error("Nenhum canal detectado.");
  const results=[];for(const channel of channels){const message=await sendTelegramMessage(channel.chat_id,telegramChannelWelcomeText());await db.from("telegram_channels").update({welcome_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",channel.id);results.push({id:channel.id,title:channel.title,role:channel.role,messageId:extractMessageId(message)});}return results;
}
