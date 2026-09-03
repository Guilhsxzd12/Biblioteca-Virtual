import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const CANONICAL_ORIGIN="https://biblioteca-virtual-umber.vercel.app";

export async function proxy(request: NextRequest) {
  const configured=(process.env.NEXT_PUBLIC_SITE_URL||CANONICAL_ORIGIN).replace(/\/$/,"");
  const canonical=new URL(configured);
  const host=request.headers.get("host")||"";
  const isVercelAlias=host.endsWith(".vercel.app")&&host!==canonical.host;
  if(process.env.VERCEL_ENV==="production"&&isVercelAlias){
    const destination=new URL(request.nextUrl.pathname+request.nextUrl.search,canonical);
    return NextResponse.redirect(destination,308);
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
