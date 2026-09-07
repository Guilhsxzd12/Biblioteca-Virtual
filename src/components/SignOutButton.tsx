"use client";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
export function SignOutButton(){ const router=useRouter(); async function signOut(){ await createBrowserSupabaseClient().auth.signOut({scope:"local"}); router.replace("/login"); router.refresh(); } return <button className="btn ghost" onClick={signOut}>Sair</button>; }
