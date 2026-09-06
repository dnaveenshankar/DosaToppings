import { requirePermission } from './authz';
import { supabaseAdminRest } from './supabase';
import type { AuthContext } from './authz';
import type { Env } from './types';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export async function adminDataRoute(request: Request, env: Env, ctx: AuthContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/admin/data/')) return null;

  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);

  if (url.pathname === '/v1/admin/data/customers') {
    requirePermission(ctx, 'users.read');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500);
    const q = (url.searchParams.get('q') || '').trim();
    const filter = q ? `&or=(email.ilike.*${encodeURIComponent(q)}*,display_name.ilike.*${encodeURIComponent(q)}*)` : '';
    const rows = await supabaseAdminRest<any[]>(env, `profiles?select=id,email,display_name,phone,is_active,created_at,updated_at&order=created_at.desc&limit=${limit}${filter}`);
    return json({ ok: true, customers: rows });
  }

  if (url.pathname === '/v1/admin/data/payments') {
    requirePermission(ctx, 'reports.read');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500);
    const rows = await supabaseAdminRest<any[]>(env, `payments?select=id,order_id,amount_paise,status,method,provider_order_id,provider_payment_id,created_at,updated_at&order=created_at.desc&limit=${limit}`);
    return json({ ok: true, payments: rows });
  }

  if (url.pathname === '/v1/admin/data/audit') {
    requirePermission(ctx, 'audit_logs.read');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500);
    const rows = await supabaseAdminRest<any[]>(env, `audit_logs?select=id,actor_id,action,resource_type,resource_id,metadata,created_at&order=created_at.desc&limit=${limit}`);
    return json({ ok: true, audit: rows });
  }

  if (url.pathname === '/v1/admin/data/inventory') {
    requirePermission(ctx, 'inventory.read');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 250), 1), 1000);
    const rows = await supabaseAdminRest<any[]>(env, `inventory_movements?select=id,variant_id,movement_type,quantity,reference_type,reference_id,notes,performed_by,created_at&order=created_at.desc&limit=${limit}`);
    return json({ ok: true, movements: rows });
  }

  return json({ ok: false, error: 'Not found' }, 404);
}
