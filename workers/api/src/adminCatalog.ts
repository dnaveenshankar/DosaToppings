import type { Env } from './types';
import type { AuthContext, Permission } from './authz';
import { requirePermission } from './authz';
import { supabaseAdminRest, supabaseRpc } from './supabase';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') throw new Response('Invalid text field', { status: 400 });
  const v = value.trim();
  if (!v || v.length > max) throw new Response('Invalid text field', { status: 400 });
  return v;
}

function optionalText(value: unknown, max: number): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new Response('Invalid text field', { status: 400 });
  return value.trim().slice(0, max) || null;
}

function slug(value: unknown): string {
  const v = text(value, 80).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!v) throw new Response('Invalid slug', { status: 400 });
  return v;
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Response(`Invalid ${field}`, { status: 400 });
  return value;
}

function integer(value: unknown, field: string, min = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < min) throw new Response(`Invalid ${field}`, { status: 400 });
  return Number(value);
}

function guard(ctx: AuthContext, permission: Permission) { requirePermission(ctx, permission); }

export async function adminCatalogRoute(request: Request, env: Env, ctx: AuthContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/admin/catalog')) return null;
  if (request.method === 'GET') guard(ctx, 'products.read');
  else guard(ctx, 'products.write');

  if (request.method === 'GET' && url.pathname === '/v1/admin/catalog/products') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500);
    const rows = await supabaseAdminRest<any[]>(env, `products?select=id,name,slug,short_description,description,image_url,sku,is_published,is_bestseller,is_featured,category_id,created_at,updated_at,product_variants(id,name,sku,price_paise,compare_at_price_paise,stock_threshold,is_active,created_at,updated_at),categories(id,name,slug)&order=created_at.desc&limit=${limit}`);
    return json({ ok: true, products: rows });
  }

  if (request.method === 'GET' && url.pathname === '/v1/admin/catalog/categories') {
    const rows = await supabaseAdminRest<any[]>(env, 'categories?select=id,name,slug,description,sort_order,is_published,created_at,updated_at&order=sort_order.asc,name.asc&limit=500');
    return json({ ok: true, categories: rows });
  }

  if (request.method === 'POST' && url.pathname === '/v1/admin/catalog/categories') {
    const body = await request.json() as Record<string, unknown>;
    const row = await supabaseAdminRest<any[]>(env, 'categories', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
      name: text(body.name, 120), slug: slug(body.slug ?? body.name), description: optionalText(body.description, 1000),
      sort_order: integer(body.sort_order ?? 0, 'sort_order'), is_published: body.is_published === true
    }) });
    await supabaseRpc(env, 'write_audit_log', { p_actor: ctx.userId, p_action: 'catalog.category.created', p_resource_type: 'category', p_resource_id: row[0]?.id ?? null, p_metadata: { name: row[0]?.name } }).catch(() => undefined);
    return json({ ok: true, category: row[0] }, 201);
  }

  if (request.method === 'PATCH' && /^\/v1\/admin\/catalog\/categories\/[^/]+$/.test(url.pathname)) {
    const id = uuid(url.pathname.split('/').pop(), 'category_id');
    const body = await request.json() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if ('name' in body) patch.name = text(body.name, 120);
    if ('slug' in body) patch.slug = slug(body.slug);
    if ('description' in body) patch.description = optionalText(body.description, 1000);
    if ('sort_order' in body) patch.sort_order = integer(body.sort_order, 'sort_order');
    if ('is_published' in body) patch.is_published = body.is_published === true;
    patch.updated_at = new Date().toISOString();
    const rows = await supabaseAdminRest<any[]>(env, `categories?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
    if (!rows.length) return json({ error: 'category_not_found' }, 404);
    await supabaseRpc(env, 'write_audit_log', { p_actor: ctx.userId, p_action: 'catalog.category.updated', p_resource_type: 'category', p_resource_id: id, p_metadata: { fields: Object.keys(patch) } }).catch(() => undefined);
    return json({ ok: true, category: rows[0] });
  }

  if (request.method === 'POST' && url.pathname === '/v1/admin/catalog/products') {
    const body = await request.json() as Record<string, unknown>;
    const row = await supabaseAdminRest<any[]>(env, 'products', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
      category_id: body.category_id == null ? null : uuid(body.category_id, 'category_id'),
      name: text(body.name, 160), slug: slug(body.slug ?? body.name), short_description: optionalText(body.short_description, 300),
      description: optionalText(body.description, 5000), image_url: optionalText(body.image_url, 1000), sku: optionalText(body.sku, 80),
      is_published: body.is_published === true, is_bestseller: body.is_bestseller === true, is_featured: body.is_featured === true
    }) });
    const id = row[0]?.id;
    await supabaseRpc(env, 'write_audit_log', { p_actor: ctx.userId, p_action: 'catalog.product.created', p_resource_type: 'product', p_resource_id: id, p_metadata: { name: row[0]?.name } }).catch(() => undefined);
    return json({ ok: true, product: row[0] }, 201);
  }

  if (request.method === 'PATCH' && /^\/v1\/admin\/catalog\/products\/[^/]+$/.test(url.pathname)) {
    const id = uuid(url.pathname.split('/').pop(), 'product_id');
    const body = await request.json() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if ('category_id' in body) patch.category_id = body.category_id == null ? null : uuid(body.category_id, 'category_id');
    if ('name' in body) patch.name = text(body.name, 160);
    if ('slug' in body) patch.slug = slug(body.slug);
    if ('short_description' in body) patch.short_description = optionalText(body.short_description, 300);
    if ('description' in body) patch.description = optionalText(body.description, 5000);
    if ('image_url' in body) patch.image_url = optionalText(body.image_url, 1000);
    if ('sku' in body) patch.sku = optionalText(body.sku, 80);
    for (const key of ['is_published','is_bestseller','is_featured']) if (key in body) patch[key] = body[key] === true;
    patch.updated_at = new Date().toISOString();
    const rows = await supabaseAdminRest<any[]>(env, `products?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
    if (!rows.length) return json({ error: 'product_not_found' }, 404);
    await supabaseRpc(env, 'write_audit_log', { p_actor: ctx.userId, p_action: 'catalog.product.updated', p_resource_type: 'product', p_resource_id: id, p_metadata: { fields: Object.keys(patch) } }).catch(() => undefined);
    return json({ ok: true, product: rows[0] });
  }

  if (request.method === 'POST' && /^\/v1\/admin\/catalog\/products\/[^/]+\/variants$/.test(url.pathname)) {
    const productId = uuid(url.pathname.split('/')[5], 'product_id');
    const body = await request.json() as Record<string, unknown>;
    const price = integer(body.price_paise, 'price_paise');
    const compare = body.compare_at_price_paise == null ? null : integer(body.compare_at_price_paise, 'compare_at_price_paise', price);
    const row = await supabaseAdminRest<any[]>(env, 'product_variants', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
      product_id: productId, name: text(body.name, 120), sku: optionalText(body.sku, 80), price_paise: price,
      compare_at_price_paise: compare, stock_threshold: integer(body.stock_threshold ?? 0, 'stock_threshold'), is_active: body.is_active !== false
    }) });
    await supabaseRpc(env, 'write_audit_log', { p_actor: ctx.userId, p_action: 'catalog.variant.created', p_resource_type: 'product_variant', p_resource_id: row[0]?.id ?? null, p_metadata: { product_id: productId, name: row[0]?.name } }).catch(() => undefined);
    return json({ ok: true, variant: row[0] }, 201);
  }

  if (request.method === 'PATCH' && /^\/v1\/admin\/catalog\/variants\/[^/]+$/.test(url.pathname)) {
    const id = uuid(url.pathname.split('/').pop(), 'variant_id');
    const body = await request.json() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if ('name' in body) patch.name = text(body.name, 120);
    if ('sku' in body) patch.sku = optionalText(body.sku, 80);
    if ('price_paise' in body) patch.price_paise = integer(body.price_paise, 'price_paise');
    if ('compare_at_price_paise' in body) patch.compare_at_price_paise = body.compare_at_price_paise == null ? null : integer(body.compare_at_price_paise, 'compare_at_price_paise');
    if ('stock_threshold' in body) patch.stock_threshold = integer(body.stock_threshold, 'stock_threshold');
    if ('is_active' in body) patch.is_active = body.is_active !== false;
    patch.updated_at = new Date().toISOString();
    if (patch.price_paise != null && patch.compare_at_price_paise != null && Number(patch.compare_at_price_paise) < Number(patch.price_paise)) throw new Response('compare_at_price_paise must be >= price_paise', { status: 400 });
    const rows = await supabaseAdminRest<any[]>(env, `product_variants?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
    if (!rows.length) return json({ error: 'variant_not_found' }, 404);
    await supabaseRpc(env, 'write_audit_log', { p_actor: ctx.userId, p_action: 'catalog.variant.updated', p_resource_type: 'product_variant', p_resource_id: id, p_metadata: { fields: Object.keys(patch) } }).catch(() => undefined);
    return json({ ok: true, variant: rows[0] });
  }

  return json({ error: 'unsupported_catalog_route' }, 404);
}
