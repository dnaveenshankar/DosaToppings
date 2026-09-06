import { requirePermission } from './authz';
import { supabaseAdminRest, supabaseRpc } from './supabase';
import type { AuthContext } from './authz';
import type { Env } from './types';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Response(`Invalid ${field}`, { status: 400 });
  }
  return value;
}

export async function adminRefundsRoute(request: Request, env: Env, ctx: AuthContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/admin/refunds')) return null;
  requirePermission(ctx, 'billing.refund');

  if (request.method === 'GET' && url.pathname === '/v1/admin/refunds') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500);
    const status = url.searchParams.get('status');
    const filter = status ? `&status=eq.${encodeURIComponent(status)}` : '';
    const rows = await supabaseAdminRest<any[]>(env, `refund_requests?select=id,order_id,payment_id,amount_paise,reason,status,requested_by,approved_by,provider_refund_id,last_error,attempt_count,next_attempt_at,created_at,updated_at&order=created_at.desc&limit=${limit}${filter}`);
    return json({ ok: true, refunds: rows });
  }

  if (request.method === 'POST' && url.pathname === '/v1/admin/refunds') {
    const body = await request.json() as { order_id?: unknown; amount_paise?: unknown; reason?: unknown };
    const key = request.headers.get('Idempotency-Key');
    if (!key || key.length < 16 || key.length > 128) throw new Response('Valid Idempotency-Key is required', { status: 400 });
    if (!Number.isInteger(body.amount_paise) || Number(body.amount_paise) < 100) throw new Response('Refund must be at least ₹1', { status: 400 });
    return json(await supabaseRpc(env, 'request_refund_atomic', {
      p_order_id: uuid(body.order_id, 'order_id'),
      p_actor: ctx.userId,
      p_amount_paise: Number(body.amount_paise),
      p_reason: typeof body.reason === 'string' ? body.reason.slice(0, 1000) : null,
      p_idempotency_key: key,
    }), 201);
  }

  const match = url.pathname.match(/^\/v1\/admin\/refunds\/([^/]+)\/approve$/);
  if (request.method === 'POST' && match) {
    return json(await supabaseRpc(env, 'approve_refund_atomic', {
      p_refund_id: uuid(match[1], 'refund_id'),
      p_actor: ctx.userId,
    }));
  }

  return json({ ok: false, error: 'Not found' }, 404);
}
