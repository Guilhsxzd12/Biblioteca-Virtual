import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { searchCatalog } from "@/lib/catalog";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function GET(request:Request){
  await requireApproved();
  const url=new URL(request.url);
  const category=(url.searchParams.get("categoria")||"").trim();
  const page=Math.max(1,Number.parseInt(url.searchParams.get("pagina")||"1",10)||1);
  const size=Math.min(60,Math.max(12,Number.parseInt(url.searchParams.get("tamanho")||"30",10)||30));
  if(!category)return NextResponse.json({books:[],total:0,page:1},{status:400});

  const admin=createAdminSupabaseClient();
  const result=await searchCatalog(admin,{category,page,size,sort:"title"});
  return NextResponse.json(result,{headers:{"Cache-Control":"private, max-age=20"}});
}
