import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { TelegramBooksAdmin } from "@/components/TelegramBooksAdmin";
import { requireAdmin } from "@/lib/auth";
import type { Book } from "@/lib/types";

export default async function TelegramBooksPage(){
  const {supabase}=await requireAdmin();
  const {data}=await supabase.from("books").select("*,categories(name)").eq("source","telegram").order("created_at",{ascending:false});
  return <AppShell><main className="container admin-page">
    <div className="page-head"><div><span className="eyebrow">PAINEL ADMIN</span><h1>Livros Telegram</h1><p>Livros enviados pelo @BIBLIOTECAUPLOADBOT.</p></div><Link className="btn ghost" href="/admin">← Voltar ao painel</Link></div>
    <TelegramBooksAdmin initialBooks={(data||[]) as Book[]}/>
  </main></AppShell>;
}
