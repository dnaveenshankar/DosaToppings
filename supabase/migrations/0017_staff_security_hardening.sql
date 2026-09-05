-- Staff role changes must be attributable to a privileged actor. The RPC is
-- service-role-only at the API boundary, and the function independently checks
-- the actor so a forged p_actor cannot grant privileges.
create or replace function public.assign_staff_role(p_target_user uuid,p_role public.app_role,p_actor uuid)
returns public.staff_roles language plpgsql security definer set search_path=public as $$
declare v public.staff_roles%rowtype;
begin
  if p_target_user is null or p_actor is null then raise exception using errcode='22023',message='staff_identity_required'; end if;
  if not exists(select 1 from public.staff_roles where user_id=p_actor and role='super_admin') then raise exception using errcode='42501',message='super_admin_required'; end if;
  if not exists(select 1 from public.profiles where id=p_target_user and is_active=true and email is not null and length(trim(email))>3) then raise exception using errcode='P0001',message='active_staff_email_required'; end if;
  insert into public.staff_roles(user_id,role,assigned_by) values(p_target_user,p_role,p_actor)
  on conflict(user_id) do update set role=excluded.role,assigned_by=excluded.assigned_by,updated_at=now()
  returning * into v;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,metadata) values(p_actor,'staff.role_changed','staff',p_target_user,jsonb_build_object('role',p_role));
  return v;
end; $$;
revoke all on function public.assign_staff_role(uuid,public.app_role,uuid) from public,anon,authenticated;
grant execute on function public.assign_staff_role(uuid,public.app_role,uuid) to service_role;

-- Keep the database's permission mapping authoritative. Existing application
-- role maps can be used as a fallback only while this mapping is populated.
insert into public.permissions(code,description) values
('billing.refund','Process authorized refunds'),('users.read','Read customer/staff users'),('users.create','Create staff/users'),('users.update','Update users'),('users.disable','Disable staff/users')
on conflict(code) do nothing;
