-- Security/operations hardening for staff audit and POS attribution.

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
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,metadata)
  values(p_actor,'staff.role_changed','staff_role',p_target_user,jsonb_build_object('role',p_role));
  return v_role;
end;
$$;
revoke all on function public.assign_staff_role(uuid,public.app_role,uuid) from public,anon,authenticated;
grant execute on function public.assign_staff_role(uuid,public.app_role,uuid) to service_role;

-- POS keeps the individual staff member as actor while an optional registered customer owns the order.
create or replace function public.create_pos_order_atomic(p_staff_id uuid,p_customer_id uuid,p_idempotency_key text,p_request_hash text,p_items jsonb)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_result jsonb; v_order_id uuid;
begin
  if not exists(select 1 from public.staff_roles where user_id=p_staff_id) then raise exception using errcode='42501',message='staff_required'; end if;
  if p_customer_id is not null and not exists(select 1 from public.profiles where id=p_customer_id and is_active=true) then raise exception using errcode='P0002',message='customer_not_found'; end if;
  v_result := public.create_order_atomic(p_staff_id,p_idempotency_key,p_request_hash,p_items,null,null,null,null);
  v_order_id := (v_result->>'order_id')::uuid;
  update public.orders set customer_id=p_customer_id,updated_at=now() where id=v_order_id;
  return v_result;
end;
$$;
revoke all on function public.create_pos_order_atomic(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_pos_order_atomic(uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.create_order_atomic(uuid,text,text,jsonb,jsonb,jsonb,text,text) to service_role;
grant execute on function public.reconcile_payment_atomic(text,text,bigint,boolean,text) to service_role;

-- Explicitly prevent an authorization event from becoming a paid order by itself.
create or replace function public.process_razorpay_event_atomic(p_event_id text,p_event_type text,p_payload jsonb,p_payload_hash text)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_payment jsonb; v_entity jsonb; v_payment_id text; v_order_id text; v_amount bigint; v_success boolean;
begin
  if p_event_id is null or p_event_type is null or p_payload is null then raise exception using errcode='22023',message='invalid_event'; end if;
  if exists(select 1 from public.payment_events where event_id=p_event_id) then
    if exists(select 1 from public.payment_events where event_id=p_event_id and payload_hash=p_payload_hash) then return jsonb_build_object('ok',true,'duplicate',true); end if;
    raise exception using errcode='23505',message='event_id_payload_mismatch';
  end if;
  insert into public.payment_events(provider,event_id,event_type,payload_hash,payload) values('razorpay',p_event_id,p_event_type,p_payload_hash,p_payload);
  v_entity := coalesce(p_payload->'payload'->'payment'->'entity',p_payload->'payment'->'entity',p_payload->'payload'->'order'->'entity','{}'::jsonb);
  v_payment_id := nullif(v_entity->>'id','');
  v_order_id := nullif(v_entity->'notes'->>'dosatoppings_order_id','');
  v_amount := nullif(v_entity->>'amount','')::bigint;
  v_success := p_event_type in ('payment.captured','order.paid');
  if p_event_type='payment.authorized' then
    update public.payment_events set processed_at=now() where event_id=p_event_id;
    return jsonb_build_object('ok',true,'ignored','authorization_not_capture');
  end if;
  if p_event_type='payment.failed' then v_success:=false; end if;
  if v_payment_id is null or v_amount is null then
    update public.payment_events set processed_at=now() where event_id=p_event_id;
    return jsonb_build_object('ok',true,'ignored','event_without_payment_entity');
  end if;
  perform public.reconcile_payment_atomic(v_payment_id,null,v_amount,v_success,null);
  update public.payment_events set processed_at=now() where event_id=p_event_id;
  return jsonb_build_object('ok',true,'processed',true,'payment_id',v_payment_id,'order_id',v_order_id);
exception when others then raise;
end;
$$;
revoke all on function public.process_razorpay_event_atomic(text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.process_razorpay_event_atomic(text,text,jsonb,text) to service_role;
