export type AppRole =
  | 'super_admin' | 'admin_manager' | 'store_manager' | 'billing_staff'
  | 'order_staff' | 'inventory_staff' | 'content_manager'
  | 'support_staff' | 'review_moderator' | 'report_viewer';

export type Permission =
  | 'users.read' | 'users.create' | 'users.update' | 'users.disable'
  | 'products.read' | 'products.write' | 'categories.read' | 'categories.write'
  | 'orders.read' | 'orders.update' | 'orders.print' | 'orders.cancel'
  | 'inventory.read' | 'inventory.adjust' | 'inventory.transfer'
  | 'billing.create' | 'billing.refund' | 'coupons.read' | 'coupons.write'
  | 'promotions.write' | 'referrals.read' | 'rewards.adjust' | 'reviews.moderate'
  | 'reports.read' | 'settings.write' | 'audit_logs.read'
  | 'content.read' | 'content.write';

export interface AuthContext {
  userId: string;
  email?: string;
  role?: AppRole;
  isActive: boolean;
  permissions?: readonly Permission[];
}

export function hasPermission(ctx: AuthContext, permission: Permission): boolean {
  return !!ctx.isActive && !!ctx.role && !!ctx.permissions?.includes(permission);
}

export function requirePermission(ctx: AuthContext, permission: Permission): void {
  if (!ctx.isActive) throw new Response('Account disabled', { status: 403 });
  if (!hasPermission(ctx, permission)) throw new Response('Forbidden', { status: 403 });
}

export function requireSuperAdminEmail(ctx: AuthContext): void {
  if (ctx.role === 'super_admin' && !ctx.email?.trim()) throw new Response('Super Admin email is required', { status: 403 });
}
