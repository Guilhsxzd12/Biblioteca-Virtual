"use client";

import { useRef } from "react";

export function HorizontalBookSlider({children,className=""}:{children:React.ReactNode;className?:string}){
  const ref=useRef<HTMLDivElement|null>(null);
  const state=useRef({dragging:false,moved:false,startX:0,startScroll:0,pointerId:0});

  function pointerDown(event:React.PointerEvent<HTMLDivElement>){
    if(event.pointerType!=="mouse"||event.button!==0)return;
    const el=ref.current;if(!el)return;
    state.current={dragging:true,moved:false,startX:event.clientX,startScroll:el.scrollLeft,pointerId:event.pointerId};
    el.setPointerCapture(event.pointerId);el.classList.add("is-dragging");
  }
  function pointerMove(event:React.PointerEvent<HTMLDivElement>){
    const el=ref.current;const s=state.current;if(!el||!s.dragging)return;
    const delta=event.clientX-s.startX;if(Math.abs(delta)>5)s.moved=true;
    el.scrollLeft=s.startScroll-delta;
  }
  function stopDrag(){
    const el=ref.current;if(!el)return;
    state.current.dragging=false;el.classList.remove("is-dragging");
    window.setTimeout(()=>{state.current.moved=false;},0);
  }
  function clickCapture(event:React.MouseEvent<HTMLDivElement>){if(state.current.moved){event.preventDefault();event.stopPropagation();}}

  return <div ref={ref} className={`book-slider ${className}`.trim()} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={stopDrag} onPointerCancel={stopDrag} onClickCapture={clickCapture}>{children}</div>;
}
