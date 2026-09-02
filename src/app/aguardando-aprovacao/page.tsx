import { getViewer } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { redirect } from "next/navigation";
export default async function WaitingPage(){ const v=await getViewer(); if(!v.user) redirect("/login"); if(v.profile?.role==="admin"||v.profile?.approved) redirect("/biblioteca"); return <main className="auth-panel"><section className="card panel" style={{maxWidth:560,textAlign:"center"}}><h1>Acesso aguardando aprovação</h1><p className="muted">Sua conta foi criada. Assim que o administrador liberar o acesso, você poderá entrar na biblioteca.</p><SignOutButton/></section></main>; }
