import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { BookCard } from "@/components/BookCard";
import { requireApproved } from "@/lib/auth";
import type { Book,Category } from "@/lib/types";

function norm(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function matches(query:string,book:Book){const q=norm(query);return norm(book.title).includes(q)||norm(book.author||"").includes(q);}

export default async function LibraryPage({searchParams}:{searchParams:Promise<{q?:string;categoria?:string}>}){
  const {supabase,profile}=await requireApproved();
  const {q="",categoria=""}=await searchParams;
  const query=q.trim();
  const [{data:bookData},{data:categoryData}]=await Promise.all([
    supabase.from("books").select("*,categories(name)").eq("published",true).order("created_at",{ascending:false}),
    supabase.from("categories").select("*").order("name")
  ]);
  const all=(bookData||[]) as Book[];
  const categories=(categoryData||[]) as Category[];
  const selectedCategory=categories.find(c=>c.slug===categoria);
  const filtered=all.filter(book=>(!query||matches(query,book))&&(!selectedCategory||book.category_id===selectedCategory.id));
  const recent=all.slice(0,12);
  const featured=all.filter(book=>book.cover_url).slice(0,4);

  return <AppShell><main className="library-home">
    {!query&&!selectedCategory&&<section className="editorial-hero">
      <div className="shell-width editorial-hero-inner">
        <div className="editorial-copy"><span className="eyebrow">OLÁ, {profile.full_name?.split(" ")[0]?.toUpperCase()||"LEITOR"}</span><h1>Histórias para todos<br/>os seus momentos.</h1><p>Explore o acervo, escolha seu próximo livro e baixe em PDF ou EPUB para ler no aplicativo que preferir.</p><form className="hero-search" action="/biblioteca"><input name="q" placeholder="Qual livro você procura?" aria-label="Pesquisar livro"/><button>Buscar</button></form><div className="hero-stats"><div><strong>{all.length}</strong><span>livros disponíveis</span></div><div><strong>{categories.length}</strong><span>categorias</span></div></div></div>
        <div className="cover-collage" aria-label="Livros em destaque">{featured.map((book,index)=><Link href={`/livro/${book.slug}`} className={`collage-book collage-${index+1}`} key={book.id}>{book.cover_url&&<img src={book.cover_url} alt={`Capa de ${book.title}`}/>}</Link>)}</div>
      </div>
    </section>}

    <div className="shell-width library-content">
      <nav className="category-strip" aria-label="Categorias"><Link className={!selectedCategory?"active":""} href="/biblioteca">Todos</Link>{categories.map(c=><Link className={selectedCategory?.id===c.id?"active":""} href={`/biblioteca?categoria=${encodeURIComponent(c.slug)}`} key={c.id}>{c.name}</Link>)}</nav>

      {(query||selectedCategory)&&<section className="search-result-head"><span className="eyebrow">ACERVO</span><h1>{query?`Resultados para “${query}”`:selectedCategory?.name}</h1><p>{filtered.length} {filtered.length===1?"livro encontrado":"livros encontrados"}.</p></section>}

      {!query&&!selectedCategory&&recent.length>0&&<section className="library-section"><div className="section-heading"><div><span className="eyebrow">NOVIDADES</span><h2>Adicionados recentemente</h2><p>Deslize para o lado para ver os últimos títulos que chegaram à estante.</p></div></div><div className="book-slider">{recent.map(book=><BookCard key={book.id} book={book}/>)}</div></section>}

      {query||selectedCategory?<section className="library-section search-books-section">{filtered.length?<div className="book-grid shelf-grid search-books-grid">{filtered.map(book=><BookCard key={book.id} book={book}/>)}</div>:<div className="empty-state"><h3>Nenhum livro encontrado</h3><p>Tente pesquisar por uma parte do título ou pelo nome do autor.</p><Link className="btn ghost" href="/biblioteca">Voltar ao acervo</Link></div>}</section>:<div className="category-sections">{categories.map(category=>{const books=all.filter(book=>book.category_id===category.id).slice(0,12);if(!books.length)return null;return <section className="category-block" key={category.id}><div className="category-title"><div><span className="eyebrow">COLEÇÃO</span><h3>{category.name}</h3></div><Link href={`/biblioteca?categoria=${encodeURIComponent(category.slug)}`}>Ver todos <span>→</span></Link></div><div className="book-slider">{books.map(book=><BookCard key={book.id} book={book}/>)}</div></section>;})}</div>}
    </div>
  </main></AppShell>;
}
