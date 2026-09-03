"use client";

import { useRef,useState } from "react";

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
  const coverInput=useRef<HTMLInputElement|null>(null);

  async function prepareFile(coverUrl:string){
    setBusy(true);setMessage("");setPreparedFile(null);
    try{
      const response=await fetch("/api/kindle/prepare",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({source,id,coverUrl})});
      if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||"Não foi possível preparar a versão Kindle.");}
      const blob=await response.blob();
      const fileName=fileNameFromHeader(response.headers.get("content-disposition"),title);
      const file=new File([blob],fileName,{type:"application/epub+zip"});
      setPreparedFile(file);
      setPicker(false);
      setMessage("EPUB pronto com a capa escolhida. Toque em “Compartilhar com Kindle”.");
    }catch(error){
      setMessage(error instanceof Error?error.message:"Não foi possível preparar o livro.");
    }finally{setBusy(false);}
  }

  async function uploadCustomCover(file:File){
    if(!/^image\/(jpeg|png|webp)$/i.test(file.type)){setMessage("Escolha uma capa em JPG, PNG ou WEBP.");return;}
    setBusy(true);setMessage("Enviando sua capa...");
    try{
      const form=new FormData();form.append("file",file);
      const response=await fetch("/api/kindle/cover",{method:"POST",body:form});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Não foi possível usar essa capa.");
      await prepareFile(String(data.coverUrl));
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível usar essa capa.");setBusy(false);}
    finally{if(coverInput.current)coverInput.current.value="";}
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
        await navigator.share({title,text:`Enviar ${title} para o Kindle`,files:[file]});
      }else{
        downloadPrepared(file);
      }
    }catch(error){
      if(error instanceof DOMException&&error.name==="AbortError")return;
      if(error instanceof DOMException&&(error.name==="NotAllowedError"||error.name==="SecurityError")){downloadPrepared(file);return;}
      setMessage(error instanceof Error?error.message:"Não foi possível abrir o compartilhamento.");
    }
  }

  async function start(){
    setBusy(true);setMessage("");setPreparedFile(null);
    try{
      const response=await fetch(`/api/kindle/covers?source=${source}&id=${encodeURIComponent(id)}`);
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Não foi possível carregar as capas.");
      setCovers((data.covers||[]) as CoverChoice[]);
      setPicker(true);
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível preparar o Kindle.");}
    finally{setBusy(false);}
  }

  return <>
    {preparedFile?
      <button className="btn kindle-share-btn" type="button" onClick={sharePrepared}>Compartilhar com Kindle</button>:
      <button className="btn kindle-share-btn" type="button" onClick={start} disabled={busy}>{busy?"Carregando capas...":"Enviar ao Kindle"}</button>
    }
    {message&&<div className="mini-message">{message}</div>}
    {picker&&<div className="cover-picker-backdrop" role="presentation" onClick={()=>!busy&&setPicker(false)}>
      <div className="cover-picker card" role="dialog" aria-modal="true" aria-label="Escolher capa do Kindle" onClick={e=>e.stopPropagation()}>
        <div className="cover-picker-head"><div><strong>Escolha a capa do Kindle</strong><p>A capa selecionada será incorporada ao EPUB e enviada junto com o livro.</p></div><button type="button" className="icon-close" onClick={()=>setPicker(false)} aria-label="Fechar">×</button></div>
        {!!covers.length&&<div className="cover-choice-grid">{covers.map((cover,index)=><button type="button" className={`cover-choice ${cover.isDefault?"default":""}`} key={`${cover.url}-${index}`} onClick={()=>prepareFile(cover.url)} disabled={busy}><img src={cover.url} alt={cover.label}/><span>{cover.isDefault?"Capa atual":cover.label}</span></button>)}</div>}
        <div className="stack" style={{marginTop:16}}>
          <button className="btn secondary" type="button" disabled={busy} onClick={()=>coverInput.current?.click()}>🖼 Enviar outra capa</button>
          <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void uploadCustomCover(file);}}/>
          {!covers.length&&<p className="muted">Este livro ainda não possui capa cadastrada. Envie uma imagem para continuar.</p>}
        </div>
        {busy&&<div className="notice">Gerando o EPUB com a capa escolhida...</div>}
      </div>
    </div>}
  </>;
}
