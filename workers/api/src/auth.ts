import type { Env } from './types';

interface AuthResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user?: { id: string; email?: string };
  error?: string;
  error_description?: string;
}

function jsonHeaders(env: Env): HeadersInit {
  return { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
}

async function authRequest(env: Env, path: string, body: Record<string, unknown>): Promise<AuthResponse> {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: jsonHeaders(env),
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({})) as AuthResponse;
  if (!response.ok) {
    const message = payload.error_description || payload.error || 'Authentication failed';
    throw new Response(JSON.stringify({ error: message }), { status: response.status, headers: { 'Content-Type': 'application/json' } });
  }
  return payload;
}

export async function authRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/auth/')) return null;
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    body = parsed as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  let result: AuthResponse;
  if (url.pathname === '/v1/auth/signup') {
    if (typeof body.email !== 'string' || typeof body.password !== 'string') return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    if (body.password.length < 10) return new Response(JSON.stringify({ error: 'Password must be at least 10 characters' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    result = await authRequest(env, 'signup', { email: body.email.trim().toLowerCase(), password: body.password });
  } else if (url.pathname === '/v1/auth/login') {
    if (typeof body.email !== 'string' || typeof body.password !== 'string') return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    result = await authRequest(env, 'token?grant_type=password', { email: body.email.trim().toLowerCase(), password: body.password });
  } else if (url.pathname === '/v1/auth/refresh') {
    if (typeof body.refresh_token !== 'string' || !body.refresh_token) return new Response(JSON.stringify({ error: 'Refresh token is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    result = await authRequest(env, 'token?grant_type=refresh_token', { refresh_token: body.refresh_token });
  } else if (url.pathname === '/v1/auth/recover') {
    if (typeof body.email !== 'string' || !body.email.trim()) return new Response(JSON.stringify({ error: 'Email is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    result = await authRequest(env, 'recover', { email: body.email.trim().toLowerCase(), redirect_to: `${env.APP_BASE_URL || 'https://www.dosatoppings.in'}/reset-password` });
  } else {
    return new Response(JSON.stringify({ error: 'Unknown authentication route' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ ok: true, ...result }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
