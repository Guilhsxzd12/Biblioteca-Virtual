"use client";

import { useState } from "react";
import Link from "next/link";
import { uploadDriveFileInChunks } from "@/lib/upload-client";
import type { Book, Category } from "@/lib/types";

type Format="pdf"|"epub";
type MissingKey=Format|"author"|"description"|"cover"|"title"|"category";
type Item={book:Book;missing:MissingKey[]};
type Props={initialItems:Item[];categories:Category[]};
type Draft={title:string;author:string;description:string;coverUrl:string;categoryId:string};

function norm(value:unknown){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();}
function isMain(book:Book,format:Format){const name=String(book.file_name||"").toLowerCase();return format==="pdf"?(book.mime_type==="application/pdf"||name.endsWith(".pdf")):(book.mime_type==="application/epub+zip"||name.endsWith(".epub"));}
function authorMissing(book:Book){const value=norm(book.author);return !value||value.includes("nao identificado")||value==="unknown"||value==="desconhecido"||value==="sem autor";}
function titleMissing(book:Book){const value=norm(book.title);return value.length<2||value.includes("titulo nao identificado");}
function missingFor(book:Book,knownFormats?:Set<string>):MissingKey[]{
  const extra=knownFormats||new Set<string>();const missing:MissingKey[]=[];
  if(!(isMain(book,"pdf")||Boolean(book.reading_pdf_drive_file_id)||extra.has("pdf")))missing.push("pdf");
  if(!(isMain(book,"epub")||Boolean(book.kindle_drive_file_id)||extra.has("epub")))missing.push("epub");
  if(!book.category_id)missing.push("category");
  if(titleMissing(book))missing.push("title");
  if(authorMissing(book))missing.push("author");
  if(!String(book.description||"").trim())missing.push("description");
  if(!String(book.cover_url||"").trim())missing.push("cover");
  return missing;
}
function label(key:MissingKey){return ({pdf:"PDF",epub:"EPUB",author:"Autor",description:"Sinopse",cover:"Capa",title:"Título",category:"Categoria"} as Record<MissingKey,string>)[key];}

