import type { AppRole, AuthContext, Permission } from './authz';
import type { Env } from './types';
import { supabaseAdminRest } from './supabase';

interface ProfileRow { id:string; email:string; is_active:boolean; }
interface StaffRoleRow { user_id:string; role:AppRole; }
const ALL_PERMISSIONS: Permission[] = ['users.read','users.create','users.update','users.disable','users.activity.read','products.read','products.write','categories.read','categories.write','orders.read','orders.update','orders.print','orders.cancel','inventory.read','inventory.adjust','inventory.transfer','billing.create','billing.refund','coupons.read','coupons.write','promotions.write','referrals.read','referrals.write','rewards.adjust','reviews.moderate','reports.read','settings.write','settings.features.write','audit_logs.read','content.read','content.write'];

export async function resolveAuthContext(env:Env,userId:string,email?:string):Promise<AuthContext>{
  if(!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  const profiles=await supabaseAdminRest<ProfileRow[]>(env,`profiles?select=id,email,is_active&id=eq.${encodeURIComponent(userId)}&limit=1`);
  if(!profiles.length||!profiles[0].is_active)return{userId,email,isActive:false};
  const roles=await supabaseAdminRest<StaffRoleRow[]>(env,`staff_roles?select=user_id,role&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  const role=roles[0]?.role;
  if(!role)return{userId,email:profiles[0].email||email,isActive:true};
  if(role==='super_admin')return{userId,email:profiles[0].email||email,role,isActive:true,permissions:ALL_PERMISSIONS};
  const permissions=await supabaseAdminRest<{permission_code:string}[]>(env,`role_permissions?select=permission_code&role=eq.${encodeURIComponent(role)}`);
  return{userId,email:profiles[0].email||email,role,isActive:true,permissions:permissions.map((p)=>p.permission_code as Permission)};
}
