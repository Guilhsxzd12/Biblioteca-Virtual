import Link from "next/link";
import { requireApproved } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { SITE_NAME } from "@/lib/site";

function Icon({name}:{name:"library"|"heart"|"help"|"admin"|"search"|"request"}){
  const common={width:20,height:20,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.9,strokeLinecap:"round" as const,strokeLinejoin:"round" as const,"aria-hidden":true};
  if(name==="library")return <svg {...common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16"/><path d="M8 7h8M8 11h7"/></svg>;
  if(name==="heart")return <svg {...common}><path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.8Z"/></svg>;
  if(name==="help")return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 3.7 2c-.9.6-1.4 1.1-1.4 2M12 17h.01"/></svg>;
  if(name==="admin")return <svg {...common}><path d="M12 3 4.5 6v5.7c0 4.6 3.2 7.8 7.5 9.3 4.3-1.5 7.5-4.7 7.5-9.3V6z"/><path d="M9.5 12 11 13.5l3.5-4"/></svg>;
  if(name==="request")return <svg {...common}><path d="M4 4h16v12H8l-4 4z"/><path d="M8 8h8M8 12h5"/></svg>;
  return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
}

function WhatsAppIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a9.8 9.8 0 0 0-8.5 14.7L2 22l5.5-1.4A10 10 0 1 0 12 2Zm0 17.9a8 8 0 0 1-4.1-1.1l-.3-.2-3.2.8.9-3.1-.2-.3A7.8 7.8 0 1 1 12 19.9Zm4.3-5.8c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.6.1-.2.3-.6.8-.8 1-.1.2-.3.2-.5.1-1.4-.7-2.3-1.3-3.2-2.9-.2-.3.2-.3.6-1.1.1-.2 0-.4 0-.5l-.7-1.7c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.4-.2.2-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .2-1.1-.1-.2-.2-.3-.4-.4Z"/></svg>}
function TelegramIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.7 3.4 18.5 20c-.2 1.2-.9 1.5-1.9.9l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6 13.8l-4.8-1.5c-1-.3-1.1-1 .2-1.5L20.1 3.6c.9-.3 1.7.2 1.6-.2Z"/></svg>}

export async function AppShell({children}:{children:React.ReactNode}){
  const {profile}=await requireApproved();
  const admin=profile.role==="admin";
  return <div className="app-shell">
    <header className="app-header">
      <div className="header-inner">
        <Link className="brand" href="/biblioteca"><span className="brand-mark">K</span><span className="brand-copy">{SITE_NAME}</span></Link>
        <nav className="desktop-nav">
          <Link href="/biblioteca">Início</Link>
          <Link href="/favoritos">Favoritos</Link>
          <Link href="/pedido">Pedir livro</Link>
          {admin&&<Link href="/admin">Admin</Link>}
        </nav>
        <form className="header-search" action="/biblioteca" method="get"><Icon name="search"/><input name="q" placeholder="Busque por título ou autor" aria-label="Pesquisar livros"/><button type="submit">Buscar</button></form>
        <Link className="header-icon-link" href="/ajuda" aria-label="Precisa de ajuda?" title="Precisa de ajuda?"><Icon name="help"/></Link>
        <div className="user-pill"><span>{profile.full_name||profile.email}</span><SignOutButton/></div>
      </div>
    </header>
    {children}
    <div className="floating-contact" aria-label="Atendimento">
      <a className="contact-bubble telegram" href="/api/telegram/open" target="_blank" rel="noreferrer" aria-label="Abrir bot do Telegram" title="Telegram"><TelegramIcon/></a>
      <a className="contact-bubble whatsapp" href="https://wa.me/5545999056277" target="_blank" rel="noreferrer" aria-label="Falar pelo WhatsApp" title="WhatsApp"><WhatsAppIcon/></a>
    </div>
    <nav className={`mobile-bottom-nav ${admin?"has-admin":""}`} aria-label="Navegação principal">
      <Link href="/biblioteca"><Icon name="library"/><span>Estante</span></Link>
      <Link href="/favoritos"><Icon name="heart"/><span>Favoritos</span></Link>
      <Link href="/pedido"><Icon name="request"/><span>Pedir</span></Link>
      <Link href="/ajuda"><Icon name="help"/><span>Ajuda</span></Link>
      {admin&&<Link href="/admin"><Icon name="admin"/><span>Admin</span></Link>}
    </nav>
  </div>;
}
