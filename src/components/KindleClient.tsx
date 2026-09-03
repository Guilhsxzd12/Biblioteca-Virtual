"use client";

import { useEffect,useState } from "react";
import JSZip from "jszip";
import { guessCategoryId } from "@/lib/category-match";
import { uploadDriveFileInChunks } from "@/lib/upload-client";
import type { BookMetadataResult,Category,UserBook } from "@/lib/types";

type Props={categories:Category[];initialBooks:UserBook[]};

async function validateEpub(file:File){
  let zip:JSZip;
  try{zip=await JSZip.loadAsync(file);}catch{throw new Error("Esse arquivo não é um EPUB válido.");}
  const mimeEntry=zip.file("mimetype");const container=zip.file("META-INF/container.xml");
  if(!mimeEntry||!container)throw new Error("EPUB inválido: estrutura obrigatória ausente.");
  const mime=(await mimeEntry.async("text")).trim();
  if(mime!=="application/epub+zip")throw new Error("EPUB inválido: tipo interno incorreto.");
}

function langLabel(code?:string|null){const m:Record<string,string>={pt:"Português",en:"Inglês",es:"Espanhol",fr:"Francês",it:"Italiano",de:"Alemão",ja:"Japonês",zh:"Chinês",ru:"Russo"};return code?(m[code]||code.toUpperCase()):"Idioma não informado";}

