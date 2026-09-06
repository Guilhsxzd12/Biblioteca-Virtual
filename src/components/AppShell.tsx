import Link from "next/link";
import { requireApproved } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { SiteFooter } from "@/components/SiteFooter";
import type { Category } from "@/lib/types";

function Icon({name}:{name:"library"|"heart"|"help"|"admin"|"search"|"request"|"store"|"chevron"}){
  const common={width:20,height:20,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.9,strokeLinecap:"round" as const,strokeLinejoin:"round" as const,"aria-hidden":true};
  if(name==="library")return <svg {...common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16"/><path d="M8 7h8M8 11h7"/></svg>;
  if(name==="heart")return <svg {...common}><path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.8Z"/></svg>;
  if(name==="help")return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 3.7 2c-.9.6-1.4 1.1-1.4 2M12 17h.01"/></svg>;
  if(name==="admin")return <svg {...common}><path d="M12 3 4.5 6v5.7c0 4.6 3.2 7.8 7.5 9.3 4.3-1.5 7.5-4.7 7.5-9.3V6z"/><path d="M9.5 12 11 13.5l3.5-4"/></svg>;
  if(name==="request")return <svg {...common}><path d="M4 4h16v12H8l-4 4z"/><path d="M8 8h8M8 12h5"/></svg>;
  if(name==="store")return <svg {...common}><path d="M4 9h16l-1-5H5L4 9Z"/><path d="M5 9v10h14V9M9 19v-6h6v6"/><path d="M4 9c0 1.7 1 3 2.5 3S9 10.7 9 9c0 1.7 1.2 3 3 3s3-1.3 3-3c0 1.7 1 3 2.5 3S20 10.7 20 9"/></svg>;
  if(name==="chevron")return <svg {...common}><path d="m8 10 4 4 4-4"/></svg>;
  return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
}

function WhatsAppIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="11.5" r="7.6" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M6.1 17.4 5 21l3.6-1.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 8.3c.3-.3.7-.2.9.1l1 1.7c.2.3.1.6-.1.8l-.6.6c.7 1.4 1.8 2.5 3.3 3.2l.6-.7c.2-.2.5-.3.8-.1l1.7.9c.3.2.4.6.2.9-.5.8-1.4 1.3-2.3 1.2-3.8-.4-6.8-3.4-7.3-7.2-.1-.6.3-1.1.8-1.4Z" fill="currentColor"/></svg>}
function TelegramIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4 9.6 15.1M21 4l-6.2 16-5.2-4.9L5.9 18l1.2-5.4L3 10.9 21 4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}

export async function AppShell({children}:{children:React.ReactNode}){
  const {profile,supabase}=await requireApproved();
  const admin=profile.role==="admin";
  const [{data:categoryData},{data:authorData}]=await Promise.all([
    supabase.from("categories").select("id,name,slug").order("name"),
    supabase.from("books").select("author").eq("published",true).not("author","is",null)
  ]);
  const categories=(categoryData||[]) as Category[];
  const authors=Array.from(new Set((authorData||[]).map(row=>String(row.author||"").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"pt-BR")).slice(0,18);

  return <div className="app-shell">
    <header className="app-header store-header">
      <div className="header-main shell-width">
        <Link className="brand brand-logo" href="/biblioteca"><img src="/kindle-books-logo.svg" alt="KINDLE BOOKS"/></Link>
        <form className="header-search store-search" action="/biblioteca" method="get"><Icon name="search"/><input name="q" placeholder="Estou à procura de..." aria-label="Pesquisar livros"/><button type="submit">Buscar</button></form>
        <div className="header-actions">
          <a className="header-action-icon whatsapp-action" href="https://wa.me/5545999056277" target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp"><WhatsAppIcon/><span>WhatsApp</span></a>
          <a className="header-action-icon telegram-action" href="/api/telegram/open" target="_blank" rel="noreferrer" aria-label="Telegram" title="Telegram"><TelegramIcon/><span>Telegram</span></a>
          <Link className="header-action-icon" href="/biblioteca" aria-label="Loja" title="Loja"><Icon name="store"/><span>Loja</span></Link>
          <Link className="header-request-btn" href="/pedido"><Icon name="request"/>Pedir livro</Link>
          <div className="user-pill"><span>{profile.full_name||profile.email}</span><SignOutButton/></div>
        </div>
      </div>
      <div className="header-nav-wrap">
        <nav className="header-nav shell-width" aria-label="Navegação do catálogo">
          <Link href="/biblioteca">Início</Link>
          <details className="nav-dropdown"><summary>Categorias <Icon name="chevron"/></summary><div className="nav-dropdown-menu">{categories.map(category=><Link key={category.id} href={`/biblioteca?categoria=${encodeURIComponent(category.slug)}`}>{category.name}</Link>)}</div></details>
          <details className="nav-dropdown"><summary>Autores <Icon name="chevron"/></summary><div className="nav-dropdown-menu authors-menu">{authors.map(author=><Link key={author} href={`/biblioteca?autor=${encodeURIComponent(author)}`}>{author}</Link>)}</div></details>
          <Link href="/favoritos">Favoritos</Link>
          <Link href="/ajuda">Ajuda</Link>
          {admin&&<Link href="/admin">Admin</Link>}
        </nav>
      </div>
    </header>

    {children}

    <SiteFooter categories={categories}/>

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
