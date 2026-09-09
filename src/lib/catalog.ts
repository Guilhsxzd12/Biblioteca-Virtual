import type { SupabaseClient } from "@supabase/supabase-js";
import type { Book } from "@/lib/types";

export async function searchCatalog(db:SupabaseClient, options:{search?:string;category?:string;author?:string;page?:number;size?:number;sort?:"title"|"recent"|"popular"|"views"}={}){
  const {data,error}=await db.rpc("catalog_search",{
    p_search:options.search||"",p_category:options.category||"",p_author:options.author||"",
    p_page:options.page||1,p_size:options.size||20,p_sort:options.sort||"title"
  });
  if(error){
    console.error("[catalog_search]",{code:error.code,message:error.message});
    throw new Error("Não foi possível carregar o acervo. Tente novamente.");
  }
  return data as {books:Book[];total:number;page:number};
}

export async function catalogAuthors(db:SupabaseClient){
  const {data,error}=await db.rpc("catalog_authors");
  if(error){console.error("[catalog_authors]",{code:error.code,message:error.message});return [] as string[];}
  return data as string[];
}
