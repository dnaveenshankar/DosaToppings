import type { Env } from './types';
import type { AuthContext } from './authz';
import { requirePermission, requireSuperAdminEmail } from './authz';
import { supabaseAdminRest, supabaseRpc } from './supabase';

export interface BillingLine { variant_id: string; quantity: number; }

export async function createPosSale(env: Env, ctx: AuthContext, lines: BillingLine[], paymentMethod: string, customerId?: string | null) {
  requirePermission(ctx, 'billing.create');
  requireSuperAdminEmail(ctx);
  if (!lines.length || lines.length > 100) throw new Response('Invalid bill lines', { status: 400 });
  if (!['cash','upi','card','online'].includes(paymentMethod)) throw new Response('Invalid payment method', { status: 400 });

  // Reuse the same authoritative order engine used by the storefront. POS must never
  // calculate a final amount in the browser. The actor is the individual billing staff user.
  const key = crypto.randomUUID() + crypto.randomUUID();
  const result = await supabaseRpc<any>(env, 'create_order_atomic', {
    p_actor_id: customerId || ctx.userId,
    p_idempotency_key: key,
    p_request_hash: await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ lines, paymentMethod, customerId: customerId || null }))).then((b) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2,'0')).join('')),
    p_items: lines,
    p_billing_address: null,
    p_shipping_address: null,
    p_coupon_code: null,
    p_referral_code: null,
  });

  if (paymentMethod !== 'online') {
    await supabaseAdminRest(env, `payments?id=eq.${encodeURIComponent(result.payment_id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'paid', method: paymentMethod, updated_at: new Date().toISOString() }),
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
