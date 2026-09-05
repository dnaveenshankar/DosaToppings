import type { Env } from './types';
import type { AppRole, AuthContext } from './authz';
import { requirePermission } from './authz';
import { supabaseAdminRest, supabaseRpc } from './supabase';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

const ROLES: AppRole[] = ['super_admin','admin_manager','store_manager','billing_staff','order_staff','inventory_staff','content_manager','support_staff','review_moderator','report_viewer'];
function role(value: unknown): AppRole {
  if (typeof value !== 'string' || !ROLES.includes(value as AppRole)) throw new Response('Invalid role', { status: 400 });
  return value as AppRole;
}
function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Response(`Invalid ${field}`, { status: 400 });
  return value;
}

export async function adminStaffRoute(request: Request, env: Env, ctx: AuthContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/admin/staff')) return null;

  if (request.method === 'GET' && url.pathname === '/v1/admin/staff') {
    requirePermission(ctx, 'users.read');
    const profiles = await supabaseAdminRest<any[]>(env, 'profiles?select=id,email,display_name,phone,is_active,created_at,updated_at&order=created_at.desc&limit=500');
    const roles = await supabaseAdminRest<any[]>(env, 'staff_roles?select=user_id,role,assigned_by,created_at,updated_at&limit=500');
    const byUser = new Map(roles.map((item) => [item.user_id, item]));
    return json({ ok: true, staff: profiles.map((profile) => ({ ...profile, role: byUser.get(profile.id)?.role ?? null, assigned_by: byUser.get(profile.id)?.assigned_by ?? null })) });
  }

  if (request.method === 'POST' && url.pathname.endsWith('/role')) {
    requirePermission(ctx, 'users.update');
    if (ctx.role !== 'super_admin') throw new Response('Super Admin approval required for role changes', { status: 403 });
    const target = uuid(url.pathname.split('/').filter(Boolean)[3], 'user_id');
    const body = await request.json() as { role?: unknown };
    const assigned = await supabaseRpc<any>(env, 'assign_staff_role', { p_target_user: target, p_role: role(body.role), p_actor: ctx.userId });
    return json({ ok: true, staff_role: assigned });
  }

  if (request.method === 'POST' && /^\/v1\/admin\/staff\/[^/]+\/active$/.test(url.pathname)) {
    requirePermission(ctx, 'users.disable');
    const target = uuid(url.pathname.split('/')[4], 'user_id');
    const body = await request.json() as { is_active?: unknown };
    if (typeof body.is_active !== 'boolean') throw new Response('is_active must be boolean', { status: 400 });
    const profile = await supabaseRpc<any>(env, 'set_staff_active', { p_target_user: target, p_active: body.is_active, p_actor: ctx.userId });
    return json({ ok: true, profile });
  }

  return json({ error: 'unsupported_staff_route' }, 404);
}
