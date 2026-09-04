-- Preserve the original inventory reservation semantics while making payment
-- reconciliation safe under repeated webhooks and concurrent processing.

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
  v_available bigint;
begin
  if p_provider_payment_id is null or length(trim(p_provider_payment_id)) = 0 then
    raise exception using errcode='22023', message='provider_payment_id_required';
  end if;
  if p_amount_paise is null or p_amount_paise < 0 then
    raise exception using errcode='22023', message='invalid_payment_amount';
  end if;

  select * into v_payment
  from public.payments
  where (p_provider_order_id is not null and provider_order_id = p_provider_order_id)
     or provider_payment_id = p_provider_payment_id
  order by created_at desc
  limit 1
  for update;

  if not found then raise exception using errcode='P0002', message='payment_not_found'; end if;
  select * into v_order from public.orders where id=v_payment.order_id for update;

  if p_amount_paise <> v_payment.amount_paise then
    update public.payments set status='failed', method=p_method, updated_at=now() where id=v_payment.id;
    update public.orders set status='payment_review', updated_at=now() where id=v_order.id;
    insert into public.order_status_history(order_id,from_status,to_status,reason)
    values(v_order.id,v_order.status,'payment_review','Payment amount mismatch');
    raise exception using errcode='P0001', message='payment_amount_mismatch';
  end if;

  if p_success then
    if v_payment.status = 'paid' and v_order.status in ('paid','processing','packed','shipped','delivered') then
      return jsonb_build_object('ok',true,'duplicate',true,'order_id',v_order.id,'payment_id',v_payment.id,'status',v_order.status);
    end if;
    if v_payment.status = 'failed' then
      raise exception using errcode='P0001', message='payment_already_failed';
    end if;

    update public.payments
      set provider_payment_id=coalesce(provider_payment_id,p_provider_payment_id),
          provider_order_id=coalesce(p_provider_order_id,provider_order_id),
          status='paid', method=p_method, updated_at=now()
    where id=v_payment.id;

    for v_item in select * from public.order_items where order_id=v_order.id loop
      select coalesce(sum(quantity),0) into v_available
      from public.inventory_movements where variant_id=v_item.variant_id;
      if v_available < 0 then
        update public.payments set status='pending', updated_at=now() where id=v_payment.id;
        update public.orders set status='payment_review', updated_at=now() where id=v_order.id;
        raise exception using errcode='P0001', message='inventory_not_available_during_payment';
      end if;
      insert into public.inventory_movements(variant_id,movement_type,quantity,reference_type,reference_id,notes)
      values(v_item.variant_id,'release',v_item.quantity,'order',v_order.id,'Convert reservation to sale');
      insert into public.inventory_movements(variant_id,movement_type,quantity,reference_type,reference_id,notes)
      values(v_item.variant_id,'sale',-v_item.quantity,'order',v_order.id,'Paid order sale');
    end loop;

    update public.orders set status='paid', updated_at=now() where id=v_order.id;
    insert into public.order_status_history(order_id,from_status,to_status,reason)
    values(v_order.id,v_order.status,'paid','Verified payment');
  else
    if v_payment.status = 'paid' then
      return jsonb_build_object('ok',true,'duplicate',true,'order_id',v_order.id,'payment_id',v_payment.id,'status',v_order.status);
    end if;
    update public.payments
      set provider_payment_id=coalesce(provider_payment_id,p_provider_payment_id),
          provider_order_id=coalesce(p_provider_order_id,provider_order_id),
          status='failed', method=p_method, updated_at=now()
    where id=v_payment.id;
    if v_order.status <> 'payment_failed' then
      for v_item in select * from public.order_items where order_id=v_order.id loop
        insert into public.inventory_movements(variant_id,movement_type,quantity,reference_type,reference_id,notes)
        values(v_item.variant_id,'release',v_item.quantity,'order',v_order.id,'Release failed-payment reservation');
      end loop;
      update public.orders set status='payment_failed', updated_at=now() where id=v_order.id;
      insert into public.order_status_history(order_id,from_status,to_status,reason)
      values(v_order.id,v_order.status,'payment_failed','Payment failed');
    end if;
  end if;

  v_result := jsonb_build_object('ok',true,'order_id',v_order.id,'payment_id',v_payment.id,'status',(select status from public.orders where id=v_order.id));
  return v_result;
end;
$$;

revoke all on function public.reconcile_payment_atomic(text,text,bigint,boolean,text) from public,anon,authenticated;
grant execute on function public.reconcile_payment_atomic(text,text,bigint,boolean,text) to service_role;
