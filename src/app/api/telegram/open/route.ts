import { NextRequest,NextResponse } from "next/server";
import { getTelegramBot } from "@/lib/telegram";

export async function GET(request:NextRequest){
  try{
    const bot=await getTelegramBot();
    if(!bot.username)return NextResponse.redirect(new URL("/ajuda",request.url));
    return NextResponse.redirect(`https://t.me/${bot.username}`);
  }catch{
    return NextResponse.redirect(new URL("/ajuda",request.url));
  }
}
