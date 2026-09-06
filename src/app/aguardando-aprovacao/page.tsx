import { getViewer } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { redirect } from "next/navigation";
export default async function WaitingPage(){ const v=await getViewer(); if(!v.user) redirect("/login"); if(v.profile?.role==="admin"||v.profile?.approved) redirect("/biblioteca"); return <main className="auth-panel"><section className="card panel" style={{maxWidth:560,textAlign:"center"}}><h1>Acesso indisponível</h1><p className="muted">Esta conta ainda não está liberada ou a assinatura está inativa. Fale com o administrador para regularizar o acesso.</p><SignOutButton/></section></main>; }
