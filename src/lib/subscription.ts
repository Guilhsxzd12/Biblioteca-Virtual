import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type SubscriptionState={status:"inactive"|"active"|"canceled";activeUntil:string|null;isActive:boolean};

export async function getSubscriptionState(userId:string):Promise<SubscriptionState>{
  const admin=createAdminSupabaseClient();
  const {data,error}=await admin.from("subscriptions").select("status,active_until").eq("user_id",userId).maybeSingle();
  if(error)throw new Error(`Falha ao consultar assinatura: ${error.message}`);
  const activeUntil=data?.active_until?String(data.active_until):null;
  const isActive=data?.status==="active"&&!!activeUntil&&new Date(activeUntil).getTime()>Date.now();
  return {status:(data?.status||"inactive") as SubscriptionState["status"],activeUntil,isActive};
}

export async function activateSubscription(userId:string,days:number,adminUserId:string,note?:string|null){
  const admin=createAdminSupabaseClient();
  const {data:current}=await admin.from("subscriptions").select("active_until").eq("user_id",userId).maybeSingle();
  const now=Date.now();
  const currentTime=current?.active_until?new Date(current.active_until).getTime():0;
  const base=Math.max(now,Number.isFinite(currentTime)?currentTime:0);
  const activeUntil=new Date(base+Math.max(1,days)*86400000).toISOString();
  const payload={user_id:userId,status:"active",active_until:activeUntil,activated_at:new Date().toISOString(),activated_by:adminUserId,note:note||null,updated_at:new Date().toISOString()};
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
