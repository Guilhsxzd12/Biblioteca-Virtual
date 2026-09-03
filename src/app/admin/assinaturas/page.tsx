import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SubscriptionsAdmin } from "@/components/SubscriptionsAdmin";
import { requireAdmin } from "@/lib/auth";

export default async function AdminSubscriptionsPage(){
  await requireAdmin();
  return <AppShell><main className="container"><div className="page-head"><div><span className="eyebrow">ADMIN</span><h1>Assinaturas e Telegram</h1><p>Confirme pagamentos manualmente e gerencie o acesso pelo Telegram.</p></div><Link className="btn ghost" href="/admin">← Voltar ao painel</Link></div><SubscriptionsAdmin/></main></AppShell>;
}
