create or replace function public.set_staff_active(
  p_target_user uuid,
  p_active boolean,
  p_actor uuid
) returns public.profiles
language plpgsql security definer set search_path=public
as $$
declare v public.profiles%rowtype; v_role public.app_role;
begin
  if p_target_user is null or p_actor is null then raise exception using errcode='22023',message='staff_identity_required'; end if;
  if not exists(select 1 from public.staff_roles where user_id=p_actor and role in ('super_admin','admin_manager')) then
    raise exception using errcode='42501',message='staff_management_required';
  end if;
  select role into v_role from public.staff_roles where user_id=p_target_user;
  if not found then raise exception using errcode='P0002',message='staff_role_not_found'; end if;
  if v_role='super_admin' and p_active=false then
    if (select count(*) from public.staff_roles sr join public.profiles p on p.id=sr.user_id where sr.role='super_admin' and p.is_active=true) <= 1 then
      raise exception using errcode='P0001',message='cannot_disable_last_super_admin';
    end if;
    if not exists(select 1 from public.staff_roles where user_id=p_actor and role='super_admin') then
      raise exception using errcode='42501',message='super_admin_required';
    end if;
  end if;
  update public.profiles set is_active=p_active,updated_at=now() where id=p_target_user returning * into v;
  if not found then raise exception using errcode='P0002',message='staff_not_found'; end if;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,metadata)
    values(p_actor,'staff.active_changed','staff',p_target_user,jsonb_build_object('is_active',p_active));
  return v;
end; $$;
revoke all on function public.set_staff_active(uuid,boolean,uuid) from public,anon,authenticated;
grant execute on function public.set_staff_active(uuid,boolean,uuid) to service_role;