export function MissingBooksAdmin({initialItems,categories}:Props){
  const [items,setItems]=useState(initialItems);
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState("");
  const [editing,setEditing]=useState<string|null>(null);
  const [draft,setDraft]=useState<Draft>({title:"",author:"",description:"",coverUrl:"",categoryId:""});
  const [coverFile,setCoverFile]=useState<File|null>(null);

  function beginEdit(item:Item){setEditing(item.book.id);setCoverFile(null);setMessage("");setDraft({title:item.book.title||"",author:item.book.author||"",description:item.book.description||"",coverUrl:item.book.cover_url||"",categoryId:item.book.category_id||""});}
  function replaceBook(book:Book,clearedFormat?:Format){
    setItems(current=>current.map(row=>{
      if(row.book.id!==book.id)return row;
      const keep=row.missing.filter(key=>key!==clearedFormat);
      const fileMissing=keep.filter(key=>key==="pdf"||key==="epub") as MissingKey[];
      const metadataMissing=missingFor(book).filter(key=>key!=="pdf"&&key!=="epub");
      const combined=[...fileMissing,...metadataMissing].filter((value,index,array)=>array.indexOf(value)===index);
      return {book,missing:combined};
    }).filter(row=>row.missing.length>0));
  }

  async function uploadMissing(item:Item,format:Format,file:File){
    const key=`${item.book.id}:${format}`;setBusy(key);setMessage("");
    try{
      const mimeType=format==="epub"?"application/epub+zip":"application/pdf";
      const sessionResponse=await fetch("/api/drive/upload-url",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title:item.book.title,originalFileName:file.name,mimeType,fileSize:file.size})});
      const session=await sessionResponse.json();if(!sessionResponse.ok)throw new Error(session.error||"Falha ao preparar upload.");
      const uploaded=await uploadDriveFileInChunks(session.uploadUrl,new File([file],file.name,{type:mimeType}),()=>{});
      const patch:Record<string,unknown>={id:item.book.id};
      if(format==="epub"){patch.epubDriveFileId=uploaded.id;patch.epubFileName=session.fileName;}
      else{patch.readingPdfDriveFileId=uploaded.id;patch.readingPdfFileName=session.fileName;}
      const response=await fetch("/api/admin/books",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(patch)});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Falha ao atualizar livro.");

      let telegramNote="";
      if(format==="epub"&&String(data.book?.language||item.book.language||"").toLowerCase().startsWith("pt")){
        try{
          const tg=await fetch("/api/admin/telegram/channels",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"publish_book",bookId:item.book.id,force:false})});
          const tgData=await tg.json();
          if(tg.ok){const sent=(tgData.results||[]).filter((r:any)=>r.status==="sent").length;const skipped=(tgData.results||[]).filter((r:any)=>r.status==="already-sent").length;telegramNote=` Telegram: ${sent} enviado(s)${skipped?`, ${skipped} já estava(m) enviado(s)`:""}.`;}
          else telegramNote=` Telegram: ${tgData.error||"não enviado"}.`;
        }catch{telegramNote=" Telegram: será possível reenviar pelo painel.";}
      }

      replaceBook(data.book as Book,format);
      setMessage(`✅ ${format.toUpperCase()} adicionado a “${item.book.title}”.${telegramNote}`);
    }catch(error){setMessage(`❌ ${error instanceof Error?error.message:"Erro no upload."}`);}finally{setBusy(null);}
  }

  async function saveMetadata(item:Item){
    setBusy(`${item.book.id}:metadata`);setMessage("");
    try{
      let coverUrl=draft.coverUrl.trim();
      if(coverFile){const form=new FormData();form.append("file",coverFile);const response=await fetch("/api/admin/covers",{method:"POST",body:form});const data=await response.json();if(!response.ok)throw new Error(data.error||"Não foi possível enviar a capa.");coverUrl=data.coverUrl;}
      const response=await fetch("/api/admin/books",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:item.book.id,title:draft.title,author:draft.author,description:draft.description,coverUrl,categoryId:draft.categoryId,metadataReviewed:true})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Falha ao salvar as informações.");
      replaceBook(data.book as Book);
      setEditing(null);setCoverFile(null);setMessage(`✅ Informações de “${data.book.title}” atualizadas.`);
    }catch(error){setMessage(`❌ ${error instanceof Error?error.message:"Erro ao salvar."}`);}finally{setBusy(null);}
  }

  if(items.length===0)return <div className="card panel"><h2>Nenhuma pendência nesta página</h2><p className="muted">Não há pendências nos registros exibidos. Confira as outras páginas, se houver.</p>{message&&<div className="notice">{message}</div>}</div>;

  return <div className="stack" style={{gap:16}}>
    <div className="card panel"><h2>Faltantes</h2><p className="muted">Aqui entram tanto arquivos ausentes quanto informações importantes. Ao corrigir o que falta, o livro sai desta lista automaticamente.</p>{message&&<div className="notice" style={{marginTop:12}}>{message}</div>}</div>
    {items.map(item=>{
      const metadataMissing=item.missing.some(key=>!["pdf","epub"].includes(key));const isEditing=editing===item.book.id;
      return <section className="card panel" key={item.book.id}>
        <div style={{display:"grid",gridTemplateColumns:"72px minmax(0,1fr)",gap:14,alignItems:"start"}}>
          {item.book.cover_url?<img src={item.book.cover_url} alt="" style={{width:72,height:102,objectFit:"cover",borderRadius:8}}/>:<div className="cover-fallback" style={{width:72,height:102,fontSize:10}}>Sem capa</div>}
          <div className="stack" style={{gap:10}}>
            <div><h3 style={{margin:0}}>{item.book.title||"Título não identificado"}</h3><p className="muted" style={{margin:"4px 0"}}>{item.book.author||"Autor não identificado"}</p><div className="row wrap">{item.missing.map(key=><span className="badge" key={key}>⚠️ Falta {label(key)}</span>)}</div></div>
            {!isEditing?<div className="row wrap">
              {item.missing.includes("pdf")&&<label className="btn" style={{cursor:"pointer"}}>{busy===`${item.book.id}:pdf`?"Enviando...":"Adicionar PDF"}<input hidden type="file" disabled={Boolean(busy)} accept=".pdf,application/pdf" onChange={e=>{const file=e.target.files?.[0];if(file)void uploadMissing(item,"pdf",file);e.currentTarget.value="";}}/></label>}
              {item.missing.includes("epub")&&<label className="btn" style={{cursor:"pointer"}}>{busy===`${item.book.id}:epub`?"Enviando...":"Adicionar EPUB"}<input hidden type="file" disabled={Boolean(busy)} accept=".epub,application/epub+zip" onChange={e=>{const file=e.target.files?.[0];if(file)void uploadMissing(item,"epub",file);e.currentTarget.value="";}}/></label>}
              {metadataMissing&&<button className="btn" onClick={()=>beginEdit(item)}>Corrigir informações</button>}
              <Link className="btn ghost" href={`/livro/${item.book.slug}`} target="_blank">Abrir</Link>
            </div>:<div className="stack" style={{gap:10}}>
              <label>Título<input value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label>
              <label>Autor<input value={draft.author} onChange={e=>setDraft(d=>({...d,author:e.target.value}))}/></label>
              <label>Categoria<select value={draft.categoryId} onChange={e=>setDraft(d=>({...d,categoryId:e.target.value}))}><option value="">Aguardando classificação</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label>Sinopse<textarea rows={6} value={draft.description} onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/></label>
              <label>Capa<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setCoverFile(e.target.files?.[0]||null)}/></label>
              <div className="row wrap"><button className="btn" disabled={Boolean(busy)} onClick={()=>void saveMetadata(item)}>{busy===`${item.book.id}:metadata`?"Salvando...":"Salvar"}</button><button className="btn ghost" disabled={Boolean(busy)} onClick={()=>{setEditing(null);setCoverFile(null);}}>Cancelar</button></div>
            </div>}
          </div>
        </div>
      </section>;
    })}
  </div>;
}
