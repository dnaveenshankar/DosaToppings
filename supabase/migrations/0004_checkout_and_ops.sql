-- Checkout/cart/address and operational read/write primitives.
-- Service-role API only; no browser access is granted to these RPCs.

create or replace function public.get_or_create_cart(p_customer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_cart uuid;
begin
  select id into v_cart from public.carts where customer_id=p_customer_id and status='active' order by created_at desc limit 1;
  if v_cart is null then
    insert into public.carts(customer_id) values(p_customer_id) returning id into v_cart;
  end if;
  return v_cart;
end;
$$;

create or replace function public.upsert_cart_item(p_customer_id uuid, p_variant_id uuid, p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_cart uuid; v_item uuid;
begin
  if p_quantity < 1 or p_quantity > 99 then raise exception using errcode='22023', message='invalid_quantity'; end if;
  if not exists(select 1 from public.product_variants where id=p_variant_id and is_active=true) then raise exception using errcode='P0001', message='variant_unavailable'; end if;
  v_cart := public.get_or_create_cart(p_customer_id);
  insert into public.cart_items(cart_id,variant_id,quantity) values(v_cart,p_variant_id,p_quantity)
  on conflict(cart_id,variant_id) do update set quantity=excluded.quantity, updated_at=now()
  returning id into v_item;
  update public.carts set updated_at=now() where id=v_cart;
  return jsonb_build_object('ok',true,'cart_id',v_cart,'item_id',v_item,'quantity',p_quantity);
end;
$$;

create or replace function public.remove_cart_item(p_customer_id uuid, p_variant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_cart uuid;
begin
  select id into v_cart from public.carts where customer_id=p_customer_id and status='active' order by created_at desc limit 1;
  if v_cart is null then return jsonb_build_object('ok',true,'removed',false); end if;
  delete from public.cart_items where cart_id=v_cart and variant_id=p_variant_id;
  update public.carts set updated_at=now() where id=v_cart;
  return jsonb_build_object('ok',true,'removed',true,'cart_id',v_cart);
end;
$$;

create or replace function public.save_customer_address(
  p_customer_id uuid,
  p_address_id uuid,
  p_label text,
  p_recipient_name text,
  p_phone text,
  p_line1 text,
  p_line2 text,
  p_locality text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_country text,
  p_is_default boolean
)
returns public.addresses
language plpgsql
security definer
set search_path = public
as $$
declare v_address public.addresses%rowtype;
begin
  if length(trim(coalesce(p_recipient_name,''))) < 2 or length(trim(coalesce(p_line1,''))) < 3
     or length(trim(coalesce(p_city,''))) < 2 or length(trim(coalesce(p_state,''))) < 2
     or length(trim(coalesce(p_postal_code,''))) < 3 then
    raise exception using errcode='22023', message='invalid_address';
  end if;
  if p_is_default then update public.addresses set is_default=false, updated_at=now() where customer_id=p_customer_id; end if;
  if p_address_id is null then
    insert into public.addresses(customer_id,label,recipient_name,phone,line1,line2,locality,city,state,postal_code,country,is_default)
    values(p_customer_id,nullif(trim(p_label),''),trim(p_recipient_name),nullif(trim(p_phone),''),trim(p_line1),nullif(trim(p_line2),''),nullif(trim(p_locality),''),trim(p_city),trim(p_state),trim(p_postal_code),coalesce(nullif(trim(p_country),''),'India'),coalesce(p_is_default,false))
    returning * into v_address;
  else
    update public.addresses set label=nullif(trim(p_label),''),recipient_name=trim(p_recipient_name),phone=nullif(trim(p_phone),''),line1=trim(p_line1),line2=nullif(trim(p_line2),''),locality=nullif(trim(p_locality),''),city=trim(p_city),state=trim(p_state),postal_code=trim(p_postal_code),country=coalesce(nullif(trim(p_country),''),'India'),is_default=coalesce(p_is_default,false),updated_at=now()
    where id=p_address_id and customer_id=p_customer_id returning * into v_address;
    if not found then raise exception using errcode='P0002', message='address_not_found'; end if;
  end if;
  return v_address;
end;
$$;

create or replace function public.admin_update_order_status(p_order_id uuid, p_to_status public.order_status, p_actor uuid, p_reason text default null)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0002', message='order_not_found'; end if;
  if p_to_status = v_order.status then return v_order; end if;
  update public.orders set status=p_to_status, updated_at=now() where id=p_order_id returning * into v_order;
  insert into public.order_status_history(order_id,from_status,to_status,changed_by,reason) values(p_order_id,(select status from public.orders where id=p_order_id),p_to_status,p_actor,p_reason);
  return v_order;
end;
$$;

create or replace function public.admin_adjust_inventory(p_variant_id uuid, p_quantity integer, p_actor uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_balance bigint;
begin
  if p_quantity = 0 or length(trim(coalesce(p_reason,''))) < 3 then raise exception using errcode='22023', message='invalid_inventory_adjustment'; end if;
  insert into public.inventory_movements(variant_id,movement_type,quantity,reference_type,notes,performed_by) values(p_variant_id,'adjustment',p_quantity,'admin',trim(p_reason),p_actor);
  select coalesce(sum(quantity),0) into v_balance from public.inventory_movements where variant_id=p_variant_id;
  return jsonb_build_object('ok',true,'variant_id',p_variant_id,'balance',v_balance);
end;
$$;

revoke all on function public.get_or_create_cart(uuid) from public, anon, authenticated;
revoke all on function public.upsert_cart_item(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.remove_cart_item(uuid,uuid) from public, anon, authenticated;
revoke all on function public.save_customer_address(uuid,uuid,text,text,text,text,text,text,text,text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.admin_update_order_status(uuid,public.order_status,uuid,text) from public, anon, authenticated;
revoke all on function public.admin_adjust_inventory(uuid,integer,uuid,text) from public, anon, authenticated;
