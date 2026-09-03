import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { FavoriteButton } from "@/components/FavoriteButton";
import { KindleShareButton } from "@/components/KindleShareButton";
import { requireApproved } from "@/lib/auth";
import type { Book } from "@/lib/types";

export default async function BookPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const {supabase,user}=await requireApproved();
  const [{data:book},{data:favorite}]=await Promise.all([
    supabase.from("books").select("*,categories(name)").eq("id",id).maybeSingle(),
    supabase.from("favorites").select("book_id").eq("user_id",user.id).eq("book_id",id).maybeSingle()
  ]);
  if(!book)notFound();
  const b=book as Book;
  return <AppShell><main className="shell-width detail-page"><Link className="back-link" href="/biblioteca">← Voltar ao acervo</Link><section className="detail">
    <div className="detail-cover-col">{b.cover_url?<img className="cover" src={b.cover_url} alt={`Capa de ${b.title}`}/>:<div className="cover-fallback">{b.title}</div>}<div className="detail-small-meta">{b.categories?.name&&<span>{b.categories.name}</span>}{b.language&&<span>{b.language.toUpperCase()}</span>}</div></div>
    <div className="detail-copy"><span className="eyebrow">ACERVO DA BIBLIOTECA</span><h1>{b.title}</h1><h2>{b.author}</h2><div className="detail-stats">{b.year&&<div><small>ANO</small><strong>{b.year}</strong></div>}{b.pages&&<div><small>PÁGINAS</small><strong>{b.pages}</strong></div>}{b.categories?.name&&<div><small>CATEGORIA</small><strong>{b.categories.name}</strong></div>}</div><div className="detail-actions"><Link className="btn" href={`/leitor/${b.id}`}>Ler agora</Link><KindleShareButton id={b.id} title={b.title} source="catalog"/><FavoriteButton bookId={b.id} initial={Boolean(favorite)}/>{b.allow_download&&<a className="btn ghost" href={`/api/books/${b.id}/file?download=1`}>Baixar PDF</a>}</div><div className="synopsis-block"><span className="eyebrow">SINOPSE</span><div className="prose">{b.description||"Sinopse não informada."}</div></div></div>
  </section></main></AppShell>;
}
