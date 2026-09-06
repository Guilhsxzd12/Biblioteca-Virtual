"use client";

import { useEffect,useState } from "react";
import Link from "next/link";
import { driveFileName } from "@/lib/slugify";
import { guessCategoryId } from "@/lib/category-match";
import { uploadDriveFileInChunks } from "@/lib/upload-client";
import type { Book,BookMetadataResult,BookRequest,Category,Profile } from "@/lib/types";

type Props={initialBooks:Book[];initialCategories:Category[];initialProfiles:Profile[];initialRequests:BookRequest[]};
type Tab="livros"|"pedidos"|"categorias"|"usuarios"|"drive";
type Draft={title:string;author:string;description:string;language:string;year:string;pages:string;categoryId:string;coverUrl:string;published:boolean};
const emptyDraft:Draft={title:"",author:"",description:"",language:"pt",year:"",pages:"",categoryId:"",coverUrl:"",published:true};

function languageName(value?:string|null){return ({pt:"Português",en:"Inglês",es:"Espanhol",fr:"Francês",it:"Italiano",de:"Alemão"} as Record<string,string>)[value||""]||value||"Não informado";}
function date(value:string){return new Intl.DateTimeFormat("pt-BR",{dateStyle:"short"}).format(new Date(value));}

export function AdminDashboard({initialBooks,initialCategories,initialProfiles,initialRequests}:Props){
  const [tab,setTab]=useState<Tab>("livros");
  const [books,setBooks]=useState(initialBooks);const [categories,setCategories]=useState(initialCategories);const [profiles,setProfiles]=useState(initialProfiles);const [requests,setRequests]=useState(initialRequests);
  const [draft,setDraft]=useState<Draft>(emptyDraft);const [editing,setEditing]=useState<Book|null>(null);const [requestId,setRequestId]=useState<string|null>(null);
  const [epubFile,setEpubFile]=useState<File|null>(null);const [pdfFile,setPdfFile]=useState<File|null>(null);const [coverFile,setCoverFile]=useState<File|null>(null);
  const [suggestions,setSuggestions]=useState<BookMetadataResult[]>([]);const [searching,setSearching]=useState(false);const [selected,setSelected]=useState<BookMetadataResult|null>(null);
  const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);const [progress,setProgress]=useState(0);const [drive,setDrive]=useState<{connected:boolean;accountEmail?:string|null}>({connected:false});
  const pendingRequests=requests.filter(item=>item.status==="pending");const completedRequests=requests.filter(item=>item.status!=="pending");
  const suggestedCategory=selected?guessCategoryId(categories,selected.categories||[],selected.title,selected.description||""):null;

  async function refreshDrive(){try{const response=await fetch("/api/drive/status",{cache:"no-store"});const data=await response.json();if(response.ok)setDrive(data);}catch{}}
  useEffect(()=>{void refreshDrive();},[]);
  useEffect(()=>{
    if(editing||selected||draft.title.trim().length<2){setSuggestions([]);return;}
    const controller=new AbortController();const timer=setTimeout(async()=>{setSearching(true);try{const response=await fetch(`/api/book-metadata?title=${encodeURIComponent(draft.title)}`,{signal:controller.signal});const data=await response.json();if(response.ok)setSuggestions(data.results||[]);}catch{}finally{setSearching(false);}},450);
    return()=>{clearTimeout(timer);controller.abort();};
  },[draft.title,selected,editing]);

  function chooseMetadata(item:BookMetadataResult){setSelected(item);setSuggestions([]);setDraft(current=>({...current,title:item.title,author:item.author,description:item.description||"",language:item.language||"pt",year:item.year?String(item.year):"",pages:item.pages?String(item.pages):"",coverUrl:item.coverUrl||"",categoryId:guessCategoryId(categories,item.categories||[],item.title,item.description||"")||current.categoryId}));}
  function resetForm(){setEditing(null);setRequestId(null);setSelected(null);setDraft(emptyDraft);setEpubFile(null);setPdfFile(null);setCoverFile(null);setProgress(0);(document.getElementById("book-form") as HTMLFormElement|null)?.reset();}
  function editBook(book:Book){setEditing(book);setRequestId(null);setSelected(null);setDraft({title:book.title,author:book.author,description:book.description||"",language:book.language||"pt",year:book.year?String(book.year):"",pages:book.pages?String(book.pages):"",categoryId:book.category_id||"",coverUrl:book.cover_url||"",published:book.published});setEpubFile(null);setPdfFile(null);setCoverFile(null);setTab("livros");window.scrollTo({top:0,behavior:"smooth"});}
  function useRequest(item:BookRequest){resetForm();setRequestId(item.id);setDraft({...emptyDraft,title:item.title,author:item.author,language:item.language});setTab("livros");window.scrollTo({top:0,behavior:"smooth"});}

  async function uploadFile(bookTitle:string,file:File,mimeType:string,onProgress:(value:number)=>void){
    const sessionResponse=await fetch("/api/drive/upload-url",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title:bookTitle,originalFileName:file.name,mimeType,fileSize:file.size})});
    const session=await sessionResponse.json();if(!sessionResponse.ok){if(session.needsConnection)setTab("drive");throw new Error(session.error||"Falha ao preparar upload.");}
    const uploaded=await uploadDriveFileInChunks(session.uploadUrl,new File([file],file.name,{type:mimeType}),onProgress);return {id:uploaded.id,fileName:session.fileName as string};
  }

  async function saveBook(_formData:FormData){
    if(!draft.title.trim()||!draft.author.trim()){setMessage("Preencha título e autor.");return;}
    if(!editing&&(!epubFile||!pdfFile)){setMessage("Para cadastrar um livro novo, o EPUB e o PDF são obrigatórios.");return;}
    setBusy(true);setProgress(0);setMessage("");
    try{
      let coverUrl=draft.coverUrl.trim();
      if(coverFile){const form=new FormData();form.append("file",coverFile);const response=await fetch("/api/admin/covers",{method:"POST",body:form});const data=await response.json();if(!response.ok)throw new Error(data.error||"Não foi possível enviar a capa.");coverUrl=data.coverUrl;}
      const epub=epubFile?await uploadFile(draft.title,epubFile,"application/epub+zip",value=>setProgress(Math.round(value*(pdfFile?0.5:1)))):null;
      const pdf=pdfFile?await uploadFile(draft.title,pdfFile,"application/pdf",value=>setProgress((epub?50:0)+Math.round(value*(epub?0.5:1)))):null;
      const body:Record<string,unknown>={id:editing?.id,title:draft.title,author:draft.author,description:draft.description,language:draft.language,year:draft.year,pages:draft.pages,categoryId:draft.categoryId,coverUrl,published:draft.published,requestId};
      if(epub){body.driveFileId=epub.id;body.fileName=epub.fileName;body.mimeType="application/epub+zip";if(pdf){body.readingPdfDriveFileId=pdf.id;body.readingPdfFileName=pdf.fileName;}else if(editing&&editing.reading_pdf_drive_file_id){body.readingPdfDriveFileId=editing.reading_pdf_drive_file_id;body.readingPdfFileName=editing.reading_pdf_file_name;}}
      else if(pdf){if(editing&&(editing.mime_type==="application/epub+zip"||editing.file_name.toLowerCase().endsWith(".epub"))){body.readingPdfDriveFileId=pdf.id;body.readingPdfFileName=pdf.fileName;}else{body.driveFileId=pdf.id;body.fileName=pdf.fileName;body.mimeType="application/pdf";}}
      const response=await fetch("/api/admin/books",{method:editing?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error||"Não foi possível salvar o livro.");
      if(editing)setBooks(current=>current.map(book=>book.id===data.book.id?data.book:book));else setBooks(current=>[data.book,...current]);
      if(requestId)setRequests(current=>current.map(item=>item.id===requestId?{...item,status:"published",matched_book_id:data.book.id,published_at:new Date().toISOString(),notified_at:data.notification?.notificationSent?new Date().toISOString():null}:item));
      setMessage(`${editing?"Livro atualizado":"Livro publicado"} com sucesso.${data.notification?.notificationSent?" O usuário foi avisado pelo Telegram.":""}`);resetForm();
    }catch(error){setMessage(error instanceof Error?error.message:"Erro ao salvar livro.");}finally{setBusy(false);}
  }

  async function removeBook(id:string){if(!confirm("Excluir este livro do catálogo?"))return;const response=await fetch(`/api/admin/books?id=${encodeURIComponent(id)}`,{method:"DELETE"});const data=await response.json();if(response.ok){setBooks(current=>current.filter(book=>book.id!==id));setMessage("Livro excluído.");}else setMessage(data.error||"Não foi possível excluir.");}
  async function updateRequest(id:string,action:"archive"|"reopen"|"notify"){const response=await fetch("/api/admin/requests",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,action})});const data=await response.json();if(!response.ok){setMessage(data.error||"Erro ao atualizar pedido.");return;}if(data.request)setRequests(current=>current.map(item=>item.id===id?{...item,...data.request}:item));if(action==="notify")setMessage(data.notification?.notificationSent?"Notificação reenviada.":data.notification?.reason||"Notificação não entregue.");}
  async function addCategory(formData:FormData){const response=await fetch("/api/admin/categories",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:String(formData.get("name")||"")})});const data=await response.json();if(response.ok)setCategories(current=>[...current,data.category].sort((a,b)=>a.name.localeCompare(b.name)));else setMessage(data.error||"Erro ao criar categoria.");}
  async function removeCategory(id:string){if(!confirm("Excluir esta categoria?"))return;const response=await fetch(`/api/admin/categories?id=${encodeURIComponent(id)}`,{method:"DELETE"});if(response.ok)setCategories(current=>current.filter(item=>item.id!==id));}
  async function createUser(formData:FormData){setBusy(true);setMessage("");try{const response=await fetch("/api/admin/users",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({fullName:formData.get("full_name"),email:formData.get("email"),password:formData.get("password")})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Não foi possível criar o usuário.");setProfiles(current=>[data.profile,...current]);setMessage("Usuário criado e acesso liberado.");(document.getElementById("user-form") as HTMLFormElement|null)?.reset();}catch(error){setMessage(error instanceof Error?error.message:"Erro ao criar usuário.");}finally{setBusy(false);}}
  async function updateUser(id:string,patch:{approved?:boolean;password?:string}){const response=await fetch("/api/admin/users",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,...patch})});const data=await response.json();if(response.ok){setProfiles(current=>current.map(profile=>profile.id===id?data.profile:profile));setMessage(patch.password?"Senha redefinida.":"Usuário atualizado.");}else setMessage(data.error||"Erro ao atualizar usuário.");}
  async function connectDrive(){const response=await fetch("/api/drive/auth-url");const data=await response.json();if(response.ok&&data.url)location.href=data.url;else setMessage(data.error||"Não foi possível conectar o Drive.");}

  const tabs:[Tab,string][]=[["livros","Livros"],["pedidos",`Pedidos (${pendingRequests.length})`],["categorias","Categorias"],["usuarios","Usuários"],["drive","Google Drive"]];
  return <>
    <div className="tabs">{tabs.map(([key,label])=><button key={key} className={`tab ${tab===key?"active":""}`} onClick={()=>setTab(key)}>{label}</button>)}</div>
    {message&&<div className={`notice ${/sucesso|criado|publicado|atualizado|liberado|reenviada/i.test(message)?"success":""}`}>{message}</div>}

    {tab==="livros"&&<div className="admin-grid">
      <section className="card panel"><div className="panel-title"><div><span className="eyebrow">{editing?"EDIÇÃO":"NOVO TÍTULO"}</span><h2>{editing?`Editar ${editing.title}`:"Adicionar livro"}</h2></div>{(editing||requestId)&&<button className="btn ghost small" onClick={resetForm}>Cancelar</button>}</div>
        {requestId&&<div className="notice success">Este cadastro veio de um pedido. Ao publicar, o pedido será marcado como atendido.</div>}
        <form id="book-form" className="stack" action={saveBook}>
          <label className="suggestion-box">Título<input value={draft.title} onChange={event=>{setDraft(current=>({...current,title:event.target.value}));setSelected(null);}} placeholder="Digite o título ou ISBN" required/>{searching&&<small>Buscando informações...</small>}{suggestions.length>0&&<div className="suggestions">{suggestions.map(item=><button type="button" className="suggestion" key={item.id} onClick={()=>chooseMetadata(item)}>{item.coverUrl?<img src={item.coverUrl} alt=""/>:<span/>}<span><strong>{item.title}</strong><small>{item.author}{item.year?` • ${item.year}`:""}</small></span></button>)}</div>}</label>
          <label>Autor<input value={draft.author} onChange={event=>setDraft(current=>({...current,author:event.target.value}))} required/></label>
          <div className="form-row"><label>Idioma<input value={draft.language} onChange={event=>setDraft(current=>({...current,language:event.target.value}))}/></label><label>Ano<input type="number" value={draft.year} onChange={event=>setDraft(current=>({...current,year:event.target.value}))}/></label><label>Páginas<input type="number" value={draft.pages} onChange={event=>setDraft(current=>({...current,pages:event.target.value}))}/></label></div>
          <label>Sinopse<textarea value={draft.description} onChange={event=>setDraft(current=>({...current,description:event.target.value}))}/></label>
          <label>Categoria<select value={draft.categoryId||suggestedCategory||""} onChange={event=>setDraft(current=>({...current,categoryId:event.target.value}))}><option value="">Sem categoria</option>{categories.map(category=><option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
          <label>URL da capa (opcional)<input value={draft.coverUrl} onChange={event=>setDraft(current=>({...current,coverUrl:event.target.value}))}/></label>
          <label>Ou envie a capa do dispositivo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>setCoverFile(event.target.files?.[0]||null)}/><small>Você pode cadastrar o livro sem capa e adicioná-la depois ao editar.</small></label>
          <div className="file-pair"><label><strong>Arquivo EPUB</strong><span>{editing?"Opcional — envie apenas para substituir":"Obrigatório"}</span><input type="file" accept=".epub,application/epub+zip" onChange={event=>setEpubFile(event.target.files?.[0]||null)}/>{epubFile&&<small>{driveFileName(draft.title,epubFile.name)}</small>}</label><label><strong>Arquivo PDF</strong><span>{editing?"Opcional — envie apenas para substituir":"Obrigatório"}</span><input type="file" accept=".pdf,application/pdf" onChange={event=>setPdfFile(event.target.files?.[0]||null)}/>{pdfFile&&<small>{driveFileName(draft.title,pdfFile.name)}</small>}</label></div>
          <label className="check-label"><input type="checkbox" checked={draft.published} onChange={event=>setDraft(current=>({...current,published:event.target.checked}))}/> Publicar no acervo</label>
          {busy&&<div className="upload-progress"><span style={{width:`${progress}%`}}/></div>}
          <button className="btn" disabled={busy}>{busy?`Salvando${progress?` • ${progress}%`:"..."}`:editing?"Salvar alterações":"Publicar livro"}</button>
        </form>
      </section>
      <section className="card panel"><div className="panel-title"><div><span className="eyebrow">ACERVO</span><h2>Livros cadastrados</h2></div><span className="count-badge">{books.length}</span></div><div className="admin-book-list">{books.map(book=><article className="admin-book" key={book.id}>{book.cover_url?<img src={book.cover_url} alt=""/>:<span className="mini-cover"/>}<div><strong>{book.title}</strong><small>{book.author} • {book.categories?.name||"Sem categoria"} • {book.published?"Publicado":"Oculto"}</small><small>URL: /livro/{book.slug}</small></div><div className="row"><button className="btn ghost small" onClick={()=>editBook(book)}>Editar</button><button className="btn danger small" onClick={()=>removeBook(book.id)}>Excluir</button></div></article>)}</div></section>
    </div>}

    {tab==="pedidos"&&<section className="card panel"><div className="panel-title"><div><span className="eyebrow">SITE + TELEGRAM</span><h2>Pedidos de livros</h2><p>Todos os pedidos feitos pelo formulário do site ou pelo bot aparecem juntos aqui.</p></div><span className="count-badge">{pendingRequests.length}</span></div><div className="request-list">{pendingRequests.length?pendingRequests.map(item=><article className="request-card" key={item.id}><div><span className="request-date">{date(item.created_at)}</span><h3>{item.title}</h3><p>{item.author} • {languageName(item.language)}</p><small>{item.requester_name||item.requester_email||"Assinante"}{item.telegram_username?` • @${item.telegram_username}`:""}</small></div><div className="row wrap"><button className="btn small" onClick={()=>useRequest(item)}>Cadastrar este livro</button><button className="btn ghost small" onClick={()=>updateRequest(item.id,"archive")}>Arquivar</button></div></article>):<div className="empty-state"><h3>Nenhum pedido pendente</h3><p>Novos pedidos do site e do Telegram aparecerão aqui.</p></div>}</div>{completedRequests.length>0&&<details className="request-history"><summary>Ver pedidos concluídos e arquivados ({completedRequests.length})</summary>{completedRequests.map(item=><div className="table-row" key={item.id}><div><strong>{item.title}</strong><small>{item.status==="published"?"Publicado":"Arquivado"}</small></div><div className="row">{item.status==="published"&&!item.notified_at&&item.telegram_username&&<button className="btn small" onClick={()=>updateRequest(item.id,"notify")}>Reenviar aviso</button>}<button className="btn ghost small" onClick={()=>updateRequest(item.id,"reopen")}>Reabrir</button></div></div>)}</details>}</section>}

    {tab==="categorias"&&<section className="card panel"><div className="panel-title"><div><span className="eyebrow">ORGANIZAÇÃO</span><h2>Categorias</h2></div></div><form className="row category-form" action={addCategory}><input name="name" placeholder="Nome da nova categoria" required/><button className="btn">Adicionar</button></form><div className="table-list">{categories.map(category=><div className="table-row" key={category.id}><strong>{category.name}</strong><button className="btn danger small" onClick={()=>removeCategory(category.id)}>Excluir</button></div>)}</div></section>}

    {tab==="usuarios"&&<div className="admin-grid"><section className="card panel"><span className="eyebrow">NOVO ASSINANTE</span><h2>Criar usuário e login</h2><form id="user-form" className="stack" action={createUser}><label>Nome completo<input name="full_name" required/></label><label>E-mail de login<input name="email" type="email" required/></label><label>Senha inicial<input name="password" type="password" minLength={8} required/></label><button className="btn" disabled={busy}>Criar e liberar acesso</button></form><Link className="text-link" href="/admin/assinaturas">Gerenciar vencimentos e pagamentos →</Link></section><section className="card panel"><div className="panel-title"><div><span className="eyebrow">ACESSOS</span><h2>Usuários</h2></div><span className="count-badge">{profiles.length}</span></div><div className="table-list">{profiles.map(profile=><div className="table-row user-row" key={profile.id}><div><strong>{profile.full_name||profile.email||"Usuário"}</strong><small>{profile.email} • {profile.role} • {profile.approved?"ativo":"bloqueado"}</small></div><div className="row wrap"><button className="btn ghost small" onClick={()=>{const password=prompt("Digite a nova senha (mínimo 8 caracteres):");if(password)void updateUser(profile.id,{password});}}>Redefinir senha</button><button className="btn small" onClick={()=>void updateUser(profile.id,{approved:!profile.approved})}>{profile.approved?"Bloquear":"Ativar"}</button></div></div>)}</div></section></div>}

    {tab==="drive"&&<section className="card panel drive-panel"><span className="eyebrow">ARMAZENAMENTO</span><h2>Google Drive</h2><div className="drive-status"><span className={`status-dot ${drive.connected?"on":""}`}/><div><strong>{drive.connected?"Drive conectado":"Drive desconectado"}</strong>{drive.accountEmail&&<small>{drive.accountEmail}</small>}</div></div><p className="muted">Livros, PDFs, EPUBs, capas e versões Kindle são enviados para suas áreas próprias no Google Drive.</p><div className="row"><button className="btn" onClick={connectDrive}>{drive.connected?"Reconectar":"Conectar Google Drive"}</button><button className="btn ghost" onClick={()=>void refreshDrive()}>Verificar</button></div></section>}
  </>;
}
