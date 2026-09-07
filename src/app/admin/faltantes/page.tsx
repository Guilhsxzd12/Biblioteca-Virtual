import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { MissingBooksAdmin } from "@/components/MissingBooksAdmin";
import { requireAdmin } from "@/lib/auth";
import type { Book } from "@/lib/types";

type MissingKey="pdf"|"epub"|"author"|"description"|"cover"|"title";

function mainIs(book:Book,format:"pdf"|"epub"){
  const name=String(book.file_name||"").toLowerCase();
  return format==="pdf"?(book.mime_type==="application/pdf"||name.endsWith(".pdf")):(book.mime_type==="application/epub+zip"||name.endsWith(".epub"));
}
function normalized(value:unknown){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();}
function authorMissing(book:Book){const value=normalized(book.author);return !value||value.includes("nao identificado")||value==="unknown"||value==="desconhecido"||value==="sem autor";}
function titleMissing(book:Book){const value=normalized(book.title);return value.length<2||value.includes("titulo nao identificado");}

export default async function MissingBooksPage(){
  const {supabase}=await requireAdmin();
  const [{data:books},{data:languageFiles}]=await Promise.all([
    supabase.from("books").select("*,categories(name)").order("created_at",{ascending:false}),
    supabase.from("book_language_files").select("book_id,format")
  ]);
  const formats=new Map<string,Set<string>>();
  for(const row of languageFiles||[]){const set=formats.get(row.book_id)||new Set<string>();set.add(row.format);formats.set(row.book_id,set);}
  const items=((books||[]) as Book[]).map(book=>{
    const extra=formats.get(book.id)||new Set<string>();
    const hasPdf=mainIs(book,"pdf")||Boolean(book.reading_pdf_drive_file_id)||extra.has("pdf");
    const hasEpub=mainIs(book,"epub")||Boolean(book.kindle_drive_file_id)||extra.has("epub");
    const missing:MissingKey[]=[];
    if(!hasPdf)missing.push("pdf");
    if(!hasEpub)missing.push("epub");
    if(titleMissing(book))missing.push("title");
    if(authorMissing(book))missing.push("author");
    if(!String(book.description||"").trim())missing.push("description");
    if(!String(book.cover_url||"").trim())missing.push("cover");
    return {book,missing};
  }).filter(item=>item.missing.length>0);
  return <AppShell><main className="container admin-page">
    <div className="page-head"><div><span className="eyebrow">PAINEL ADMIN</span><h1>Faltantes</h1><p>Livros que ainda estão sem algum arquivo ou informação importante.</p></div><Link className="btn ghost" href="/admin">← Voltar ao painel</Link></div>
    <MissingBooksAdmin initialItems={items}/>
  </main></AppShell>;
}
