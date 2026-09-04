-- Staff authorization hardening.
-- Production bootstrap should assign the first Super Admin through a controlled SQL/admin path.
-- No staff role is granted automatically to a newly authenticated user.

create or replace function public.assign_staff_role(p_target_user uuid, p_role public.app_role, p_actor uuid)
returns public.staff_roles
language plpgsql
security definer
set search_path = public
as $$
declare v_role public.staff_roles%rowtype;
begin
  if not exists(select 1 from public.staff_roles where user_id=p_actor and role='super_admin') then
    raise exception using errcode='42501', message='super_admin_required';
  end if;
  if not exists(select 1 from public.profiles where id=p_target_user and is_active=true) then
    raise exception using errcode='P0002', message='staff_profile_not_found';
  end if;
  insert into public.staff_roles(user_id,role,assigned_by) values(p_target_user,p_role,p_actor)
  on conflict(user_id) do update set role=excluded.role, assigned_by=excluded.assigned_by, updated_at=now()
  returning * into v_role;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(p_actor,'staff.role_changed','staff_role',p_target_user,jsonb_build_object('role',p_role));
  return v_role;
end;
$$;

revoke all on function public.assign_staff_role(uuid,public.app_role,uuid) from public,anon,authenticated;
