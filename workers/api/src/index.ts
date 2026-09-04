import type { AuthContext } from './authz';
import { requireIdempotencyKey, json, handleOptions } from './http';
import { getSupabaseUser } from './supabase';
import { calculateQuote } from './pricing';
import type { CheckoutInput, Env } from './types';

async function authContext(request: Request, env: Env): Promise<AuthContext> {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) throw new Response('Unauthenticated', { status: 401 });
  const token = header.slice(7).trim();
  if (!token) throw new Response('Unauthenticated', { status: 401 });
  const user = await getSupabaseUser(env, token);
  // Role/activity resolution is deliberately server-side. The implementation will
  // query the protected staff/profile records rather than trusting JWT role claims.
  return { userId: user.id, email: user.email, isActive: true };
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
        const body = await request.json() as CheckoutInput;
        const quote = await calculateQuote(env, body);
        return json({ ok: true, quote, customer_id: ctx.userId }, 200, origin);
      }

      if (request.method === 'POST' && url.pathname === '/v1/orders') {
        await authContext(request, env);
        const idempotencyKey = requireIdempotencyKey(request);
        // Order creation will atomically persist the authoritative quote, reserve/adjust
        // stock, create the payment intent and enqueue notification work. It is not wired
        // until the transaction functions and payment provider secrets exist.
        return json({ ok: false, error: 'order_creation_not_ready', idempotency_key: idempotencyKey }, 501, origin);
      }

      return json({ error: 'not_found' }, 404, origin);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error(error);
      return json({ error: 'internal_error' }, 500, origin);
    }
  },
};
