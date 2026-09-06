import { NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const viewer=await getApiViewer();
  if(!viewer.user||!viewer.profile||(!viewer.profile.approved&&viewer.profile.role!=="admin"))return NextResponse.json({error:"Acesso negado."},{status:403});
  const admin=createAdminSupabaseClient();
  const since=new Date(Date.now()-30*60*1000).toISOString();
  const {data:recent}=await admin.from("book_view_events").select("id").eq("book_id",id).eq("user_id",viewer.user.id).gte("viewed_at",since).limit(1);
  if(!recent?.length){
    const {error}=await admin.from("book_view_events").insert({book_id:id,user_id:viewer.user.id});
    if(error)return NextResponse.json({error:"Não foi possível registrar o acesso."},{status:400});
  }
  return NextResponse.json({ok:true});
}
