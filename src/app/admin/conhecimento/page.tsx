import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export default async function ConhecimentoPage(){
  await requireAdmin();
  const admin=createAdminSupabaseClient();
  const [{count:total},{count:pending},{count:reviewed}]=await Promise.all([
    admin.from("book_knowledge").select("id",{count:"exact",head:true}),
    admin.from("book_knowledge").select("id",{count:"exact",head:true}).lt("confidence",90),
    admin.from("books").select("id",{count:"exact",head:true}).eq("metadata_reviewed",true)
  ]);
  return <AppShell><main className="container admin-page"><div className="page-head"><div><span className="eyebrow">IA DO ACERVO</span><h1>Base de conhecimento dos livros</h1><p>Gerencie capas, autores, títulos e sinopses usadas pela busca automática.</p></div><Link className="btn" href="/admin">Voltar ao painel</Link></div><section className="card"><h2>Status da base</h2><p>Livros na base: {total||0}</p><p>Pendentes de confiança: {pending||0}</p><p>Livros revisados: {reviewed||0}</p><button className="btn">Atualizar conhecimento dos livros</button></section></main></AppShell>;
}
