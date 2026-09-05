import { requirePermission } from './authz';
import { supabaseAdminRest } from './supabase';
import type { AuthContext, Permission } from './authz';
import type { Env } from './types';

interface SiteContentRow {
  id: string;
  key: string;
  title: string;
  content_json: Record<string, unknown>;
  is_published: boolean;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function validKey(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,99}$/.test(value);
}

export async function publicSiteContent(env: Env, key?: string): Promise<Response> {
  const filter = key ? `&key=eq.${encodeURIComponent(key)}` : '';
  const rows = await supabaseAdminRest<SiteContentRow[]>(
    env,
    `site_content?select=id,key,title,content_json,is_published,version,updated_at&is_published=eq.true${filter}&order=key.asc`,
  );
  return json({ ok: true, content: rows });
}

export async function adminSiteContent(
  request: Request,
  env: Env,
  ctx: AuthContext,
): Promise<Response> {
  const methodPermission: Permission = request.method === 'GET' ? 'content.read' : 'content.write';
  requirePermission(ctx, methodPermission);

  if (request.method === 'GET') {
    const rows = await supabaseAdminRest<SiteContentRow[]>(
      env,
      'site_content?select=id,key,title,content_json,is_published,version,updated_by,created_at,updated_at&order=key.asc',
    );
    return json({ ok: true, content: rows });
  }

  if (request.method !== 'PATCH' && request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'Invalid JSON body' }, 400);
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
  const content = body.content_json;
  const isPublished = typeof body.is_published === 'boolean' ? body.is_published : true;
  if (!validKey(key)) return json({ ok: false, error: 'Invalid content key' }, 400);
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return json({ ok: false, error: 'content_json must be an object' }, 400);
  }

  const result = await supabaseAdminRest<SiteContentRow[]>(
    env,
    `site_content?key=eq.${encodeURIComponent(key)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        title,
        content_json: content,
        is_published: isPublished,
        updated_by: ctx.userId,
      }),
    },
  );

  if (!result.length) {
    const created = await supabaseAdminRest<SiteContentRow[]>(env, 'site_content', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        key,
        title,
        content_json: content,
        is_published: isPublished,
        updated_by: ctx.userId,
      }),
    });
    return json({ ok: true, content: created[0] ?? null }, 201);
  }

  return json({ ok: true, content: result[0] });
}
