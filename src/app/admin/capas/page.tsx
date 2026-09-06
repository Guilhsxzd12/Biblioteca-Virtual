import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireAdmin } from "@/lib/auth";

export default async function CoversAdminIndex({searchParams}:{searchParams:Promise<{q?:string}>}){
  const {supabase}=await requireAdmin();
  const {q=""}=await searchParams;const query=q.trim();const safe=query.replace(/[,()%]/g," ").replace(/\s+/g," ").trim();
  let booksQuery=supabase.from("books").select("id,title,author,cover_url,slug,created_at").order("created_at",{ascending:false});
  booksQuery=safe?booksQuery.or(`title.ilike.%${safe}%,author.ilike.%${safe}%`).limit(20):booksQuery.limit(10);
  const {data:books}=await booksQuery;
  return <AppShell><main className="container admin-page"><div className="page-head"><div><span className="eyebrow">CAPAS DO KINDLE</span><h1>Capas alternativas</h1><p>Adicione versões de capa corretas para cada livro. Elas aparecem no seletor antes do EPUB.</p></div><Link className="btn ghost" href="/admin">← Voltar ao admin</Link></div>
    <section className="card panel cover-search-panel">
      <form className="admin-cover-search" action="/admin/capas"><input type="search" name="q" defaultValue={query} placeholder="Pesquisar livro ou autor..." aria-label="Pesquisar livros para gerenciar capas"/><button className="btn" type="submit">Buscar</button>{query&&<Link className="btn ghost" href="/admin/capas">Limpar</Link>}</form>
      <p className="admin-list-hint">{query?`${books?.length||0} ${(books?.length||0)===1?"resultado encontrado":"resultados encontrados"} — mostrando no máximo 20`:`Mostrando os ${Math.min(10,books?.length||0)} livros adicionados mais recentemente`}</p>
    </section>
    <div className="admin-cover-library">{(books||[]).length?(books||[]).map(book=><article className="card cover-library-row" key={book.id}>{book.cover_url?<img src={book.cover_url} alt=""/>:<div className="mini-cover"/>}<div><strong>{book.title}</strong><small>{book.author}</small></div><Link className="btn small" href={`/admin/capas/${book.id}`}>Gerenciar capas</Link></article>):<div className="card panel empty-state"><h3>Nenhum livro encontrado</h3><p>Tente pesquisar por outro título ou autor.</p></div>}</div>
  </main></AppShell>;
}
