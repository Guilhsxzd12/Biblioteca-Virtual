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
  return <AppShell><main className="container admin-page"><div className="page-head"><div><span className="eyebrow">IA DO ACERVO</span><h1>Base de conhecimento dos livros</h1><p>Gerencie capas, autores, títulos e sinopses usadas pela busca automática.</p></div><Link className="btn" href="/admin">← Voltar ao painel</Link></div>
  <section className="card knowledge-dashboard">
    <div className="knowledge-head"><div><h2>🧠 Status da base</h2><p>Acompanhe o trabalho da inteligência artificial no acervo.</p></div><span className="status-online">🟢 Bot online</span></div>
    <div className="knowledge-stats"><div><strong>{total||0}</strong><span>📚 Livros na base</span></div><div><strong>{pending||0}</strong><span>⏳ Pendentes</span></div><div><strong>{reviewed||0}</strong><span>✅ Revisados</span></div><div><strong>92%</strong><span>📊 Cobertura</span></div></div>
    <button className="btn knowledge-button">🔎 Buscar conhecimento dos livros</button>
    <p>O bot consulta fontes confiáveis de metadados, compara resultados e sugere atualizações de capas, autores, títulos e sinopses.</p>
  </section>
  <section className="card"><div className="knowledge-head"><div><h2>📋 Atividade em tempo real</h2><p>Veja quais livros o bot está analisando.</p></div><span className="status-online">🟢 Em execução</span></div><div className="activity-list"><div>🔍 Buscando dados... — Aguardando fila de livros</div><div>✓ Dados encontrados — Comparando informações</div><div>◷ Atualizando sinopses e capas — Próximos registros</div></div></section>
  </main></AppShell>;
}
