"use client";

import { useRef } from "react";

export function HorizontalBookSlider({children,className=""}:{children:React.ReactNode;className?:string}){
  const ref=useRef<HTMLDivElement|null>(null);
  const state=useRef({dragging:false,moved:false,startX:0,startScroll:0,pointerId:0});

  function pointerDown(event:React.PointerEvent<HTMLDivElement>){
    if(event.pointerType!=="mouse"||event.button!==0)return;
    const el=ref.current;if(!el)return;
    state.current={dragging:true,moved:false,startX:event.clientX,startScroll:el.scrollLeft,pointerId:event.pointerId};
    el.setPointerCapture(event.pointerId);
    el.classList.add("is-dragging");
  }

  function pointerMove(event:React.PointerEvent<HTMLDivElement>){
    const el=ref.current;const s=state.current;if(!el||!s.dragging)return;
    const delta=event.clientX-s.startX;
    if(Math.abs(delta)>4)s.moved=true;
    if(s.moved)event.preventDefault();
    el.scrollLeft=s.startScroll-delta;
  }

  function stopDrag(event?:React.PointerEvent<HTMLDivElement>){
    const el=ref.current;if(!el)return;
    state.current.dragging=false;
    el.classList.remove("is-dragging");
    if(event&&el.hasPointerCapture(event.pointerId))el.releasePointerCapture(event.pointerId);
  }

  function clickCapture(event:React.MouseEvent<HTMLDivElement>){
    if(!state.current.moved)return;
    event.preventDefault();
    event.stopPropagation();
    state.current.moved=false;
  }

  return <div
    ref={ref}
    className={`book-slider ${className}`.trim()}
    onPointerDown={pointerDown}
    onPointerMove={pointerMove}
    onPointerUp={stopDrag}
    onPointerCancel={stopDrag}
    onDragStart={event=>event.preventDefault()}
    onClickCapture={clickCapture}
  >{children}</div>;
}
