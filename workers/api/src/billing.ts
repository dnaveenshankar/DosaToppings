import type { Env } from './types';
import type { AuthContext } from './authz';
import { requirePermission, requireSuperAdminEmail } from './authz';
import { supabaseAdminRest, supabaseRpc } from './supabase';
import { sha256Hex } from './security';

export interface BillingLine { variant_id: string; quantity: number; }

export async function createPosSale(env: Env, ctx: AuthContext, lines: BillingLine[], paymentMethod: string, customerId?: string | null, idempotencyKey?: string) {
  requirePermission(ctx, 'billing.create');
  requireSuperAdminEmail(ctx);
  if (!lines.length || lines.length > 100) throw new Response('Invalid bill lines', { status: 400 });
  if (!['cash','upi','card','online'].includes(paymentMethod)) throw new Response('Invalid payment method', { status: 400 });
  if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128) throw new Response('Idempotency-Key required', { status: 400 });
  const requestBody = { lines, paymentMethod, customerId: customerId || null };
  const requestHash = await sha256Hex(JSON.stringify(requestBody));
  const result = await supabaseRpc<any>(env, 'create_pos_order_atomic', {
    p_staff_id: ctx.userId,
    p_customer_id: customerId || null,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    p_items: lines,
  });
  if (paymentMethod !== 'online') {
    await supabaseAdminRest(env, `payments?id=eq.${encodeURIComponent(result.payment_id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ provider_payment_id: `pos_${result.payment_id}`, method: paymentMethod, updated_at: new Date().toISOString() }),
    });
    await supabaseRpc(env, 'reconcile_payment_atomic', {
      p_provider_payment_id: `pos_${result.payment_id}`,
      p_provider_order_id: null,
      p_amount_paise: result.amount_paise,
      p_success: true,
      p_method: paymentMethod,
    });
  }
  return result;
}
