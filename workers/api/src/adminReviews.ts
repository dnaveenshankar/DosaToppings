import type { Env } from './types';
import type { AuthContext } from './authz';
import { requirePermission } from './authz';
import { supabaseAdminRest, supabaseRpc } from './supabase';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Response(`Invalid ${field}`, { status: 400 });
  return value;
}

export async function adminReviewsRoute(request: Request, env: Env, ctx: AuthContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/admin/reviews')) return null;
  requirePermission(ctx, 'reviews.moderate');

  if (request.method === 'GET' && url.pathname === '/v1/admin/reviews') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500);
    const published = url.searchParams.get('published');
    const filter = published === null ? '' : `&is_published=eq.${published === 'true'}`;
    const rows = await supabaseAdminRest<any[]>(env, `reviews?select=id,product_id,customer_id,order_id,rating,title,body,is_verified_purchase,is_published,created_at,updated_at,products(name),profiles(display_name,email)&order=created_at.desc&limit=${limit}${filter}`);
    return json({ ok: true, reviews: rows });
  }

  if (request.method === 'POST' && /^\/v1\/admin\/reviews\/[^/]+\/moderate$/.test(url.pathname)) {
    const reviewId = uuid(url.pathname.split('/')[4], 'review_id');
    const body = await request.json() as { is_published?: unknown };
    if (typeof body.is_published !== 'boolean') throw new Response('is_published must be boolean', { status: 400 });
    const review = await supabaseRpc(env, 'moderate_review_atomic', { p_review_id: reviewId, p_actor: ctx.userId, p_is_published: body.is_published });
    return json({ ok: true, review });
  }

  return json({ error: 'unsupported_review_route' }, 404);
}
