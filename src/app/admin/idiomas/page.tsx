import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireAdmin } from "@/lib/auth";

export default async function LanguageFilesAdmin({searchParams}:{searchParams:Promise<{q?:string}>}){
  const {supabase}=await requireAdmin();const {q=""}=await searchParams;const query=q.trim();const safe=query.replace(/[,()%]/g," ").replace(/\s+/g," ").trim();
  let booksQuery=supabase.from("books").select("id,title,author,cover_url,language,created_at").order("created_at",{ascending:false});
  booksQuery=safe?booksQuery.or(`title.ilike.%${safe}%,author.ilike.%${safe}%`).limit(20):booksQuery.limit(10);
  const {data:books}=await booksQuery;
  return <AppShell><main className="container admin-page"><div className="page-head"><div><span className="eyebrow">IDIOMAS DOS LIVROS</span><h1>PDF e EPUB por idioma</h1><p>Adicione versões em outros idiomas sem duplicar o livro no catálogo.</p></div><Link className="btn ghost" href="/admin">← Voltar ao admin</Link></div>
    <section className="card panel cover-search-panel"><form className="admin-cover-search" action="/admin/idiomas"><input type="search" name="q" defaultValue={query} placeholder="Pesquisar livro ou autor..."/><button className="btn" type="submit">Buscar</button>{query&&<Link className="btn ghost" href="/admin/idiomas">Limpar</Link>}</form><p className="admin-list-hint">{query?`Mostrando até 20 resultados`:`Mostrando os ${Math.min(10,books?.length||0)} livros mais recentes`}</p></section>
    <div className="admin-cover-library">{(books||[]).map(book=><article className="card cover-library-row" key={book.id}>{book.cover_url?<img src={book.cover_url} alt=""/>:<div className="mini-cover"/>}<div><strong>{book.title}</strong><small>{book.author} · {(book.language||"pt").toUpperCase()}</small></div><Link className="btn small" href={`/admin/idiomas/${book.id}`}>Gerenciar idiomas</Link></article>)}</div>
  </main></AppShell>;
}
