import type { Env } from './types';
import type { AuthContext } from './authz';
import { supabaseAdminRest, supabaseRpc } from './supabase';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Response(`Invalid ${field}`, { status: 400 });
  return value;
}

export async function reviewRoute(request: Request, env: Env, ctx?: AuthContext): Promise<Response | null> {
  const url = new URL(request.url);
  const productMatch = url.pathname.match(/^\/v1\/products\/([0-9a-f-]{36})\/reviews$/i);
  if (request.method === 'GET' && productMatch) {
    const productId = uuid(productMatch[1], 'product_id');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 50);
    const rows = await supabaseAdminRest<any[]>(env, `reviews?select=id,rating,title,body,is_verified_purchase,created_at,profiles(display_name)&product_id=eq.${encodeURIComponent(productId)}&is_published=eq.true&order=created_at.desc&limit=${limit}`);
    return json({ ok: true, reviews: rows });
  }

  if (request.method === 'POST' && url.pathname === '/v1/customer/reviews') {
    if (!ctx?.isActive) throw new Response('Unauthenticated', { status: 401 });
    const body = await request.json() as { product_id?: unknown; order_id?: unknown; rating?: unknown; title?: unknown; body?: unknown };
    if (!Number.isInteger(body.rating) || Number(body.rating) < 1 || Number(body.rating) > 5) throw new Response('Invalid rating', { status: 400 });
    const result = await supabaseRpc(env, 'submit_review_atomic', {
      p_customer: ctx.userId, p_product_id: uuid(body.product_id, 'product_id'), p_order_id: uuid(body.order_id, 'order_id'),
      p_rating: Number(body.rating), p_title: typeof body.title === 'string' ? body.title.slice(0, 160) : null,
      p_body: typeof body.body === 'string' ? body.body.slice(0, 3000) : null
    });
    return json({ ok: true, review: result }, 201);
  }

  return null;
}
