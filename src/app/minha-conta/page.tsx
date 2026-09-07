import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AccountSettings } from "@/components/AccountSettings";
import { getViewer } from "@/lib/auth";

export default async function MyAccountPage(){
  const {user,profile}=await getViewer();
  if(!user)redirect("/login?next=/minha-conta");
  if(!profile)redirect("/aguardando-aprovacao");
  return <AppShell allowInactive><main className="container account-page"><div className="page-head"><div><span className="eyebrow">PERFIL</span><h1>Minha conta</h1><p>Gerencie seus dados de login e sua segurança.</p></div></div><AccountSettings initialProfile={{email:profile.email,full_name:profile.full_name,username:profile.username}}/></main></AppShell>;
}
