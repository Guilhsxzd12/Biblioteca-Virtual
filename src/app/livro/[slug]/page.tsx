import type { Metadata } from "next";
import { notFound,permanentRedirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { FavoriteButton } from "@/components/FavoriteButton";
import { KindleShareButton } from "@/components/KindleShareButton";
import { BookCard } from "@/components/BookCard";
import { requireApproved } from "@/lib/auth";
import type { Book } from "@/lib/types";

function isPdf(book:Book){return book.mime_type==="application/pdf"||book.file_name.toLowerCase().endsWith(".pdf");}
function isEpub(book:Book){return book.mime_type==="application/epub+zip"||book.file_name.toLowerCase().endsWith(".epub");}

export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const {slug}=await params;return {title:slug.split("-").map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(" ")};
}

export default async function BookPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const {supabase,user}=await requireApproved();
  const result=await supabase.from("books").select("*,categories(name)").eq("slug",slug).eq("published",true).maybeSingle();
  let book=result.data;
  if(!book&&/^[0-9a-f-]{36}$/i.test(slug)){
    const legacy=await supabase.from("books").select("*,categories(name)").eq("id",slug).eq("published",true).maybeSingle();
    if(legacy.data)permanentRedirect(`/livro/${legacy.data.slug}`);
  }
  if(!book)notFound();
  const b=book as Book;
  const [{data:favorite},{data:relatedData}]=await Promise.all([
    supabase.from("favorites").select("book_id").eq("user_id",user.id).eq("book_id",b.id).maybeSingle(),
    supabase.from("books").select("*,categories(name)").eq("published",true).neq("id",b.id).limit(30)
  ]);
  const related=((relatedData||[]) as Book[]).sort((a,c)=>{
    const ar=(a.author||"").toLowerCase()===(b.author||"").toLowerCase()?2:a.category_id&&a.category_id===b.category_id?1:0;
    const cr=(c.author||"").toLowerCase()===(b.author||"").toLowerCase()?2:c.category_id&&c.category_id===b.category_id?1:0;
    return cr-ar;
  }).filter(item=>(item.author||"").toLowerCase()===(b.author||"").toLowerCase()||Boolean(item.category_id&&item.category_id===b.category_id)).slice(0,12);
  const hasPdf=isPdf(b)||Boolean(b.reading_pdf_drive_file_id);
  const hasEpub=isEpub(b);
  return <AppShell><main className="shell-width detail-page"><Link className="back-link" href="/biblioteca">← Voltar ao acervo</Link><section className="detail">
    <div className="detail-cover-col">{b.cover_url?<img className="cover" src={b.cover_url} alt={`Capa de ${b.title}`}/>:<div className="cover-fallback">{b.title}</div>}<div className="detail-small-meta">{b.categories?.name&&<span>{b.categories.name}</span>}{b.language&&<span>{b.language.toUpperCase()}</span>}</div></div>
    <div className="detail-copy"><span className="eyebrow">KINDLE BOOKS</span><h1>{b.title}</h1><h2>{b.author}</h2><div className="detail-stats">{b.year&&<div><small>ANO</small><strong>{b.year}</strong></div>}{b.pages&&<div><small>PÁGINAS</small><strong>{b.pages}</strong></div>}{b.categories?.name&&<div><small>CATEGORIA</small><strong>{b.categories.name}</strong></div>}</div>
      <div className="format-note"><strong>Escolha o formato</strong><span>PDF para leitura direta ou EPUB para Kindle e outros aplicativos compatíveis.</span></div>
      <div className="detail-actions">{hasPdf&&<a className="btn" href={`/api/books/${b.id}/file?format=pdf`}>Baixar PDF</a>}{hasEpub&&<KindleShareButton id={b.id} title={b.title} source="catalog"/>}<FavoriteButton bookId={b.id} initial={Boolean(favorite)}/></div>
      {!hasPdf&&!hasEpub&&<div className="notice">Este título está temporariamente sem arquivo disponível.</div>}
      <div className="synopsis-block"><span className="eyebrow">SOBRE O LIVRO</span><div className="prose">{b.description||"Sinopse não informada."}</div></div></div>
  </section>
  {related.length>0&&<section className="related-section"><div className="section-heading"><div><span className="eyebrow">VOCÊ TAMBÉM PODE GOSTAR</span><h2>Livros relacionados</h2><p>Do mesmo autor ou da mesma categoria.</p></div></div><div className="book-slider">{related.map(item=><BookCard key={item.id} book={item}/>)}</div></section>}
  </main></AppShell>;
}
