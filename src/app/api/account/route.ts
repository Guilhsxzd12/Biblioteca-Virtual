import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

function cleanUsername(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9._-]+/g,"").slice(0,32);}

async function usernameAvailable(admin:ReturnType<typeof createAdminSupabaseClient>,username:string,userId:string){
  const {data,error}=await admin.from("profiles").select("id").ilike("username",username).neq("id",userId).limit(1);
  if(error)throw new Error(error.message);
  return !data?.length;
}

export async function PATCH(request:NextRequest){
  try{
    const viewer=await getApiViewer();
    if(!viewer.user||!viewer.profile)return NextResponse.json({error:"Faça login para alterar sua conta."},{status:401});
    const body=await request.json();
    const fullName=typeof body.fullName==="string"?body.fullName.trim():undefined;
    const email=typeof body.email==="string"?body.email.trim().toLowerCase():undefined;
    const requestedUsername=typeof body.username==="string"?body.username.trim():undefined;
    const password=typeof body.password==="string"?body.password:"";

    if(email!==undefined&&!/^\S+@\S+\.\S+$/.test(email))return NextResponse.json({error:"Informe um e-mail válido."},{status:400});
    if(password&&password.length<8)return NextResponse.json({error:"A nova senha precisa ter pelo menos 8 caracteres."},{status:400});
    if(fullName!==undefined&&fullName.length<2)return NextResponse.json({error:"O nome precisa ter pelo menos 2 caracteres."},{status:400});

    const admin=createAdminSupabaseClient();
    let username=viewer.profile.username||null;
    if(requestedUsername!==undefined){
      const cleaned=cleanUsername(requestedUsername);
      if(cleaned.length<3)return NextResponse.json({error:"O nome de usuário precisa ter pelo menos 3 caracteres e usar letras, números, ponto, hífen ou underline."},{status:400});
      if(!await usernameAvailable(admin,cleaned,viewer.user.id))return NextResponse.json({error:"Este nome de usuário já está em uso."},{status:409});
      username=cleaned;
    }

    const authPatch:Record<string,unknown>={};
    if(email!==undefined&&email!==viewer.user.email)authPatch.email=email;
    if(password)authPatch.password=password;
    if(fullName!==undefined||requestedUsername!==undefined){
      authPatch.user_metadata={...(viewer.user.user_metadata||{}),...(fullName!==undefined?{full_name:fullName}:{}),...(requestedUsername!==undefined?{username}:{} )};
    }
    if(Object.keys(authPatch).length){
      const {error}=await admin.auth.admin.updateUserById(viewer.user.id,authPatch);
      if(error)throw new Error(error.message);
    }

    const profilePatch:Record<string,unknown>={updated_at:new Date().toISOString()};
    if(fullName!==undefined)profilePatch.full_name=fullName;
    if(email!==undefined)profilePatch.email=email;
    if(requestedUsername!==undefined)profilePatch.username=username;
    if(Object.keys(profilePatch).length>1){
      const {error}=await admin.from("profiles").update(profilePatch).eq("id",viewer.user.id);
      if(error)throw new Error(error.message);
    }

    const {data:profile,error:profileError}=await admin.from("profiles").select("id,email,full_name,username,role,approved").eq("id",viewer.user.id).single();
    if(profileError)throw new Error(profileError.message);
    return NextResponse.json({ok:true,profile,passwordChanged:Boolean(password)});
  }catch(error){
    const message=error instanceof Error?error.message:"Não foi possível atualizar a conta.";
    const friendly=/already registered|already been registered|duplicate/i.test(message)?"Este e-mail já está em uso.":message;
    return NextResponse.json({error:friendly},{status:400});
  }
}
