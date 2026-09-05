import app from './index';
import { deliverNotificationBatch } from './notifications';
import type { Env } from './types';

interface ScheduledController {
  cron: string;
  scheduledTime: number;
  noRetry(): void;
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: WorkerExecutionContext) {
    if (controller.cron !== '*/5 * * * *') return;

    const superAdminRows = await fetch(`${env.SUPABASE_URL}/rest/v1/staff_roles?select=user_id&role=eq.super_admin`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
    }).then(async response => {
      if (!response.ok) throw new Error(`Unable to load super admin roles (${response.status})`);
      return response.json() as Promise<Array<{ user_id: string }>>;
    });

    const superAdminIds = superAdminRows.map(row => row.user_id);
    if (!superAdminIds.length) return;

    const profiles = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?select=id,email,is_active&id=in.(${superAdminIds.join(',')})&is_active=eq.true`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
    }).then(async response => {
      if (!response.ok) throw new Error(`Unable to load super admin profiles (${response.status})`);
      return response.json() as Promise<Array<{ id: string; email: string | null; is_active: boolean }>>;
    });

    const superAdminEmail = profiles.find(profile => profile.email)?.email || '';
    if (!superAdminEmail) throw new Error('Verified Super Admin email is not configured');

    const configured = await fetch(`${env.SUPABASE_URL}/rest/v1/notification_recipients?select=email,display_name,enabled,event_types&enabled=eq.true`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
    }).then(async response => {
      if (!response.ok) throw new Error(`Unable to load notification recipients (${response.status})`);
      return response.json() as Promise<Array<{ email: string; display_name: string | null; enabled: boolean; event_types: string[] }>>;
    });

    await deliverNotificationBatch(env, superAdminEmail, configured.filter(item => item.event_types?.includes('new_order')));
  }
};
