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
  const [preparedFile,setPreparedFile]=useState<File|null>(null);

  async function prepareFile(coverUrl?:string|null){
    setBusy(true);setMessage("");setPreparedFile(null);
    try{
      const response=await fetch("/api/kindle/prepare",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({source,id,coverUrl:coverUrl||null})});
      if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||"Não foi possível preparar a versão Kindle.");}
      const blob=await response.blob();
      const fileName=fileNameFromHeader(response.headers.get("content-disposition"),title);
      const file=new File([blob],fileName,{type:"application/epub+zip"});
      setPreparedFile(file);
      setPicker(false);
      setMessage("EPUB pronto. Toque em “Compartilhar com Kindle” para abrir o menu do celular.");
    }catch(error){
      setMessage(error instanceof Error?error.message:"Não foi possível preparar o livro.");
    }finally{setBusy(false);}
  }

  function downloadPrepared(file:File){
    const url=URL.createObjectURL(file);
    const a=document.createElement("a");
    a.href=url;a.download=file.name;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    setMessage("O EPUB foi baixado. Abra o arquivo e escolha o app Kindle.");
  }

  async function sharePrepared(){
    const file=preparedFile;
    if(!file)return;
    setMessage("");
    try{
      const nav=navigator as Navigator & {canShare?:(data:ShareData)=>boolean};
      if(navigator.share&&(!nav.canShare||nav.canShare({files:[file]}))){
        // IMPORTANT: navigator.share is called directly from this click.
        // iOS Safari requires transient user activation and blocks sharing
        // when an awaited network request happens before this call.
        await navigator.share({title,text:`Enviar ${title} para o Kindle`,files:[file]});
      }else{
        downloadPrepared(file);
      }
    }catch(error){
      if(error instanceof DOMException&&error.name==="AbortError")return;
      // Some embedded/private browsers expose navigator.share but still reject files.
      if(error instanceof DOMException&&(error.name==="NotAllowedError"||error.name==="SecurityError")){
        downloadPrepared(file);
        return;
      }
      setMessage(error instanceof Error?error.message:"Não foi possível abrir o compartilhamento.");
    }
  }

  async function start(){
    setBusy(true);setMessage("");setPreparedFile(null);
    try{
      const response=await fetch(`/api/kindle/covers?source=${source}&id=${encodeURIComponent(id)}`);
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Não foi possível carregar as capas.");
      const choices=(data.covers||[]) as CoverChoice[];
      setCovers(choices);
      if(choices.length>1){setPicker(true);setBusy(false);}
      else await prepareFile(choices[0]?.url||null);
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível preparar o Kindle.");setBusy(false);}
  }

  return <>
    {preparedFile?
      <button className="btn kindle-share-btn" type="button" onClick={sharePrepared}>Compartilhar com Kindle</button>:
      <button className="btn kindle-share-btn" type="button" onClick={start} disabled={busy}>{busy?"Preparando EPUB...":"Enviar ao Kindle"}</button>
    }
    {message&&<div className="mini-message">{message}</div>}
    {picker&&<div className="cover-picker-backdrop" role="presentation" onClick={()=>!busy&&setPicker(false)}>
      <div className="cover-picker card" role="dialog" aria-modal="true" aria-label="Escolher capa do Kindle" onClick={e=>e.stopPropagation()}>
        <div className="cover-picker-head"><div><strong>Escolha a capa</strong><p>Ela será incorporada ao EPUB. Depois, toque em Compartilhar com Kindle.</p></div><button type="button" className="icon-close" onClick={()=>setPicker(false)} aria-label="Fechar">×</button></div>
        <div className="cover-choice-grid">{covers.map((cover,index)=><button type="button" className={`cover-choice ${cover.isDefault?"default":""}`} key={`${cover.url}-${index}`} onClick={()=>prepareFile(cover.url)} disabled={busy}><img src={cover.url} alt={cover.label}/><span>{cover.isDefault?"Capa atual":cover.label}</span></button>)}</div>
        {busy&&<div className="notice">Gerando EPUB e incorporando a capa...</div>}
      </div>
    </div>}
  </>;
}
