import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireAdmin } from "@/lib/auth";

export default async function CoversAdminIndex(){
  const {supabase}=await requireAdmin();
  const {data:books}=await supabase.from("books").select("id,title,author,cover_url,slug").order("title");
  return <AppShell><main className="container admin-page"><div className="page-head"><div><span className="eyebrow">CAPAS DO KINDLE</span><h1>Capas alternativas</h1><p>Adicione versões de capa corretas para cada livro. Elas aparecem no seletor antes do EPUB.</p></div><Link className="btn ghost" href="/admin">← Voltar ao admin</Link></div><div className="admin-cover-library">{(books||[]).map(book=><article className="card cover-library-row" key={book.id}>{book.cover_url?<img src={book.cover_url} alt=""/>:<div className="mini-cover"/>}<div><strong>{book.title}</strong><small>{book.author}</small></div><Link className="btn small" href={`/admin/capas/${book.id}`}>Gerenciar capas</Link></article>)}</div></main></AppShell>;
}
