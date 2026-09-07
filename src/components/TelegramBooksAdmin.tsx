"use client";

import { useMemo,useState } from "react";
import Link from "next/link";
import type { Book } from "@/lib/types";

type Props={initialBooks:Book[]};
type Draft={title:string;author:string;description:string;coverUrl:string};

function incomplete(book:Book){
  const author=(book.author||"").trim().toLowerCase();
  return !book.title?.trim()||!author||author.includes("não identificado")||!book.description?.trim()||!book.cover_url;
}

export function TelegramBooksAdmin({initialBooks}:Props){
  const [books,setBooks]=useState(initialBooks);
  const [search,setSearch]=useState("");
  const [editing,setEditing]=useState<string|null>(null);
  const [draft,setDraft]=useState<Draft>({title:"",author:"",description:"",coverUrl:""});
  const [coverFile,setCoverFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  const shown=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return q?books.filter(b=>`${b.title} ${b.author}`.toLowerCase().includes(q)):books;
  },[books,search]);

  function begin(book:Book){
    setEditing(book.id);setCoverFile(null);setMessage("");
    setDraft({title:book.title,author:book.author,description:book.description||"",coverUrl:book.cover_url||""});
  }

  async function save(book:Book){
    if(!draft.title.trim()){setMessage("O título é obrigatório.");return;}
    setBusy(true);setMessage("");
    try{
      let coverUrl=draft.coverUrl;
      if(coverFile){
        const fd=new FormData();fd.append("file",coverFile);
        const coverResponse=await fetch("/api/admin/covers",{method:"POST",body:fd});
        const coverData=await coverResponse.json();
        if(!coverResponse.ok)throw new Error(coverData.error||"Falha ao enviar capa.");
        coverUrl=coverData.coverUrl;
      }
      const response=await fetch("/api/admin/books",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({
        id:book.id,title:draft.title.trim(),author:draft.author.trim()||"Autor não identificado",description:draft.description,
        language:book.language,categoryId:book.category_id,year:book.year,pages:book.pages,coverUrl,published:book.published,metadataReviewed:true
      })});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Falha ao salvar.");
      setBooks(current=>current.map(item=>item.id===book.id?data.book:item));
      setEditing(null);setCoverFile(null);setMessage("✅ Informações salvas.");
    }catch(error){setMessage(`❌ ${error instanceof Error?error.message:"Erro ao salvar."}`);}finally{setBusy(false);}
  }

  return <div className="stack" style={{gap:18}}>
    <div className="card panel">
      <div className="row wrap" style={{justifyContent:"space-between",alignItems:"center"}}>
        <div><span className="eyebrow">TELEGRAM</span><h2>Livros recebidos pelo bot</h2><p className="muted">Edite principalmente título, autor, sinopse e capa. O arquivo do livro já fica salvo no acervo.</p></div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar livro..." style={{minWidth:240}}/>
      </div>
      {message&&<div className="notice" style={{marginTop:12}}>{message}</div>}
    </div>

    {shown.length===0?<div className="card panel muted">Nenhum livro enviado pelo Telegram.</div>:shown.map(book=>{
      const isEditing=editing===book.id;const needs=incomplete(book);
      return <section className="card panel" key={book.id}>
        <div style={{display:"grid",gridTemplateColumns:"90px minmax(0,1fr)",gap:16,alignItems:"start"}}>
          <div>{book.cover_url?<img src={book.cover_url} alt="" style={{width:90,aspectRatio:"2/3",objectFit:"cover",borderRadius:10}}/>:<div className="cover-fallback" style={{width:90,aspectRatio:"2/3",fontSize:12}}>Sem capa</div>}</div>
          <div className="stack" style={{gap:10}}>
            {!isEditing?<>
              <div className="row wrap" style={{justifyContent:"space-between"}}><div><h3 style={{margin:0}}>{book.title}</h3><p className="muted" style={{margin:"4px 0 0"}}>{book.author||"Autor não identificado"}</p></div><span className="badge">{needs?"⚠️ Revisar dados":"✅ Revisado"}</span></div>
              <p style={{margin:0}}>{book.description?.trim()?book.description.slice(0,280)+(book.description.length>280?"…":""):"Sinopse ainda não informada."}</p>
              <div className="row wrap"><button className="btn" onClick={()=>begin(book)}>Editar informações</button><Link className="btn ghost" href={`/livro/${book.slug}`} target="_blank">Abrir livro</Link></div>
            </>:<>
              <label>Título<input value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label>
              <label>Autor<input value={draft.author} onChange={e=>setDraft(d=>({...d,author:e.target.value}))}/></label>
              <label>Sinopse<textarea value={draft.description} onChange={e=>setDraft(d=>({...d,description:e.target.value}))} rows={7}/></label>
              <label>Trocar capa<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setCoverFile(e.target.files?.[0]||null)}/></label>
              <div className="row wrap"><button className="btn" disabled={busy} onClick={()=>void save(book)}>{busy?"Salvando...":"Salvar"}</button><button className="btn ghost" disabled={busy} onClick={()=>{setEditing(null);setCoverFile(null);}}>Cancelar</button></div>
            </>}
          </div>
        </div>
      </section>;
    })}
  </div>;
}
