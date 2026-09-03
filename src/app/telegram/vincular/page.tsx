import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSubscriptionState } from "@/lib/subscription";
import { paymentKeyboard,paymentMessage,sendTelegramMessage,telegramMainKeyboard } from "@/lib/telegram";

export default async function TelegramLinkPage({searchParams}:{searchParams:Promise<{code?:string}>}){
  const params=await searchParams;const code=String(params.code||"").trim();
  const viewer=await getViewer();
  if(!viewer.user){const next=code?`/telegram/vincular?code=${encodeURIComponent(code)}`:"/telegram/vincular";redirect(`/login?next=${encodeURIComponent(next)}`);}
  const admin=createAdminSupabaseClient();
  if(!code){
    const {data:linked}=await admin.from("telegram_accounts").select("username,first_name").eq("user_id",viewer.user.id).maybeSingle();
    return <main className="container" style={{maxWidth:680,paddingTop:50}}><section className="card panel"><h1>Telegram</h1>{linked?<><div className="notice success">Conta vinculada com sucesso.</div><p>Telegram: <b>@{linked.username||linked.first_name||"conta vinculada"}</b></p><Link className="btn" href="/assinatura">Ver assinatura</Link></>:<><p className="muted">Abra o bot da Biblioteca Virtual e envie <b>/start</b>. Ele vai gerar um link seguro para vincular sua conta.</p><Link className="btn ghost" href="/assinatura">Voltar</Link></>}</section></main>;
  }
  const {data:link}=await admin.from("telegram_link_codes").select("code,telegram_user_id,chat_id,username,first_name,expires_at,used_at").eq("code",code).maybeSingle();
  if(!link)return <main className="container" style={{maxWidth:680,paddingTop:50}}><section className="card panel"><h1>Link inválido</h1><p className="muted">Esse link não existe ou já expirou. Volte ao bot e envie /start para gerar outro.</p></section></main>;
  const {data:existing}=await admin.from("telegram_accounts").select("user_id,username,first_name").eq("telegram_user_id",link.telegram_user_id).maybeSingle();
  if(link.used_at){
    const ok=existing?.user_id===viewer.user.id;
    return <main className="container" style={{maxWidth:680,paddingTop:50}}><section className="card panel"><h1>{ok?"Telegram vinculado":"Link já utilizado"}</h1><div className={`notice ${ok?"success":""}`}>{ok?"Sua conta já está vinculada ao Telegram.":"Gere um novo link pelo bot para continuar."}</div>{ok&&<Link className="btn" href="/assinatura">Continuar</Link>}</section></main>;
  }
  if(new Date(link.expires_at).getTime()<=Date.now())return <main className="container" style={{maxWidth:680,paddingTop:50}}><section className="card panel"><h1>Link expirado</h1><p className="muted">Volte ao bot e envie /start para gerar um novo link.</p></section></main>;
  await admin.from("telegram_accounts").delete().eq("user_id",viewer.user.id);
  await admin.from("telegram_accounts").delete().eq("telegram_user_id",link.telegram_user_id);
  const {error}=await admin.from("telegram_accounts").insert({user_id:viewer.user.id,telegram_user_id:link.telegram_user_id,chat_id:link.chat_id,username:link.username,first_name:link.first_name,bot_mode:"idle",updated_at:new Date().toISOString()});
  if(error)throw new Error(error.message);
  await admin.from("telegram_link_codes").update({used_at:new Date().toISOString()}).eq("code",code);
  try{
    const [{data:profile},subscription]=await Promise.all([
      admin.from("profiles").select("approved,role").eq("id",viewer.user.id).maybeSingle(),
      getSubscriptionState(viewer.user.id)
    ]);
    if(profile?.role==="admin"||(profile?.approved&&subscription.isActive)){
      await sendTelegramMessage(link.chat_id,"✅ <b>Conta vinculada!</b>\n\nSeu Telegram agora está conectado à Biblioteca Virtual.\n\nO que você deseja fazer?",telegramMainKeyboard());
    }else{
      await sendTelegramMessage(link.chat_id,"✅ <b>Conta vinculada!</b>\n\nAgora falta ativar sua assinatura para usar a biblioteca pelo Telegram.\n\n"+paymentMessage(),paymentKeyboard());
    }
  }catch(error){console.warn("[telegram-link] não foi possível confirmar no bot",error);}
  return <main className="container" style={{maxWidth:680,paddingTop:50}}><section className="card panel"><h1>Telegram vinculado 🎉</h1><div className="notice success">A conta foi conectada à Biblioteca Virtual.</div><p>Telegram: <b>@{link.username||link.first_name||"conta vinculada"}</b></p><div className="row wrap"><Link className="btn" href="/assinatura">Ver assinatura</Link><Link className="btn ghost" href="/biblioteca">Biblioteca</Link></div></section></main>;
}
