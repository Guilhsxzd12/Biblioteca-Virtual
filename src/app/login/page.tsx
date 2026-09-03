import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

function safeNext(value?:string){return value&&value.startsWith("/")&&!value.startsWith("//")?value:undefined;}

export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string}>}){
  const params=await searchParams;const next=safeNext(params.next);
  const v=await getViewer();
  if(v.user&&(v.profile?.role==="admin"||v.profile?.approved))redirect(next||"/biblioteca");
  return <main className="auth-page"><section className="auth-visual"><div className="auth-quote"><span>“</span><h2>Um leitor vive mil vidas antes de morrer.</h2><p>— George R. R. Martin</p></div></section><section className="auth-panel"><LoginForm next={next}/></section></main>;
}
