import type { Env } from './types';
import type { AuthContext } from './authz';
import { requirePermission } from './authz';
import { supabaseAdminRest } from './supabase';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const enc = (v: string) => encodeURIComponent(v);

async function flag(env: Env, key: string): Promise<{ enabled: boolean; config: any }> {
  const rows = await supabaseAdminRest<any[]>(env, `feature_flags?select=enabled,config&key=eq.${enc(key)}&limit=1`);
  return rows[0] || { enabled: false, config: {} };
}
async function audit(env: Env, actor: string, action: string, resourceType: string, resourceId: string | null, metadata: unknown = {}) {
  await supabaseAdminRest(env, 'audit_logs', { method: 'POST', body: JSON.stringify({ actor_id: actor, action, resource_type: resourceType, resource_id: resourceId, metadata }) });
}
async function activity(env: Env, customerId: string, eventType: string, request: Request, entityType?: string, entityId?: string, metadata: unknown = {}) {
  const ua = request.headers.get('User-Agent') || '';
  await supabaseAdminRest(env, 'customer_activity_events', { method: 'POST', body: JSON.stringify({ customer_id: customerId, event_type: eventType, entity_type: entityType || null, entity_id: entityId || null, metadata, user_agent: ua.slice(0, 500) }) });
}
function codeFor(id: string) { return `DOSA-${id.replace(/-/g,'').slice(0,8).toUpperCase()}`; }

export async function customerFeaturesRoute(request: Request, env: Env, ctx: AuthContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/customer/')) return null;

  if (url.pathname === '/v1/customer/wishlist' && request.method === 'GET') {
    if (!(await flag(env, 'wishlist')).enabled) return json({ ok: true, enabled: false, items: [] });
    const rows = await supabaseAdminRest<any[]>(env, `wishlists?select=variant_id,created_at,product_variants(id,name,sku,price_paise,is_active,products(id,name,slug,image_url,is_published))&customer_id=eq.${enc(ctx.userId)}&order=created_at.desc`);
    return json({ ok: true, enabled: true, items: rows });
  }
  if (url.pathname === '/v1/customer/wishlist' && request.method === 'POST') {
    if (!(await flag(env, 'wishlist')).enabled) return json({ ok: false, enabled: false, error: 'wishlist_disabled' }, 409);
    const body = await request.json() as { variant_id?: unknown };
    if (typeof body.variant_id !== 'string') return json({ ok: false, error: 'variant_id_required' }, 400);
    await supabaseAdminRest(env, 'wishlists', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ customer_id: ctx.userId, variant_id: body.variant_id }) });
    await activity(env, ctx.userId, 'wishlist_added', request, 'product_variant', body.variant_id);
    return json({ ok: true });
  }
  if (url.pathname === '/v1/customer/wishlist' && request.method === 'DELETE') {
    if (!(await flag(env, 'wishlist')).enabled) return json({ ok: false, enabled: false, error: 'wishlist_disabled' }, 409);
    const variant = url.searchParams.get('variant_id'); if (!variant) return json({ ok: false, error: 'variant_id_required' }, 400);
    await supabaseAdminRest(env, `wishlists?customer_id=eq.${enc(ctx.userId)}&variant_id=eq.${enc(variant)}`, { method: 'DELETE' });
    await activity(env, ctx.userId, 'wishlist_removed', request, 'product_variant', variant);
    return json({ ok: true });
  }

  if (url.pathname === '/v1/customer/orders' && request.method === 'GET') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 100);
    const orders = await supabaseAdminRest<any[]>(env, `orders?select=id,order_number,status,currency,subtotal_paise,discount_paise,shipping_paise,tax_paise,total_paise,billing_address,shipping_address,referral_code,created_at,updated_at&customer_id=eq.${enc(ctx.userId)}&order=created_at.desc&limit=${limit}`);
    const ids = orders.map(o => o.id).filter(Boolean);
    let history: any[] = [];
    if (ids.length) history = await supabaseAdminRest<any[]>(env, `order_status_history?select=order_id,from_status,to_status,reason,created_at&order_id=in.(${ids.map(enc).join(',')})&order=created_at.asc`);
    return json({ ok: true, orders: orders.map(o => ({ ...o, status_history: history.filter(h => h.order_id === o.id) })) });
  }

  if (url.pathname === '/v1/customer/activity' && request.method === 'GET') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 200);
    const rows = await supabaseAdminRest<any[]>(env, `customer_activity_events?select=id,event_type,entity_type,entity_id,metadata,created_at&customer_id=eq.${enc(ctx.userId)}&order=created_at.desc&limit=${limit}`);
    return json({ ok: true, events: rows });
  }

  if (url.pathname === '/v1/customer/referral' && request.method === 'GET') {
    const f = await flag(env, 'referrals');
    if (!f.enabled) return json({ ok: true, enabled: false, referral: null });
    let rows = await supabaseAdminRest<any[]>(env, `referrals?select=id,code,status,created_at,updated_at&referrer_id=eq.${enc(ctx.userId)}&order=created_at.desc&limit=1`);
    let referral = rows[0];
    if (!referral) {
      const code = codeFor(ctx.userId);
      const created = await supabaseAdminRest<any[]>(env, 'referrals', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ referrer_id: ctx.userId, code, status: 'issued' }) });
      referral = created[0];
    }
    const events = referral ? await supabaseAdminRest<any[]>(env, `referral_events?select=event_type,order_id,metadata,created_at&referral_id=eq.${enc(referral.id)}&order=created_at.desc`) : [];
    return json({ ok: true, enabled: true, referral, events });
  }

  if (url.pathname === '/v1/customer/referral/attribute' && request.method === 'POST') {
    const f = await flag(env, 'referrals');
    if (!f.enabled) return json({ ok: false, enabled: false, error: 'referrals_disabled' }, 409);
    const body = await request.json() as { code?: unknown };
    if (typeof body.code !== 'string' || body.code.trim().length < 4) return json({ ok: false, error: 'invalid_referral_code' }, 400);
    const rows = await supabaseAdminRest<any[]>(env, `referrals?select=id,referrer_id,code,status&code=eq.${enc(body.code.trim().toUpperCase())}&limit=1`);
    const referral = rows[0];
    if (!referral || referral.referrer_id === ctx.userId || referral.status === 'reversed') return json({ ok: false, error: 'invalid_referral_code' }, 400);
    await supabaseAdminRest(env, `referrals?id=eq.${enc(referral.id)}&referred_id=is.null`, { method: 'PATCH', body: JSON.stringify({ referred_id: ctx.userId, status: 'attributed', updated_at: new Date().toISOString() }) });
    await supabaseAdminRest(env, 'referral_events', { method: 'POST', body: JSON.stringify({ referral_id: referral.id, event_type: 'attributed', metadata: { referred_id: ctx.userId } }) });
    await activity(env, ctx.userId, 'referral_attributed', request, 'referral', referral.id);
    return json({ ok: true, referral_id: referral.id });
  }
  return null;
}

