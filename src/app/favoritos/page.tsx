import { AppShell } from "@/components/AppShell";
import { BookCard } from "@/components/BookCard";
import { requireApproved } from "@/lib/auth";
import type { Book } from "@/lib/types";
export default async function FavoritesPage(){ const {supabase,user}=await requireApproved(); const {data}=await supabase.from("favorites").select("book_id,books(*,categories(name))").eq("user_id",user.id).order("created_at",{ascending:false}); const books=(data||[]).map((r:any)=>r.books).filter(Boolean) as Book[]; return <AppShell><main className="container"><div className="page-head"><div><h1>Favoritos</h1><p>Seus livros salvos.</p></div></div>{books.length?<div className="grid">{books.map(b=><BookCard key={b.id} book={b}/>)}</div>:<div className="card empty">Você ainda não adicionou favoritos.</div>}</main></AppShell>; }
