"use client";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
export function SignOutButton(){ const router=useRouter(); async function signOut(){ await createBrowserSupabaseClient().auth.signOut(); router.replace("/login"); router.refresh(); } return <button className="btn ghost" onClick={signOut}>Sair</button>; }
