import type { UserBook } from "@/lib/types";
import { KindleShareButton } from "@/components/KindleShareButton";

export function UserBookCard({book}:{book:UserBook}){
  const status=book.moderation_status==="catalog"?"No catálogo":book.moderation_status==="private"?"Privado":"Pendente";
  const primaryIsPdf=book.mime_type==="application/pdf"||book.file_name.toLowerCase().endsWith(".pdf");
  const canReadPdf=primaryIsPdf||Boolean(book.reading_pdf_drive_file_id);
  return <article className="book-card personal-book-card">
    <div className="book-cover-wrap">{book.cover_url?<img className="cover" src={book.cover_url} alt={`Capa de ${book.title}`}/>:<div className="cover-fallback">{book.title}</div>}<span className="book-status-chip">{status}</span></div>
    <div className="book-body"><h2 className="book-title">{book.title}</h2><div className="meta">{book.author}</div><div className="row wrap book-badges">{book.year&&<span className="badge">{book.year}</span>}{book.categories?.name&&<span className="badge">{book.categories.name}</span>}</div><div className="personal-actions"><KindleShareButton id={book.id} title={book.title} source="user"/>{canReadPdf&&<a className="btn ghost" href={`/api/user-books/${book.id}/file?inline=1`} target="_blank">Ler PDF</a>}</div></div>
  </article>;
}
