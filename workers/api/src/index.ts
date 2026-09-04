import type { AuthContext } from './authz';
import { requireIdempotencyKey, json, handleOptions } from './http';
import { getSupabaseUser, supabaseRpc } from './supabase';
import { calculateQuote } from './pricing';
import { resolveAuthContext } from './authorization';
import { sha256Hex, normalizeEmail, verifyRazorpaySignature } from './security';
import type { CheckoutInput, Env } from './types';

async function authContext(request: Request, env: Env): Promise<AuthContext> {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) throw new Response('Unauthenticated', { status: 401 });
  const token = header.slice(7).trim();
  if (!token) throw new Response('Unauthenticated', { status: 401 });
  const user = await getSupabaseUser(env, token);
  return resolveAuthContext(env, user.id, user.email);
}

function requireActiveCustomer(ctx: AuthContext): void {
  if (!ctx.isActive) throw new Response('Account disabled', { status: 403 });
}

function parseJsonBody<T>(value: unknown): T {
  if (!value || typeof value !== 'object') throw new Response('Invalid JSON body', { status: 400 });
  return value as T;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const options = handleOptions(request);
    if (options) return options;

    try {
      const url = new URL(request.url);

      if (request.method === 'GET' && url.pathname === '/health') {
        return json({ ok: true, service: 'dosatoppings-api' }, 200, origin);
      }

      if (request.method === 'POST' && url.pathname === '/v1/checkout/quote') {
        const ctx = await authContext(request, env);
        requireActiveCustomer(ctx);
        const body = parseJsonBody<CheckoutInput>(await request.json());
        const quote = await calculateQuote(env, body);
        return json({ ok: true, quote, customer_id: ctx.userId }, 200, origin);
      }

      if (request.method === 'POST' && url.pathname === '/v1/orders') {
        const ctx = await authContext(request, env);
        requireActiveCustomer(ctx);
        const idempotencyKey = requireIdempotencyKey(request);
        const body = parseJsonBody<CheckoutInput>(await request.json());
        const requestHash = await sha256Hex(JSON.stringify(body));

        // The SQL function re-reads prices and stock under transaction/advisory locks;
        // the browser-supplied quote or totals are never accepted as authoritative.
        const result = await supabaseRpc<Record<string, unknown>>(env, 'create_order_atomic', {
          p_actor_id: ctx.userId,
          p_idempotency_key: idempotencyKey,
          p_request_hash: requestHash,
          p_items: body.items,
          p_billing_address: null,
          p_shipping_address: null,
          p_coupon_code: body.coupon_code ?? null,
          p_referral_code: body.referral_code ?? null,
        });
        return json(result, 201, origin);
      }

      if (request.method === 'POST' && url.pathname === '/v1/payments/webhook/razorpay') {
        if (!env.RAZORPAY_WEBHOOK_SECRET) throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured');
        const signature = request.headers.get('X-Razorpay-Signature') || '';
        const rawBody = await request.text();
        if (!signature || !(await verifyRazorpaySignature(rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET))) {
          return json({ error: 'invalid_signature' }, 401, origin);
        }
        // Webhook parsing/reconciliation is the next payment integration step. Keeping
        // signature verification at the edge means untrusted webhook bodies never reach
        // the payment state machine without authentication.
        return json({ ok: true, accepted: true }, 202, origin);
      }

      if (request.method === 'GET' && url.pathname === '/v1/me') {
        const ctx = await authContext(request, env);
        return json({ user_id: ctx.userId, email: ctx.email ? normalizeEmail(ctx.email) : null, role: ctx.role ?? null, is_active: ctx.isActive }, 200, origin);
      }

      return json({ error: 'not_found' }, 404, origin);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error(error);
      return json({ error: 'internal_error' }, 500, origin);
    }
  },
};
