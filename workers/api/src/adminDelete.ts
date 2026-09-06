import type { Env } from './types';
import type { AuthContext } from './authz';
import { requirePermission } from './authz';
import { supabaseAdminRest } from './supabase';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function uuid(value: string, field: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Response(`Invalid ${field}`, { status: 400 });
  return value;
}
async function hasRows(env: Env, query: string): Promise<boolean> {
  const rows = await supabaseAdminRest<any[]>(env, query);
  return rows.length > 0;
}

export async function adminDeleteRoute(request: Request, env: Env, ctx: AuthContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/admin/catalog')) return null;

  const productMatch = url.pathname.match(/^\/v1\/admin\/catalog\/products\/([^/]+)$/);
  if (request.method === 'DELETE' && productMatch) {
    requirePermission(ctx, 'products.write');
    const productId = uuid(productMatch[1], 'product_id');
    const variants = await supabaseAdminRest<{ id: string }[]>(env, `product_variants?select=id&product_id=eq.${encodeURIComponent(productId)}&limit=500`);
    for (const variant of variants) {
      if (await hasRows(env, `inventory_movements?select=id&variant_id=eq.${encodeURIComponent(variant.id)}&limit=1`)) {
        return json({ ok: false, error: 'Product cannot be deleted because one or more variants have inventory history. Deactivate the product/variants instead.' }, 409);
      }
      if (await hasRows(env, `order_items?select=id&variant_id=eq.${encodeURIComponent(variant.id)}&limit=1`)) {
        return json({ ok: false, error: 'Product cannot be deleted because one or more variants have order history. Deactivate the product/variants instead.' }, 409);
      }
      if (await hasRows(env, `cart_items?select=id&variant_id=eq.${encodeURIComponent(variant.id)}&limit=1`)) {
        return json({ ok: false, error: 'Product cannot be deleted because one or more variants are referenced by a cart. Deactivate the product/variants instead.' }, 409);
      }
    }
    const deleted = await supabaseAdminRest<any[]>(env, `products?id=eq.${encodeURIComponent(productId)}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
    if (!deleted.length) return json({ ok: false, error: 'Product not found' }, 404);
    return json({ ok: true, product: deleted[0] ?? null });
  }

  const variantMatch = url.pathname.match(/^\/v1\/admin\/catalog\/variants\/([^/]+)$/);
  if (request.method === 'DELETE' && variantMatch) {
    requirePermission(ctx, 'products.write');
    const variantId = uuid(variantMatch[1], 'variant_id');
    if (await hasRows(env, `inventory_movements?select=id&variant_id=eq.${encodeURIComponent(variantId)}&limit=1`)) {
      return json({ ok: false, error: 'Variant cannot be deleted because it has inventory history. Set it inactive instead.' }, 409);
    }
    if (await hasRows(env, `order_items?select=id&variant_id=eq.${encodeURIComponent(variantId)}&limit=1`)) {
      return json({ ok: false, error: 'Variant cannot be deleted because it has order history. Set it inactive instead.' }, 409);
    }
    if (await hasRows(env, `cart_items?select=id&variant_id=eq.${encodeURIComponent(variantId)}&limit=1`)) {
      return json({ ok: false, error: 'Variant cannot be deleted because it is referenced by a cart. Set it inactive instead.' }, 409);
    }
    const deleted = await supabaseAdminRest<any[]>(env, `product_variants?id=eq.${encodeURIComponent(variantId)}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
    if (!deleted.length) return json({ ok: false, error: 'Variant not found' }, 404);
    return json({ ok: true, variant: deleted[0] ?? null });
  }
  return null;
}
