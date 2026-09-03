import Link from "next/link";
import type { Book } from "@/lib/types";

export function BookCard({book}:{book:Book}){
  return <Link className="book-card catalog-book-card" href={`/livro/${book.id}`}>
    <div className="book-cover-wrap">{book.cover_url?<img className="cover" src={book.cover_url} alt={`Capa de ${book.title}`}/>:<div className="cover-fallback">{book.title}</div>}{book.categories?.name&&<span className="floating-category">{book.categories.name}</span>}</div>
    <div className="book-body"><h2 className="book-title">{book.title}</h2><div className="meta">{book.author}</div><div className="book-footer-meta">{book.year&&<span>{book.year}</span>}{book.language&&<span>{book.language.toUpperCase()}</span>}</div></div>
  </Link>;
}
