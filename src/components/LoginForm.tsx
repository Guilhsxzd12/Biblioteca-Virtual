"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { SITE_NAME } from "@/lib/site";

function safeNext(value?:string){return value&&value.startsWith("/")&&!value.startsWith("//")?value:"/biblioteca";}

export function LoginForm({next}:{next?:string}){
  const [loading,setLoading]=useState(false);const [message,setMessage]=useState("");const router=useRouter();
  async function submit(formData:FormData){
    setLoading(true);setMessage("");const supabase=createBrowserSupabaseClient();const email=String(formData.get("email")||"").trim();const password=String(formData.get("password")||"");
    try{
      const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;router.replace(safeNext(next));router.refresh();
    }catch{setMessage("E-mail ou senha incorretos. Confira os dados enviados pelo administrador.");}finally{setLoading(false);}
  }
  return <div className="auth-card"><div className="brand"><span className="brand-mark">E</span><span>{SITE_NAME}</span></div><span className="eyebrow">ÁREA DE ASSINANTES</span><h1>Bem-vindo de volta</h1><p className="muted">Entre com o acesso fornecido após a confirmação da sua assinatura.</p><form className="stack" action={submit}><label>E-mail<input type="email" name="email" autoComplete="email" required/></label><label>Senha<input type="password" name="password" minLength={6} autoComplete="current-password" required/></label><button className="btn" disabled={loading}>{loading?"Entrando...":"Entrar na estante"}</button></form>{message&&<p className="notice">{message}</p>}<p className="auth-help">Ainda não tem acesso? Fale com o atendimento pelo bot do Telegram para conhecer a assinatura.</p></div>;
}
