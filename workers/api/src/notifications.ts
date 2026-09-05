import type { Env } from './types';
import { supabaseRpc } from './supabase';
import { buildNewOrderRecipients, newOrderEmailHtml, sendTransactionalEmail, type OperationalRecipient } from './email';

interface OutboxRow { id:string; event_type:string; aggregate_type:string; aggregate_id:string; idempotency_key:string; payload:Record<string,unknown>; attempts:number; }

export async function enqueueNewOrderNotification(env: Env, orderId: string, payload: Record<string,unknown>) {
  return supabaseRpc(env,'enqueue_notification',{p_event_type:'new_order',p_aggregate_type:'order',p_aggregate_id:orderId,p_idempotency_key:`new_order:${orderId}`,p_payload:payload});
}

export async function deliverNotificationBatch(env: Env, superAdminEmail: string, configured: OperationalRecipient[], limit=20) {
  const rows=await supabaseRpc<OutboxRow[]>(env,'claim_notification_batch',{p_limit:limit});
  const results=[];
  for(const row of rows){
    try {
      if(row.event_type!=='new_order') { await supabaseRpc(env,'finish_notification',{p_id:row.id,p_status:'dead',p_error:'Unsupported notification event'}); results.push({id:row.id,status:'dead'}); continue; }
      const recipients=buildNewOrderRecipients(superAdminEmail,configured);
      const p=row.payload||{};
      const html=newOrderEmailHtml({orderNumber:String(p.order_number||row.aggregate_id),customerName:String(p.customer_name||'Customer'),totalRupees:String(p.total_rupees||'0.00'),paymentStatus:String(p.payment_status||'Paid'),adminUrl:typeof p.admin_url==='string'?p.admin_url:undefined});
      const sent=await sendTransactionalEmail(env,recipients,`New DosaToppings order ${String(p.order_number||row.aggregate_id)}`,html,row.idempotency_key);
      await supabaseRpc(env,'finish_notification',{p_id:row.id,p_status:'sent',p_provider_message_id:sent.providerMessageId||null});
      results.push({id:row.id,status:'sent'});
    } catch(error) {
      const message=error instanceof Error?error.message:String(error);
      await supabaseRpc(env,'finish_notification',{p_id:row.id,p_status:row.attempts>=8?'dead':'failed',p_error:message});
      results.push({id:row.id,status:row.attempts>=8?'dead':'failed'});
    }
  }
  return results;
}
