import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

function text(value:unknown){return String(value||"").trim();}

export async function POST(request:NextRequest){
  const viewer=await getApiViewer();
  if(!viewer.user||!viewer.profile)return NextResponse.json({error:"Faça login para pedir um livro."},{status:401});
  if(viewer.profile.role!=="admin"&&!viewer.profile.approved)return NextResponse.json({error:"Sua conta ainda não está liberada."},{status:403});

  try{
    const body=await request.json();
    const title=text(body.title);const author=text(body.author);const language=text(body.language).toLowerCase()||"pt";
    if(title.length<2)return NextResponse.json({error:"Informe o nome do livro."},{status:400});
    if(author.length<2)return NextResponse.json({error:"Informe o autor do livro."},{status:400});

    const admin=createAdminSupabaseClient();
    const {data:existing}=await admin.from("book_requests").select("id,status").eq("user_id",viewer.user.id).ilike("title",title).eq("status","pending").maybeSingle();
    if(existing)return NextResponse.json({ok:true,duplicate:true,message:"Esse livro já está na sua lista de pedidos."});

    const now=new Date().toISOString();
    const {data,error}=await admin.from("book_requests").insert({user_id:viewer.user.id,title,author,language,status:"pending",updated_at:now}).select("*").single();
    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({ok:true,request:data,message:"Pedido enviado. Ele já apareceu no painel do administrador."});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível enviar o pedido."},{status:400});
  }
}
