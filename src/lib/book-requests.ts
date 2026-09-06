import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { SITE_NAME } from "@/lib/site";
import { PUBLIC_SITE_URL,sendTelegramMessage } from "@/lib/telegram";

export async function completeBookRequest(requestId:string,book:{id:string;slug:string;title:string}){
  const admin=createAdminSupabaseClient();
  const {data:request,error}=await admin.from("book_requests").select("id,user_id,status").eq("id",requestId).maybeSingle();
  if(error)throw new Error(error.message);
  if(!request)return {notificationSent:false,reason:"Pedido não encontrado."};
  const now=new Date().toISOString();
  const {error:updateError}=await admin.from("book_requests").update({status:"published",matched_book_id:book.id,published_at:now,updated_at:now}).eq("id",request.id);
  if(updateError)throw new Error(updateError.message);
  const {data:telegram}=await admin.from("telegram_accounts").select("chat_id").eq("user_id",request.user_id).maybeSingle();
  if(!telegram?.chat_id)return {notificationSent:false,reason:"Usuário ainda não conectou o Telegram."};
  try{
    const url=`${PUBLIC_SITE_URL}/livro/${encodeURIComponent(book.slug)}`;
    await sendTelegramMessage(telegram.chat_id,`🎉 <b>Seu livro foi publicado!</b>\n\n📚 <b>${escapeHtml(book.title)}</b> já está disponível na ${SITE_NAME}.\n\nAcesse pelo link abaixo para baixar:`,{inline_keyboard:[[{text:"📖 ACESSAR LIVRO",url}],[{text:"↩️ VOLTAR AO MENU",callback_data:"show_menu"}]]});
    await admin.from("book_requests").update({notified_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",request.id);
    return {notificationSent:true};
  }catch(error){
    console.warn("[book-request] notification failed",error instanceof Error?error.message:"unknown");
    return {notificationSent:false,reason:"O Telegram não aceitou a notificação."};
  }
}

function escapeHtml(value:string){return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");}
