import type { UserBook } from "@/lib/types";
import { KindleShareButton } from "@/components/KindleShareButton";

export function UserBookCard({book}:{book:UserBook}){
  const status=book.moderation_status==="catalog"?"No catálogo":book.moderation_status==="private"?"Privado":"Pendente";
  return <article className="card book-card personal-book-card">
    {book.cover_url?<img className="cover" src={book.cover_url} alt={`Capa de ${book.title}`}/>:<div className="cover-fallback">{book.title}</div>}
    <div className="book-body"><h2 className="book-title">{book.title}</h2><div className="meta">{book.author}</div><div className="row wrap" style={{marginTop:10}}>{book.year&&<span className="badge">{book.year}</span>}{book.categories?.name&&<span className="badge">{book.categories.name}</span>}<span className="badge">{status}</span></div><div className="personal-actions"><KindleShareButton id={book.id} title={book.title} fileName={book.file_name}/><a className="btn ghost" href={`/api/user-books/${book.id}/file`}>Baixar EPUB</a></div></div>
  </article>;
}
