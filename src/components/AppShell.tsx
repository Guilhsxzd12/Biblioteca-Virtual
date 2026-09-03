import Link from "next/link";
import { requireApproved } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

export async function AppShell({children}:{children:React.ReactNode}){
  const {profile}=await requireApproved();
  return <div>
    <header className="topbar">
      <Link className="brand" href="/biblioteca"><span className="brand-mark">B</span><span>Biblioteca <b>Virtual</b></span></Link>
      <nav className="nav"><Link href="/biblioteca">Biblioteca</Link><Link href="/kindle">Enviar ao Kindle</Link><Link href="/favoritos">Favoritos</Link>{profile.role==="admin"&&<Link href="/admin">Admin</Link>}</nav>
      <form className="header-search" action="/biblioteca" method="get"><input name="q" placeholder="Pesquisar livros..." aria-label="Pesquisar livros"/><button type="submit">Buscar</button></form>
      <div className="user-pill"><span>{profile.full_name||profile.email}</span><SignOutButton/></div>
    </header>
    {children}
  </div>;
}
