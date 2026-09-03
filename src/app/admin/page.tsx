import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AdminDashboard } from "@/components/AdminDashboard";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Book,Category,Profile,UserBook } from "@/lib/types";

export default async function AdminPage(){
  const {supabase}=await requireAdmin();
  const admin=createAdminSupabaseClient();
  const [{data:books},{data:categories},{data:profiles},{data:userBooks}]=await Promise.all([
    supabase.from("books").select("*,categories(name)").order("created_at",{ascending:false}),
    supabase.from("categories").select("*").order("name"),
    supabase.from("profiles").select("id,email,full_name,role,approved").order("created_at",{ascending:false}),
    admin.from("user_books").select("*,categories(name)").order("created_at",{ascending:false})
  ]);
  const profileMap=new Map((profiles||[]).map(p=>[p.id,p]));
  const uploads=(userBooks||[]).map(b=>({...b,uploader_name:profileMap.get(b.user_id)?.full_name||null,uploader_email:profileMap.get(b.user_id)?.email||null})) as UserBook[];
  return <AppShell><main className="container"><div className="page-head"><div><h1>Painel administrativo</h1><p>Gerencie livros, envios dos usuários, usuários, categorias e Google Drive.</p></div><Link className="btn" href="/admin/assinaturas">Assinaturas e Telegram</Link></div><AdminDashboard initialBooks={(books||[]) as Book[]} initialCategories={(categories||[]) as Category[]} initialProfiles={(profiles||[]) as Profile[]} initialUserBooks={uploads}/></main></AppShell>;
}
