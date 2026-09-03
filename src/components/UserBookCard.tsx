import type { UserBook } from "@/lib/types";

export function UserBookCard({book}:{book:UserBook}){
  return <article className="card book-card personal-book-card">
    {book.cover_url?<img className="cover" src={book.cover_url} alt={`Capa de ${book.title}`}/>:<div className="cover-fallback">{book.title}</div>}
    <div className="book-body"><h2 className="book-title">{book.title}</h2><div className="meta">{book.author}</div><div className="row wrap" style={{marginTop:10}}>{book.year&&<span className="badge">{book.year}</span>}{book.categories?.name&&<span className="badge">{book.categories.name}</span>}<span className="badge">Meu e-book</span></div><div className="personal-actions"><a className="btn ghost" href={`/api/user-books/${book.id}/file`}>Baixar EPUB</a><a className="btn secondary" href="https://www.amazon.com/sendtokindle" target="_blank" rel="noreferrer">Kindle</a></div></div>
  </article>;
}
