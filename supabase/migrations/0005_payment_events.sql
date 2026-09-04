-- Idempotent webhook ingestion. Signature verification remains in the Worker;
-- this function handles duplicate event suppression and authoritative payment state.

create or replace function public.process_razorpay_event_atomic(
  p_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_entity jsonb;
  v_payment_id text;
  v_order_id text;
  v_amount bigint;
  v_method text;
  v_success boolean;
  v_existing public.payment_events%rowtype;
  v_result jsonb;
begin
  if p_event_id is null or length(trim(p_event_id)) < 8 then
    raise exception using errcode='22023', message='event_id_required';
  end if;
  if p_event_type is null or length(trim(p_event_type)) = 0 then
    raise exception using errcode='22023', message='event_type_required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode='22023', message='invalid_payload';
  end if;

  select * into v_existing from public.payment_events where event_id=p_event_id for update;
  if found then
    if v_existing.payload_hash is distinct from p_payload_hash then
      raise exception using errcode='23505', message='event_id_payload_mismatch';
    end if;
    return jsonb_build_object('ok',true,'duplicate',true,'event_id',p_event_id,'processed',v_existing.processed_at is not null);
  end if;

  insert into public.payment_events(provider,event_id,event_type,payload_hash,payload)
  values('razorpay',p_event_id,p_event_type,p_payload_hash,p_payload);

  if p_event_type in ('payment.captured','payment.authorized','order.paid') then
    v_success := true;
  elsif p_event_type in ('payment.failed') then
    v_success := false;
  else
    update public.payment_events set processed_at=now() where event_id=p_event_id;
    return jsonb_build_object('ok',true,'ignored',true,'event_id',p_event_id,'event_type',p_event_type);
  end if;

  v_payment_entity := coalesce(p_payload->'payload'->'payment'->'entity', p_payload->'payment'->'entity', p_payload->'payload'->'order'->'entity');
  v_payment_id := v_payment_entity->>'id';
  v_order_id := v_payment_entity->>'order_id';
  v_amount := (v_payment_entity->>'amount')::bigint;
  v_method := v_payment_entity->>'method';

  if v_payment_id is null or v_amount is null then
    raise exception using errcode='22023', message='unsupported_razorpay_payload';
  end if;

  v_result := public.reconcile_payment_atomic(v_payment_id, v_order_id, v_amount, v_success, v_method);

  update public.payment_events
  set processed_at=now()
  where event_id=p_event_id;

  return v_result || jsonb_build_object('event_id',p_event_id,'duplicate',false);
exception
  when others then
    -- Keep the event row for forensic/audit visibility. processed_at remains null so
    -- a controlled retry can safely re-run the reconciliation after the root cause is fixed.
    raise;
end;
$$;

revoke all on function public.process_razorpay_event_atomic(text,text,jsonb,text) from public,anon,authenticated;
