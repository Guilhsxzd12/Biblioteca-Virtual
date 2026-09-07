import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getViewer } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSubscriptionState } from "@/lib/subscription";
import { paymentUrl,receiptUsername } from "@/lib/telegram";
import { SITE_NAME } from "@/lib/site";

export default async function SubscriptionPage(){
  const viewer=await getViewer();
  if(!viewer.user)redirect("/login?next=/assinatura");
  const admin=createAdminSupabaseClient();
  const [subscription,{data:telegram}]=await Promise.all([
    getSubscriptionState(viewer.user.id),
    admin.from("telegram_accounts").select("username,first_name").eq("user_id",viewer.user.id).maybeSingle()
  ]);
  const payUrl=paymentUrl();
  const receipt=receiptUsername();
  const activeUntil=subscription.activeUntil?new Intl.DateTimeFormat("pt-BR",{dateStyle:"long",timeZone:"America/Sao_Paulo"}).format(new Date(subscription.activeUntil)):null;
  return <AppShell allowInactive><main className="container" style={{maxWidth:860}}><section className="card panel" style={{padding:28}}>
    <span className="eyebrow">ASSINATURA</span><h1>{SITE_NAME}</h1><p className="muted">Acesso ao catálogo, downloads em PDF e EPUB, pedidos e integração com Telegram.</p>
    <div className="card" style={{padding:22,margin:"22px 0"}}><div className="row" style={{justifyContent:"space-between",alignItems:"end"}}><div><small className="muted">PLANO MENSAL</small><div style={{fontSize:34,fontWeight:800}}>R$ 8,90 <small style={{fontSize:14}}>/ mês</small></div></div><strong>{subscription.isActive?"Ativa":"Inativa"}</strong></div>{activeUntil&&<p className="muted">Acesso liberado até <b>{activeUntil}</b>.</p>}</div>
    {viewer.profile?.role==="admin"?<div className="notice success">Contas de administrador não precisam de assinatura.</div>:subscription.isActive?<div className="notice success">Sua assinatura está ativa. Você já pode baixar livros e fazer pedidos pelo Telegram.</div>:<><p>Para liberar o acesso, faça o pagamento e envie o comprovante para <b>@{receipt}</b>. O administrador fornecerá seu e-mail e senha.</p><div className="row wrap">{payUrl?<a className="btn" href={payUrl} target="_blank" rel="noreferrer">Pagar assinatura</a>:<span className="notice">O link fixo de pagamento ainda não foi configurado pelo administrador.</span>}</div></>}
    <hr style={{margin:"26px 0",border:0,borderTop:"1px solid var(--border)"}}/><h2>Telegram</h2>{telegram?<p>Conta vinculada: <b>@{telegram.username||telegram.first_name||"Telegram"}</b></p>:<p className="muted">Abra o bot, toque em <b>Já tenho acesso</b> e envie o mesmo e-mail e senha usados neste site.</p>}
  </section></main></AppShell>;
}
