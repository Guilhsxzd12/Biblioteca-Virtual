"use client";

import { useEffect,useState } from "react";
import { guessCategoryId } from "@/lib/category-match";
import type { BookMetadataResult,Category,UserBook } from "@/lib/types";

type Props={categories:Category[];initialBooks:UserBook[]};

export function KindleClient({categories,initialBooks}:Props){
  const [books,setBooks]=useState(initialBooks);
  const [title,setTitle]=useState("");
  const [author,setAuthor]=useState("");
  const [year,setYear]=useState("");
  const [pages,setPages]=useState("");
  const [description,setDescription]=useState("");
  const [coverUrl,setCoverUrl]=useState("");
  const [categoryId,setCategoryId]=useState("");
  const [ebook,setEbook]=useState<File|null>(null);
  const [coverFile,setCoverFile]=useState<File|null>(null);
  const [suggestions,setSuggestions]=useState<BookMetadataResult[]>([]);
  const [selected,setSelected]=useState<BookMetadataResult|null>(null);
  const [searching,setSearching]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [message,setMessage]=useState("");
  const [lastBook,setLastBook]=useState<UserBook|null>(null);

  useEffect(()=>{
    if(selected&&title===selected.title){setSuggestions([]);return;}
    if(title.trim().length<2){setSuggestions([]);return;}
    const c=new AbortController();
    const t=setTimeout(async()=>{
      setSearching(true);
      try{
        const r=await fetch(`/api/book-metadata?title=${encodeURIComponent(title)}`,{signal:c.signal});
        const d=await r.json();
        if(r.ok)setSuggestions(d.results||[]);
      }catch{}
      setSearching(false);
    },450);
    return()=>{clearTimeout(t);c.abort();};
  },[title,selected]);

  function choose(item:BookMetadataResult){
    setSelected(item);
    setTitle(item.title);
    setAuthor(item.author||"");
    setYear(item.year?String(item.year):"");
    setPages(item.pages?String(item.pages):"");
    setDescription(item.description||"");
    setCoverUrl(item.coverUrl||"");
    setCategoryId(guessCategoryId(categories,item.categories||[],item.title,item.description||"")||"");
    setSuggestions([]);
  }

  async function submit(e:React.FormEvent){
    e.preventDefault();
    if(!ebook){setMessage("Selecione o arquivo EPUB.");return;}
    setUploading(true);setMessage("");setLastBook(null);
    try{
      const sr=await fetch("/api/user-books/upload-url",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({title,originalFileName:ebook.name,mimeType:ebook.type||"application/epub+zip",fileSize:ebook.size})
      });
      const s=await sr.json();
      if(!sr.ok)throw new Error(s.error||"Não foi possível preparar o upload.");
      const ur=await fetch(s.uploadUrl,{method:"PUT",body:ebook});
      if(!ur.ok)throw new Error(`Upload do EPUB falhou (${ur.status}).`);
      const raw=await ur.text();
      const uploaded=raw?JSON.parse(raw):null;
      if(!uploaded?.id)throw new Error("O Google Drive não retornou o ID do EPUB.");

      let finalCover=coverUrl.trim();
      if(coverFile){
        const fd=new FormData();fd.append("file",coverFile);
        const cr=await fetch("/api/user-books/cover",{method:"POST",body:fd});
        const cd=await cr.json();
        if(!cr.ok)throw new Error(cd.error||"Não foi possível enviar a capa.");
        finalCover=cd.coverUrl||finalCover;
      }

      const br=await fetch("/api/user-books",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({title,author,year,pages,description,coverUrl:finalCover,categoryId:categoryId||null,driveFileId:uploaded.id,fileName:s.fileName,mimeType:ebook.type||"application/epub+zip"})
      });
      const saved=await br.json();
      if(!br.ok)throw new Error(saved.error||"Não foi possível salvar o e-book.");
      setBooks(p=>[saved.book,...p]);
      setLastBook(saved.book);
      setMessage("E-book salvo na sua biblioteca e pronto para o Send to Kindle.");
      setEbook(null);setCoverFile(null);
    }catch(err){setMessage(err instanceof Error?err.message:"Erro ao preparar o e-book.");}
    finally{setUploading(false);}
  }

  return <div className="kindle-layout">
    <section className="card panel">
      <h2>Preparar e-book para o Kindle</h2>
      <p className="muted">Envie seu EPUB e, se quiser, uma capa. Os arquivos ficam privados no Google Drive da Biblioteca e o e-book entra na sua Minha Biblioteca.</p>
      <form className="stack" onSubmit={submit}>
        <label className="suggestion-box">Livro
          <input value={title} onChange={e=>{setTitle(e.target.value);setSelected(null);}} placeholder="Digite o título ou ISBN" required/>
          {searching&&<small className="muted">Buscando livro...</small>}
          {!!suggestions.length&&<div className="suggestions">{suggestions.map(i=><button type="button" className="suggestion" key={i.id} onClick={()=>choose(i)}>{i.coverUrl?<img src={i.coverUrl} alt=""/>:<span/>}<span><strong>{i.title}</strong><small>{i.author}{i.year?` • ${i.year}`:""}{i.isEbook?" • e-book":""}</small></span></button>)}</div>}
        </label>
        <label>Autor<input value={author} onChange={e=>setAuthor(e.target.value)}/></label>
        <div className="row"><label style={{flex:1}}>Ano<input type="number" value={year} onChange={e=>setYear(e.target.value)}/></label><label style={{flex:1}}>Páginas<input type="number" value={pages} onChange={e=>setPages(e.target.value)}/></label></div>
        <label>Categoria<select value={categoryId} onChange={e=>setCategoryId(e.target.value)}><option value="">Sem categoria</option>{categories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select><small className="muted">Quando a busca informa o gênero, tentamos escolher a categoria automaticamente.</small></label>
        <label>Sinopse<textarea value={description} onChange={e=>setDescription(e.target.value)}/></label>
        <label>EPUB<input type="file" accept=".epub,application/epub+zip" onChange={e=>setEbook(e.target.files?.[0]||null)} required/><small className="muted">O Send to Kindle aceita EPUB e arquivos de até 200 MB.</small></label>
        <label>URL da capa<input value={coverUrl} onChange={e=>setCoverUrl(e.target.value)} placeholder="Preenchida automaticamente quando disponível"/></label>
        <label>Ou enviar uma capa<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e=>setCoverFile(e.target.files?.[0]||null)}/></label>
        {(coverFile||coverUrl)&&<div className="kindle-cover-preview">{coverFile?<span>{coverFile.name}</span>:<img src={coverUrl} alt="Prévia da capa"/>}</div>}
        <button className="btn" disabled={uploading||!title||!ebook}>{uploading?"Enviando para sua biblioteca...":"Salvar e preparar para Kindle"}</button>
      </form>
      {message&&<div className={`notice ${lastBook?"success":""}`} style={{marginTop:14}}>{message}</div>}
      {lastBook&&<div className="kindle-actions"><a className="btn secondary" href={`/api/user-books/${lastBook.id}/file`}>Baixar EPUB</a><a className="btn" href="https://www.amazon.com/sendtokindle" target="_blank" rel="noreferrer">Abrir Send to Kindle</a></div>}
    </section>

    <section className="card panel">
      <h2>Seus e-books</h2>
      <p className="muted">Uploads feitos por você. Eles também aparecem no topo da página Biblioteca.</p>
      <div className="table-list">{books.length?books.map(b=><div className="table-row" key={b.id}><div><strong>{b.title}</strong><div className="meta">{b.author}{b.categories?.name?` • ${b.categories.name}`:""}</div></div><div className="row wrap"><a className="btn ghost" href={`/api/user-books/${b.id}/file`}>Baixar</a><a className="btn secondary" href="https://www.amazon.com/sendtokindle" target="_blank" rel="noreferrer">Kindle</a></div></div>):<div className="muted">Você ainda não enviou nenhum e-book.</div>}</div>
    </section>
  </div>;
}
