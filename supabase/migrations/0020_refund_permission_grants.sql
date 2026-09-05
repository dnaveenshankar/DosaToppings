-- Keep API permission checks aligned with the refund approval policy.
insert into public.role_permissions(role,permission_code)
values
  ('super_admin','billing.refund'),
  ('admin_manager','billing.refund'),
  ('store_manager','billing.refund')
on conflict(role,permission_code) do nothing;
