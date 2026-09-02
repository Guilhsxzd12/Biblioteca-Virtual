import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";
export default async function LoginPage(){ const v=await getViewer(); if(v.user&&(v.profile?.role==="admin"||v.profile?.approved)) redirect("/biblioteca"); return <main className="auth-page"><section className="auth-visual"><div className="auth-quote"><span>“</span><h2>Um leitor vive mil vidas antes de morrer.</h2><p>— George R. R. Martin</p></div></section><section className="auth-panel"><LoginForm/></section></main>; }
