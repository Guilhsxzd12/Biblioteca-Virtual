import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

function safeNext(value?:string){return value&&value.startsWith("/")&&!value.startsWith("//")?value:undefined;}

export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string}>}){
  const params=await searchParams;const next=safeNext(params.next);
  const v=await getViewer();
  if(v.user&&(v.profile?.role==="admin"||v.profile?.approved))redirect(next||"/biblioteca");
  return <main className="auth-page"><section className="auth-visual"><div className="auth-visual-copy"><span className="auth-kicker">SEU PRÓXIMO LIVRO ESTÁ AQUI</span><h2>Uma estante inteira,<br/>onde você estiver.</h2><p>Descubra títulos, encontre novas histórias e baixe no formato ideal para o seu aplicativo de leitura.</p></div><div className="auth-book-stack" aria-hidden="true"><span/><span/><span/></div></section><section className="auth-panel"><LoginForm next={next}/></section></main>;
}
