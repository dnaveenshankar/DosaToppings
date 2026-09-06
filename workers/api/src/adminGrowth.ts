import { requirePermission } from './authz';
import { supabaseAdminRest } from './supabase';
import { sha256Hex } from './security';
import type { AuthContext } from './authz';
import type { Env } from './types';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const enc = (v: string) => encodeURIComponent(v);
const uuid = (v: unknown, field: string) => { if (typeof v !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) throw new Response(`Invalid ${field}`, { status: 400 }); return v; };

export async function adminGrowthRoute(request: Request, env: Env, ctx: AuthContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/admin/growth/') && !url.pathname.startsWith('/v1/admin/settings')) return null;

  if (url.pathname === '/v1/admin/growth/coupons' && request.method === 'GET') {
    requirePermission(ctx, 'coupons.read');
    const rows = await supabaseAdminRest<any[]>(env, `coupons?select=id,code,discount_type,discount_value,max_discount_paise,min_order_paise,usage_limit,per_customer_limit,starts_at,ends_at,is_active,created_at,updated_at&order=created_at.desc&limit=500`);
    return json({ ok: true, coupons: rows });
  }
  if (url.pathname === '/v1/admin/growth/coupons' && request.method === 'POST') {
    requirePermission(ctx, 'coupons.write');
    const b = await request.json() as any;
    if (typeof b.code !== 'string' || !/^[A-Za-z0-9_-]{3,40}$/.test(b.code.trim())) throw new Response('Invalid coupon code', { status: 400 });
    if (!['fixed', 'percent'].includes(b.discount_type)) throw new Response('Invalid discount type', { status: 400 });
    if (!Number.isInteger(b.discount_value) || b.discount_value <= 0) throw new Response('Invalid discount value', { status: 400 });
    if (b.discount_type === 'percent' && b.discount_value > 100) throw new Response('Percent discount cannot exceed 100', { status: 400 });
    const rows = await supabaseAdminRest<any[]>(env, 'coupons', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ code: b.code.trim().toUpperCase(), discount_type: b.discount_type, discount_value: b.discount_value, max_discount_paise: Number.isInteger(b.max_discount_paise) ? b.max_discount_paise : null, min_order_paise: Number.isInteger(b.min_order_paise) ? b.min_order_paise : 0, usage_limit: Number.isInteger(b.usage_limit) ? b.usage_limit : null, per_customer_limit: Number.isInteger(b.per_customer_limit) ? b.per_customer_limit : null, starts_at: b.starts_at || null, ends_at: b.ends_at || null, is_active: b.is_active !== false }) });
    return json({ ok: true, coupon: rows[0] || null }, 201);
  }
  const couponMatch = url.pathname.match(/^\/v1\/admin\/growth\/coupons\/([^/]+)$/);
  if (couponMatch && request.method === 'PATCH') {
    requirePermission(ctx, 'coupons.write');
    const b = await request.json() as any;
    const patch: Record<string, unknown> = {};
    for (const k of ['discount_type','discount_value','max_discount_paise','min_order_paise','usage_limit','per_customer_limit','starts_at','ends_at','is_active']) if (b[k] !== undefined) patch[k] = b[k];
    if (b.code !== undefined) patch.code = String(b.code).trim().toUpperCase();
    patch.updated_at = new Date().toISOString();
    const rows = await supabaseAdminRest<any[]>(env, `coupons?id=eq.${enc(couponMatch[1])}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
    return json({ ok: true, coupon: rows[0] || null });
  }

  if (url.pathname === '/v1/admin/growth/referrals' && request.method === 'GET') {
    requirePermission(ctx, 'referrals.read');
    const rows = await supabaseAdminRest<any[]>(env, `referrals?select=id,referrer_id,referred_id,code,status,created_at,updated_at&order=created_at.desc&limit=500`);
    return json({ ok: true, referrals: rows });
  }
  if (url.pathname === '/v1/admin/growth/referrals/events' && request.method === 'GET') {
    requirePermission(ctx, 'referrals.read');
    const rows = await supabaseAdminRest<any[]>(env, `referral_events?select=id,referral_id,event_type,order_id,metadata,created_at&order=created_at.desc&limit=500`);
    return json({ ok: true, events: rows });
  }
  const referralMatch = url.pathname.match(/^\/v1\/admin\/growth\/referrals\/([^/]+)$/);
  if (referralMatch && request.method === 'PATCH') {
    requirePermission(ctx, 'rewards.adjust');
    const b = await request.json() as any;
    if (!['issued','attributed','qualified','rewarded','reversed'].includes(b.status)) throw new Response('Invalid referral status', { status: 400 });
    const rows = await supabaseAdminRest<any[]>(env, `referrals?id=eq.${enc(referralMatch[1])}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: b.status, updated_at: new Date().toISOString() }) });
    await supabaseAdminRest(env, 'audit_logs', { method: 'POST', body: JSON.stringify({ actor_id: ctx.userId, action: 'referral.status_changed', resource_type: 'referral', resource_id: referralMatch[1], metadata: { status: b.status } }) });
    return json({ ok: true, referral: rows[0] || null });
  }

  if (url.pathname === '/v1/admin/growth/gift-cards' && request.method === 'GET') {
    requirePermission(ctx, 'coupons.read');
    const rows = await supabaseAdminRest<any[]>(env, `gift_cards?select=id,initial_value_paise,balance_paise,expires_at,is_active,created_at&order=created_at.desc&limit=500`);
    return json({ ok: true, gift_cards: rows });
  }
  if (url.pathname === '/v1/admin/growth/gift-cards' && request.method === 'POST') {
    requirePermission(ctx, 'coupons.write');
    const b = await request.json() as any;
    if (typeof b.code !== 'string' || b.code.trim().length < 8) throw new Response('A gift card code of at least 8 characters is required', { status: 400 });
    if (!Number.isInteger(b.value_paise) || b.value_paise < 100) throw new Response('Gift card value must be at least ₹1', { status: 400 });
    const codeHash = await sha256Hex(b.code.trim().toUpperCase());
    const rows = await supabaseAdminRest<any[]>(env, 'gift_cards', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ code_hash: codeHash, initial_value_paise: b.value_paise, balance_paise: b.value_paise, expires_at: b.expires_at || null, is_active: b.is_active !== false }) });
    return json({ ok: true, gift_card: rows[0] || null }, 201);
  }
  const giftMatch = url.pathname.match(/^\/v1\/admin\/growth\/gift-cards\/([^/]+)$/);
  if (giftMatch && request.method === 'PATCH') {
    requirePermission(ctx, 'coupons.write');
    const b = await request.json() as any;
    const rows = await supabaseAdminRest<any[]>(env, `gift_cards?id=eq.${enc(giftMatch[1])}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...(b.expires_at !== undefined ? { expires_at: b.expires_at } : {}), ...(b.is_active !== undefined ? { is_active: Boolean(b.is_active) } : {}) }) });
    return json({ ok: true, gift_card: rows[0] || null });
  }

  if (url.pathname === '/v1/admin/growth/rewards' && request.method === 'GET') {
    requirePermission(ctx, 'rewards.adjust');
    const [wallets, loyalty] = await Promise.all([
      supabaseAdminRest<any[]>(env, 'wallets?select=customer_id,balance_paise,updated_at&order=updated_at.desc&limit=500'),
      supabaseAdminRest<any[]>(env, 'loyalty_accounts?select=customer_id,points,updated_at&order=updated_at.desc&limit=500'),
    ]);
    return json({ ok: true, wallets, loyalty });
  }

  if (url.pathname === '/v1/admin/settings' && request.method === 'GET') {
    requirePermission(ctx, 'settings.write');
    const rows = await supabaseAdminRest<any[]>(env, 'settings?select=key,value,updated_by,updated_at&order=key.asc');
    return json({ ok: true, settings: rows });
  }
  if (url.pathname === '/v1/admin/settings' && request.method === 'PATCH') {
    requirePermission(ctx, 'settings.write');
    const b = await request.json() as { key?: unknown; value?: unknown };
    if (typeof b.key !== 'string' || !b.key.trim() || b.value === undefined) throw new Response('key and value are required', { status: 400 });
    const rows = await supabaseAdminRest<any[]>(env, 'settings', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ key: b.key.trim(), value: b.value, updated_by: ctx.userId, updated_at: new Date().toISOString() }) });
    return json({ ok: true, setting: rows[0] || null });
  }

  return json({ ok: false, error: 'Not found' }, 404);
}
