"use client";

import { useState } from "react";
import Link from "next/link";
import { uploadDriveFileInChunks } from "@/lib/upload-client";
import type { Book } from "@/lib/types";

type Format="pdf"|"epub";
type Item={book:Book;missing:Format[]};
type Props={initialItems:Item[]};

export function MissingBooksAdmin({initialItems}:Props){
  const [items,setItems]=useState(initialItems);
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState("");

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
          if(tg.ok){const sent=(tgData.results||[]).filter((r:any)=>r.status==="sent").length;const skipped=(tgData.results||[]).filter((r:any)=>r.status==="already-sent").length;telegramNote=` Telegram: ${sent} enviado(s)${skipped?`, ${skipped} já estava(m) completo(s)`:""}.`;}
          else telegramNote=` Telegram: ${tgData.error||"não enviado"}.`;
        }catch{telegramNote=" Telegram: será possível reenviar pelo painel.";}
      }

      setItems(current=>current.map(row=>row.book.id===item.book.id?{book:data.book,missing:row.missing.filter(x=>x!==format)}:row).filter(row=>row.missing.length>0));
      setMessage(`✅ ${format.toUpperCase()} adicionado a “${item.book.title}”.${telegramNote}`);
    }catch(error){setMessage(`❌ ${error instanceof Error?error.message:"Erro no upload."}`);}finally{setBusy(null);}
  }

  if(items.length===0)return <div className="card panel"><h2>✅ Acervo completo</h2><p className="muted">Nenhum livro está faltando PDF ou EPUB.</p>{message&&<div className="notice">{message}</div>}</div>;

  return <div className="stack" style={{gap:16}}>
    <div className="card panel"><h2>Faltantes</h2><p className="muted">Ao adicionar o arquivo que falta, o livro sai desta lista automaticamente. Quando um EPUB em português é adicionado, o site também tenta enviá-lo aos canais do Telegram sem repetir o que já foi enviado.</p>{message&&<div className="notice" style={{marginTop:12}}>{message}</div>}</div>
    {items.map(item=><section className="card panel" key={item.book.id}>
      <div className="row wrap" style={{justifyContent:"space-between",alignItems:"center",gap:16}}>
        <div style={{display:"flex",gap:14,alignItems:"center",minWidth:0}}>
          {item.book.cover_url?<img src={item.book.cover_url} alt="" style={{width:58,height:82,objectFit:"cover",borderRadius:8}}/>:<div className="cover-fallback" style={{width:58,height:82,fontSize:10}}>Sem capa</div>}
          <div><h3 style={{margin:0}}>{item.book.title}</h3><p className="muted" style={{margin:"4px 0"}}>{item.book.author}</p><div className="row wrap">{item.missing.map(format=><span className="badge" key={format}>⚠️ Falta {format.toUpperCase()}</span>)}</div></div>
        </div>
        <div className="row wrap">
          {item.missing.map(format=><label className="btn" key={format} style={{cursor:"pointer"}}>{busy===`${item.book.id}:${format}`?"Enviando...":`Adicionar ${format.toUpperCase()}`}<input hidden type="file" disabled={Boolean(busy)} accept={format==="epub"?".epub,application/epub+zip":".pdf,application/pdf"} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadMissing(item,format,file);e.currentTarget.value="";}}/></label>)}
          <Link className="btn ghost" href={`/livro/${item.book.slug}`} target="_blank">Abrir</Link>
        </div>
      </div>
    </section>)}
  </div>;
}
