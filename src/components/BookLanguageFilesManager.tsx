"use client";

import { useEffect,useState } from "react";
import { uploadDriveFileInChunks } from "@/lib/upload-client";
import type { BookLanguageFile } from "@/lib/types";

function languageName(value:string){return ({pt:"Português",en:"Inglês",es:"Espanhol",fr:"Francês",it:"Italiano",de:"Alemão",ja:"Japonês"} as Record<string,string>)[value]||value.toUpperCase();}

export function BookLanguageFilesManager({bookId,title,defaultLanguage}:{bookId:string;title:string;defaultLanguage:string}){
  const [files,setFiles]=useState<BookLanguageFile[]>([]);const [language,setLanguage]=useState("");const [epub,setEpub]=useState<File|null>(null);const [pdf,setPdf]=useState<File|null>(null);const [busy,setBusy]=useState(false);const [progress,setProgress]=useState(0);const [message,setMessage]=useState("");
  async function load(){const r=await fetch(`/api/admin/book-language-files?bookId=${encodeURIComponent(bookId)}`,{cache:"no-store"});const d=await r.json();if(r.ok)setFiles(d.files||[]);}
  useEffect(()=>{void load();},[bookId]);

  async function upload(file:File,mimeType:string,start:number,span:number){
    const r=await fetch("/api/drive/upload-url",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title,originalFileName:file.name,mimeType,fileSize:file.size})});const session=await r.json();if(!r.ok)throw new Error(session.error||"Não foi possível preparar o upload.");
    const result=await uploadDriveFileInChunks(session.uploadUrl,new File([file],file.name,{type:mimeType}),v=>setProgress(start+Math.round(v*span)));
    return {driveFileId:result.id,fileName:session.fileName as string};
  }
  async function save(){
    const lang=language.trim().toLowerCase().replace(/_/g,"-");if(lang.length<2){setMessage("Informe o idioma, por exemplo: en, es ou pt.");return;}if(!epub&&!pdf){setMessage("Escolha pelo menos um EPUB ou PDF.");return;}
    setBusy(true);setProgress(0);setMessage("");try{
      const count=(epub?1:0)+(pdf?1:0);let done=0;
      for(const [format,file,mime] of [["epub",epub,"application/epub+zip"],["pdf",pdf,"application/pdf"]] as const){if(!file)continue;const start=Math.round((done/count)*100),span=1/count;const uploaded=await upload(file,mime,start,span);const r=await fetch("/api/admin/book-language-files",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({bookId,language:lang,format,...uploaded})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Falha ao registrar o arquivo.");done++;}
      setMessage(`Arquivos em ${languageName(lang)} salvos.`);setEpub(null);setPdf(null);setLanguage("");setProgress(100);await load();
    }catch(error){setMessage(error instanceof Error?error.message:"Erro ao salvar idioma.");}finally{setBusy(false);}
  }
  async function remove(id:string){if(!confirm("Remover esta opção de idioma/formato? O arquivo permanecerá no Google Drive."))return;const r=await fetch(`/api/admin/book-language-files?id=${encodeURIComponent(id)}`,{method:"DELETE"});if(r.ok)setFiles(x=>x.filter(item=>item.id!==id));}
  const grouped=files.reduce<Record<string,BookLanguageFile[]>>((acc,file)=>{(acc[file.language]??=[]).push(file);return acc;},{});
  return <section className="card panel language-files-panel">
    <div className="panel-title"><div><span className="eyebrow">IDIOMAS E FORMATOS</span><h2>Arquivos do livro</h2><p className="muted">O idioma principal é <strong>{languageName(defaultLanguage||"pt")}</strong>. Adicione outras versões sem criar outro livro no acervo.</p></div></div>
    <div className="language-file-list">{Object.entries(grouped).map(([lang,items])=><div className="language-file-row" key={lang}><div><strong>{languageName(lang)}</strong><small>{items.map(i=>i.format.toUpperCase()).join(" + ")}</small></div><div className="row wrap">{items.map(item=><button type="button" className="btn ghost small" key={item.id} onClick={()=>void remove(item.id)}>{item.format.toUpperCase()} · remover</button>)}</div></div>)}</div>
    <div className="language-upload-box"><label>Idioma<input value={language} onChange={e=>setLanguage(e.target.value)} placeholder="Ex.: en, es, fr"/></label><div className="file-pair"><label><strong>EPUB neste idioma</strong><input type="file" accept=".epub,application/epub+zip" onChange={e=>setEpub(e.target.files?.[0]||null)}/></label><label><strong>PDF neste idioma</strong><input type="file" accept=".pdf,application/pdf" onChange={e=>setPdf(e.target.files?.[0]||null)}/></label></div>{busy&&<div className="upload-progress"><span style={{width:`${progress}%`}}/></div>}<button type="button" className="btn" disabled={busy} onClick={()=>void save()}>{busy?`Enviando • ${progress}%`:"Adicionar idioma"}</button></div>
    {message&&<div className="notice">{message}</div>}
  </section>;
}
