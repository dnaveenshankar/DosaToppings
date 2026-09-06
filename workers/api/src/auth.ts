import type { Env } from './types';

interface AuthResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user?: { id: string; email?: string };
  error?: string;
  error_description?: string;
  msg?: string;
  message?: string;
}

function jsonHeaders(env: Env): HeadersInit {
  return {
    apikey: env.SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function authRequest(env: Env, path: string, body: Record<string, unknown>): Promise<AuthResponse> {
  if (!env.SUPABASE_URL) throw errorResponse(503, 'Authentication service is not configured: SUPABASE_URL is missing');
  if (!env.SUPABASE_ANON_KEY) throw errorResponse(503, 'Authentication service is not configured: SUPABASE_ANON_KEY is missing');

  let response: Response;
  try {
    response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/${path}`, {
      method: 'POST',
      headers: jsonHeaders(env),
      body: JSON.stringify(body),
    });
  } catch {
    throw errorResponse(503, 'Authentication service is unreachable');
  }

  const raw = await response.text();
  let payload: AuthResponse = {};
  try {
    payload = raw ? JSON.parse(raw) as AuthResponse : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const upstreamMessage = payload.error_description || payload.error || payload.msg || payload.message;
    const safeMessage = upstreamMessage || `Supabase authentication request failed (HTTP ${response.status})`;
    throw errorResponse(response.status, safeMessage);
  }

  return payload;
}

export async function authRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/auth/')) return null;

  if (request.method !== 'POST') {
    if (request.method === 'GET' && url.pathname === '/v1/auth/health') {
      return new Response(JSON.stringify({
        ok: true,
        configured: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
        supabase_url_configured: Boolean(env.SUPABASE_URL),
        anon_key_configured: Boolean(env.SUPABASE_ANON_KEY),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw 0;
    body = parsed as Record<string, unknown>;
  } catch {
    return errorResponse(400, 'Invalid JSON body');
  }

  let result: AuthResponse;
  if (url.pathname === '/v1/auth/signup') {
    if (typeof body.email !== 'string' || typeof body.password !== 'string') return errorResponse(400, 'Email and password are required');
    if (body.password.length < 10) return errorResponse(400, 'Password must be at least 10 characters');
    result = await authRequest(env, 'signup', { email: body.email.trim().toLowerCase(), password: body.password });
  } else if (url.pathname === '/v1/auth/login') {
    if (typeof body.email !== 'string' || typeof body.password !== 'string') return errorResponse(400, 'Email and password are required');
    result = await authRequest(env, 'token?grant_type=password', { email: body.email.trim().toLowerCase(), password: body.password });
  } else if (url.pathname === '/v1/auth/refresh') {
    if (typeof body.refresh_token !== 'string' || !body.refresh_token) return errorResponse(400, 'Refresh token is required');
    result = await authRequest(env, 'token?grant_type=refresh_token', { refresh_token: body.refresh_token });
  } else if (url.pathname === '/v1/auth/recover') {
    if (typeof body.email !== 'string' || !body.email.trim()) return errorResponse(400, 'Email is required');
    result = await authRequest(env, 'recover', {
      email: body.email.trim().toLowerCase(),
      redirect_to: `${env.APP_BASE_URL || 'https://www.dosatoppings.in'}/reset-password`,
    });
  } else {
    return errorResponse(404, 'Unknown authentication route');
  }

  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
