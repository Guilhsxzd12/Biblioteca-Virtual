"use client";

import { useState } from "react";

type CoverChoice={url:string;label:string;isDefault:boolean};

function fileNameFromHeader(header:string|null,title:string){
  const match=header?.match(/filename="([^"]+)"/i);
  return match?.[1]||`${title.replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"")||"livro"}-Kindle.epub`;
}

export function KindleShareButton({id,title,source="user"}:{id:string;title:string;source?:"user"|"catalog"}){
  const [busy,setBusy]=useState(false);
  const [covers,setCovers]=useState<CoverChoice[]>([]);
  const [picker,setPicker]=useState(false);
  const [message,setMessage]=useState("");

  async function prepareAndShare(coverUrl?:string|null){
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/kindle/prepare",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({source,id,coverUrl:coverUrl||null})});
      if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||"Não foi possível preparar a versão Kindle.");}
      const blob=await response.blob();
      const fileName=fileNameFromHeader(response.headers.get("content-disposition"),title);
      const file=new File([blob],fileName,{type:"application/epub+zip"});
      const nav=navigator as Navigator & {canShare?:(data:ShareData)=>boolean};
      if(navigator.share&&(!nav.canShare||nav.canShare({files:[file]}))){
        await navigator.share({title,text:`Enviar ${title} para o Kindle`,files:[file]});
      }else{
        const url=URL.createObjectURL(file);const a=document.createElement("a");a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
        setMessage("Seu navegador não oferece compartilhamento de arquivos. O EPUB foi baixado para você abrir no app Kindle.");
      }
      setPicker(false);
    }catch(error){
      if(error instanceof DOMException&&error.name==="AbortError")return;
      setMessage(error instanceof Error?error.message:"Não foi possível compartilhar o livro.");
    }finally{setBusy(false);}
  }

  async function start(){
    setBusy(true);setMessage("");
    try{
      const response=await fetch(`/api/kindle/covers?source=${source}&id=${encodeURIComponent(id)}`);
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Não foi possível carregar as capas.");
      const choices=(data.covers||[]) as CoverChoice[];
      setCovers(choices);
      if(choices.length>1)setPicker(true);
      else await prepareAndShare(choices[0]?.url||null);
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível preparar o Kindle.");setBusy(false);}
  }

  return <>
    <button className="btn kindle-share-btn" type="button" onClick={start} disabled={busy}>{busy?"Preparando...":"Enviar ao Kindle"}</button>
    {message&&<div className="mini-message">{message}</div>}
    {picker&&<div className="cover-picker-backdrop" role="presentation" onClick={()=>!busy&&setPicker(false)}>
      <div className="cover-picker card" role="dialog" aria-modal="true" aria-label="Escolher capa do Kindle" onClick={e=>e.stopPropagation()}>
        <div className="cover-picker-head"><div><strong>Escolha a capa</strong><p>Ela será incorporada ao EPUB enviado ao Kindle.</p></div><button type="button" className="icon-close" onClick={()=>setPicker(false)} aria-label="Fechar">×</button></div>
        <div className="cover-choice-grid">{covers.map((cover,index)=><button type="button" className={`cover-choice ${cover.isDefault?"default":""}`} key={`${cover.url}-${index}`} onClick={()=>prepareAndShare(cover.url)} disabled={busy}><img src={cover.url} alt={cover.label}/><span>{cover.isDefault?"Capa atual":cover.label}</span></button>)}</div>
        {busy&&<div className="notice">Gerando EPUB e incorporando a capa...</div>}
      </div>
    </div>}
  </>;
}
