import type { AppRole, AuthContext } from './authz';
import type { Env } from './types';
import { supabaseAdminRest } from './supabase';

interface ProfileRow { id: string; email: string; is_active: boolean; }
interface StaffRoleRow { user_id: string; role: AppRole; }

export async function resolveAuthContext(env: Env, userId: string, email?: string): Promise<AuthContext> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }

  const profiles = await supabaseAdminRest<ProfileRow[]>(
    env,
    `profiles?select=id,email,is_active&id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  if (!profiles.length || !profiles[0].is_active) {
    return { userId, email, isActive: false };
  }

  const roles = await supabaseAdminRest<StaffRoleRow[]>(
    env,
    `staff_roles?select=user_id,role&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
  );

  return {
    userId,
    email: profiles[0].email || email,
    role: roles[0]?.role,
    isActive: true,
  };
}
