-- Customer cancellation hardening.
-- Only unpaid/pending orders can be cancelled here. Paid-order refunds require the
-- dedicated refund workflow so payment provider state and inventory remain aligned.

create or replace function public.cancel_customer_order_atomic(
  p_customer_id uuid,
  p_order_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
begin
  if p_customer_id is null or p_order_id is null then
    raise exception using errcode='22023', message='customer_and_order_required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and customer_id = p_customer_id
  for update;

  if not found then
    raise exception using errcode='P0002', message='order_not_found';
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'duplicate', true, 'order_id', v_order.id, 'status', 'cancelled');
  end if;

  if v_order.status <> 'payment_pending' then
    raise exception using errcode='P0001', message='order_not_cancellable';
  end if;

  for v_item in select variant_id, quantity from public.order_items where order_id = v_order.id loop
    perform pg_advisory_xact_lock(hashtextextended(v_item.variant_id::text, 20260904));
    insert into public.inventory_movements(
      variant_id, movement_type, quantity, reference_type, reference_id, notes, performed_by
    ) values (
      v_item.variant_id, 'release', v_item.quantity, 'order', v_order.id,
      'Release customer cancellation reservation', p_customer_id
    );
  end loop;

  update public.orders
  set status = 'cancelled', updated_at = now()
  where id = v_order.id;

  insert into public.order_status_history(order_id, from_status, to_status, changed_by, reason)
  values (v_order.id, v_order.status, 'cancelled', p_customer_id, coalesce(nullif(trim(p_reason), ''), 'Customer cancelled order'));

  update public.payments
  set status = 'cancelled', updated_at = now()
  where order_id = v_order.id and status in ('created','pending','authorized');

  return jsonb_build_object('ok', true, 'order_id', v_order.id, 'status', 'cancelled');
end;
$$;

revoke all on function public.cancel_customer_order_atomic(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_customer_order_atomic(uuid,uuid,text) to service_role;
