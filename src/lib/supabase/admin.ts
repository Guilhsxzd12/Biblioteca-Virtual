import "server-only";
import { createClient } from "@supabase/supabase-js";

export function createAdminSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) throw new Error("SUPABASE_SECRET_KEY não configurada no servidor.");
  return createClient(url, secretKey, {
    auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false },
    global: { headers: { "x-application-name":"biblioteca-virtual-server" } }
  });
}
