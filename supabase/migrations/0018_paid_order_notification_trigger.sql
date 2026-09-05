-- Queue a durable new-order notification in the same transaction that marks a payment paid.
-- This covers online payments and POS payments without making email delivery part of checkout.
create or replace function public.enqueue_new_order_notification_on_paid_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_customer public.profiles%rowtype;
begin
  if new.status <> 'paid'::public.payment_status or old.status = 'paid'::public.payment_status then
    return new;
  end if;

  select * into v_order from public.orders where id = new.order_id;
  if not found then
    return new;
  end if;

  if v_order.customer_id is not null then
    select * into v_customer from public.profiles where id = v_order.customer_id;
  end if;

  insert into public.notification_outbox(
    event_type,
    aggregate_type,
    aggregate_id,
    idempotency_key,
    payload
  ) values (
    'new_order',
    'order',
    v_order.id,
    'new_order:' || v_order.id::text,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'customer_name', coalesce(v_customer.display_name, 'Customer'),
      'total_rupees', to_char(v_order.total_paise / 100.0, 'FM999999990.00'),
      'payment_status', 'Paid',
      'admin_url', 'https://admin.dosatoppings.in/orders/' || v_order.id::text
    )
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

revoke all on function public.enqueue_new_order_notification_on_paid_payment() from public,anon,authenticated;
grant execute on function public.enqueue_new_order_notification_on_paid_payment() to service_role;

drop trigger if exists payments_paid_notification on public.payments;
create trigger payments_paid_notification
after update of status on public.payments
for each row
when (new.status = 'paid'::public.payment_status and old.status is distinct from new.status)
execute function public.enqueue_new_order_notification_on_paid_payment();
