"use client";

import { useEffect,useRef,useState } from "react";

type CoverChoice={url:string;label:string;isDefault:boolean};
type MetadataResult={coverUrl?:string|null;title?:string;author?:string};
export type DownloadLanguage={code:string;label:string};

function fileNameFromHeader(header:string|null,title:string){
  const utf=header?.match(/filename\*=UTF-8''([^;]+)/i);if(utf?.[1])try{return decodeURIComponent(utf[1]);}catch{}
  const match=header?.match(/filename="([^"]+)"/i);
  return match?.[1]||`${title.replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"")||"livro"}-Kindle.epub`;
}
function norm(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function sameTitle(candidate:string,target:string){const a=norm(candidate),b=norm(target);return a===b||a.startsWith(`${b} `)||b.startsWith(`${a} `);}
function authorMatches(candidate:string,target:string){
  const stop=new Set(["autor","nao","informado","george","linda","elio","garcia"]);
  const a=new Set(norm(candidate).split(" ").filter(x=>x.length>=4&&!stop.has(x)));
  const b=norm(target).split(" ").filter(x=>x.length>=4&&!stop.has(x));
  return b.some(token=>a.has(token));
}

export function KindleShareButton({id,title,author="",source="user",languages=[]}:{id:string;title:string;author?:string;source?:"user"|"catalog";languages?:DownloadLanguage[]}){
  const [busy,setBusy]=useState(false);const [covers,setCovers]=useState<CoverChoice[]>([]);const [picker,setPicker]=useState(false);const [languagePicker,setLanguagePicker]=useState(false);const [selectedLanguage,setSelectedLanguage]=useState(languages[0]?.code||"");const [message,setMessage]=useState("");const [preparedFile,setPreparedFile]=useState<File|null>(null);const coverInput=useRef<HTMLInputElement|null>(null);
  const selectedLanguageLabel=languages.find(x=>x.code===selectedLanguage)?.label||selectedLanguage.toUpperCase();

  useEffect(()=>{if(!picker&&!languagePicker)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.body.style.overflow=previous;};},[picker,languagePicker]);

  async function prepareFile(coverUrl:string){
    setBusy(true);setMessage("");setPreparedFile(null);
    try{
      const response=await fetch("/api/kindle/prepare",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({source,id,coverUrl,language:selectedLanguage||undefined})});
      if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||"Não foi possível preparar a versão Kindle.");}
      const blob=await response.blob();const fileName=fileNameFromHeader(response.headers.get("content-disposition"),title);const file=new File([blob],fileName,{type:"application/epub+zip"});
      setPreparedFile(file);setPicker(false);setMessage(`EPUB ${selectedLanguageLabel?`em ${selectedLanguageLabel} `:""}pronto com a capa escolhida.`);
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível preparar o livro.");}finally{setBusy(false);}
  }

  async function uploadCustomCover(file:File){
    if(!/^image\/(jpeg|png|webp)$/i.test(file.type)){setMessage("Escolha uma capa em JPG, PNG ou WEBP.");return;}
    setBusy(true);setMessage("");
    try{
      const form=new FormData();form.append("file",file);const response=await fetch("/api/kindle/cover",{method:"POST",body:form});const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Não foi possível usar essa capa.");await prepareFile(String(data.coverUrl));
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível usar essa capa.");setBusy(false);}finally{if(coverInput.current)coverInput.current.value="";}
  }

  function downloadPrepared(file:File){const url=URL.createObjectURL(file);const a=document.createElement("a");a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);setMessage("EPUB baixado. Agora você pode abrir ou enviar o arquivo ao Kindle.");}

  async function sharePrepared(){
    const file=preparedFile;if(!file)return;setMessage("");
    try{
      const nav=navigator as Navigator & {canShare?:(data:ShareData)=>boolean};
      if(navigator.share&&(!nav.canShare||nav.canShare({files:[file]})))await navigator.share({title,text:`Enviar ${title} para o Kindle`,files:[file]});else downloadPrepared(file);
    }catch(error){if(error instanceof DOMException&&error.name==="AbortError")return;if(error instanceof DOMException&&(error.name==="NotAllowedError"||error.name==="SecurityError")){downloadPrepared(file);return;}setMessage(error instanceof Error?error.message:"Não foi possível abrir o compartilhamento.");}
  }

  async function loadCovers(language?:string){
    if(language)setSelectedLanguage(language);setLanguagePicker(false);setBusy(true);setMessage("");setPreparedFile(null);
    try{
      const [savedResponse,metadataResponse]=await Promise.all([fetch(`/api/kindle/covers?source=${source}&id=${encodeURIComponent(id)}`),fetch(`/api/book-metadata?title=${encodeURIComponent(title)}`)]);
      const saved=await savedResponse.json();if(!savedResponse.ok)throw new Error(saved.error||"Não foi possível carregar as capas.");const metadata=metadataResponse.ok?await metadataResponse.json():{results:[]};
      const merged:CoverChoice[]=[];const seen=new Set<string>();
      for(const item of (saved.covers||[]) as CoverChoice[]){if(item.url&&!seen.has(item.url)){seen.add(item.url);merged.push(item);}}
      const exact=((metadata.results||[]) as MetadataResult[]).filter(item=>{const itemTitle=String(item.title||"");const itemAuthor=String(item.author||"");return Boolean(item.coverUrl&&sameTitle(itemTitle,title)&&(!author||authorMatches(itemAuthor,author)));});
      for(const item of exact){const url=String(item.coverUrl||"");if(url&&!seen.has(url)){seen.add(url);merged.push({url,label:"Outra edição deste livro",isDefault:false});}}
      setCovers(merged.slice(0,12));setPicker(true);
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível preparar o Kindle.");}finally{setBusy(false);}
  }

  function start(){setMessage("");setPreparedFile(null);if(source==="catalog"&&languages.length>1){setLanguagePicker(true);return;}void loadCovers(languages[0]?.code||selectedLanguage||undefined);}

  return <>
    {preparedFile?<div className="kindle-ready-actions"><button className="btn secondary" type="button" onClick={()=>downloadPrepared(preparedFile)}>Baixar EPUB</button><button className="btn kindle-share-btn" type="button" onClick={sharePrepared}>Enviar ao Kindle</button><button className="btn ghost" type="button" onClick={start}>Trocar idioma/capa</button></div>:<button className="btn secondary kindle-share-btn" type="button" onClick={start} disabled={busy}>{busy?"Carregando...":"Baixar EPUB / Kindle"}</button>}
    {message&&<div className="mini-message">{message}</div>}

    {languagePicker&&<div className="cover-picker-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setLanguagePicker(false);}}><section className="cover-picker language-picker" role="dialog" aria-modal="true" aria-labelledby="language-picker-title"><div className="cover-picker-head"><div><span className="eyebrow">IDIOMA DO EPUB</span><h2 id="language-picker-title">Em qual idioma você quer baixar?</h2><p><strong>{title}</strong> · Escolha uma das versões disponíveis.</p></div><button type="button" className="icon-close" onClick={()=>setLanguagePicker(false)} aria-label="Fechar">×</button></div><div className="language-choice-grid">{languages.map(language=><button type="button" className="language-choice" key={language.code} onClick={()=>void loadCovers(language.code)}><strong>{language.label}</strong><span>{language.code.toUpperCase()}</span></button>)}</div></section></div>}

    {picker&&<div className="cover-picker-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setPicker(false);}}>
      <section className="cover-picker" role="dialog" aria-modal="true" aria-labelledby="cover-picker-title">
        <div className="cover-picker-head"><div><span className="eyebrow">PREPARAR PARA O KINDLE</span><h2 id="cover-picker-title">Escolha a capa do EPUB</h2><p><strong>{title}</strong>{selectedLanguageLabel?` · ${selectedLanguageLabel}`:""} · Mostramos somente capas vinculadas a este mesmo livro.</p></div><button type="button" className="icon-close" onClick={()=>!busy&&setPicker(false)} aria-label="Fechar">×</button></div>
        <div className="cover-picker-body"><div className="cover-picker-tip"><span>1</span><div><strong>Escolha uma capa</strong><small>Use a principal, uma alternativa cadastrada ou outra edição compatível.</small></div></div>
          {!!covers.length&&<div className="cover-choice-grid">{covers.map((cover,index)=><button type="button" className={`cover-choice ${cover.isDefault?"default":""}`} key={`${cover.url}-${index}`} onClick={()=>prepareFile(cover.url)} disabled={busy}><div className="cover-choice-image"><img src={cover.url} alt={cover.isDefault?"Capa atual":cover.label}/>{cover.isDefault&&<span className="cover-badge">Atual</span>}</div><span>{cover.isDefault?"Usar capa atual":cover.label}</span></button>)}</div>}
          <button className="custom-cover-card" type="button" disabled={busy} onClick={()=>coverInput.current?.click()}><span className="custom-cover-icon">＋</span><strong>Enviar uma capa do dispositivo</strong><small>JPG, PNG ou WEBP</small></button><input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void uploadCustomCover(file);}}/>
          {busy&&<div className="cover-generation"><span className="spinner"/><div><strong>Preparando seu EPUB...</strong><small>Estamos incorporando a capa escolhida ao arquivo.</small></div></div>}
        </div>
      </section>
    </div>}
  </>;
}
