"use client";

import { useEffect,useMemo,useState } from "react";
import { driveFileName } from "@/lib/slugify";
import { guessCategoryId } from "@/lib/category-match";
import { uploadDriveFileInChunks } from "@/lib/upload-client";
import type { Book,BookMetadataResult,Category,Profile,UserBook } from "@/lib/types";

type Props={initialBooks:Book[];initialCategories:Category[];initialProfiles:Profile[];initialUserBooks:UserBook[]};
type Tab="livros"|"envios"|"categorias"|"usuarios"|"drive";

export function AdminDashboard({initialBooks,initialCategories,initialProfiles,initialUserBooks}:Props){
  const [tab,setTab]=useState<Tab>("livros");
  const [books,setBooks]=useState(initialBooks);
  const [userBooks,setUserBooks]=useState(initialUserBooks);
  const [categories,setCategories]=useState(initialCategories);
  const [profiles,setProfiles]=useState(initialProfiles);
  const [message,setMessage]=useState("");
  const [uploading,setUploading]=useState(false);
  const [uploadProgress,setUploadProgress]=useState(0);
  const [title,setTitle]=useState("");
  const [file,setFile]=useState<File|null>(null);
  const [coverFile,setCoverFile]=useState<File|null>(null);
  const [suggestions,setSuggestions]=useState<BookMetadataResult[]>([]);
  const [searching,setSearching]=useState(false);
  const [selected,setSelected]=useState<BookMetadataResult|null>(null);
  const [drive,setDrive]=useState<{connected:boolean;accountEmail?:string|null;updatedAt?:string|null}>({connected:false});
  const [moderating,setModerating]=useState<string|null>(null);

  const computedFileName=useMemo(()=>driveFileName(title,file?.name),[title,file?.name]);
  const suggestedCategory=selected?guessCategoryId(categories,selected.categories||[],selected.title,selected.description||""):null;

  async function refreshDrive(){try{const r=await fetch("/api/drive/status",{cache:"no-store"});const d=await r.json();if(r.ok)setDrive(d);}catch{}}
  useEffect(()=>{refreshDrive();},[]);

  useEffect(()=>{
    if(selected&&title===selected.title){setSuggestions([]);return;}
    if(title.trim().length<2){setSuggestions([]);return;}
    const c=new AbortController();
    const t=setTimeout(async()=>{setSearching(true);try{const r=await fetch(`/api/book-metadata?title=${encodeURIComponent(title)}`,{signal:c.signal});const d=await r.json();if(r.ok)setSuggestions(d.results||[]);}catch{}setSearching(false);},450);
    return()=>{clearTimeout(t);c.abort();};
  },[title,selected]);

  function choose(item:BookMetadataResult){setSelected(item);setTitle(item.title);setSuggestions([]);}

  async function addBook(formData:FormData){
    if(!file){setMessage("Selecione o arquivo do livro.");return;}
    setUploading(true);setUploadProgress(0);setMessage("");
    try{
      const sr=await fetch("/api/drive/upload-url",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title,originalFileName:file.name,mimeType:file.type||"application/pdf",fileSize:file.size})});
      const s=await sr.json();if(!sr.ok){if(s.needsConnection)setTab("drive");throw new Error(s.error||"Falha ao preparar upload.");}
      const df=await uploadDriveFileInChunks(s.uploadUrl,file,setUploadProgress);

      let coverUrl=String(formData.get("cover_url")||selected?.coverUrl||"").trim();
      if(coverFile){const coverData=new FormData();coverData.append("file",coverFile);const cr=await fetch("/api/admin/covers",{method:"POST",body:coverData});const cd=await cr.json();if(!cr.ok)throw new Error(cd.error||"Não foi possível enviar a capa.");coverUrl=cd.coverUrl||coverUrl;}

      const br=await fetch("/api/admin/books",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title,author:String(formData.get("author")||selected?.author||""),description:String(formData.get("description")||selected?.description||""),year:String(formData.get("year")||selected?.year||""),pages:String(formData.get("pages")||selected?.pages||""),coverUrl,categoryId:String(formData.get("category_id")||"")||null,driveFileId:df.id,fileName:s.fileName,mimeType:file.type||"application/pdf",published:formData.get("published")==="on",allowDownload:formData.get("allow_download")==="on"})});
      const saved=await br.json();if(!br.ok)throw new Error(saved.error||"Erro ao salvar livro.");
      setBooks(p=>[saved.book,...p]);setTitle("");setFile(null);setCoverFile(null);setSelected(null);setSuggestions([]);setMessage("Livro enviado e cadastrado com sucesso.");(document.getElementById("book-form") as HTMLFormElement|null)?.reset();
    }catch(e){setMessage(e instanceof Error?e.message:"Erro no upload.");}finally{setUploading(false);}
  }

  async function moderateUserBook(id:string,status:"pending"|"private"|"catalog"){
    setModerating(id);setMessage("");
    try{const r=await fetch("/api/admin/user-books",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,status})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Falha ao atualizar envio.");setUserBooks(p=>p.map(x=>x.id===id?{...x,...d.book}:x));setMessage(status==="catalog"?"Envio aprovado e publicado no catálogo.":status==="private"?"Envio marcado como privado para o usuário.":"Envio voltou para análise.");}catch(e){setMessage(e instanceof Error?e.message:"Erro na moderação.");}finally{setModerating(null);}
  }

  async function removeBook(id:string){if(!confirm("Remover este livro do catálogo?"))return;const r=await fetch(`/api/admin/books?id=${encodeURIComponent(id)}`,{method:"DELETE"});if(r.ok)setBooks(p=>p.filter(b=>b.id!==id));}
  async function addCategory(fd:FormData){const r=await fetch("/api/admin/categories",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:String(fd.get("name")||"")})});const d=await r.json();if(r.ok)setCategories(p=>[...p,d.category].sort((a,b)=>a.name.localeCompare(b.name)));else setMessage(d.error||"Erro ao criar categoria.");}
  async function removeCategory(id:string){const r=await fetch(`/api/admin/categories?id=${encodeURIComponent(id)}`,{method:"DELETE"});if(r.ok)setCategories(p=>p.filter(c=>c.id!==id));}
  async function updateUser(id:string,patch:{approved?:boolean;role?:string}){const r=await fetch("/api/admin/users",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,...patch})});if(r.ok)setProfiles(p=>p.map(x=>x.id===id?{...x,...patch}:x));}
  async function connectDrive(){const r=await fetch("/api/drive/auth-url");const d=await r.json();if(r.ok&&d.url)location.href=d.url;else setMessage(d.error||"Não foi possível conectar o Drive.");}
  const statusLabel=(s:string)=>s==="catalog"?"Catálogo":s==="private"?"Privado":"Pendente";

  return <>
    <div className="tabs">{[["livros","Livros"],["envios","Envios dos usuários"],["categorias","Categorias"],["usuarios","Usuários"],["drive","Google Drive"]].map(([k,l])=><button key={k} className={`tab ${tab===k?"active":""}`} onClick={()=>setTab(k as Tab)}>{l}</button>)}</div>
    {message&&<div className={`notice ${message.includes("sucesso")||message.includes("publicado")?"success":""}`} style={{marginBottom:16}}>{message}</div>}

    {tab==="livros"&&<div className="admin-grid"><section className="card panel"><h2>Adicionar livro</h2><form id="book-form" className="stack" action={addBook}>
      <label className="suggestion-box">Título<input value={title} onChange={e=>{setTitle(e.target.value);setSelected(null);}} placeholder="Digite título ou ISBN" required/><small className="muted">Google Books, e-books e Open Library. Escolha uma opção para preencher os dados.</small>{searching&&<small className="muted">Buscando...</small>}{!!suggestions.length&&<div className="suggestions">{suggestions.map(i=><button type="button" className="suggestion" key={i.id} onClick={()=>choose(i)}>{i.coverUrl?<img src={i.coverUrl} alt=""/>:<span/>}<span><strong>{i.title}</strong><small>{i.author}{i.year?` • ${i.year}`:""}{i.isEbook?" • e-book":""}</small></span></button>)}</div>}</label>
      <div className="file-preview">No Google Drive: <b>{computedFileName}</b></div><label>Arquivo do livro<input type="file" accept=".pdf,.epub,application/pdf,application/epub+zip" onChange={e=>setFile(e.target.files?.[0]||null)} required/></label>
      <label>Autor<input name="author" key={`a-${selected?.id||""}`} defaultValue={selected?.author||""}/></label><div className="row"><label style={{flex:1}}>Ano<input name="year" type="number" key={`y-${selected?.id||""}`} defaultValue={selected?.year||""}/></label><label style={{flex:1}}>Páginas<input name="pages" type="number" key={`p-${selected?.id||""}`} defaultValue={selected?.pages||""}/></label></div>
      <label>Sinopse<textarea name="description" key={`d-${selected?.id||""}`} defaultValue={selected?.description||""}/></label><label>URL da capa<input name="cover_url" key={`c-${selected?.id||""}`} defaultValue={selected?.coverUrl||""}/></label><label>Ou enviar capa<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e=>setCoverFile(e.target.files?.[0]||null)}/></label>
      <label>Categoria<select name="category_id" key={`cat-${selected?.id||"manual"}`} defaultValue={suggestedCategory||""}><option value="">Sem categoria</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>{suggestedCategory&&<small className="muted">Categoria sugerida automaticamente.</small>}</label>
      <div className="row wrap"><label style={{display:"flex",alignItems:"center"}}><input name="published" type="checkbox" defaultChecked style={{width:"auto"}}/> Publicado</label><label style={{display:"flex",alignItems:"center"}}><input name="allow_download" type="checkbox" style={{width:"auto"}}/> Permitir download</label></div>{uploading&&<div className="file-preview">Upload: <b>{uploadProgress}%</b></div>}<button className="btn" disabled={uploading||!title||!file}>{uploading?"Enviando...":"Adicionar livro"}</button>
    </form></section><section className="card panel"><h2>Livros cadastrados</h2><div className="table-list">{books.length?books.map(b=><div className="table-row" key={b.id}><div><strong>{b.title}</strong><div className="meta">{b.author} • {b.file_name} • {b.published?"publicado":"oculto"}</div></div><button className="btn danger" onClick={()=>removeBook(b.id)}>Excluir</button></div>):<div className="muted">Nenhum livro cadastrado ainda.</div>}</div></section></div>}

    {tab==="envios"&&<section className="card panel"><h2>Envios dos usuários</h2><p className="muted">Todo EPUB enviado entra como Pendente. Você decide se ele vai para o catálogo geral ou se permanece privado para quem enviou.</p><div className="table-list">{userBooks.length?userBooks.map(b=><div className="table-row" key={b.id}><div><strong>{b.title}</strong><div className="meta">{b.author} • {b.uploader_name||b.uploader_email||"Usuário"} • {b.categories?.name||"Sem categoria"} • <b>{statusLabel(b.moderation_status)}</b></div></div><div className="row wrap"><button className="btn" disabled={moderating===b.id||b.moderation_status==="catalog"} onClick={()=>moderateUserBook(b.id,"catalog")}>Aprovar catálogo</button><button className="btn secondary" disabled={moderating===b.id||b.moderation_status==="private"} onClick={()=>moderateUserBook(b.id,"private")}>Privado</button><button className="btn ghost" disabled={moderating===b.id||b.moderation_status==="pending"} onClick={()=>moderateUserBook(b.id,"pending")}>Pendente</button></div></div>):<div className="muted">Nenhum envio de usuário ainda.</div>}</div></section>}

    {tab==="categorias"&&<section className="card panel"><h2>Categorias</h2><form className="row" action={addCategory}><input name="name" placeholder="Nova categoria" required/><button className="btn">Adicionar</button></form><div className="table-list">{categories.map(c=><div className="table-row" key={c.id}><strong>{c.name}</strong><button className="btn danger" onClick={()=>removeCategory(c.id)}>Excluir</button></div>)}</div></section>}
    {tab==="usuarios"&&<section className="card panel"><h2>Usuários</h2><div className="table-list">{profiles.map(p=><div className="table-row" key={p.id}><div><strong>{p.full_name||p.email||"Usuário"}</strong><div className="meta">{p.email} • {p.role} • {p.approved?"aprovado":"aguardando"}</div></div><div className="row wrap"><button className="btn" onClick={()=>updateUser(p.id,{approved:!p.approved})}>{p.approved?"Bloquear":"Aprovar"}</button><button className="btn ghost" onClick={()=>updateUser(p.id,{role:p.role==="admin"?"reader":"admin"})}>{p.role==="admin"?"Tornar leitor":"Tornar admin"}</button></div></div>)}</div></section>}
    {tab==="drive"&&<section className="card panel" style={{maxWidth:700}}><h2>Google Drive</h2><div className="row"><span className={`status-dot ${drive.connected?"on":""}`}/><strong>{drive.connected?"Conectado de forma persistente":"Não conectado"}</strong></div>{drive.accountEmail&&<p className="muted">Conta: {drive.accountEmail}</p>}<p className="muted">A conexão fica salva no servidor e continua ativa ao atualizar, sair ou entrar novamente. O servidor renova o acesso automaticamente usando o refresh token.</p><p className="muted">Acervo: BIBLIOTECA VIRTUAL/A–Z. Uploads pessoais: BIBLIOTECA VIRTUAL/USUARIOS.</p><div className="row wrap"><button className="btn" onClick={connectDrive}>{drive.connected?"Reconectar Google Drive":"Conectar Google Drive"}</button><button className="btn ghost" onClick={refreshDrive}>Verificar conexão</button></div></section>}
  </>;
}
