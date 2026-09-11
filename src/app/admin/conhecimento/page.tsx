import Link from "next/link";
import { revalidatePath } from "next/cache";
import { AppShell } from "@/components/AppShell";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import styles from "./conhecimento.module.css";

export const dynamic="force-dynamic";

async function processKnowledgeNow(){
  "use server";
  await requireAdmin();
  const admin=createAdminSupabaseClient();
  await Promise.allSettled([
    admin.rpc("trigger_knowledge_worker",{p_limit:100}),
    admin.rpc("trigger_knowledge_enricher",{p_limit:100}),
    admin.rpc("trigger_cover_cache_worker",{p_limit:100})
  ]);
  revalidatePath("/admin/conhecimento");
}

const fmt=(value?:string|null)=>value?new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"}).format(new Date(value)):"—";

export default async function ConhecimentoPage(){
  await requireAdmin();
  const admin=createAdminSupabaseClient();
  const [
    knowledgeCount,publishedCount,linkedCount,reviewedCount,pendingCount,missingCoverCount,manualCount,
    recentRuns,recentKnowledge
  ]=await Promise.all([
    admin.from("book_knowledge").select("id",{count:"exact",head:true}),
    admin.from("books").select("id",{count:"exact",head:true}).eq("published",true),
    admin.from("books").select("id",{count:"exact",head:true}).eq("published",true).not("knowledge_id","is",null),
    admin.from("books").select("id",{count:"exact",head:true}).eq("published",true).eq("metadata_reviewed",true),
    admin.from("books").select("id",{count:"exact",head:true}).eq("published",true).eq("metadata_reviewed",false),
    admin.from("books").select("id",{count:"exact",head:true}).eq("published",true).is("cover_url",null),
    admin.from("books").select("id",{count:"exact",head:true}).eq("published",true).eq("knowledge_status","manual"),
    admin.from("knowledge_runs").select("id,started_at,finished_at,selected_count,matched_count,completed_count,error_count,status,note").order("id",{ascending:false}).limit(5),
    admin.from("book_knowledge").select("id,title,author,cover_url,language,year,confidence,source,updated_at").order("updated_at",{ascending:false}).limit(8)
  ]);

  const totalKnowledge=knowledgeCount.count||0;
  const totalPublished=publishedCount.count||0;
  const linked=linkedCount.count||0;
  const reviewed=reviewedCount.count||0;
  const pending=pendingCount.count||0;
  const missingCover=missingCoverCount.count||0;
  const manual=manualCount.count||0;
  const coverage=totalPublished?Math.round(linked/totalPublished*100):0;
  const reviewCoverage=totalPublished?Math.round(reviewed/totalPublished*100):0;
  const latestRun=recentRuns.data?.[0];

  return <AppShell><main className={`container ${styles.page}`}>
    <section className={styles.hero}>
      <div>
        <span className={styles.eyebrow}>🧠 INTELIGÊNCIA DO ACERVO</span>
        <h1 className={styles.title}>Base de conhecimento</h1>
        <p className={styles.subtitle}>O Kindle Books reconhece cada obra, cruza a base local com Google Books e Open Library e aplica automaticamente título, autor, sinopse, capa, idioma, ano, páginas e classificação no livro correspondente.</p>
        <div className={styles.heroActions}>
          <form action={processKnowledgeNow}><button className={styles.primaryButton} type="submit">⚡ Processar 100 livros agora</button></form>
          <Link className={styles.secondaryButton} href="/admin">← Voltar ao painel</Link>
        </div>
      </div>
      <aside className={styles.heroStatus}>
        <span className={styles.online}><i className={styles.onlineDot}/> Automação ativa</span>
        <strong>{coverage}% reconhecidos</strong>
        <span>Novos livros entram com prioridade. O robô principal roda automaticamente a cada 5 minutos e os dados enriquecidos são enviados de volta aos registros do catálogo.</span>
        <div className={styles.progressTrack}><div className={styles.progressFill} style={{width:`${Math.min(100,coverage)}%`}}/></div>
      </aside>
    </section>

    <section className={styles.stats}>
      <article className={styles.stat}><span className={styles.statLabel}>📚 Conhecimento acumulado</span><strong className={styles.statValue}>{totalKnowledge.toLocaleString("pt-BR")}</strong><span className={styles.statMeta}>obras e edições aprendidas</span></article>
      <article className={styles.stat}><span className={styles.statLabel}>🔗 Livros reconhecidos</span><strong className={styles.statValue}>{linked.toLocaleString("pt-BR")}</strong><span className={styles.statMeta}>de {totalPublished.toLocaleString("pt-BR")} publicados</span></article>
      <article className={styles.stat}><span className={styles.statLabel}>✅ Revisão completa</span><strong className={styles.statValue}>{reviewed.toLocaleString("pt-BR")}</strong><span className={styles.statMeta}>{reviewCoverage}% do acervo validado</span></article>
      <article className={styles.stat}><span className={styles.statLabel}>🖼️ Capas faltantes</span><strong className={styles.statValue}>{missingCover.toLocaleString("pt-BR")}</strong><span className={styles.statMeta}>{pending.toLocaleString("pt-BR")} ainda na fila geral</span></article>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHead}><div><h2>Como o reconhecimento funciona</h2><p>Não depende de uma revisão manual livro por livro. O fluxo acontece no próprio sistema.</p></div><span className={styles.badge}>{manual} precisam de decisão humana</span></div>
      <div className={styles.pipeline}>
        <article className={styles.step}><span className={styles.stepNumber}>1</span><h3>Livro entra no acervo</h3><p>Título, autor, nome do arquivo e metadados internos são usados como pistas. Entradas novas recebem prioridade.</p></article>
        <article className={styles.step}><span className={styles.stepNumber}>2</span><h3>Consulta a base local</h3><p>Se o Kindle Books já conhece a obra, o vínculo é feito imediatamente sem depender de uma busca externa.</p></article>
        <article className={styles.step}><span className={styles.stepNumber}>3</span><h3>Confirma em fontes externas</h3><p>Quando necessário, compara Google Books e Open Library e só aceita resultados com confiança suficiente.</p></article>
        <article className={styles.step}><span className={styles.stepNumber}>4</span><h3>Aplica no livro correto</h3><p>Sinopse, capa, ano, páginas, idioma e demais dados faltantes voltam automaticamente para o registro do catálogo.</p></article>
      </div>
    </section>

    <div className={styles.contentGrid}>
      <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>Atividade recente</h2><p>{latestRun?`Último processamento: ${fmt(latestRun.finished_at||latestRun.started_at)}`:"Aguardando a primeira execução."}</p></div><span className={styles.badge}>tempo real</span></div>
        <div className={styles.runList}>{recentRuns.data?.length?recentRuns.data.map(run=><article className={styles.run} key={run.id}><span className={styles.runIcon}>{run.status==="done"?"✓":"…"}</span><div><strong>{run.status==="done"?"Lote processado":"Processando lote"}</strong><small>{fmt(run.finished_at||run.started_at)} • {run.matched_count||0} reconhecidos • {run.error_count||0} erros</small></div><span className={styles.runCount}>{run.selected_count||0} livros</span></article>):<div className={styles.empty}>Nenhuma execução registrada.</div>}</div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>Conhecimento aprendido</h2><p>Registros atualizados mais recentemente pela base.</p></div><span className={styles.badge}>{totalKnowledge.toLocaleString("pt-BR")} registros</span></div>
        <div className={styles.knowledgeList}>{recentKnowledge.data?.length?recentKnowledge.data.map(item=><article className={styles.knowledgeRow} key={item.id}>{item.cover_url?<img className={styles.cover} src={item.cover_url} alt=""/>:<span className={styles.coverFallback}>{String(item.title||"?").slice(0,1).toUpperCase()}</span>}<div><strong>{item.title}</strong><small>{item.author||"Autor não identificado"}{item.year?` • ${item.year}`:""}{item.language?` • ${String(item.language).toUpperCase()}`:""} • {item.source||"base local"}</small></div><span className={styles.confidence}>{item.confidence||0}%</span></article>):<div className={styles.empty}>A base ainda não possui registros recentes.</div>}</div>
      </section>
    </div>

    <div className={styles.footNote}><strong>🤖 O sistema continua trabalhando mesmo sem o ChatGPT aberto.</strong><span>Reconhecimento: a cada 5 min • enriquecimento e cache de capas: automáticos • dados propagados aos livros vinculados</span></div>
  </main></AppShell>;
}
