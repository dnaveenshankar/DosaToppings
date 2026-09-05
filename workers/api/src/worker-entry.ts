import base from './worker';
import { adminStaffRoute } from './adminStaff';
import { adminReviewsRoute } from './adminReviews';
import { reviewRoute } from './reviews';
import { getSupabaseUser } from './supabase';
import { resolveAuthContext } from './authorization';
import type { AuthContext } from './authz';
import type { Env } from './types';

interface ScheduledController { cron: string; scheduledTime: number; noRetry(): void; }
interface WorkerExecutionContext { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void; }

function withCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key, X-Requested-With');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  headers.set('Vary', 'Origin');
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function corsOrigin(request: Request): string {
  const origin = request.headers.get('Origin') || '';
  return origin === 'https://www.dosatoppings.in' || origin === 'https://admin.dosatoppings.in' || origin === 'https://bill.dosatoppings.in'
    ? origin : 'https://www.dosatoppings.in';
}

async function staffContext(request: Request, env: Env): Promise<AuthContext> {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) throw new Response('Unauthenticated', { status: 401 });
  const user = await getSupabaseUser(env, header.slice(7).trim());
  const ctx = await resolveAuthContext(env, user.id, user.email);
  if (!ctx.isActive) throw new Response('Account disabled', { status: 403 });
  return ctx;
}

export default {
  async fetch(request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = corsOrigin(request);

    if (url.pathname.startsWith('/v1/customer/reviews') || /^\/v1\/products\/[^/]+\/reviews$/.test(url.pathname)) {
      if (request.method === 'OPTIONS') return base.fetch(request, env, ctx);
      try {
        const auth = request.method === 'POST' ? await staffContext(request, env) : undefined;
        const result = await reviewRoute(request, env, auth);
        if (result) return withCors(result, origin);
      } catch (error) {
        if (error instanceof Response) return withCors(error, origin);
        return withCors(new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Review request failed' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        }), origin);
      }
    }

    if (url.pathname.startsWith('/v1/admin/staff') && request.method !== 'OPTIONS') {
      try {
        const result = await adminStaffRoute(request, env, await staffContext(request, env));
        if (result) return withCors(result, 'https://admin.dosatoppings.in');
      } catch (error) {
        if (error instanceof Response) return withCors(error, 'https://admin.dosatoppings.in');
        return withCors(new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Staff request failed' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        }), 'https://admin.dosatoppings.in');
      }
    }

    if (url.pathname.startsWith('/v1/admin/reviews') && request.method !== 'OPTIONS') {
      try {
        const result = await adminReviewsRoute(request, env, await staffContext(request, env));
        if (result) return withCors(result, 'https://admin.dosatoppings.in');
      } catch (error) {
        if (error instanceof Response) return withCors(error, 'https://admin.dosatoppings.in');
        return withCors(new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Review admin request failed' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        }), 'https://admin.dosatoppings.in');
      }
    }
    return base.fetch(request, env, ctx);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: WorkerExecutionContext) {
    return base.scheduled(controller, env, ctx);
  }
};
