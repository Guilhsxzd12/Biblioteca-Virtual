import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { exchangeGoogleCode } from "@/lib/google-drive";

export async function GET(request:NextRequest){
  const v=await getApiViewer();
  if(!v.user||v.profile?.role!=="admin")return NextResponse.redirect(new URL("/login",request.url));

  const code=request.nextUrl.searchParams.get("code");
  const state=request.nextUrl.searchParams.get("state");
  const expected=request.cookies.get("google_drive_oauth_state")?.value;

  if(!code||!state||!expected||state!==expected){
    console.error("[drive-oauth] state validation failed",{
      hasCode:Boolean(code),
      hasState:Boolean(state),
      hasExpected:Boolean(expected),
      stateMatches:Boolean(state&&expected&&state===expected),
      origin:request.nextUrl.origin,
    });
    return NextResponse.redirect(new URL("/admin?drive=erro-state",request.url));
  }

  try{
    console.info("[drive-oauth] exchanging code",{origin:request.nextUrl.origin});
    const tokens=await exchangeGoogleCode(code,request.nextUrl.origin);
    console.info("[drive-oauth] code exchanged",{hasRefreshToken:Boolean(tokens.refresh_token)});

    const admin=createAdminSupabaseClient();
    const {data:existing,error:selectError}=await admin.from("app_integrations").select("refresh_token").eq("provider","google_drive").maybeSingle();
    if(selectError)throw new Error(`Supabase select app_integrations: ${selectError.message}`);

    const refresh=tokens.refresh_token||existing?.refresh_token;
    if(!refresh)throw new Error("Google não retornou refresh token.");

    let email:string|null=null;
    const info=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{
      headers:{authorization:`Bearer ${tokens.access_token}`},
      cache:"no-store",
    });
    if(info.ok)email=(await info.json()).email||null;

    const {error}=await admin.from("app_integrations").upsert({
      provider:"google_drive",
      refresh_token:refresh,
      account_email:email,
      updated_at:new Date().toISOString(),
    });
    if(error)throw new Error(`Supabase upsert app_integrations: ${error.message}`);

    console.info("[drive-oauth] connection stored",{accountEmail:email});
    const response=NextResponse.redirect(new URL("/admin?drive=conectado",request.url));
    response.cookies.delete("google_drive_oauth_state");
    return response;
  }catch(error){
    console.error("[drive-oauth] callback failed",{
      message:error instanceof Error?error.message:String(error),
      origin:request.nextUrl.origin,
    });
    return NextResponse.redirect(new URL("/admin?drive=erro",request.url));
  }
}
