import { AppShell } from "@/components/AppShell";
import { BookCard } from "@/components/BookCard";
import { requireApproved } from "@/lib/auth";
import type { Book } from "@/lib/types";
export default async function LibraryPage(){ const {supabase}=await requireApproved(); const {data}=await supabase.from("books").select("*,categories(name)").eq("published",true).order("title"); const books=(data||[]) as Book[]; return <AppShell><main className="container"><div className="page-head"><div><h1>Minha biblioteca</h1><p>{books.length} livros disponíveis</p></div></div>{books.length?<div className="grid">{books.map(b=><BookCard key={b.id} book={b}/>)}</div>:<div className="card empty">Nenhum livro publicado ainda.</div>}</main></AppShell>; }
