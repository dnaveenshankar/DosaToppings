-- Hardening migration for concurrent checkouts and strict payment state transitions.

create or replace function public.create_order_atomic(
  p_actor_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_items jsonb,
  p_billing_address jsonb default null,
  p_shipping_address jsonb default null,
  p_coupon_code text default null,
  p_referral_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.api_idempotency_keys%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_subtotal bigint := 0;
  v_total bigint := 0;
  v_variant record;
  v_item jsonb;
  v_qty integer;
  v_available bigint;
  v_line_total bigint;
  v_items jsonb := '[]'::jsonb;
  v_payment_id uuid;
  v_status public.order_status := 'payment_pending';
  v_variant_id uuid;
begin
  if p_actor_id is null then raise exception using errcode='28000', message='actor_required'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 16 or length(p_idempotency_key) > 128 then
    raise exception using errcode='22023', message='invalid_idempotency_key';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception using errcode='22023', message='invalid_items';
  end if;
  if (select count(*) from jsonb_array_elements(p_items)) <>
     (select count(distinct value->>'variant_id') from jsonb_array_elements(p_items)) then
    raise exception using errcode='22023', message='duplicate_cart_item';
  end if;

  select * into v_existing
  from public.api_idempotency_keys
  where actor_id = p_actor_id and idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_existing.request_hash <> p_request_hash then
      raise exception using errcode='23505', message='idempotency_key_reused_with_different_request';
    end if;
    if v_existing.response_body is not null then return v_existing.response_body; end if;
    raise exception using errcode='55P03', message='request_already_processing';
  end if;

  insert into public.api_idempotency_keys(actor_id, idempotency_key, request_hash)
  values (p_actor_id, p_idempotency_key, p_request_hash);

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception using errcode='22023', message='invalid_quantity';
    end if;

    -- Advisory transaction lock serializes reservations for the same SKU without
    -- turning the immutable inventory ledger into mutable stock counters.
    perform pg_advisory_xact_lock(hashtextextended(v_variant_id::text, 20260904));

    select pv.*, p.name as product_name
      into v_variant
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = v_variant_id
      and pv.is_active = true
      and p.is_published = true
    for update of pv;

    if not found then raise exception using errcode='P0001', message='variant_unavailable'; end if;

    select coalesce(sum(im.quantity), 0)
      into v_available
    from public.inventory_movements im
    where im.variant_id = v_variant.id;

    if v_available < v_qty then
      raise exception using errcode='P0001', message='insufficient_stock';
    end if;

    v_line_total := v_variant.price_paise * v_qty;
    v_subtotal := v_subtotal + v_line_total;
    v_items := v_items || jsonb_build_object(
      'variant_id', v_variant.id,
      'product_name', v_variant.product_name,
      'variant_name', v_variant.name,
      'sku', v_variant.sku,
      'quantity', v_qty,
      'unit_price_paise', v_variant.price_paise,
      'discount_paise', 0,
      'line_total_paise', v_line_total
    );
  end loop;

  v_total := v_subtotal;
  v_order_number := 'DT-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));

  insert into public.orders(
    order_number, customer_id, status, subtotal_paise, discount_paise,
    shipping_paise, tax_paise, total_paise, billing_address, shipping_address,
    referral_code
  ) values (
    v_order_number, p_actor_id, v_status, v_subtotal, 0, 0, 0, v_total,
    p_billing_address, p_shipping_address, nullif(trim(p_referral_code), '')
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(v_items) loop
    insert into public.order_items(
      order_id, variant_id, product_name, variant_name, sku, quantity,
      unit_price_paise, discount_paise, line_total_paise
    ) values (
      v_order_id, (v_item->>'variant_id')::uuid, v_item->>'product_name',
      v_item->>'variant_name', nullif(v_item->>'sku',''), (v_item->>'quantity')::integer,
      (v_item->>'unit_price_paise')::bigint, 0, (v_item->>'line_total_paise')::bigint
    );

    insert into public.inventory_movements(
      variant_id, movement_type, quantity, reference_type, reference_id, notes, performed_by
    ) values (
      (v_item->>'variant_id')::uuid, 'reservation', -(v_item->>'quantity')::integer,
      'order', v_order_id, 'Checkout stock reservation', p_actor_id
    );
  end loop;

  insert into public.order_status_history(order_id, from_status, to_status, changed_by, reason)
  values (v_order_id, 'cart', v_status, p_actor_id, 'Order created');

  insert into public.payments(order_id, amount_paise, status)
  values (v_order_id, v_total, 'created') returning id into v_payment_id;

  update public.api_idempotency_keys
  set response_status = 201, resource_type='order', resource_id=v_order_id,
      response_body=jsonb_build_object('ok',true,'order_id',v_order_id,'order_number',v_order_number,
        'payment_id',v_payment_id,'status',v_status,'amount_paise',v_total,'currency','INR')
  where actor_id=p_actor_id and idempotency_key=p_idempotency_key;

  return (select response_body from public.api_idempotency_keys where actor_id=p_actor_id and idempotency_key=p_idempotency_key);
exception
  when others then
    delete from public.api_idempotency_keys where actor_id=p_actor_id and idempotency_key=p_idempotency_key and response_body is null;
    raise;
end;
$$;

create or replace function public.reconcile_payment_atomic(
  p_provider_payment_id text,
  p_provider_order_id text,
  p_amount_paise bigint,
  p_success boolean,
  p_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_item record;
  v_result jsonb;
begin
  if p_provider_payment_id is null or length(trim(p_provider_payment_id)) = 0 then
    raise exception using errcode='22023', message='provider_payment_id_required';
  end if;

  select * into v_payment from public.payments
  where provider_order_id=p_provider_order_id or provider_payment_id=p_provider_payment_id
  order by created_at desc limit 1 for update;
  if not found then raise exception using errcode='P0002', message='payment_not_found'; end if;

  select * into v_order from public.orders where id=v_payment.order_id for update;

  if p_amount_paise <> v_payment.amount_paise then
    update public.payments set status='failed', method=p_method, updated_at=now() where id=v_payment.id;
    update public.orders set status='payment_review', updated_at=now() where id=v_order.id;
    raise exception using errcode='P0001', message='payment_amount_mismatch';
  end if;

  if p_success then
    if v_payment.status='paid' then
      return jsonb_build_object('ok',true,'duplicate',true,'order_id',v_order.id,'status',v_order.status);
    end if;
    if v_payment.status in ('refunded','partially_refunded','cancelled') then
      raise exception using errcode='P0001', message='invalid_payment_transition';
    end if;

    update public.payments set provider_payment_id=p_provider_payment_id,
      provider_order_id=coalesce(p_provider_order_id,provider_order_id),status='paid',method=p_method,updated_at=now()
    where id=v_payment.id;

    for v_item in select * from public.order_items where order_id=v_order.id loop
      perform pg_advisory_xact_lock(hashtextextended(v_item.variant_id::text, 20260904));
      insert into public.inventory_movements(variant_id,movement_type,quantity,reference_type,reference_id,notes)
      values(v_item.variant_id,'release',v_item.quantity,'order',v_order.id,'Convert reservation to sale');
      insert into public.inventory_movements(variant_id,movement_type,quantity,reference_type,reference_id,notes)
      values(v_item.variant_id,'sale',-v_item.quantity,'order',v_order.id,'Paid order sale');
    end loop;

    update public.orders set status='paid',updated_at=now() where id=v_order.id;
    insert into public.order_status_history(order_id,from_status,to_status,reason)
    values(v_order.id,v_order.status,'paid','Verified payment');
  else
    if v_payment.status='paid' then
      raise exception using errcode='P0001', message='cannot_fail_paid_payment';
    end if;
    if v_payment.status='failed' then
      return jsonb_build_object('ok',true,'duplicate',true,'order_id',v_order.id,'status',v_order.status);
    end if;

    update public.payments set provider_payment_id=coalesce(provider_payment_id,p_provider_payment_id),
      status='failed',method=p_method,updated_at=now() where id=v_payment.id;
    for v_item in select * from public.order_items where order_id=v_order.id loop
      perform pg_advisory_xact_lock(hashtextextended(v_item.variant_id::text, 20260904));
      insert into public.inventory_movements(variant_id,movement_type,quantity,reference_type,reference_id,notes)
      values(v_item.variant_id,'release',v_item.quantity,'order',v_order.id,'Release failed-payment reservation');
    end loop;
    update public.orders set status='payment_failed',updated_at=now() where id=v_order.id;
    insert into public.order_status_history(order_id,from_status,to_status,reason)
    values(v_order.id,v_order.status,'payment_failed','Payment failed');
  end if;

  v_result=jsonb_build_object('ok',true,'order_id',v_order.id,'payment_id',v_payment.id,'status',(select status from public.orders where id=v_order.id));
  return v_result;
end;
$$;

revoke all on function public.create_order_atomic(uuid,text,text,jsonb,jsonb,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.reconcile_payment_atomic(text,text,bigint,boolean,text) from public,anon,authenticated;
