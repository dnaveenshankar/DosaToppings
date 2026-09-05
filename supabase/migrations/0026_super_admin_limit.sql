-- Hard cap: at most three active Super Admin accounts.
-- The advisory transaction lock serializes concurrent promotions.
create or replace function public.assign_staff_role(p_target_user uuid,p_role public.app_role,p_actor uuid)
returns public.staff_roles language plpgsql security definer set search_path=public as $$
declare
  v public.staff_roles%rowtype;
  v_active_super_admins integer;
begin
  if p_target_user is null or p_actor is null then
    raise exception using errcode='22023',message='staff_identity_required';
  end if;

  if not exists(select 1 from public.staff_roles where user_id=p_actor and role='super_admin') then
    raise exception using errcode='42501',message='super_admin_required';
  end if;

  if not exists(select 1 from public.profiles where id=p_target_user and is_active=true and email is not null and length(trim(email))>3) then
    raise exception using errcode='P0001',message='active_staff_email_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('dosatoppings:super_admin_limit', 20260905));

  if p_role='super_admin' and not exists(
    select 1 from public.staff_roles sr
    join public.profiles p on p.id=sr.user_id
    where sr.role='super_admin' and p.is_active=true and sr.user_id<>p_target_user
  ) then
    null;
  elsif p_role='super_admin' then
    select count(*) into v_active_super_admins
    from public.staff_roles sr
    join public.profiles p on p.id=sr.user_id
    where sr.role='super_admin' and p.is_active=true and sr.user_id<>p_target_user;
    if v_active_super_admins >= 3 then
      raise exception using errcode='P0001',message='super_admin_limit_reached';
    end if;
  end if;

  insert into public.staff_roles(user_id,role,assigned_by)
  values(p_target_user,p_role,p_actor)
  on conflict(user_id) do update set role=excluded.role,assigned_by=excluded.assigned_by,updated_at=now()
  returning * into v;

  insert into public.audit_logs(actor_id,action,resource_type,resource_id,metadata)
  values(p_actor,'staff.role_changed','staff',p_target_user,jsonb_build_object('role',p_role,'super_admin_limit',3));

  return v;
end; $$;

revoke all on function public.assign_staff_role(uuid,public.app_role,uuid) from public,anon,authenticated;
grant execute on function public.assign_staff_role(uuid,public.app_role,uuid) to service_role;
