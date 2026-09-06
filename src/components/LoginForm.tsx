"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

function safeNext(value?:string){return value&&value.startsWith("/")&&!value.startsWith("//")?value:"/biblioteca";}

type ContactMode="access"|"password"|null;

export function LoginForm({next}:{next?:string}){
  const [loading,setLoading]=useState(false);const [message,setMessage]=useState("");const [contactMode,setContactMode]=useState<ContactMode>(null);const router=useRouter();
  async function submit(formData:FormData){
    setLoading(true);setMessage("");const supabase=createBrowserSupabaseClient();const email=String(formData.get("email")||"").trim();const password=String(formData.get("password")||"");
    try{
      const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;router.replace(safeNext(next));router.refresh();
    }catch{setMessage("E-mail ou senha incorretos. Confira seus dados ou fale com o atendimento para recuperar o acesso.");}finally{setLoading(false);}
  }
  const contactTitle=contactMode==="password"?"Recuperar acesso":"Comprar acesso";
  const contactText=contactMode==="password"?"Escolha onde prefere falar para recuperar sua senha.":"Escolha onde prefere falar para comprar seu acesso ao Kindle Books.";
  return <div className="oda-login-shell">
    <div className="oda-login-brand"><img src="/kindle-books-logo.svg" alt="KINDLE BOOKS"/></div>
    <section className="oda-login-card">
      <div className="oda-login-intro"><h1>Bem-vindo!</h1><p>Se você ainda não possui cadastro, <button type="button" className="oda-inline-link" onClick={()=>setContactMode("access")}>clique aqui</button> e fale com o atendimento para realizar sua inscrição.</p><p>Caso já possua cadastro, faça o login abaixo.</p></div>
      <form className="oda-login-form" action={submit}>
        <label>E-mail<input type="email" name="email" placeholder="E-mail" autoComplete="email" required/></label>
        <label>Senha<input type="password" name="password" placeholder="Senha" minLength={6} autoComplete="current-password" required/></label>
        <label className="oda-remember"><input type="checkbox" name="remember" defaultChecked/><span>Lembre de mim</span></label>
        <button className="oda-login-submit" disabled={loading}>{loading?"Entrando...":"Entrar"}</button>
      </form>
      {message&&<p className="oda-login-error">{message}</p>}
      <div className="oda-login-divider"><span/>ou<span/></div>
      <button type="button" className="oda-register-button" onClick={()=>setContactMode("access")}>Cadastre-se</button>
      <p className="oda-forgot">Esqueceu sua senha? Recupere-a <button type="button" className="oda-inline-link" onClick={()=>setContactMode("password")}>aqui</button>.</p>
    </section>
    <p className="oda-login-footer">KINDLE BOOKS · sua biblioteca digital</p>

    {contactMode&&<div className="oda-contact-backdrop" role="presentation" onClick={()=>setContactMode(null)}>
      <div className="oda-contact-modal" role="dialog" aria-modal="true" aria-labelledby="contact-title" onClick={e=>e.stopPropagation()}>
        <button type="button" className="oda-contact-close" onClick={()=>setContactMode(null)} aria-label="Fechar">×</button>
        <span className="oda-contact-kicker">ATENDIMENTO</span><h2 id="contact-title">{contactTitle}</h2><p>{contactText}</p>
        <div className="oda-contact-options">
          <a className="oda-contact-option whatsapp" href="https://wa.me/5545999056277" target="_blank" rel="noreferrer"><strong>WhatsApp</strong><span>45 99905-6277</span></a>
          <a className="oda-contact-option telegram" href="https://t.me/guilh2026" target="_blank" rel="noreferrer"><strong>Telegram</strong><span>@guilh2026</span></a>
        </div>
      </div>
    </div>}
  </div>;
}
