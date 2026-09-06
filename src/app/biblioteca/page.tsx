import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { BookCard } from "@/components/BookCard";
import { HorizontalBookSlider } from "@/components/HorizontalBookSlider";
import { requireApproved } from "@/lib/auth";
import type { Book,Category } from "@/lib/types";

function norm(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function matches(query:string,book:Book){const q=norm(query);return norm(book.title).includes(q)||norm(book.author||"").includes(q);}
function urlWith(base:{q?:string;categoria?:string;autor?:string},patch:{q?:string;categoria?:string;autor?:string}){
  const params=new URLSearchParams();const next={...base,...patch};
  if(next.q)params.set("q",next.q);if(next.categoria)params.set("categoria",next.categoria);if(next.autor)params.set("autor",next.autor);
  const qs=params.toString();return qs?`/biblioteca?${qs}`:"/biblioteca";
}

export default async function LibraryPage({searchParams}:{searchParams:Promise<{q?:string;categoria?:string;autor?:string}>}){
  const {supabase,profile}=await requireApproved();
  const {q="",categoria="",autor=""}=await searchParams;
  const query=q.trim();const authorFilter=autor.trim();
  const [{data:bookData},{data:categoryData}]=await Promise.all([
    supabase.from("books").select("*,categories(name)").eq("published",true).order("created_at",{ascending:false}),
    supabase.from("categories").select("*").order("name")
  ]);
  const all=(bookData||[]) as Book[];const categories=(categoryData||[]) as Category[];
  const selectedCategory=categories.find(c=>c.slug===categoria);
  const authors=Array.from(new Set(all.map(book=>book.author?.trim()).filter((value):value is string=>Boolean(value)))).sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const filtered=all.filter(book=>(!query||matches(query,book))&&(!selectedCategory||book.category_id===selectedCategory.id)&&(!authorFilter||norm(book.author||"")===norm(authorFilter)));
  const recent=all.slice(0,12);const featured=all.filter(book=>book.cover_url).slice(0,4);
  const filteredMode=Boolean(query||selectedCategory||authorFilter);
  const activeBase={q:query||undefined,categoria:selectedCategory?.slug,autor:authorFilter||undefined};

  const filters=<div className="filter-panel-inner">
    <div className="filter-block"><h3>Pesquisar</h3><form className="filter-search" action="/biblioteca"><input name="q" defaultValue={query} placeholder="Título ou autor"/>{selectedCategory&&<input type="hidden" name="categoria" value={selectedCategory.slug}/>} {authorFilter&&<input type="hidden" name="autor" value={authorFilter}/>}<button type="submit">Buscar</button></form></div>
    <div className="filter-block"><h3>Categorias</h3><div className="filter-links"><Link className={!selectedCategory?"active":""} href={urlWith(activeBase,{categoria:""})}>Todas</Link>{categories.map(category=><Link className={selectedCategory?.id===category.id?"active":""} key={category.id} href={urlWith(activeBase,{categoria:category.slug})}>{category.name}</Link>)}</div></div>
    <div className="filter-block"><h3>Autores</h3><div className="filter-links author-filter-links"><Link className={!authorFilter?"active":""} href={urlWith(activeBase,{autor:""})}>Todos</Link>{authors.slice(0,18).map(author=><Link className={norm(author)===norm(authorFilter)?"active":""} key={author} href={urlWith(activeBase,{autor:author})}>{author}</Link>)}</div></div>
    {(query||selectedCategory||authorFilter)&&<Link className="clear-filters" href="/biblioteca">Limpar filtros</Link>}
  </div>;

  return <AppShell><main className="library-home">
    {!filteredMode&&<section className="editorial-hero">
      <div className="shell-width editorial-hero-inner">
        <div className="editorial-copy"><span className="eyebrow">OLÁ, {profile.full_name?.split(" ")[0]?.toUpperCase()||"LEITOR"}</span><h1>Histórias para todos<br/>os seus momentos.</h1><p>Explore o acervo, escolha seu próximo livro e baixe em PDF ou EPUB para ler no aplicativo que preferir.</p><form className="hero-search" action="/biblioteca"><input name="q" placeholder="Qual livro você procura?" aria-label="Pesquisar livro"/><button>Buscar</button></form><div className="hero-stats"><div><strong>{all.length}</strong><span>livros disponíveis</span></div><div><strong>{categories.length}</strong><span>categorias</span></div></div></div>
        <div className="cover-collage" aria-label="Livros em destaque">{featured.map((book,index)=><Link href={`/livro/${book.slug}`} className={`collage-book collage-${index+1}`} key={book.id}>{book.cover_url&&<img src={book.cover_url} alt={`Capa de ${book.title}`}/>}</Link>)}</div>
      </div>
    </section>}

    <div className="shell-width library-content">
      {!filteredMode&&<nav className="category-strip" aria-label="Categorias"><Link className="active" href="/biblioteca">Todos</Link>{categories.map(c=><Link href={`/biblioteca?categoria=${encodeURIComponent(c.slug)}`} key={c.id}>{c.name}</Link>)}</nav>}

      {!filteredMode&&recent.length>0&&<section className="library-section"><div className="section-heading"><div><span className="eyebrow">NOVIDADES</span><h2>Adicionados recentemente</h2><p>Arraste com o mouse ou deslize com o dedo para explorar.</p></div></div><HorizontalBookSlider>{recent.map(book=><BookCard key={book.id} book={book}/>)}</HorizontalBookSlider></section>}

      {filteredMode?<div className="catalog-results-layout">
        <aside className="catalog-filter-sidebar">{filters}</aside>
        <section className="catalog-results-main">
          <details className="mobile-filter-drawer"><summary>Filtros e categorias</summary>{filters}</details>
          <div className="search-result-head"><span className="eyebrow">ACERVO</span><h1>{query?`Resultados para “${query}”`:authorFilter?authorFilter:selectedCategory?.name}</h1><p>{filtered.length} {filtered.length===1?"livro encontrado":"livros encontrados"}{selectedCategory?` em ${selectedCategory.name}`:""}.</p></div>
          {filtered.length?<div className="book-grid shelf-grid search-books-grid">{filtered.map(book=><BookCard key={book.id} book={book}/>)}</div>:<div className="empty-state"><h3>Nenhum livro encontrado</h3><p>Tente outro título, autor ou categoria.</p><Link className="btn ghost" href="/biblioteca">Limpar busca</Link></div>}
        </section>
      </div>:<div className="category-sections">{categories.map(category=>{const books=all.filter(book=>book.category_id===category.id).slice(0,12);if(!books.length)return null;return <section className="category-block" key={category.id}><div className="category-title"><div><span className="eyebrow">COLEÇÃO</span><h3>{category.name}</h3></div><Link href={`/biblioteca?categoria=${encodeURIComponent(category.slug)}`}>Ver todos <span>→</span></Link></div><HorizontalBookSlider>{books.map(book=><BookCard key={book.id} book={book}/>)}</HorizontalBookSlider></section>;})}</div>}
    </div>
  </main></AppShell>;
}
