"use client";

import Link from "next/link";
import { useCallback,useEffect,useRef,useState } from "react";

type PdfDocument = {
  numPages:number;
  getPage:(page:number)=>Promise<any>;
  destroy?:()=>Promise<void>|void;
};

export function ReaderClient({bookId,title,totalPages,initialPage}:{bookId:string;title:string;totalPages:number;initialPage:number}){
  const [page,setPage]=useState(Math.max(1,initialPage||1));
  const [pages,setPages]=useState(Math.max(1,totalPages||1));
  const [pdf,setPdf]=useState<PdfDocument|null>(null);
  const [loading,setLoading]=useState(true);
  const [rendering,setRendering]=useState(false);
  const [error,setError]=useState("");
  const [zoom,setZoom]=useState(1);
  const [stageWidth,setStageWidth]=useState(0);
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const stageRef=useRef<HTMLDivElement|null>(null);
  const touchStart=useRef<{x:number;y:number}|null>(null);

  const goTo=useCallback((next:number)=>{
    setPage(current=>Math.min(pages,Math.max(1,Number.isFinite(next)?next:current)));
  },[pages]);

  useEffect(()=>{
    let disposed=false;
    let loadingTask:any=null;
    setLoading(true);
    setError("");
    setPdf(null);

    (async()=>{
      try{
        const response=await fetch(`/api/books/${bookId}/file`,{cache:"no-store"});
        if(!response.ok){
          const data=await response.json().catch(()=>null);
          throw new Error(data?.error||"Não foi possível carregar este livro.");
        }
        const bytes=new Uint8Array(await response.arrayBuffer());
        const pdfjs:any=await import("pdfjs-dist/webpack.mjs");
        loadingTask=pdfjs.getDocument({data,useSystemFonts:true});
        const document:PdfDocument=await loadingTask.promise;
        if(disposed){await document.destroy?.();return;}
        setPdf(document);
        setPages(Math.max(1,document.numPages));
        setPage(current=>Math.min(Math.max(1,document.numPages),Math.max(1,current)));
      }catch(e){
        if(!disposed)setError(e instanceof Error?e.message:"Não foi possível abrir o PDF.");
      }finally{
        if(!disposed)setLoading(false);
      }
    })();

    return()=>{
      disposed=true;
      loadingTask?.destroy?.();
    };
  },[bookId]);

  useEffect(()=>{
    const stage=stageRef.current;
    if(!stage)return;
    const update=()=>setStageWidth(stage.clientWidth);
    update();
    const observer=new ResizeObserver(update);
    observer.observe(stage);
    return()=>observer.disconnect();
  },[]);

  useEffect(()=>{
    if(!pdf||!canvasRef.current||!stageWidth)return;
    let cancelled=false;
    let renderTask:any=null;
    setRendering(true);
    setError("");

    (async()=>{
      try{
        const pdfPage=await pdf.getPage(page);
        if(cancelled){pdfPage.cleanup?.();return;}
        const base=pdfPage.getViewport({scale:1});
        const mobile=window.innerWidth<=700;
        const horizontalPadding=mobile?18:64;
        const maxReadingWidth=mobile?stageWidth-horizontalPadding:Math.min(920,stageWidth-horizontalPadding);
        const fitScale=Math.max(.2,maxReadingWidth/base.width);
        const viewport=pdfPage.getViewport({scale:fitScale*zoom});
        const ratio=Math.min(window.devicePixelRatio||1,2);
        const canvas=canvasRef.current;
        if(!canvas)return;
        const context=canvas.getContext("2d",{alpha:false});
        if(!context)throw new Error("Seu navegador não conseguiu iniciar o leitor.");

        canvas.width=Math.max(1,Math.floor(viewport.width*ratio));
        canvas.height=Math.max(1,Math.floor(viewport.height*ratio));
        canvas.style.width=`${Math.floor(viewport.width)}px`;
        canvas.style.height=`${Math.floor(viewport.height)}px`;
        context.setTransform(1,0,0,1,0,0);
        context.fillStyle="#ffffff";
        context.fillRect(0,0,canvas.width,canvas.height);

        renderTask=pdfPage.render({
          canvasContext:context,
          viewport,
          transform:ratio!==1?[ratio,0,0,ratio,0,0]:undefined,
          background:"white"
        });
        await renderTask.promise;
        pdfPage.cleanup?.();
      }catch(e:any){
        if(!cancelled&&e?.name!=="RenderingCancelledException")setError(e instanceof Error?e.message:"Não foi possível renderizar esta página.");
      }finally{
        if(!cancelled)setRendering(false);
      }
    })();

    return()=>{
      cancelled=true;
      try{renderTask?.cancel?.();}catch{}
    };
  },[pdf,page,zoom,stageWidth]);

  useEffect(()=>{
    if(!pdf)return;
    const t=setTimeout(()=>{
      fetch("/api/progress",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({bookId,currentPage:page,totalPages:pages})
      }).catch(()=>{});
    },500);
    return()=>clearTimeout(t);
  },[page,pages,bookId,pdf]);

  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.key==="ArrowLeft")goTo(page-1);
      if(event.key==="ArrowRight")goTo(page+1);
    };
    window.addEventListener("keydown",key);
    return()=>window.removeEventListener("keydown",key);
  },[page,goTo]);

  return <main className="reader reader-app">
    <header className="reader-toolbar reader-header">
      <Link className="reader-back" href={`/livro/${bookId}`} aria-label="Voltar ao livro">← <span>Voltar</span></Link>
      <div className="reader-book-info"><strong>{title}</strong><span>Página {page} de {pages}</span></div>
      <div className="reader-zoom reader-zoom-desktop" aria-label="Zoom do leitor">
        <button type="button" onClick={()=>setZoom(z=>Math.max(.75,Math.round((z-.1)*10)/10))} disabled={zoom<=.75}>−</button>
        <span>{Math.round(zoom*100)}%</span>
        <button type="button" onClick={()=>setZoom(z=>Math.min(1.8,Math.round((z+.1)*10)/10))} disabled={zoom>=1.8}>+</button>
      </div>
    </header>

    <div
      className="reader-stage"
      ref={stageRef}
      onTouchStart={e=>{const t=e.touches[0];touchStart.current={x:t.clientX,y:t.clientY};}}
      onTouchEnd={e=>{
        const start=touchStart.current;touchStart.current=null;
        if(!start)return;
        const t=e.changedTouches[0];const dx=t.clientX-start.x;const dy=t.clientY-start.y;
        if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.35)goTo(dx<0?page+1:page-1);
      }}
    >
      {loading&&<div className="reader-state"><div className="reader-spinner"/><strong>Abrindo o livro...</strong><span>Preparando as páginas para leitura.</span></div>}
      {error&&<div className="reader-state reader-error"><strong>Não foi possível mostrar esta página</strong><span>{error}</span><button className="btn" type="button" onClick={()=>location.reload()}>Tentar novamente</button></div>}
      {!loading&&!error&&<div className={`reader-paper ${rendering?"is-rendering":""}`}><canvas ref={canvasRef} aria-label={`Página ${page} de ${title}`}/>{rendering&&<div className="reader-page-loading"><div className="reader-spinner"/></div>}</div>}
    </div>

    {!loading&&!error&&<nav className="reader-controls" aria-label="Navegação entre páginas">
      <button className="reader-page-button" type="button" onClick={()=>goTo(page-1)} disabled={page<=1} aria-label="Página anterior">‹ <span>Anterior</span></button>
      <div className="reader-page-jump">
        <span>Página</span>
        <input aria-label="Número da página" type="number" min={1} max={pages} value={page} onChange={e=>goTo(Number(e.target.value)||1)}/>
        <b>de {pages}</b>
      </div>
      <button className="reader-page-button" type="button" onClick={()=>goTo(page+1)} disabled={page>=pages} aria-label="Próxima página"><span>Próxima</span> ›</button>
      <div className="reader-zoom reader-zoom-mobile">
        <button type="button" onClick={()=>setZoom(z=>Math.max(.75,Math.round((z-.1)*10)/10))} disabled={zoom<=.75}>−</button>
        <span>{Math.round(zoom*100)}%</span>
        <button type="button" onClick={()=>setZoom(z=>Math.min(1.8,Math.round((z+.1)*10)/10))} disabled={zoom>=1.8}>+</button>
      </div>
    </nav>}
  </main>;
}
