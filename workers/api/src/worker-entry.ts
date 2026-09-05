import base from './worker';
import { adminStaffRoute } from './adminStaff';
import { getSupabaseUser } from './supabase';
import { resolveAuthContext } from './authorization';
import type { AuthContext } from './authz';
import type { Env } from './types';

interface ScheduledController { cron: string; scheduledTime: number; noRetry(): void; }
interface WorkerExecutionContext { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void; }

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', 'https://admin.dosatoppings.in');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key, X-Requested-With');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function staffContext(request: Request, env: Env): Promise<AuthContext> {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) throw new Response('Unauthenticated', { status: 401 });
  const user = await getSupabaseUser(env, header.slice(7).trim());
  const ctx = await resolveAuthContext(env, user.id, user.email);
  if (!ctx.isActive) throw new Response('Account disabled', { status: 403 });
  return ctx;
}

export default {
  async fetch(request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/v1/admin/staff') && request.method !== 'OPTIONS') {
      try {
        const result = await adminStaffRoute(request, env, await staffContext(request, env));
        if (result) return withCors(result);
      } catch (error) {
        if (error instanceof Response) return withCors(error);
        return withCors(new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Staff request failed' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        }));
      }
    }
    return base.fetch(request, env, ctx);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: WorkerExecutionContext) {
    return base.scheduled(controller, env, ctx);
  }
};
