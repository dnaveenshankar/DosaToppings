import base from './worker';
import { authRoute } from './auth';
import { adminStaffRoute } from './adminStaff';
import { adminReviewsRoute } from './adminReviews';
import { reviewRoute } from './reviews';
import { publicSiteContent, adminSiteContent } from './content';
import { adminCatalogRoute } from './adminCatalog';
import { dashboardSummary, setOrderStatus, adjustInventory } from './ops';
import { getSupabaseUser, supabaseAdminRest } from './supabase';
import { resolveAuthContext } from './authorization';
import { requirePermission } from './authz';
import type { AuthContext } from './authz';
import type { Env } from './types';

interface ScheduledController { cron: string; scheduledTime: number; noRetry(): void; }
interface WorkerExecutionContext { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void; }

function withCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers); headers.set('Access-Control-Allow-Origin', origin); headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key, X-Requested-With'); headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS'); headers.set('Vary', 'Origin'); headers.set('Cache-Control', 'no-store'); return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function corsOrigin(request: Request): string { const origin = request.headers.get('Origin') || ''; return origin === 'https://www.dosatoppings.in' || origin === 'https://admin.dosatoppings.in' || origin === 'https://bill.dosatoppings.in' ? origin : 'https://www.dosatoppings.in'; }
async function staffContext(request: Request, env: Env): Promise<AuthContext> { const header = request.headers.get('Authorization') || ''; if (!header.startsWith('Bearer ')) throw new Response('Unauthenticated', { status: 401 }); const token = header.slice(7).trim(); if (!token) throw new Response('Unauthenticated', { status: 401 }); const user = await getSupabaseUser(env, token); const ctx = await resolveAuthContext(env, user.id, user.email); if (!ctx.isActive) throw new Response('Account disabled', { status: 403 }); return ctx; }
async function handleJsonRoute(fn: () => Promise<Response>, origin: string, fallback: string): Promise<Response> { try { return withCors(await fn(), origin); } catch (error) { if (error instanceof Response) return withCors(error, origin); return withCors(new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : fallback }), { status: 400, headers: { 'Content-Type': 'application/json' } }), origin); } }
function contextResponse(ctx: AuthContext): Response { return new Response(JSON.stringify({ ok: true, user_id: ctx.userId, email: ctx.email ?? null, role: ctx.role ?? null, is_active: ctx.isActive, permissions: ctx.permissions ?? [] }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }

async function adminOperationsRoute(request: Request, env: Env, ctx: AuthContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/admin/')) return null;
  if (request.method === 'GET' && url.pathname === '/v1/admin/dashboard') { requirePermission(ctx, 'reports.read'); return new Response(JSON.stringify({ ok: true, summary: await dashboardSummary(env) }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }
  if (request.method === 'GET' && url.pathname === '/v1/admin/orders') { requirePermission(ctx, 'orders.read'); const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500); const status = url.searchParams.get('status'); const filter = status ? `&status=eq.${encodeURIComponent(status)}` : ''; const rows = await supabaseAdminRest<any[]>(env, `orders?select=id,user_id,status,total_paise,currency,payment_id,shipping_address_snapshot,billing_address_snapshot,created_at,updated_at&order=created_at.desc&limit=${limit}${filter}`); return new Response(JSON.stringify({ ok: true, orders: rows }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }
  const statusMatch = url.pathname.match(/^\/v1\/admin\/orders\/([^/]+)\/status$/); if (request.method === 'POST' && statusMatch) { requirePermission(ctx, 'orders.update'); const body = await request.json() as { status?: unknown; reason?: unknown }; if (typeof body.status !== 'string' || !body.status.trim()) throw new Response('status is required', { status: 400 }); return new Response(JSON.stringify({ ok: true, result: await setOrderStatus(env, ctx, statusMatch[1], body.status.trim(), typeof body.reason === 'string' ? body.reason.slice(0, 500) : undefined) }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }
  if (request.method === 'POST' && url.pathname === '/v1/admin/inventory/adjust') { requirePermission(ctx, 'inventory.adjust'); const body = await request.json() as { variant_id?: unknown; quantity?: unknown; reason?: unknown }; if (typeof body.variant_id !== 'string' || !body.variant_id) throw new Response('variant_id is required', { status: 400 }); if (!Number.isInteger(body.quantity) || Number(body.quantity) === 0) throw new Response('quantity must be a non-zero integer', { status: 400 }); return new Response(JSON.stringify({ ok: true, result: await adjustInventory(env, ctx, body.variant_id, Number(body.quantity), typeof body.reason === 'string' ? body.reason.slice(0, 500) : '') }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }
  return null;
}

export default {
  async fetch(request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response> {
    const url = new URL(request.url); const origin = corsOrigin(request);
    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), origin);
    if (url.pathname === '/v1/site/content' && request.method === 'GET') return handleJsonRoute(() => publicSiteContent(env, url.searchParams.get('key') || undefined), origin, 'Content request failed');
    if (url.pathname === '/v1/admin/context' && request.method === 'GET') return handleJsonRoute(async () => contextResponse(await staffContext(request, env)), 'https://admin.dosatoppings.in', 'Context request failed');
    if (url.pathname.startsWith('/v1/admin/content')) return handleJsonRoute(async () => adminSiteContent(request, env, await staffContext(request, env)), 'https://admin.dosatoppings.in', 'Content management failed');
    if (url.pathname.startsWith('/v1/auth/')) return handleJsonRoute(async () => (await authRoute(request, env)) ?? new Response('Not found', { status: 404 }), origin, 'Authentication failed');
    if (url.pathname.startsWith('/v1/customer/reviews') || /^\/v1\/products\/[^/]+\/reviews$/.test(url.pathname)) return handleJsonRoute(async () => (await reviewRoute(request, env, request.method === 'POST' ? await staffContext(request, env) : undefined)) ?? new Response('Not found', { status: 404 }), origin, 'Review request failed');
    if (url.pathname.startsWith('/v1/admin/staff')) return handleJsonRoute(async () => (await adminStaffRoute(request, env, await staffContext(request, env))) ?? new Response('Not found', { status: 404 }), 'https://admin.dosatoppings.in', 'Staff request failed');
    if (url.pathname.startsWith('/v1/admin/reviews')) return handleJsonRoute(async () => (await adminReviewsRoute(request, env, await staffContext(request, env))) ?? new Response('Not found', { status: 404 }), 'https://admin.dosatoppings.in', 'Review admin request failed');
    if (url.pathname.startsWith('/v1/admin/catalog')) return handleJsonRoute(async () => (await adminCatalogRoute(request, env, await staffContext(request, env))) ?? new Response('Not found', { status: 404 }), 'https://admin.dosatoppings.in', 'Catalog request failed');
    if (url.pathname.startsWith('/v1/admin/')) return handleJsonRoute(async () => (await adminOperationsRoute(request, env, await staffContext(request, env))) ?? new Response('Not found', { status: 404 }), 'https://admin.dosatoppings.in', 'Admin operation failed');
    return base.fetch(request, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: WorkerExecutionContext) { return base.scheduled(controller, env, ctx); }
};
