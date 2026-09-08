"use client";

import { useEffect,useRef,useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function RealtimeBookCount({initialCount}:{initialCount:number}){
  const [count,setCount]=useState(initialCount);
  const refreshTimer=useRef<number|null>(null);

  useEffect(()=>{
    const supabase=createBrowserSupabaseClient();
    let active=true;

    async function refreshCount(){
      const {count:nextCount,error}=await supabase
        .from("books")
        .select("id",{count:"exact",head:true})
        .eq("published",true);
      if(active&&!error&&typeof nextCount==="number")setCount(nextCount);
    }

    function scheduleRefresh(){
      if(refreshTimer.current!==null)window.clearTimeout(refreshTimer.current);
      refreshTimer.current=window.setTimeout(()=>{void refreshCount();},350);
    }

    const channel=supabase
      .channel("books-live-count")
      .on(
        "postgres_changes",
        {event:"*",schema:"public",table:"books"},
        scheduleRefresh
      )
      .subscribe();

    void refreshCount();
    const fallback=window.setInterval(()=>{void refreshCount();},30000);

    return ()=>{
      active=false;
      window.clearInterval(fallback);
      if(refreshTimer.current!==null)window.clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  },[]);

  return <strong>{count}</strong>;
}
