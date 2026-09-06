"use client";

import { useState } from "react";
import type { DownloadLanguage } from "@/components/KindleShareButton";

export function PdfDownloadButton({bookId,languages=[]}:{bookId:string;languages?:DownloadLanguage[]}){
  const [picker,setPicker]=useState(false);
  function download(language?:string){window.location.href=`/api/books/${encodeURIComponent(bookId)}/file?format=pdf${language?`&language=${encodeURIComponent(language)}`:""}`;setPicker(false);}
  function start(){if(languages.length>1)setPicker(true);else download(languages[0]?.code);}
  return <><button type="button" className="btn" onClick={start}>Baixar PDF</button>{picker&&<div className="cover-picker-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setPicker(false);}}><section className="cover-picker language-picker" role="dialog" aria-modal="true" aria-labelledby="pdf-language-title"><div className="cover-picker-head"><div><span className="eyebrow">IDIOMA DO PDF</span><h2 id="pdf-language-title">Em qual idioma você quer baixar?</h2><p>Escolha uma das versões disponíveis para este livro.</p></div><button type="button" className="icon-close" onClick={()=>setPicker(false)} aria-label="Fechar">×</button></div><div className="language-choice-grid">{languages.map(language=><button type="button" className="language-choice" key={language.code} onClick={()=>download(language.code)}><strong>{language.label}</strong><span>{language.code.toUpperCase()}</span></button>)}</div></section></div>}</>;
}
