"use client";

import { useRouter } from "next/navigation";

export function BackToPrevious(){
  const router=useRouter();
  function goBack(){
    if(typeof window!=="undefined"&&window.history.length>1)router.back();
    else router.push("/biblioteca");
  }
  return <button type="button" className="eyebrow back-eyebrow" onClick={goBack}>← VOLTAR</button>;
}
