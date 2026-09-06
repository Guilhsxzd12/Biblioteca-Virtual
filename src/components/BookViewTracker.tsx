"use client";

import { useEffect } from "react";

export function BookViewTracker({bookId}:{bookId:string}){
  useEffect(()=>{
    const controller=new AbortController();
    void fetch(`/api/books/${encodeURIComponent(bookId)}/view`,{method:"POST",signal:controller.signal,keepalive:true}).catch(()=>{});
    return()=>controller.abort();
  },[bookId]);
  return null;
}
