import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getTelegramBot,getTelegramWebhookInfo,setupTelegramWebhook,telegramWebhookUrl } from "@/lib/telegram";

export async function GET(){
  try{
    await requireAdmin();
    const [bot,webhookInfo]=await Promise.all([getTelegramBot(),getTelegramWebhookInfo()]);
    const expected=telegramWebhookUrl();
    const healthy=webhookInfo.url===expected&&!webhookInfo.last_error_message;
    return NextResponse.json({configured:true,bot,webhookInfo,healthy,expectedWebhook:expected});
  }
  catch(error){return NextResponse.json({configured:false,error:error instanceof Error?error.message:"Telegram não configurado."},{status:400});}
}

export async function POST(){
  try{await requireAdmin();const result=await setupTelegramWebhook();return NextResponse.json({ok:true,...result});}
  catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Não foi possível ativar o bot."},{status:400});}
}
