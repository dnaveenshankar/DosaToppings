-- Canonical permission catalog and role grants.
-- The API currently enforces the same role map in code; this table is the
-- authoritative DB catalog for future policy-driven authorization and audit.

insert into public.permissions(code,description) values
('users.read','View users and staff'),('users.create','Create staff/users'),('users.update','Update users/staff'),('users.disable','Disable users/staff'),
('products.read','View products'),('products.write','Create/update products'),('categories.read','View categories'),('categories.write','Create/update categories'),
('orders.read','View orders'),('orders.update','Update order status'),('orders.print','Print orders'),('orders.cancel','Cancel eligible orders'),
('inventory.read','View inventory'),('inventory.adjust','Adjust inventory'),('inventory.transfer','Transfer inventory'),
('billing.create','Create POS sales'),('billing.refund','Issue refunds'),('coupons.read','View coupons'),('coupons.write','Manage coupons'),
('promotions.write','Manage promotions'),('referrals.read','View referrals'),('rewards.adjust','Adjust rewards'),('reviews.moderate','Moderate reviews'),
('reports.read','View reports'),('settings.write','Manage settings'),('audit_logs.read','View audit logs')
on conflict(code) do update set description=excluded.description;

insert into public.role_permissions(role,permission_code)
select r.role,p.code
from (values
('super_admin'::public.app_role,'*'),
('admin_manager','users.read'),('admin_manager','users.create'),('admin_manager','users.update'),('admin_manager','users.disable'),('admin_manager','products.read'),('admin_manager','categories.read'),('admin_manager','orders.read'),('admin_manager','orders.print'),('admin_manager','coupons.read'),('admin_manager','coupons.write'),('admin_manager','promotions.write'),('admin_manager','reports.read'),('admin_manager','audit_logs.read'),
('store_manager','products.read'),('store_manager','products.write'),('store_manager','categories.read'),('store_manager','categories.write'),('store_manager','orders.read'),('store_manager','orders.update'),('store_manager','orders.print'),('store_manager','orders.cancel'),('store_manager','inventory.read'),('store_manager','inventory.adjust'),('store_manager','inventory.transfer'),('store_manager','coupons.read'),('store_manager','coupons.write'),('store_manager','promotions.write'),('store_manager','referrals.read'),('store_manager','reports.read'),
('billing_staff','products.read'),('billing_staff','categories.read'),('billing_staff','orders.read'),('billing_staff','orders.print'),('billing_staff','billing.create'),
('order_staff','products.read'),('order_staff','categories.read'),('order_staff','orders.read'),('order_staff','orders.update'),('order_staff','orders.print'),
('inventory_staff','products.read'),('inventory_staff','categories.read'),('inventory_staff','inventory.read'),('inventory_staff','inventory.adjust'),('inventory_staff','inventory.transfer'),
('content_manager','products.read'),('content_manager','products.write'),('content_manager','categories.read'),('content_manager','categories.write'),
('support_staff','products.read'),('support_staff','categories.read'),('support_staff','orders.read'),('support_staff','orders.update'),('support_staff','orders.print'),('support_staff','referrals.read'),('support_staff','reviews.moderate'),
('review_moderator','products.read'),('review_moderator','reviews.moderate'),
('report_viewer','reports.read')
) as r(role,permission_code) join public.permissions p on p.code=r.permission_code
on conflict(role,permission_code) do nothing;

-- Expand Super Admin's wildcard into concrete rows. This keeps downstream
-- SQL policy checks simple and explicit.
insert into public.role_permissions(role,permission_code)
select 'super_admin'::public.app_role,code from public.permissions
on conflict(role,permission_code) do nothing;
delete from public.role_permissions where role='super_admin' and permission_code='*';
