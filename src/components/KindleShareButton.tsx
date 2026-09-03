"use client";

import { useState } from "react";

export function KindleShareButton({id,title,fileName}:{id:string;title:string;fileName:string}){
  const [busy,setBusy]=useState(false);
  async function share(){
    setBusy(true);
    try{
      const response=await fetch(`/api/user-books/${id}/file`);
      if(!response.ok)throw new Error("Não foi possível carregar o EPUB.");
      const blob=await response.blob();
      const file=new File([blob],fileName.toLowerCase().endsWith(".epub")?fileName:`${title}.epub`,{type:"application/epub+zip"});
      const nav=navigator as Navigator & {canShare?:(data:ShareData)=>boolean};
      if(navigator.share&&(!nav.canShare||nav.canShare({files:[file]}))){
        await navigator.share({title,text:`Enviar ${title} para o Kindle`,files:[file]});
      }else{
        const url=URL.createObjectURL(file);const a=document.createElement("a");a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
        alert("O navegador não oferece compartilhamento de arquivos. O EPUB foi baixado; compartilhe-o com o app Kindle.");
      }
    }catch(e){if(!(e instanceof DOMException&&e.name==="AbortError"))alert(e instanceof Error?e.message:"Não foi possível compartilhar o EPUB.");}
    finally{setBusy(false);}
  }
  return <button className="btn secondary" type="button" onClick={share} disabled={busy}>{busy?"Preparando...":"Enviar ao Kindle"}</button>;
}
