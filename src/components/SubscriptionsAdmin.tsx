"use client";
import { useEffect,useMemo,useState } from "react";

type Row={
  profile:{id:string;email:string|null;full_name:string|null;approved:boolean;role:string};
  subscription:{status:string;active_until:string|null;activated_at:string|null;note:string|null}|null;
  telegram:{telegram_user_id:number;username:string|null;first_name:string|null;linked_at:string}|null;
};

function date(value?:string|null){if(!value)return "—";return new Intl.DateTimeFormat("pt-BR",{dateStyle:"short"}).format(new Date(value));}
function isActive(row:Row){return row.subscription?.status==="active"&&!!row.subscription.active_until&&new Date(row.subscription.active_until).getTime()>Date.now();}

export function SubscriptionsAdmin(){
  const [rows,setRows]=useState<Row[]>([]);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState<string|null>(null);const [search,setSearch]=useState("");const [message,setMessage]=useState("");const [bot,setBot]=useState<{username?:string;first_name?:string}|null>(null);const [botBusy,setBotBusy]=useState(false);
  async function load(){setLoading(true);try{const r=await fetch("/api/admin/subscriptions",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Erro ao carregar assinaturas.");setRows(d.rows||[]);}catch(e){setMessage(e instanceof Error?e.message:"Erro ao carregar.");}finally{setLoading(false);}}
  async function loadBot(){try{const r=await fetch("/api/telegram/setup",{cache:"no-store"});const d=await r.json();if(r.ok)setBot(d.bot||null);}catch{}}
  useEffect(()=>{load();loadBot();},[]);
  const filtered=useMemo(()=>{const q=search.trim().toLowerCase().replace(/^@/,"");if(!q)return rows;return rows.filter(r=>[r.profile.full_name,r.profile.email,r.telegram?.username,r.telegram?.first_name].some(v=>String(v||"").toLowerCase().includes(q)));},[rows,search]);
  async function change(userId:string,action:"activate"|"cancel"){setBusy(userId);setMessage("");try{const r=await fetch("/api/admin/subscriptions",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({userId,action})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Não foi possível atualizar.");setMessage(action==="activate"?"Assinatura liberada por 30 dias.":"Assinatura cancelada.");await load();}catch(e){setMessage(e instanceof Error?e.message:"Erro ao atualizar.");}finally{setBusy(null);}}
  async function setupBot(){setBotBusy(true);setMessage("");try{const r=await fetch("/api/telegram/setup",{method:"POST"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Falha ao ativar bot.");setBot(d.bot||null);setMessage(`Bot @${d.bot?.username||"Telegram"} ativado e conectado ao site.`);}catch(e){setMessage(e instanceof Error?e.message:"Erro ao ativar bot.");}finally{setBotBusy(false);}}
  return <div className="stack" style={{gap:18}}>
    <section className="card panel"><div className="row wrap" style={{justifyContent:"space-between"}}><div><h2>Bot do Telegram</h2><p className="muted">Registra o webhook e atualiza os comandos do bot no domínio oficial.</p>{bot&&<p><b>@{bot.username||bot.first_name}</b> • token reconhecido</p>}</div><button className="btn" onClick={setupBot} disabled={botBusy}>{botBusy?"Atualizando...":"Ativar / atualizar bot"}</button></div></section>
    {message&&<div className={`notice ${message.includes("liberada")||message.includes("ativado")?"success":""}`}>{message}</div>}
    <section className="card panel"><div className="row wrap" style={{justifyContent:"space-between",alignItems:"end"}}><div><h2>Assinaturas</h2><p className="muted">Cada confirmação manual libera exatamente 30 dias a partir da data da ativação.</p></div><label style={{minWidth:260}}>Buscar usuário<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome, e-mail ou @telegram"/></label></div>
      {loading?<p className="muted">Carregando...</p>:<div className="table-list">{filtered.length?filtered.map(row=>{const active=isActive(row);return <div className="table-row" key={row.profile.id}><div><strong>{row.profile.full_name||row.profile.email||"Usuário"}</strong><div className="meta">{row.profile.email||"sem e-mail"} • {row.telegram?`@${row.telegram.username||row.telegram.first_name||row.telegram.telegram_user_id}`:"Telegram não vinculado"}</div><div className="meta">{active?`✅ Ativa • início ${date(row.subscription?.activated_at)} • fim ${date(row.subscription?.active_until)}`:row.subscription?.status==="canceled"?"⛔ Cancelada":"⚪ Inativa"} • {row.profile.approved?"conta aprovada":"conta aguardando"}</div></div><div className="row wrap"><button className="btn" disabled={busy===row.profile.id} onClick={()=>change(row.profile.id,"activate")}>Liberar 30 dias</button><button className="btn danger" disabled={busy===row.profile.id||!active} onClick={()=>change(row.profile.id,"cancel")}>Cancelar</button></div></div>}):<p className="muted">Nenhum usuário encontrado.</p>}</div>}
    </section>
  </div>;
}
