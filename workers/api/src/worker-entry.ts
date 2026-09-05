import base from './worker';
import { authRoute } from './auth';
import { adminStaffRoute } from './adminStaff';
import { adminReviewsRoute } from './adminReviews';
import { reviewRoute } from './reviews';
import { publicSiteContent, adminSiteContent } from './content';
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
  const token = header.slice(7).trim();
  if (!token) throw new Response('Unauthenticated', { status: 401 });
  const user = await getSupabaseUser(env, token);
  const ctx = await resolveAuthContext(env, user.id, user.email);
  if (!ctx.isActive) throw new Response('Account disabled', { status: 403 });
  return ctx;
}

async function handleJsonRoute(fn: () => Promise<Response>, origin: string, fallback: string): Promise<Response> {
  try { return withCors(await fn(), origin); }
  catch (error) {
    if (error instanceof Response) return withCors(error, origin);
    return withCors(new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : fallback }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    }), origin);
  }
}

function contextResponse(ctx: AuthContext): Response {
  return new Response(JSON.stringify({ ok: true, user_id: ctx.userId, email: ctx.email ?? null, role: ctx.role ?? null, is_active: ctx.isActive, permissions: ctx.permissions ?? [] }), {
    status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = corsOrigin(request);

    if (url.pathname === '/v1/site/content' && request.method === 'GET') {
      return handleJsonRoute(() => publicSiteContent(env, url.searchParams.get('key') || undefined), origin, 'Content request failed');
    }

    if (url.pathname === '/v1/admin/context' && request.method === 'GET') {
      return handleJsonRoute(async () => contextResponse(await staffContext(request, env)), 'https://admin.dosatoppings.in', 'Context request failed');
    }

    if (url.pathname.startsWith('/v1/admin/content')) {
      if (request.method === 'OPTIONS') return base.fetch(request, env, ctx);
      return handleJsonRoute(async () => adminSiteContent(request, env, await staffContext(request, env)), 'https://admin.dosatoppings.in', 'Content management failed');
    }

    if (url.pathname.startsWith('/v1/auth/')) {
      if (request.method === 'OPTIONS') return base.fetch(request, env, ctx);
      return handleJsonRoute(async () => (await authRoute(request, env)) ?? new Response('Not found', { status: 404 }), origin, 'Authentication failed');
    }

    if (url.pathname.startsWith('/v1/customer/reviews') || /^\/v1\/products\/[^/]+\/reviews$/.test(url.pathname)) {
      if (request.method === 'OPTIONS') return base.fetch(request, env, ctx);
      return handleJsonRoute(async () => {
        const auth = request.method === 'POST' ? await staffContext(request, env) : undefined;
        return (await reviewRoute(request, env, auth)) ?? new Response('Not found', { status: 404 });
      }, origin, 'Review request failed');
    }

    if (url.pathname.startsWith('/v1/admin/staff') && request.method !== 'OPTIONS') {
      return handleJsonRoute(async () => (await adminStaffRoute(request, env, await staffContext(request, env))) ?? new Response('Not found', { status: 404 }), 'https://admin.dosatoppings.in', 'Staff request failed');
    }

    if (url.pathname.startsWith('/v1/admin/reviews') && request.method !== 'OPTIONS') {
      return handleJsonRoute(async () => (await adminReviewsRoute(request, env, await staffContext(request, env))) ?? new Response('Not found', { status: 404 }), 'https://admin.dosatoppings.in', 'Review admin request failed');
    }

    return base.fetch(request, env, ctx);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: WorkerExecutionContext) {
    return base.scheduled(controller, env, ctx);
  }
};
