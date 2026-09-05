import app from './index';
import { authRoute } from './auth';
import { deliverNotificationBatch } from './notifications';
import { getSupabaseUser, supabaseAdminRest, supabaseRpc } from './supabase';
import { requirePermission } from './authz';
import { resolveAuthContext } from './authorization';
import type { AuthContext } from './authz';
import type { Env } from './types';

interface ScheduledController { cron: string; scheduledTime: number; noRetry(): void; }
interface WorkerExecutionContext { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void; }

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Response(`Invalid ${field}`, { status: 400 });
  return value;
}

async function staffContext(request: Request, env: Env): Promise<AuthContext> {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) throw new Response('Unauthenticated', { status: 401 });
  const user = await getSupabaseUser(env, header.slice(7).trim());
  const ctx = await resolveAuthContext(env, user.id, user.email);
  if (!ctx.isActive) throw new Response('Account disabled', { status: 403 });
  return ctx;
}

async function adminRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/admin/refunds')) return null;
  const ctx = await staffContext(request, env);
  requirePermission(ctx, 'billing.refund');

  if (request.method === 'GET' && url.pathname === '/v1/admin/refunds') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 100);
    const status = url.searchParams.get('status');
    const filter = status ? `&status=eq.${encodeURIComponent(status)}` : '';
    const rows = await supabaseAdminRest<any[]>(env, `refund_requests?select=id,order_id,payment_id,amount_paise,reason,status,requested_by,approved_by,provider_refund_id,last_error,created_at,updated_at&order=created_at.desc&limit=${limit}${filter}`);
    return json({ ok: true, refunds: rows });
  }

  if (request.method === 'POST' && url.pathname === '/v1/admin/refunds') {
    const body = await request.json() as { order_id?: unknown; amount_paise?: unknown; reason?: unknown };
    const key = request.headers.get('Idempotency-Key');
    if (!key || key.length < 16 || key.length > 128) throw new Response('Valid Idempotency-Key is required', { status: 400 });
    if (!Number.isInteger(body.amount_paise) || Number(body.amount_paise) < 100) throw new Response('Refund must be at least ₹1', { status: 400 });
    return json(await supabaseRpc(env, 'request_refund_atomic', {
      p_order_id: uuid(body.order_id, 'order_id'), p_actor: ctx.userId, p_amount_paise: Number(body.amount_paise),
      p_reason: typeof body.reason === 'string' ? body.reason.slice(0, 1000) : null, p_idempotency_key: key
    }), 201);
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length === 5 && parts[0] === 'v1' && parts[1] === 'admin' && parts[2] === 'refunds' && parts[4] === 'approve' && request.method === 'POST') {
    return json(await supabaseRpc(env, 'approve_refund_atomic', { p_refund_id: uuid(parts[3], 'refund_id'), p_actor: ctx.userId }));
  }
  return null;
}

async function processRefunds(env: Env) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return;
  const rows = await supabaseAdminRest<Array<{ id: string; payment_id: string; amount_paise: number }>>(env, 'refund_requests?select=id,payment_id,amount_paise&status=in.(approved,processing)&order=created_at.asc&limit=10');
  const credentials = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
  for (const row of rows) {
    try {
      const refund = await supabaseRpc<any>(env, 'start_refund_atomic', { p_refund_id: row.id });
      const payments = await supabaseAdminRest<Array<{ provider_payment_id: string | null }>>(env, `payments?select=provider_payment_id&id=eq.${encodeURIComponent(row.payment_id)}&limit=1`);
      const paymentId = payments[0]?.provider_payment_id;
      if (!paymentId || !paymentId.startsWith('pay_')) throw new Error('Razorpay payment id is unavailable');
      const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
        method: 'POST',
        headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json', 'X-Refund-Idempotency': `dt-refund-${refund.id}` },
        body: JSON.stringify({ amount: row.amount_paise, receipt: `DT-${refund.id}` })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Razorpay refund failed (${response.status}): ${JSON.stringify(payload).slice(0, 800)}`);
      await supabaseRpc(env, 'finish_refund_atomic', { p_refund_id: row.id, p_success: true, p_provider_refund_id: payload.id || null, p_provider_payload: payload });
    } catch (error) {
      await supabaseRpc(env, 'finish_refund_atomic', { p_refund_id: row.id, p_success: false, p_error: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response> {
    const auth = await authRoute(request, env);
    if (auth) return auth;
    const admin = await adminRoute(request, env);
    if (admin) return admin;
    return app.fetch(request, env, ctx);
  },

  async scheduled(controller: ScheduledController, env: Env, _ctx: WorkerExecutionContext) {
    if (controller.cron !== '*/5 * * * *') return;
    const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRole) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
    const authHeaders = { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` };

    const superAdminRows = await fetch(`${env.SUPABASE_URL}/rest/v1/staff_roles?select=user_id&role=eq.super_admin`, { headers: authHeaders }).then(async response => {
      if (!response.ok) throw new Error(`Unable to load super admin roles (${response.status})`);
      return response.json() as Promise<Array<{ user_id: string }>>;
    });
    const superAdminIds = superAdminRows.map(row => row.user_id);
    if (superAdminIds.length) {
      const profiles = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?select=id,email,is_active&id=in.(${superAdminIds.join(',')})&is_active=eq.true`, { headers: authHeaders }).then(async response => {
        if (!response.ok) throw new Error(`Unable to load super admin profiles (${response.status})`);
        return response.json() as Promise<Array<{ id: string; email: string | null; is_active: boolean }>>;
      });
      const superAdminEmail = profiles.find(profile => profile.email)?.email || '';
      if (superAdminEmail) {
        const configured = await fetch(`${env.SUPABASE_URL}/rest/v1/notification_recipients?select=email,display_name,enabled,event_types&enabled=eq.true`, { headers: authHeaders }).then(async response => {
          if (!response.ok) throw new Error(`Unable to load notification recipients (${response.status})`);
          return response.json() as Promise<Array<{ email: string; display_name: string | null; enabled: boolean; event_types: string[] }>>;
        });
        await deliverNotificationBatch(env, superAdminEmail, configured.filter(item => item.event_types?.includes('new_order')));
      }
    }
    await processRefunds(env);
  }
};