export function KindleClient({categories,initialBooks}:Props){
  const [books,setBooks]=useState(initialBooks);
  const [title,setTitle]=useState("");const [author,setAuthor]=useState("");const [language,setLanguage]=useState("");const [year,setYear]=useState("");const [pages,setPages]=useState("");const [description,setDescription]=useState("");const [coverUrl,setCoverUrl]=useState("");const [categoryId,setCategoryId]=useState("");
  const [ebook,setEbook]=useState<File|null>(null);const [coverFile,setCoverFile]=useState<File|null>(null);const [suggestions,setSuggestions]=useState<BookMetadataResult[]>([]);const [selected,setSelected]=useState<BookMetadataResult|null>(null);const [searching,setSearching]=useState(false);const [uploading,setUploading]=useState(false);const [progress,setProgress]=useState(0);const [message,setMessage]=useState("");const [lastBook,setLastBook]=useState<UserBook|null>(null);const [lastShareFile,setLastShareFile]=useState<File|null>(null);const [sharing,setSharing]=useState<string|null>(null);

  useEffect(()=>{if(selected&&title===selected.title){setSuggestions([]);return;}if(title.trim().length<2){setSuggestions([]);return;}const c=new AbortController();const t=setTimeout(async()=>{setSearching(true);try{const r=await fetch(`/api/book-metadata?title=${encodeURIComponent(title)}`,{signal:c.signal});const d=await r.json();if(r.ok)setSuggestions(d.results||[]);}catch{}setSearching(false);},450);return()=>{clearTimeout(t);c.abort();};},[title,selected]);

  function choose(item:BookMetadataResult){setSelected(item);setTitle(item.title);setAuthor(item.author||"");setLanguage(item.language||"");setYear(item.year?String(item.year):"");setPages(item.pages?String(item.pages):"");setDescription(item.description||"");setCoverUrl(item.coverUrl||"");setCategoryId(guessCategoryId(categories,item.categories||[],item.title,item.description||"")||"");setSuggestions([]);}

  async function shareToKindle(book:UserBook,preferred?:File|null){
    setSharing(book.id);setMessage("");
    try{
      let file=preferred||null;
      if(!file){const r=await fetch(`/api/user-books/${book.id}/file`);if(!r.ok)throw new Error("Não foi possível preparar o arquivo para compartilhar.");const blob=await r.blob();file=new File([blob],book.file_name,{type:book.mime_type||blob.type||"application/octet-stream"});}
      const nav=navigator as Navigator & {canShare?:(data:ShareData)=>boolean};
      if(navigator.share&&(!nav.canShare||nav.canShare({files:[file]})))await navigator.share({title:book.title,text:`Enviar ${book.title} para o Kindle`,files:[file]});
      else{const url=URL.createObjectURL(file);const a=document.createElement("a");a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage("Este navegador não permite compartilhar o arquivo diretamente. Ele foi baixado para você compartilhar com o app Kindle.");}
    }catch(e){if(e instanceof DOMException&&e.name==="AbortError")return;setMessage(e instanceof Error?e.message:"Não foi possível compartilhar o arquivo.");}finally{setSharing(null);}
  }

  async function submit(e:React.FormEvent){
    e.preventDefault();
    if(!ebook){setMessage("Selecione um arquivo PDF ou EPUB.");return;}
    if(!author.trim()||!description.trim()){setMessage("Autor e sinopse são obrigatórios.");return;}
    const isEpub=ebook.name.toLowerCase().endsWith(".epub")||ebook.type==="application/epub+zip";
    const isPdf=ebook.name.toLowerCase().endsWith(".pdf")||ebook.type==="application/pdf";
    if(!isEpub&&!isPdf){setMessage("Use um arquivo PDF ou EPUB.");return;}
    if(ebook.size>200*1024*1024){setMessage("O arquivo ultrapassa 200 MB.");return;}
    const mimeType=isEpub?"application/epub+zip":"application/pdf";
    setUploading(true);setProgress(0);setMessage("");setLastBook(null);
    try{
      if(isEpub){setMessage("Validando EPUB...");await validateEpub(ebook);}
      const sr=await fetch("/api/user-books/upload-url",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title,originalFileName:ebook.name,mimeType,fileSize:ebook.size})});const s=await sr.json();if(!sr.ok)throw new Error(s.error||"Não foi possível preparar o upload.");
      setMessage("Enviando para sua biblioteca...");const prepared=new File([ebook],ebook.name,{type:mimeType});const uploaded=await uploadDriveFileInChunks(s.uploadUrl,prepared,setProgress);
      let finalCover=coverUrl.trim();if(coverFile){const fd=new FormData();fd.append("file",coverFile);const cr=await fetch("/api/user-books/cover",{method:"POST",body:fd});const cd=await cr.json();if(!cr.ok)throw new Error(cd.error||"Não foi possível enviar a capa.");finalCover=cd.coverUrl||finalCover;}
      const br=await fetch("/api/user-books",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title,author,language,year,pages,description,coverUrl:finalCover,categoryId:categoryId||null,driveFileId:uploaded.id,fileName:s.fileName,mimeType})});const saved=await br.json();if(!br.ok)throw new Error(saved.error||"Não foi possível salvar o e-book.");
      setBooks(p=>[saved.book,...p]);setLastBook(saved.book);setLastShareFile(new File([ebook],s.fileName,{type:mimeType}));setMessage(isPdf?"PDF salvo. Ele pode ser lido no site e enviado diretamente ao Kindle.":"EPUB salvo e pronto para compartilhar com o Kindle.");setEbook(null);setCoverFile(null);setProgress(100);
    }catch(err){setMessage(err instanceof Error?err.message:"Erro ao preparar o e-book.");}finally{setUploading(false);}
  }

  const statusLabel=(s:string)=>s==="catalog"?"No catálogo":s==="private"?"Privado":"Aguardando aprovação";

  return <div className="kindle-layout"><section className="card panel"><h2>Enviar ao Kindle</h2><p className="muted">Envie PDF ou EPUB. O arquivo fica salvo no Drive e o botão Enviar ao Kindle abre o compartilhamento nativo do celular com o arquivo anexado.</p><form className="stack" onSubmit={submit}>
    <label className="suggestion-box">Livro<input value={title} onChange={e=>{setTitle(e.target.value);setSelected(null);}} placeholder="Digite o título ou ISBN" required/>{searching&&<small className="muted">Buscando livro...</small>}{!!suggestions.length&&<div className="suggestions">{suggestions.map(i=><button type="button" className="suggestion" key={i.id} onClick={()=>choose(i)}>{i.coverUrl?<img src={i.coverUrl} alt=""/>:<span/>}<span><strong>{i.title}</strong><small>{i.author}{i.year?` • ${i.year}`:""} • {langLabel(i.language)}</small></span></button>)}</div>}</label>
    <label>Autor<input value={author} onChange={e=>setAuthor(e.target.value)} required/></label><label>Idioma<input value={language} onChange={e=>setLanguage(e.target.value.toLowerCase())} placeholder="pt, en, es..."/><small className="muted">Preenchido automaticamente quando a base informa o idioma.</small></label>
    <div className="row"><label style={{flex:1}}>Ano<input type="number" value={year} onChange={e=>setYear(e.target.value)}/></label><label style={{flex:1}}>Páginas<input type="number" value={pages} onChange={e=>setPages(e.target.value)}/></label></div>
    <label>Categoria<select value={categoryId} onChange={e=>setCategoryId(e.target.value)}><option value="">Sem categoria</option>{categories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select><small className="muted">A categoria é sugerida automaticamente ao escolher o livro na pesquisa.</small></label>
    <label>Sinopse<textarea value={description} onChange={e=>setDescription(e.target.value)} required/></label><label>Arquivo do e-book<input type="file" accept=".pdf,.epub,application/pdf,application/epub+zip" onChange={e=>setEbook(e.target.files?.[0]||null)} required/><small className="muted">PDF ou EPUB, até 200 MB. PDF é o formato recomendado para leitura no site.</small></label>
    <label>URL da capa<input value={coverUrl} onChange={e=>setCoverUrl(e.target.value)} placeholder="Preenchida automaticamente quando disponível"/></label><label>Ou enviar uma capa<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e=>setCoverFile(e.target.files?.[0]||null)}/></label>{(coverFile||coverUrl)&&<div className="kindle-cover-preview">{coverFile?<span>{coverFile.name}</span>:<img src={coverUrl} alt="Prévia da capa"/>}</div>}{uploading&&<div className="file-preview">Upload: <b>{progress}%</b></div>}<button className="btn" disabled={uploading||!title||!ebook}>{uploading?"Enviando...":"Salvar e preparar para Kindle"}</button>
  </form>{message&&<div className={`notice ${lastBook?"success":""}`} style={{marginTop:14}}>{message}</div>}{lastBook&&<div className="kindle-actions"><button className="btn" type="button" onClick={()=>shareToKindle(lastBook,lastShareFile)} disabled={sharing===lastBook.id}>{sharing===lastBook.id?"Preparando...":"Enviar ao Kindle"}</button><a className="btn secondary" href={`/api/user-books/${lastBook.id}/file`}>Baixar arquivo</a></div>}</section>
  <section className="card panel"><h2>Seus e-books</h2><p className="muted">Você sempre enxerga seus próprios uploads. O administrador decide se um PDF entra no catálogo ou fica privado.</p><div className="table-list">{books.length?books.map(b=><div className="table-row" key={b.id}><div><strong>{b.title}</strong><div className="meta">{b.author}{b.language?` • ${langLabel(b.language)}`:""}{b.categories?.name?` • ${b.categories.name}`:""} • {statusLabel(b.moderation_status)}</div></div><div className="row wrap"><button className="btn" type="button" onClick={()=>shareToKindle(b)} disabled={sharing===b.id}>{sharing===b.id?"Preparando...":"Enviar ao Kindle"}</button><a className="btn ghost" href={`/api/user-books/${b.id}/file`}>Baixar</a></div></div>):<div className="muted">Você ainda não enviou nenhum e-book.</div>}</div></section></div>;
}
