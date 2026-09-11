"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./conhecimento.module.css";

export function KnowledgeLiveRefresh(){
  const router=useRouter();
  const [seconds,setSeconds]=useState(0);

  useEffect(()=>{
    let active=true;
    const refresh=()=>{
      if(!active||document.visibilityState!=="visible")return;
      router.refresh();
      setSeconds(0);
    };
    const refreshTimer=window.setInterval(refresh,5000);
    const tickTimer=window.setInterval(()=>setSeconds(value=>value+1),1000);
    const onVisibility=()=>{if(document.visibilityState==="visible")refresh();};
    document.addEventListener("visibilitychange",onVisibility);
    return()=>{
      active=false;
      window.clearInterval(refreshTimer);
      window.clearInterval(tickTimer);
      document.removeEventListener("visibilitychange",onVisibility);
    };
  },[router]);

  return <span className={styles.liveRefresh} title="A página busca novos dados automaticamente sem precisar recarregar.">
    <i className={styles.liveRefreshDot}/>
    ao vivo · {seconds<5?"atualizando":"sincronizando"}
  </span>;
}
