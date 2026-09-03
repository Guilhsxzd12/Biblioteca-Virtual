import { AppShell } from "@/components/AppShell";
import { BookCard } from "@/components/BookCard";
import { UserBookCard } from "@/components/UserBookCard";
import { requireApproved } from "@/lib/auth";
import type { Book,Category,UserBook } from "@/lib/types";

function norm(v:string){return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function matches(q:string,title:string,author:string){if(!q)return true;const n=norm(q);return norm(title).includes(n)||norm(author||"").includes(n);}

export default async function LibraryPage({searchParams}:{searchParams:Promise<{q?:string}>}){
  const {supabase}=await requireApproved();
  const {q=""}=await searchParams;
  const query=q.trim();
  const [{data:personalData},{data:baseData},{data:categoryData}]=await Promise.all([
    supabase.from("user_books").select("*,categories(name)").order("created_at",{ascending:false}),
    supabase.from("books").select("*,categories(name)").eq("published",true).order("title"),
    supabase.from("categories").select("*").order("name")
  ]);
  const personal=((personalData||[]) as UserBook[]).filter(b=>matches(query,b.title,b.author));
  const base=((baseData||[]) as Book[]).filter(b=>matches(query,b.title,b.author));
  const categories=(categoryData||[]) as Category[];
  const uncategorized=base.filter(b=>!b.category_id);

  return <AppShell><main className="container library-home">
    <div className="page-head"><div><h1>Biblioteca</h1><p>{query?`Resultados para “${query}”`:`Seus e-books e o acervo completo da Biblioteca Virtual.`}</p></div></div>

    <section className="library-section personal-section">
      <div className="section-heading"><div><h2>Minha Biblioteca</h2><p>Livros enviados por você.</p></div><a className="btn secondary" href="/kindle">+ Enviar e-book</a></div>
      {personal.length?<div className="grid">{personal.map(b=><UserBookCard key={b.id} book={b}/>)}</div>:<div className="card empty">{query?"Nenhum e-book seu corresponde à pesquisa.":"Você ainda não enviou nenhum e-book. Use a aba Enviar ao Kindle para adicionar o primeiro."}</div>}
    </section>

    <section className="library-section">
      <div className="section-heading"><div><h2>Acervo da Biblioteca</h2><p>Livros disponibilizados pela Biblioteca Virtual.</p></div></div>
      {base.length? <div className="category-sections">
        {categories.map(c=>{const items=base.filter(b=>b.category_id===c.id);if(!items.length)return null;return <section className="category-block" key={c.id}><div className="category-title"><h3>{c.name}</h3><span>{items.length} {items.length===1?"livro":"livros"}</span></div><div className="grid">{items.map(b=><BookCard key={b.id} book={b}/>)}</div></section>;})}
        {!!uncategorized.length&&<section className="category-block"><div className="category-title"><h3>Outros</h3><span>{uncategorized.length} {uncategorized.length===1?"livro":"livros"}</span></div><div className="grid">{uncategorized.map(b=><BookCard key={b.id} book={b}/>)}</div></section>}
      </div>:<div className="card empty">{query?"Nenhum livro do acervo corresponde à pesquisa.":"Nenhum livro publicado no acervo ainda."}</div>}
    </section>
  </main></AppShell>;
}
