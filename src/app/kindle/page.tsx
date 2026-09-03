import { AppShell } from "@/components/AppShell";
import { KindleClient } from "@/components/KindleClient";
import { requireApproved } from "@/lib/auth";
import type { Category,UserBook } from "@/lib/types";

export default async function KindlePage(){
  const {supabase}=await requireApproved();
  const [{data:categories},{data:books}]=await Promise.all([
    supabase.from("categories").select("*").order("name"),
    supabase.from("user_books").select("*,categories(name)").order("created_at",{ascending:false})
  ]);
  return <AppShell><main className="container"><div className="page-head"><div><h1>Enviar ao Kindle</h1><p>Valide seu EPUB, salve uma cópia privada e compartilhe o arquivo diretamente com o app Kindle pelo menu do celular.</p></div></div><KindleClient categories={(categories||[]) as Category[]} initialBooks={(books||[]) as UserBook[]}/></main></AppShell>;
}
