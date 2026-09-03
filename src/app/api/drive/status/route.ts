import { NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getGoogleAccessToken } from "@/lib/google-drive";

export async function GET(){
  const v=await getApiViewer();
  if(!v.user||v.profile?.role!=="admin")return NextResponse.json({error:"Acesso negado."},{status:403});
  try{
    const admin=createAdminSupabaseClient();
    const {data}=await admin.from("app_integrations").select("account_email,updated_at").eq("provider","google_drive").maybeSingle();
    if(!data)return NextResponse.json({connected:false,accountEmail:null,updatedAt:null});
    await getGoogleAccessToken();
    return NextResponse.json({connected:true,accountEmail:data.account_email||null,updatedAt:data.updated_at||null});
  }catch(e){
    return NextResponse.json({connected:false,error:e instanceof Error?e.message:"Erro de configuração."},{status:503});
  }
}
