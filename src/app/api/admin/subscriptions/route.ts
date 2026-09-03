import { NextRequest,NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { activateSubscription,cancelSubscription } from "@/lib/subscription";
import { sendTelegramMessage,telegramMainKeyboard } from "@/lib/telegram";

function date(value:string){return new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(value));}

export async function GET(){
  try{
    await requireAdmin();const admin=createAdminSupabaseClient();
    const [{data:profiles,error:profilesError},{data:subscriptions,error:subsError},{data:telegram,error:telegramError}]=await Promise.all([
      admin.from("profiles").select("id,email,full_name,role,approved,created_at").order("created_at",{ascending:false}),
      admin.from("subscriptions").select("user_id,status,active_until,activated_at,note,updated_at"),
      admin.from("telegram_accounts").select("user_id,telegram_user_id,username,first_name,linked_at")
    ]);
    if(profilesError||subsError||telegramError)throw new Error(profilesError?.message||subsError?.message||telegramError?.message);
    const subMap=new Map((subscriptions||[]).map(s=>[s.user_id,s]));const tgMap=new Map((telegram||[]).map(t=>[t.user_id,t]));
    const rows=(profiles||[]).filter(p=>p.role!=="admin").map(p=>({profile:p,subscription:subMap.get(p.id)||null,telegram:tgMap.get(p.id)||null}));
    return NextResponse.json({rows});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Falha ao carregar assinaturas."},{status:400});}
}

export async function PATCH(request:NextRequest){
  try{
    const viewer=await requireAdmin();const body=await request.json();const userId=String(body.userId||"").trim();const action=String(body.action||"");
    if(!userId)return NextResponse.json({error:"Usuário obrigatório."},{status:400});
    const admin=createAdminSupabaseClient();let subscription;
    if(action==="activate"){
      subscription=await activateSubscription(userId,viewer.user.id,"Pagamento confirmado manualmente — 30 dias");
      const {data:tg}=await admin.from("telegram_accounts").select("chat_id").eq("user_id",userId).maybeSingle();
      if(tg?.chat_id)try{await sendTelegramMessage(tg.chat_id,`🎉 <b>Pagamento confirmado!</b>\n\nSua assinatura da Biblioteca Virtual está ativa.\n\n📅 <b>Início:</b> ${date(subscription.activated_at)}\n⏳ <b>Vencimento:</b> ${date(subscription.active_until)}\n🗓 <b>Período:</b> 30 dias\n\nSeu acesso a downloads, EPUB para Kindle e envios pelo bot já está liberado.`,telegramMainKeyboard());}catch(error){console.warn("[subscription-admin] aviso Telegram falhou",error);}
    }else if(action==="cancel"){
      subscription=await cancelSubscription(userId,viewer.user.id);
      const {data:tg}=await admin.from("telegram_accounts").select("chat_id").eq("user_id",userId).maybeSingle();
      if(tg?.chat_id)try{await sendTelegramMessage(tg.chat_id,"⚠️ <b>Assinatura desativada</b>\n\nSeu acesso aos recursos da Biblioteca Virtual foi desativado pelo administrador. Para renovar, consulte Minha Assinatura no bot.");}catch(error){console.warn("[subscription-admin] aviso Telegram falhou",error);}
    }else return NextResponse.json({error:"Ação inválida."},{status:400});
    return NextResponse.json({subscription});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Falha ao atualizar assinatura."},{status:400});}
}
