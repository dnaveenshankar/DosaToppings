import type { Env } from './types';

export function supabaseHeaders(env: Env, accessToken?: string): HeadersInit {
  const headers: HeadersInit = {
    apikey: env.SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

export async function supabaseRest<T>(
  env: Env,
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...supabaseHeaders(env, accessToken), ...(init.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getSupabaseUser(env: Env, accessToken: string): Promise<{ id: string; email?: string }> {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: supabaseHeaders(env, accessToken),
  });
  if (!response.ok) throw new Response('Unauthenticated', { status: 401 });
  return response.json() as Promise<{ id: string; email?: string }>;
}
