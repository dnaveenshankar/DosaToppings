-- 0028: ensure active Super Admins have every current concrete permission.
-- Safe to run repeatedly. The wildcard grant is deliberately not used.
insert into public.role_permissions(role,permission_code)
select 'super_admin'::public.app_role, p.code
from public.permissions p
on conflict(role,permission_code) do nothing;

delete from public.role_permissions
where role='super_admin'
  and permission_code='*';
