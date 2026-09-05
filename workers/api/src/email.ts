import type { Env } from './types';
import { normalizeEmail } from './security';

export interface OperationalRecipient { email: string; display_name?: string | null; enabled: boolean; event_types: string[]; }

export function buildNewOrderRecipients(superAdminEmail: string, configured: OperationalRecipient[]): string[] {
  const addresses = new Set<string>();
  addresses.add(normalizeEmail(superAdminEmail));
  for (const recipient of configured) {
    if (!recipient.enabled || !recipient.event_types.includes('new_order')) continue;
    addresses.add(normalizeEmail(recipient.email));
  }
  return [...addresses].filter(Boolean);
}

export async function sendTransactionalEmail(env: Env, recipients: string[], subject: string, html: string, idempotencyKey: string): Promise<{ providerMessageId?: string }> {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured');
  if (!recipients.length) throw new Error('No email recipients configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ from: 'DosaToppings <orders@dosatoppings.in>', to: recipients, subject, html })
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Email provider failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  const result = await response.json() as { id?: string };
  return { providerMessageId: result.id };
}

export function newOrderEmailHtml(order: { orderNumber: string; customerName: string; totalRupees: string; paymentStatus: string; adminUrl?: string }): string {
  const safe = (value: string) => value.replace(/[&<>\"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[char]!));
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5"><h2>New DosaToppings Order</h2><p><strong>Order:</strong> ${safe(order.orderNumber)}</p><p><strong>Customer:</strong> ${safe(order.customerName)}</p><p><strong>Total:</strong> ₹${safe(order.totalRupees)}</p><p><strong>Payment:</strong> ${safe(order.paymentStatus)}</p>${order.adminUrl ? `<p><a href="${safe(order.adminUrl)}">Open order in Admin</a></p>` : ''}<hr><small>Developed by Naveen — naveenshankar.in</small></body></html>`;
}

// New-order mail is now delivered by the durable notification outbox scheduler.
// Keep this compatibility function because the webhook handler may still call it on older builds.
export async function dispatchNewOrderEmail(_env: Env, _orderId: string, _eventId: string): Promise<void> {
  return;
}
