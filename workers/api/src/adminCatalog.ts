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

export async function adminCatalogRoute(request: Request, env: Env, ctx: AuthContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/admin/catalog')) return null;

  if (request.method === 'GET' && url.pathname === '/v1/admin/catalog/products') {
    requirePermission(ctx, 'products.read');
    const rows = await supabaseAdminRest<any[]>(env, 'products?select=id,category_id,name,slug,description,is_active,created_at,updated_at,product_variants(id,name,sku,price_paise,compare_at_price_paise,stock_threshold,is_active)&order=created_at.desc&limit=500');
    return json({ ok: true, products: rows });
  }

  if (request.method === 'GET' && url.pathname === '/v1/admin/catalog/categories') {
    requirePermission(ctx, 'categories.read');
    const rows = await supabaseAdminRest<any[]>(env, 'categories?select=id,name,slug,description,is_active,created_at,updated_at&order=name.asc&limit=500');
    return json({ ok: true, categories: rows });
  }

  if (request.method === 'POST' && url.pathname === '/v1/admin/catalog/products') {
    requirePermission(ctx, 'products.write');
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.name !== 'string' || !body.name.trim()) throw new Response('Product name is required', { status: 400 });
    const inserted = await supabaseAdminRest<any[]>(env, 'products', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: { category_id: body.category_id ? uuid(body.category_id, 'category_id') : null, name: body.name.trim().slice(0, 200), slug: typeof body.slug === 'string' ? body.slug.trim().toLowerCase().slice(0, 200) : null, description: typeof body.description === 'string' ? body.description.slice(0, 5000) : null, is_active: body.is_active !== false }
    });
    return json({ ok: true, product: inserted[0] ?? null }, 201);
  }

  if (request.method === 'PATCH' && /^\/v1\/admin\/catalog\/products\/[^/]+$/.test(url.pathname)) {
    requirePermission(ctx, 'products.write');
    const id = uuid(url.pathname.split('/')[5], 'product_id');
    const body = await request.json() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of ['name','slug','description','is_active','category_id']) {
      if (key in body) patch[key] = key === 'category_id' && body[key] !== null ? uuid(body[key], 'category_id') : body[key];
    }
    const rows = await supabaseAdminRest<any[]>(env, `products?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: patch });
    return json({ ok: true, product: rows[0] ?? null });
  }

  if (request.method === 'POST' && url.pathname === '/v1/admin/catalog/inventory-adjust') {
    requirePermission(ctx, 'inventory.adjust');
    const body = await request.json() as { variant_id?: unknown; quantity_delta?: unknown; reason?: unknown };
    if (!Number.isInteger(body.quantity_delta) || Number(body.quantity_delta) === 0) throw new Response('Invalid quantity_delta', { status: 400 });
    const result = await supabaseRpc(env, 'adjust_inventory_atomic', { p_variant_id: uuid(body.variant_id, 'variant_id'), p_quantity_delta: Number(body.quantity_delta), p_reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : null, p_actor: ctx.userId });
    return json({ ok: true, movement: result });
  }

  return json({ error: 'unsupported_catalog_route' }, 404);
}
