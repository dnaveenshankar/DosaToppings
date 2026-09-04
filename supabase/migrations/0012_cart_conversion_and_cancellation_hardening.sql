-- Checkout finalization hardening.
-- A cart is converted only after a paid order is reconciled. Failed/cancelled
-- orders do not consume the customer's cart.

create or replace function public.convert_cart_after_paid_order(
  p_customer_id uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_cart public.carts%rowtype;
begin
  select * into v_order
  from public.orders
  where id=p_order_id and customer_id=p_customer_id
  for update;
  if not found then raise exception using errcode='P0002',message='order_not_found'; end if;
  if v_order.status <> 'paid' then
    raise exception using errcode='P0001',message='order_not_paid';
  end if;

  select * into v_cart
  from public.carts
  where customer_id=p_customer_id and status='active'
  order by updated_at desc limit 1
  for update;

  if found then
    update public.carts set status='converted',updated_at=now() where id=v_cart.id;
    return jsonb_build_object('ok',true,'cart_id',v_cart.id,'converted',true);
  end if;
  return jsonb_build_object('ok',true,'converted',false);
end;
$$;

revoke all on function public.convert_cart_after_paid_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.convert_cart_after_paid_order(uuid,uuid) to service_role;

-- Cancellation is a customer-owned operation and remains service-role-only.
-- The API must authenticate the customer before invoking it.
