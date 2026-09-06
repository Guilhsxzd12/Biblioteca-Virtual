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
  const now=new Date();
  const {data:current,error:currentError}=await admin.from("subscriptions").select("status,active_until").eq("user_id",userId).maybeSingle();
  if(currentError)throw new Error(currentError.message);
  const currentUntil=current?.active_until?new Date(current.active_until).getTime():0;
  const base=current?.status==="active"&&currentUntil>now.getTime()?currentUntil:now.getTime();
  const activeUntil=new Date(base+30*86400000).toISOString();
  const payload={user_id:userId,status:"active",active_until:activeUntil,activated_at:now.toISOString(),activated_by:adminUserId,note:note||"Assinatura liberada/renovada manualmente — +30 dias",updated_at:now.toISOString()};
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
