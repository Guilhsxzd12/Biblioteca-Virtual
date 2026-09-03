"use client";

import { useEffect,useState } from "react";
import { guessCategoryId } from "@/lib/category-match";
import { uploadDriveFileInChunks } from "@/lib/upload-client";
import { KindleShareButton } from "@/components/KindleShareButton";
import type { BookMetadataResult,Category,UserBook } from "@/lib/types";

type Props={categories:Category[];initialBooks:UserBook[]};
function langLabel(code?:string|null){const m:Record<string,string>={pt:"Português","pt-br":"Português",en:"Inglês",es:"Espanhol",fr:"Francês",it:"Italiano",de:"Alemão",ja:"Japonês",zh:"Chinês",ru:"Russo"};const key=(code||"").toLowerCase();return code?(m[key]||code.toUpperCase()):"Idioma não informado";}

export function KindleClient({categories,initialBooks}:Props){
  const [books,setBooks]=useState(initialBooks);
  const [title,setTitle]=useState("");const [author,setAuthor]=useState("");const [language,setLanguage]=useState("");const [year,setYear]=useState("");const [pages,setPages]=useState("");const [description,setDescription]=useState("");const [coverUrl,setCoverUrl]=useState("");const [categoryId,setCategoryId]=useState("");
  const [pdf,setPdf]=useState<File|null>(null);const [coverFile,setCoverFile]=useState<File|null>(null);const [suggestions,setSuggestions]=useState<BookMetadataResult[]>([]);const [selected,setSelected]=useState<BookMetadataResult|null>(null);const [searching,setSearching]=useState(false);const [uploading,setUploading]=useState(false);const [progress,setProgress]=useState(0);const [message,setMessage]=useState("");const [lastBook,setLastBook]=useState<UserBook|null>(null);

  useEffect(()=>{if(selected&&title===selected.title){setSuggestions([]);return;}if(title.trim().length<2){setSuggestions([]);return;}const c=new AbortController();const t=setTimeout(async()=>{setSearching(true);try{const r=await fetch(`/api/book-metadata?title=${encodeURIComponent(title)}`,{signal:c.signal});const d=await r.json();if(r.ok)setSuggestions(d.results||[]);}catch{}setSearching(false);},420);return()=>{clearTimeout(t);c.abort();};},[title,selected]);

  function choose(item:BookMetadataResult){setSelected(item);setTitle(item.title);setAuthor(item.author||"");setLanguage(item.language||"");setYear(item.year?String(item.year):"");setPages(item.pages?String(item.pages):"");setDescription(item.description||"");setCoverUrl(item.coverUrl||"");setCategoryId(guessCategoryId(categories,item.categories||[],item.title,item.description||"")||"");setSuggestions([]);}

  async function submit(e:React.FormEvent){
    e.preventDefault();
    if(!pdf){setMessage("Selecione o arquivo PDF ou EPUB do livro.");return;}
    const isPdf=pdf.name.toLowerCase().endsWith(".pdf")||pdf.type==="application/pdf";
    const isEpub=pdf.name.toLowerCase().endsWith(".epub")||pdf.type==="application/epub+zip";
    if(!isPdf&&!isEpub){setMessage("Use um arquivo PDF ou EPUB.");return;}
    if(pdf.size>200*1024*1024){setMessage("O arquivo ultrapassa 200 MB.");return;}
    if(!author.trim()||!description.trim()){setMessage("Autor e sinopse são obrigatórios.");return;}
    if(!coverFile&&!coverUrl.trim()){setMessage("Escolha uma capa ou selecione uma edição que possua capa.");return;}

    setUploading(true);setProgress(0);setMessage("");setLastBook(null);
    try{
      const mimeType=isPdf?"application/pdf":"application/epub+zip";
      const sr=await fetch("/api/user-books/upload-url",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title,originalFileName:pdf.name,mimeType,fileSize:pdf.size})});
      const s=await sr.json();if(!sr.ok)throw new Error(s.error||"Não foi possível preparar o upload.");
      setMessage("Salvando seu livro...");
      const prepared=new File([pdf],pdf.name,{type:mimeType});
      const uploaded=await uploadDriveFileInChunks(s.uploadUrl,prepared,setProgress);

      let finalCover=coverUrl.trim();
      if(coverFile){const fd=new FormData();fd.append("file",coverFile);const cr=await fetch("/api/user-books/cover",{method:"POST",body:fd});const cd=await cr.json();if(!cr.ok)throw new Error(cd.error||"Não foi possível enviar a capa.");finalCover=cd.coverUrl||finalCover;}

      setMessage(isPdf?"Criando também a versão EPUB para Kindle...":"Criando também a versão PDF para leitura...");
      const br=await fetch("/api/user-books",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title,author,language,year,pages,description,coverUrl:finalCover,categoryId:categoryId||null,driveFileId:uploaded.id,fileName:s.fileName,mimeType})});
      const saved=await br.json();if(!br.ok)throw new Error(saved.error||"Não foi possível salvar o livro.");
      setBooks(p=>[saved.book,...p]);setLastBook(saved.book);setProgress(100);
      setMessage(saved.formatWarning?"Livro salvo. Uma das versões ainda não pôde ser preparada automaticamente; você poderá tentar novamente ao abrir o livro.":"Pronto: o livro já possui PDF para leitura e EPUB para Kindle.");
      setPdf(null);setCoverFile(null);
    }catch(err){setMessage(err instanceof Error?err.message:"Erro ao salvar o livro.");}finally{setUploading(false);}
  }

  const statusLabel=(s:string)=>s==="catalog"?"Disponível":s==="private"?"Privado":"Em análise";

  return <div className="kindle-layout">
    <section className="card panel kindle-upload-card"><div className="panel-kicker">MINHA BIBLIOTECA</div><h2>Adicionar livro</h2><p className="muted">Envie PDF ou EPUB. A Biblioteca prepara automaticamente as duas versões: PDF para leitura e EPUB para Kindle.</p>
      <form className="stack" onSubmit={submit}>
        <label className="suggestion-box">Livro<input value={title} onChange={e=>{setTitle(e.target.value);setSelected(null);}} placeholder="Título, autor ou ISBN" required/>{searching&&<small className="muted">Buscando edições...</small>}{!!suggestions.length&&<div className="suggestions">{suggestions.map(i=><button type="button" className="suggestion" key={i.id} onClick={()=>choose(i)}>{i.coverUrl?<img src={i.coverUrl} alt=""/>:<span/>}<span><strong>{i.title}</strong><small>{i.author}{i.year?` • ${i.year}`:""} • {langLabel(i.language)}</small></span></button>)}</div>}</label>
        <div className="form-two"><label>Autor<input value={author} onChange={e=>setAuthor(e.target.value)} required/></label><label>Idioma<input value={language} onChange={e=>setLanguage(e.target.value.toLowerCase())} placeholder="pt-BR, en, es..."/></label></div>
        <div className="form-two"><label>Ano<input type="number" value={year} onChange={e=>setYear(e.target.value)}/></label><label>Páginas<input type="number" value={pages} onChange={e=>setPages(e.target.value)}/></label></div>
        <label>Categoria<select value={categoryId} onChange={e=>setCategoryId(e.target.value)}><option value="">Sem categoria</option>{categories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select><small className="muted">A categoria é sugerida automaticamente ao escolher uma edição.</small></label>
        <label>Sinopse<textarea value={description} onChange={e=>setDescription(e.target.value)} required/></label>
        <label>Arquivo do livro<input type="file" accept=".pdf,.epub,application/pdf,application/epub+zip" onChange={e=>setPdf(e.target.files?.[0]||null)} required/><small className="muted">Aceita PDF ou EPUB. O outro formato é criado automaticamente.</small></label>
        <label>URL da capa<input value={coverUrl} onChange={e=>setCoverUrl(e.target.value)} placeholder="Preenchida automaticamente quando disponível"/></label>
        <label>Ou enviar outra capa<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setCoverFile(e.target.files?.[0]||null)}/></label>
        {(coverFile||coverUrl)&&<div className="kindle-cover-preview">{coverFile?<span>{coverFile.name}</span>:<img src={coverUrl} alt="Prévia da capa"/>}</div>}
        {uploading&&<div className="upload-progress"><span style={{width:`${progress}%`}}/><b>{progress}%</b></div>}
        <button className="btn" disabled={uploading||!title||!pdf}>{uploading?"Preparando seu livro...":"Salvar livro"}</button>
      </form>
      {message&&<div className={`notice ${lastBook?"success":""}`} style={{marginTop:14}}>{message}</div>}
      {lastBook&&<div className="kindle-actions"><KindleShareButton id={lastBook.id} title={lastBook.title} source="user"/><a className="btn secondary" href={`/api/user-books/${lastBook.id}/file?inline=1`} target="_blank">Ler PDF</a></div>}
    </section>

    <section className="card panel"><div className="panel-kicker">SEUS ENVIOS</div><h2>Livros adicionados</h2><p className="muted">Acompanhe os livros enviados e o status de cada um.</p><div className="table-list">{books.length?books.map(b=><div className="table-row" key={b.id}><div><strong>{b.title}</strong><div className="meta">{b.author}{b.language?` • ${langLabel(b.language)}`:""}{b.categories?.name?` • ${b.categories.name}`:""} • {statusLabel(b.moderation_status)}</div></div><div className="row wrap"><KindleShareButton id={b.id} title={b.title} source="user"/>{(b.mime_type==="application/pdf"||b.file_name.toLowerCase().endsWith(".pdf"))&&<a className="btn ghost" href={`/api/user-books/${b.id}/file?inline=1`} target="_blank">Ler PDF</a>}</div></div>):<div className="muted">Você ainda não enviou nenhum livro.</div>}</div></section>
  </div>;
}
