import type { Env } from './types';
import type { AuthContext, Permission } from './authz';
import { requirePermission, requireSuperAdminEmail } from './authz';
import { supabaseAdminRest, supabaseRpc } from './supabase';

export async function staffGuard(ctx: AuthContext, permission: Permission): Promise<void> {
  requirePermission(ctx, permission);
  requireSuperAdminEmail(ctx);
}

export async function dashboardSummary(env: Env) {
  const [orders, products, variants] = await Promise.all([
    supabaseAdminRest<any[]>(env, 'orders?select=id,status,total_paise,created_at&order=created_at.desc&limit=100'),
    supabaseAdminRest<any[]>(env, 'products?select=id,is_published&limit=1000'),
    supabaseAdminRest<any[]>(env, 'product_variants?select=id,stock_threshold,is_active&is_active=eq.true&limit=1000'),
  ]);
  const today = new Date();
  const day = today.toISOString().slice(0, 10);
  const todays = orders.filter((o) => String(o.created_at).slice(0, 10) === day);
  return {
    orders_today: todays.length,
    revenue_today_paise: todays.filter((o) => ['paid','processing','packed','shipped','delivered'].includes(o.status)).reduce((n, o) => n + Number(o.total_paise || 0), 0),
    pending_orders: orders.filter((o) => ['paid','processing','packed','shipped'].includes(o.status)).length,
    published_products: products.filter((p) => p.is_published).length,
    active_variants: variants.length,
  };
}

export async function listStaff(env: Env) {
  const profiles = await supabaseAdminRest<any[]>(env, 'profiles?select=id,email,display_name,phone,is_active,created_at&order=created_at.desc&limit=500');
  const roles = await supabaseAdminRest<any[]>(env, 'staff_roles?select=user_id,role,created_at,updated_at&limit=500');
  const byUser = new Map(roles.map((r) => [r.user_id, r]));
  return profiles.map((p) => ({ ...p, role: byUser.get(p.id)?.role ?? null }));
}

export async function setOrderStatus(env: Env, ctx: AuthContext, orderId: string, status: string, reason?: string) {
  await staffGuard(ctx, 'orders.update');
  return supabaseRpc(env, 'admin_update_order_status', { p_order_id: orderId, p_to_status: status, p_actor: ctx.userId, p_reason: reason ?? null });
}

export async function adjustInventory(env: Env, ctx: AuthContext, variantId: string, quantity: number, reason: string) {
  await staffGuard(ctx, 'inventory.adjust');
  return supabaseRpc(env, 'admin_adjust_inventory', { p_variant_id: variantId, p_quantity: quantity, p_actor: ctx.userId, p_reason: reason });
}
