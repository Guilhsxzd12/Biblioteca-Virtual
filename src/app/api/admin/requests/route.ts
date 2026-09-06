import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { completeBookRequest } from "@/lib/book-requests";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

async function isAdmin(){const viewer=await getApiViewer();return Boolean(viewer.user&&viewer.profile?.role==="admin");}

export async function PATCH(request:NextRequest){
  if(!await isAdmin())return NextResponse.json({error:"Acesso negado."},{status:403});
  try{
    const body=await request.json();const id=String(body.id||"").trim();const action=String(body.action||"");const admin=createAdminSupabaseClient();
    if(!id)return NextResponse.json({error:"Pedido obrigatório."},{status:400});
    if(action==="archive"){
      const {data,error}=await admin.from("book_requests").update({status:"archived",updated_at:new Date().toISOString()}).eq("id",id).select("*").single();
      return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({request:data});
    }
    if(action==="reopen"){
      const {data,error}=await admin.from("book_requests").update({status:"pending",matched_book_id:null,published_at:null,notified_at:null,updated_at:new Date().toISOString()}).eq("id",id).select("*").single();
      return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({request:data});
    }
    if(action==="notify"){
      const {data:row}=await admin.from("book_requests").select("matched_book_id").eq("id",id).maybeSingle();if(!row?.matched_book_id)return NextResponse.json({error:"Esse pedido ainda não possui livro publicado."},{status:400});
      const {data:book}=await admin.from("books").select("id,slug,title").eq("id",row.matched_book_id).maybeSingle();if(!book)return NextResponse.json({error:"Livro não encontrado."},{status:404});
      return NextResponse.json({notification:await completeBookRequest(id,book)});
    }
    return NextResponse.json({error:"Ação inválida."},{status:400});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Erro ao atualizar pedido."},{status:400});}
}
