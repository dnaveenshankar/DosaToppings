import type { Env } from './types';
import { normalizeEmail } from './security';
import { supabaseAdminRest } from './supabase';

export interface OperationalRecipient {
  email: string;
  display_name?: string | null;
  enabled: boolean;
  event_types: string[];
}

export function buildNewOrderRecipients(superAdminEmail: string, configured: OperationalRecipient[]): string[] {
  const addresses = new Set<string>();
  addresses.add(normalizeEmail(superAdminEmail));
  for (const recipient of configured) {
    if (!recipient.enabled || !recipient.event_types.includes('new_order')) continue;
    addresses.add(normalizeEmail(recipient.email));
  }
  return [...addresses];
}

export async function sendTransactionalEmail(env: Env, recipients: string[], subject: string, html: string, idempotencyKey: string): Promise<{ providerMessageId?: string }> {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured');
  if (!recipients.length) throw new Error('No email recipients configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ from: 'DosaToppings <orders@dosatoppings.in>', to: recipients, subject, html }),
  });
  if (!response.ok) { const detail = await response.text(); throw new Error(`Email provider failed (${response.status}): ${detail.slice(0, 500)}`); }
  return response.json() as Promise<{ providerMessageId?: string }>;
}

export function newOrderEmailHtml(order: { orderNumber: string; customerName: string; totalRupees: string; paymentStatus: string; adminUrl?: string }): string {
  const safe = (value: string) => value.replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[char]!));
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5"><h2>New DosaToppings Order</h2><p><strong>Order:</strong> ${safe(order.orderNumber)}</p><p><strong>Customer:</strong> ${safe(order.customerName)}</p><p><strong>Total:</strong> ₹${safe(order.totalRupees)}</p><p><strong>Payment:</strong> ${safe(order.paymentStatus)}</p>${order.adminUrl ? `<p><a href="${safe(order.adminUrl)}">Open order in Admin</a></p>` : ''}<hr><small>Developed by Naveen — naveenshankar.in</small></body></html>`;
}

export async function dispatchNewOrderEmail(env: Env, orderId: string, eventId: string): Promise<void> {
  const [orders, roles, configured] = await Promise.all([
    supabaseAdminRest<any[]>(env, `orders?select=id,order_number,total_paise,customer_id,status&id=eq.${encodeURIComponent(orderId)}&limit=1`),
    supabaseAdminRest<any[]>(env, 'staff_roles?select=user_id&role=eq.super_admin&limit=20'),
    supabaseAdminRest<OperationalRecipient[]>(env, 'notification_recipients?select=email,display_name,enabled,event_types&enabled=eq.true&limit=200'),
  ]);
  const order = orders[0];
  if (!order || order.status !== 'paid') return;
  const ids = roles.map((r) => r.user_id).filter((id): id is string => typeof id === 'string');
  if (!ids.length) throw new Error('No Super Admin is configured');
  const admins = await supabaseAdminRest<any[]>(env, `profiles?select=id,email,display_name,is_active&id=in.(${ids.join(',')})&is_active=eq.true&limit=20`);
  const adminEmails = admins.map((a) => normalizeEmail(a.email)).filter(Boolean);
  if (!adminEmails.length) throw new Error('No active Super Admin email is configured');
  const recipients = buildNewOrderRecipients(adminEmails[0], configured);
  const eventKey = `new_order:${eventId}`;
  const existing = await supabaseAdminRest<any[]>(env, `notifications?select=id,status&event_key=eq.${encodeURIComponent(eventKey)}&limit=1`);
  if (existing.length && existing[0].status === 'sent') return;
  if (!existing.length) {
    await supabaseAdminRest(env, 'notifications', { method:'POST', headers:{Prefer:'return=minimal,resolution=ignore-duplicates'}, body:JSON.stringify({event_key:eventKey,event_type:'new_order',order_id:orderId,recipients,status:'processing',attempts:1}) });
  }
  try {
    const customer = order.customer_id ? await supabaseAdminRest<any[]>(env, `profiles?select=display_name&id=eq.${encodeURIComponent(order.customer_id)}&limit=1`) : [];
    const customerName = customer[0]?.display_name || 'Customer';
    const result = await sendTransactionalEmail(env, recipients, `New order ${order.order_number} — DosaToppings`, newOrderEmailHtml({orderNumber:order.order_number,customerName,totalRupees:(Number(order.total_paise)/100).toFixed(2),paymentStatus:'Paid',adminUrl:env.APP_BASE_URL ? `${env.APP_BASE_URL.replace(/\/$/,'')}/orders/${order.id}` : undefined}), `dosatoppings:${eventKey}`);
    await supabaseAdminRest(env, `notifications?event_key=eq.${encodeURIComponent(eventKey)}`, { method:'PATCH', headers:{Prefer:'return=minimal'}, body:JSON.stringify({status:'sent',provider_message_id:result.providerMessageId ?? null,last_error:null,updated_at:new Date().toISOString()}) });
  } catch (error) {
    await supabaseAdminRest(env, `notifications?event_key=eq.${encodeURIComponent(eventKey)}`, { method:'PATCH', headers:{Prefer:'return=minimal'}, body:JSON.stringify({status:'failed',last_error:error instanceof Error ? error.message.slice(0,500) : 'email_failed',next_attempt_at:new Date(Date.now()+900000).toISOString(),updated_at:new Date().toISOString()}) }).catch(() => undefined);
    throw error;
  }
}
