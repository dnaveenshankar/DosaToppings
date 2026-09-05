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
    const rows = await supabaseAdminRest<any[]>(env, 'products?select=id,category_id,name,slug,description,is_active,created_at,updated_at,product_variants(id,name,sku,price_paise,compare_at_price_paise,stock_threshold,pack_size_value,pack_size_unit,is_active)&order=created_at.desc&limit=500');
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
    const inserted = await supabaseAdminRest<any[]>(env, 'products', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ category_id: body.category_id ? uuid(body.category_id, 'category_id') : null, name: body.name.trim().slice(0, 200), slug: typeof body.slug === 'string' ? body.slug.trim().toLowerCase().slice(0, 200) : null, description: typeof body.description === 'string' ? body.description.slice(0, 5000) : null, is_active: body.is_active !== false }) });
    return json({ ok: true, product: inserted[0] ?? null }, 201);
  }

  if (request.method === 'PATCH' && /^\/v1\/admin\/catalog\/products\/[^/]+$/.test(url.pathname)) {
    requirePermission(ctx, 'products.write');
    const id = uuid(url.pathname.split('/')[5], 'product_id');
    const body = await request.json() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of ['name','slug','description','is_active','category_id']) if (key in body) patch[key] = key === 'category_id' && body[key] !== null ? uuid(body[key], 'category_id') : body[key];
    const rows = await supabaseAdminRest<any[]>(env, `products?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
    return json({ ok: true, product: rows[0] ?? null });
  }

  if (request.method === 'POST' && url.pathname === '/v1/admin/catalog/variants') {
    requirePermission(ctx, 'products.write');
    const body = await request.json() as Record<string, unknown>;
    const productId = uuid(body.product_id, 'product_id');
    if (typeof body.name !== 'string' || !body.name.trim()) throw new Response('Variant name is required', { status: 400 });
    if (!Number.isInteger(body.price_paise) || Number(body.price_paise) < 0) throw new Response('Valid price_paise is required', { status: 400 });
    const packValue = body.pack_size_value == null || body.pack_size_value === '' ? null : Number(body.pack_size_value);
    if (packValue !== null && (!Number.isFinite(packValue) || packValue <= 0)) throw new Response('Invalid pack_size_value', { status: 400 });
    const allowedUnits = new Set(['g','kg','ml','l','pcs']);
    const packUnit = body.pack_size_unit == null || body.pack_size_unit === '' ? null : String(body.pack_size_unit);
    if (packUnit !== null && !allowedUnits.has(packUnit)) throw new Response('Invalid pack_size_unit', { status: 400 });
    const inserted = await supabaseAdminRest<any[]>(env, 'product_variants', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ product_id: productId, name: body.name.trim().slice(0, 200), sku: typeof body.sku === 'string' && body.sku.trim() ? body.sku.trim().slice(0, 100) : null, price_paise: Number(body.price_paise), compare_at_price_paise: body.compare_at_price_paise == null || body.compare_at_price_paise === '' ? null : Number(body.compare_at_price_paise), stock_threshold: Number.isInteger(body.stock_threshold) && Number(body.stock_threshold) >= 0 ? Number(body.stock_threshold) : 0, pack_size_value: packValue, pack_size_unit: packUnit, is_active: body.is_active !== false }) });
    return json({ ok: true, variant: inserted[0] ?? null }, 201);
  }

  if (request.method === 'PATCH' && /^\/v1\/admin\/catalog\/variants\/[^/]+$/.test(url.pathname)) {
    requirePermission(ctx, 'products.write');
    const id = uuid(url.pathname.split('/')[5], 'variant_id');
    const body = await request.json() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of ['name','sku','price_paise','compare_at_price_paise','stock_threshold','is_active','pack_size_value','pack_size_unit']) if (key in body) patch[key] = body[key] === '' ? null : body[key];
    const rows = await supabaseAdminRest<any[]>(env, `product_variants?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
    return json({ ok: true, variant: rows[0] ?? null });
  }

  if (request.method === 'GET' && url.pathname === '/v1/admin/catalog/inventory') {
    requirePermission(ctx, 'inventory.read');
    const variants = await supabaseRpc<any[]>(env, 'admin_inventory_snapshot', {});
    const movements = await supabaseAdminRest<any[]>(env, 'inventory_movements?select=id,variant_id,movement_type,quantity,reference_type,reference_id,notes,performed_by,created_at&order=created_at.desc&limit=500');
    return json({ ok: true, variants, movements });
  }

  if (request.method === 'POST' && url.pathname === '/v1/admin/catalog/inventory/movement') {
    requirePermission(ctx, 'inventory.adjust');
    const body = await request.json() as { variant_id?: unknown; movement_type?: unknown; quantity?: unknown; reason?: unknown };
    const type = typeof body.movement_type === 'string' ? body.movement_type : '';
    if (!['opening','purchase','return','damage','adjustment'].includes(type)) throw new Response('Invalid movement_type', { status: 400 });
    if (!Number.isInteger(body.quantity) || Number(body.quantity) === 0) throw new Response('quantity must be a non-zero integer', { status: 400 });
    const result = await supabaseRpc(env, 'admin_record_inventory_movement', { p_variant_id: uuid(body.variant_id, 'variant_id'), p_movement_type: type, p_quantity: Number(body.quantity), p_actor: ctx.userId, p_reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : '' });
    return json({ ok: true, movement: result }, 201);
  }

  if (request.method === 'POST' && url.pathname === '/v1/admin/catalog/inventory-adjust') {
    requirePermission(ctx, 'inventory.adjust');
    const body = await request.json() as { variant_id?: unknown; quantity_delta?: unknown; reason?: unknown };
    if (!Number.isInteger(body.quantity_delta) || Number(body.quantity_delta) === 0) throw new Response('Invalid quantity_delta', { status: 400 });
    const result = await supabaseRpc(env, 'admin_adjust_inventory', { p_variant_id: uuid(body.variant_id, 'variant_id'), p_quantity: Number(body.quantity_delta), p_actor: ctx.userId, p_reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : null });
    return json({ ok: true, movement: result });
  }

  return json({ error: 'unsupported_catalog_route' }, 404);
}
