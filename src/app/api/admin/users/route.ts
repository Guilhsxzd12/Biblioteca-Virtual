import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { activateSubscription } from "@/lib/subscription";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

async function requireApiAdmin(){const viewer=await getApiViewer();return viewer.user&&viewer.profile?.role==="admin"?viewer:null;}
function cleanUsername(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9._-]+/g,"").slice(0,32);}
async function uniqueUsername(admin:ReturnType<typeof createAdminSupabaseClient>,preferred:string,excludeId?:string){
  const base=cleanUsername(preferred)||"leitor";
  for(let n=0;n<100;n++){
    const candidate=(n===0?base:`${base.slice(0,27)}-${n+1}`).slice(0,32);
    let q=admin.from("profiles").select("id").ilike("username",candidate);
    if(excludeId)q=q.neq("id",excludeId);
    const {data}=await q.maybeSingle();if(!data)return candidate;
  }
  return `${base.slice(0,23)}-${Date.now().toString().slice(-8)}`;
}

export async function POST(request:NextRequest){
  const viewer=await requireApiAdmin();if(!viewer)return NextResponse.json({error:"Acesso negado."},{status:403});
  try{
    const body=await request.json();const email=String(body.email||"").trim().toLowerCase();const password=String(body.password||"");const fullName=String(body.fullName||"").trim();
    if(!/^\S+@\S+\.\S+$/.test(email))return NextResponse.json({error:"Informe um e-mail válido."},{status:400});
    if(password.length<8)return NextResponse.json({error:"A senha precisa ter pelo menos 8 caracteres."},{status:400});
    if(fullName.length<2)return NextResponse.json({error:"Informe o nome do assinante."},{status:400});
    const admin=createAdminSupabaseClient();const requested=String(body.username||"").trim()||email.split("@")[0];const username=await uniqueUsername(admin,requested);
    const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:fullName,username}});
    if(error||!data.user)return NextResponse.json({error:error?.message||"Não foi possível criar o usuário."},{status:400});
    const now=new Date().toISOString();const {error:profileError}=await admin.from("profiles").upsert({id:data.user.id,email,full_name:fullName,username,role:"reader",approved:true,updated_at:now},{onConflict:"id"});
    if(profileError)return NextResponse.json({error:profileError.message},{status:400});
    await activateSubscription(data.user.id,viewer.user.id,"Conta criada após confirmação manual do pagamento");
    const {data:profile}=await admin.from("profiles").select("id,email,full_name,username,role,approved").eq("id",data.user.id).single();
    return NextResponse.json({profile});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Erro ao criar usuário."},{status:400});}
}

export async function PATCH(request:NextRequest){
  const viewer=await requireApiAdmin();if(!viewer)return NextResponse.json({error:"Acesso negado."},{status:403});
  try{
    const body=await request.json();const id=String(body.id||"").trim();if(!id)return NextResponse.json({error:"Usuário obrigatório."},{status:400});
    const admin=createAdminSupabaseClient();const profilePatch:Record<string,unknown>={updated_at:new Date().toISOString()};
    if(typeof body.approved==="boolean")profilePatch.approved=body.approved;
    if(body.role==="admin"||body.role==="reader")profilePatch.role=body.role;
    if(typeof body.fullName==="string"&&body.fullName.trim())profilePatch.full_name=body.fullName.trim();
    if(typeof body.username==="string"&&body.username.trim())profilePatch.username=await uniqueUsername(admin,body.username.trim(),id);
    if(Object.keys(profilePatch).length>1){const {error}=await admin.from("profiles").update(profilePatch).eq("id",id);if(error)throw error;}
    if(typeof body.password==="string"&&body.password){if(body.password.length<8)return NextResponse.json({error:"A nova senha precisa ter pelo menos 8 caracteres."},{status:400});const {error}=await admin.auth.admin.updateUserById(id,{password:body.password});if(error)throw error;}
    const {data:profile}=await admin.from("profiles").select("id,email,full_name,username,role,approved").eq("id",id).single();
    return NextResponse.json({profile});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Erro ao atualizar usuário."},{status:400});}
}
