import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { MissingBooksAdmin } from "@/components/MissingBooksAdmin";
import { requireAdmin } from "@/lib/auth";
import type { Book, Category } from "@/lib/types";

type MissingKey="pdf"|"epub"|"author"|"description"|"cover"|"title"|"category";

function mainIs(book:Book,format:"pdf"|"epub"){
  const name=String(book.file_name||"").toLowerCase();
  return format==="pdf"?(book.mime_type==="application/pdf"||name.endsWith(".pdf")):(book.mime_type==="application/epub+zip"||name.endsWith(".epub"));
}
function normalized(value:unknown){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();}
function authorMissing(book:Book){const value=normalized(book.author);return !value||value.includes("nao identificado")||value==="unknown"||value==="desconhecido"||value==="sem autor";}
function titleMissing(book:Book){const value=normalized(book.title);return value.length<2||value.includes("titulo nao identificado");}

export default async function MissingBooksPage({searchParams}:{searchParams:Promise<{categoria?:string;pagina?:string}>}){
  const params=await searchParams;
  const pending=params.categoria==="pendente";
  const requestedPage=Number(params.pagina);
  const page=Number.isSafeInteger(requestedPage)&&requestedPage>0?requestedPage:1;
  const {supabase}=await requireAdmin();
  let query=supabase.from("books").select("*,categories(name)",{count:"exact"}).order("title").order("id");
  if(pending)query=query.is("category_id",null);
  const {data:books,count,error}=await query.range((page-1)*50,page*50-1);
  if(error)throw new Error("Não foi possível carregar as pendências.");
  const [{data:languageFiles},{data:categories}]=await Promise.all([
    books?.length?supabase.from("book_language_files").select("book_id,format").in("book_id",books.map(book=>book.id)):Promise.resolve({data:[]}),
    supabase.from("categories").select("*").order("name")
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
    if(!book.category_id)missing.push("category");
    if(titleMissing(book))missing.push("title");
    if(authorMissing(book))missing.push("author");
    if(!String(book.description||"").trim())missing.push("description");
    if(!String(book.cover_url||"").trim())missing.push("cover");
    return {book,missing};
  }).filter(item=>item.missing.length>0);
  return <AppShell><main className="container admin-page">
    <div className="page-head"><div><span className="eyebrow">PAINEL ADMIN</span><h1>Faltantes</h1><p>Livros que ainda estão sem algum arquivo ou informação importante.</p></div><Link className="btn ghost" href="/admin">← Voltar ao painel</Link></div>
    <div className="row wrap"><Link className="btn ghost" href="/admin/faltantes">Todas as pendências</Link><Link className="btn" href="/admin/faltantes?categoria=pendente">Sem categoria</Link><span>{count||0} livros no filtro · Página {page}</span></div>
    <MissingBooksAdmin key={`${pending}:${page}`} initialItems={items} categories={(categories||[]) as Category[]}/>
    <div className="row wrap">{page>1&&<Link className="btn ghost" href={`/admin/faltantes?${pending?"categoria=pendente&":""}pagina=${page-1}`}>Anterior</Link>}{page*50<(count||0)&&<Link className="btn" href={`/admin/faltantes?${pending?"categoria=pendente&":""}pagina=${page+1}`}>Próxima</Link>}</div>
  </main></AppShell>;
}