export async function adminCustomerFeaturesRoute(request: Request, env: Env, ctx: AuthContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/admin/features') && !url.pathname.startsWith('/v1/admin/users/')) return null;
  if (url.pathname === '/v1/admin/features' && request.method === 'GET') {
    requirePermission(ctx, 'settings.features.write');
    const rows = await supabaseAdminRest<any[]>(env, 'feature_flags?select=key,enabled,config,updated_by,updated_at&order=key.asc');
    return json({ ok: true, features: rows });
  }
  if (url.pathname === '/v1/admin/features' && request.method === 'PATCH') {
    requirePermission(ctx, 'settings.features.write');
    const body = await request.json() as { key?: unknown; enabled?: unknown; config?: unknown };
    if (typeof body.key !== 'string' || typeof body.enabled !== 'boolean') return json({ ok: false, error: 'key_and_enabled_required' }, 400);
    const allowed = ['referrals','wishlist','customer_activity_trace','order_tracking'];
    if (!allowed.includes(body.key)) return json({ ok: false, error: 'unknown_feature' }, 400);
    await supabaseAdminRest(env, `feature_flags?key=eq.${enc(body.key)}`, { method: 'PATCH', body: JSON.stringify({ enabled: body.enabled, config: body.config && typeof body.config === 'object' ? body.config : {}, updated_by: ctx.userId, updated_at: new Date().toISOString() }) });
    await audit(env, ctx.userId, 'feature_flag_changed', 'feature_flag', null, { key: body.key, enabled: body.enabled });
    return json({ ok: true });
  }
  const match = url.pathname.match(/^\/v1\/admin\/users\/([^/]+)\/activity$/);
  if (match && request.method === 'GET') {
    requirePermission(ctx, 'users.activity.read');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 200), 1), 500);
    const rows = await supabaseAdminRest<any[]>(env, `customer_activity_events?select=id,event_type,entity_type,entity_id,metadata,ip_hash,user_agent,created_at&customer_id=eq.${enc(match[1])}&order=created_at.desc&limit=${limit}`);
    return json({ ok: true, events: rows });
  }
  return null;
}
