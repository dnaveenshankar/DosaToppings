import app from './index';
import type { Env } from './types';
import { handleOptions, json } from './http';

interface AuthResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user?: { id?: string; email?: string };
}

function readCredentials(value: unknown): { email: string; password: string } {
  if (!value || typeof value !== 'object') throw new Response('Invalid JSON body', { status: 400 });
  const body = value as Record<string, unknown>;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 256) {
    throw new Response('Invalid credentials', { status: 400 });
  }
  return { email, password };
}

async function supabaseAuth(env: Env, body: Record<string, unknown>, grantType: string): Promise<AuthResponse> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error('Supabase auth is not configured');
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=${grantType}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 400 || response.status === 401) {
      throw new Response(grantType === 'password' ? 'Invalid email or password' : 'Invalid or expired session', { status: 401 });
    }
    throw new Error(`Supabase auth failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return response.json() as Promise<AuthResponse>;
}

export default {
  async fetch(request: Request, env: Env, executionCtx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin');
    const options = handleOptions(request);
    if (options) return options;

    try {
      const url = new URL(request.url);
      if (request.method === 'POST' && url.pathname === '/v1/auth/login') {
        const credentials = readCredentials(await request.json());
        const session = await supabaseAuth(env, credentials, 'password');
        return json({ ok: true, ...session }, 200, origin);
      }

      if (request.method === 'POST' && url.pathname === '/v1/auth/refresh') {
        const body = await request.json();
        if (!body || typeof body !== 'object' || typeof (body as Record<string, unknown>).refresh_token !== 'string') {
          throw new Response('Invalid refresh token', { status: 400 });
        }
        const refreshToken = (body as Record<string, string>).refresh_token.trim();
        if (!refreshToken || refreshToken.length > 4096) throw new Response('Invalid refresh token', { status: 400 });
        const session = await supabaseAuth(env, { refresh_token: refreshToken }, 'refresh_token');
        return json({ ok: true, ...session }, 200, origin);
      }

      return app.fetch(request, env, executionCtx);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error(error);
      return json({ error: 'internal_error' }, 500, origin);
    }
  },
};
