"use client";

import { useState } from "react";

export function BookRequestForm(){
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [success,setSuccess]=useState(false);
  async function submit(formData:FormData){
    setBusy(true);setMessage("");setSuccess(false);
    try{
      const response=await fetch("/api/requests",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title:formData.get("title"),author:formData.get("author"),language:formData.get("language")})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Não foi possível enviar o pedido.");
      setSuccess(true);setMessage(data.message||"Pedido enviado com sucesso.");
      (document.getElementById("request-book-form") as HTMLFormElement|null)?.reset();
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível enviar o pedido.");}
    finally{setBusy(false);}
  }
  return <form id="request-book-form" className="card panel request-book-form stack" action={submit}>
    <label>Nome do livro<input name="title" placeholder="Ex.: A Guerra dos Tronos" required minLength={2}/></label>
    <label>Autor<input name="author" placeholder="Ex.: George R. R. Martin" required minLength={2}/></label>
    <label>Idioma<select name="language" defaultValue="pt"><option value="pt">Português</option><option value="en">Inglês</option><option value="es">Espanhol</option><option value="fr">Francês</option><option value="it">Italiano</option><option value="de">Alemão</option></select></label>
    <button className="btn" disabled={busy}>{busy?"Enviando...":"Enviar pedido"}</button>
    {message&&<div className={`notice ${success?"success":""}`}>{message}</div>}
  </form>;
}
