import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BookLanguageFilesManager } from "@/components/BookLanguageFilesManager";
import { requireAdmin } from "@/lib/auth";

export default async function BookLanguagesPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const {supabase}=await requireAdmin();const {data:book}=await supabase.from("books").select("id,title,author,language,cover_url").eq("id",id).maybeSingle();if(!book)notFound();
  return <AppShell><main className="container admin-page"><div className="page-head"><div><span className="eyebrow">IDIOMAS E FORMATOS</span><h1>{book.title}</h1><p>{book.author}</p></div><Link className="btn ghost" href="/admin/idiomas">← Voltar aos livros</Link></div><BookLanguageFilesManager bookId={book.id} title={book.title} defaultLanguage={book.language||"pt"}/></main></AppShell>;
}
