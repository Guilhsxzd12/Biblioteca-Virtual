import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BookCoverManager } from "@/components/BookCoverManager";
import { requireAdmin } from "@/lib/auth";

export default async function BookCoversAdminPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const {supabase}=await requireAdmin();
  const {data:book}=await supabase.from("books").select("id,title,author,cover_url,slug").eq("id",id).maybeSingle();
  if(!book)notFound();
  return <AppShell><main className="container admin-page"><div className="page-head"><div><span className="eyebrow">GESTÃO DE CAPAS</span><h1>{book.title}</h1><p>{book.author}</p></div><Link className="btn ghost" href="/admin">← Voltar ao admin</Link></div><BookCoverManager bookId={book.id} title={book.title} mainCoverUrl={book.cover_url}/></main></AppShell>;
}
