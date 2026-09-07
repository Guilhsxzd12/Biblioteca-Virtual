"use client";

import { useEffect,useRef,useState } from "react";

export function NavigationProgress(){
  const [visible,setVisible]=useState(false);
  const [progress,setProgress]=useState(0);
  const timers=useRef<number[]>([]);
  const active=useRef(false);

  useEffect(()=>{
    function clearTimers(){for(const timer of timers.current)window.clearTimeout(timer);timers.current=[];}
    function finish(){
      if(!active.current)return;
      clearTimers();setProgress(100);
      timers.current.push(window.setTimeout(()=>{active.current=false;setVisible(false);setProgress(0);},220));
    }
    function start(){
      clearTimers();active.current=true;setVisible(true);setProgress(12);
      timers.current.push(window.setTimeout(()=>setProgress(46),45));
      timers.current.push(window.setTimeout(()=>setProgress(68),260));
      timers.current.push(window.setTimeout(()=>setProgress(82),700));
      timers.current.push(window.setTimeout(()=>setProgress(90),1500));
      timers.current.push(window.setTimeout(finish,8000));
    }
    function onClick(event:MouseEvent){
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const target=event.target as HTMLElement|null;const anchor=target?.closest("a") as HTMLAnchorElement|null;
      if(!anchor||anchor.target==="_blank"||anchor.hasAttribute("download"))return;
      try{
        const url=new URL(anchor.href,window.location.href);
        if(url.origin!==window.location.origin)return;
        const current=`${window.location.pathname}${window.location.search}${window.location.hash}`;
        const next=`${url.pathname}${url.search}${url.hash}`;
        if(next===current)return;
        start();
      }catch{}
    }
    function onSubmit(event:SubmitEvent){
      const form=event.target as HTMLFormElement|null;if(!form)return;
      if(form.target==="_blank")return;
      start();
    }
    const originalPush=window.history.pushState;
    const originalReplace=window.history.replaceState;
    window.history.pushState=function(...args){const result=originalPush.apply(this,args);finish();return result;};
    window.history.replaceState=function(...args){const result=originalReplace.apply(this,args);finish();return result;};
    document.addEventListener("click",onClick,true);
    document.addEventListener("submit",onSubmit,true);
    window.addEventListener("pageshow",finish);
    return()=>{
      clearTimers();
      document.removeEventListener("click",onClick,true);
      document.removeEventListener("submit",onSubmit,true);
      window.removeEventListener("pageshow",finish);
      window.history.pushState=originalPush;
      window.history.replaceState=originalReplace;
    };
  },[]);

  return <div className={`route-progress ${visible?"is-visible":""}`} aria-hidden="true"><span style={{width:`${progress}%`}}/></div>;
}

export function HorizontalBookSlider({children,className=""}:{children:React.ReactNode;className?:string}){
  const ref=useRef<HTMLDivElement|null>(null);
  const state=useRef({pressing:false,moved:false,startX:0,startScroll:0,pointerId:0,suppressClickUntil:0});

  function pointerDown(event:React.PointerEvent<HTMLDivElement>){
    if(event.pointerType!=="mouse"||event.button!==0)return;
    const el=ref.current;if(!el)return;
    state.current.press ing=false;
  }

  function startPointer(event:React.PointerEvent<HTMLDivElement>){
    if(event.pointerType!=="mouse"||event.button!==0)return;
    const el=ref.current;if(!el)return;
    state.current={...state.current,pressing:true,moved:false,startX:event.clientX,startScroll:el.scrollLeft,pointerId:event.pointerId};
  }

  function pointerMove(event:React.PointerEvent<HTMLDivElement>){
    const el=ref.current;const s=state.current;if(!el||!s.pressing)return;
    const delta=event.clientX-s.startX;
    if(!s.moved&&Math.abs(delta)>6){
      s.moved=true;
      if(!el.hasPointerCapture(event.pointerId))el.setPointerCapture(event.pointerId);
      el.classList.add("is-dragging");
    }
    if(!s.moved)return;
    event.preventDefault();
    el.scrollLeft=s.startScroll-delta;
  }

  function stopDrag(event?:React.PointerEvent<HTMLDivElement>){
    const el=ref.current;if(!el)return;
    const s=state.current;
    if(s.moved)s.suppressClickUntil=Date.now()+260;
    s.pressing=false;s.moved=false;
    el.classList.remove("is-dragging");
    if(event&&el.hasPointerCapture(event.pointerId))el.releasePointerCapture(event.pointerId);
  }

  function clickCapture(event:React.MouseEvent<HTMLDivElement>){
    if(Date.now()>state.current.suppressClickUntil)return;
    event.preventDefault();event.stopPropagation();
  }

  return <div
    ref={ref}
    className={`book-slider ${className}`.trim()}
    onPointerDown={startPointer}
    onPointerMove={pointerMove}
    onPointerUp={stopDrag}
    onPointerCancel={stopDrag}
    onDragStart={event=>event.preventDefault()}
    onClickCapture={clickCapture}
  >{children}</div>;
}
