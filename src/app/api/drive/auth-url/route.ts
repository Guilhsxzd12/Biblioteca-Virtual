import { NextRequest,NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getApiViewer } from "@/lib/auth";
import { makeGoogleAuthUrl } from "@/lib/google-drive";
export async function GET(request:NextRequest){ const v=await getApiViewer(); if(!v.user||v.profile?.role!=="admin")return NextResponse.json({error:"Acesso negado."},{status:403}); try{ const state=randomBytes(24).toString("hex"); const response=NextResponse.json({url:makeGoogleAuthUrl(request.nextUrl.origin,state)}); response.cookies.set("google_drive_oauth_state",state,{httpOnly:true,sameSite:"lax",secure:request.nextUrl.protocol==="https:",maxAge:600,path:"/"}); return response; }catch(e){ return NextResponse.json({error:e instanceof Error?e.message:"Google OAuth não configurado."},{status:503}); } }
