import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type SubscriptionState={status:"inactive"|"active"|"canceled";activatedAt:string|null;activeUntil:string|null;isActive:boolean};

export async function getSubscriptionState(userId:string):Promise<SubscriptionState>{
  const admin=createAdminSupabaseClient();
  const {data,error}=await admin.from("subscriptions").select("status,activated_at,active_until").eq("user_id",userId).maybeSingle();
  if(error)throw new Error(`Falha ao consultar assinatura: ${error.message}`);
  const activatedAt=data?.activated_at?String(data.activated_at):null;
  const activeUntil=data?.active_until?String(data.active_until):null;
  const isActive=data?.status==="active"&&!!activeUntil&&new Date(activeUntil).getTime()>Date.now();
  return {status:(data?.status||"inactive") as SubscriptionState["status"],activatedAt,activeUntil,isActive};
}

export async function activateSubscription(userId:string,adminUserId:string,note?:string|null){
  const admin=createAdminSupabaseClient();
  const activatedAt=new Date();
  const activeUntil=new Date(activatedAt.getTime()+30*86400000).toISOString();
  const payload={user_id:userId,status:"active",active_until:activeUntil,activated_at:activatedAt.toISOString(),activated_by:adminUserId,note:note||"Pagamento confirmado manualmente — 30 dias",updated_at:activatedAt.toISOString()};
  const {data,error}=await admin.from("subscriptions").upsert(payload,{onConflict:"user_id"}).select("*").single();
  if(error)throw new Error(error.message);
  await admin.from("profiles").update({approved:true,updated_at:new Date().toISOString()}).eq("id",userId);
  return data;
}

export async function cancelSubscription(userId:string,adminUserId:string){
  const admin=createAdminSupabaseClient();
  const {data,error}=await admin.from("subscriptions").upsert({user_id:userId,status:"canceled",active_until:null,activated_by:adminUserId,updated_at:new Date().toISOString()},{onConflict:"user_id"}).select("*").single();
  if(error)throw new Error(error.message);
  return data;
}
