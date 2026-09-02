import { AppShell } from "@/components/AppShell";
import { AdminDashboard } from "@/components/AdminDashboard";
import { requireAdmin } from "@/lib/auth";
import type { Book,Category,Profile } from "@/lib/types";
export default async function AdminPage(){ const {supabase}=await requireAdmin(); const [{data:books},{data:categories},{data:profiles}]=await Promise.all([supabase.from("books").select("*,categories(name)").order("created_at",{ascending:false}),supabase.from("categories").select("*").order("name"),supabase.from("profiles").select("id,email,full_name,role,approved").order("created_at",{ascending:false})]); return <AppShell><main className="container"><div className="page-head"><div><h1>Painel administrativo</h1><p>Gerencie livros, usuários, categorias e Google Drive.</p></div></div><AdminDashboard initialBooks={(books||[]) as Book[]} initialCategories={(categories||[]) as Category[]} initialProfiles={(profiles||[]) as Profile[]}/></main></AppShell>; }
