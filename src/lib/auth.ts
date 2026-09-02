import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
export async function getViewer(){
  const supabase=await createServerSupabaseClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return {supabase,user:null,profile:null as Profile|null};
  const {data:profile}=await supabase.from("profiles").select("id,email,full_name,role,approved").eq("id",user.id).maybeSingle();
  return {supabase,user,profile:profile as Profile|null};
}
export async function requireApproved(){ const viewer=await getViewer(); if(!viewer.user) redirect("/login"); if(!viewer.profile) redirect("/aguardando-aprovacao"); if(viewer.profile.role!=="admin"&&!viewer.profile.approved) redirect("/aguardando-aprovacao"); return viewer as typeof viewer & {user:NonNullable<typeof viewer.user>;profile:Profile}; }
export async function requireAdmin(){ const viewer=await getViewer(); if(!viewer.user) redirect("/login"); if(!viewer.profile||viewer.profile.role!=="admin") redirect("/biblioteca"); return viewer as typeof viewer & {user:NonNullable<typeof viewer.user>;profile:Profile}; }
export async function getApiViewer(){ return getViewer(); }
