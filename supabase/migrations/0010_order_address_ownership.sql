-- Resolve checkout address IDs only through the authenticated customer's rows.
-- The stored JSON is a snapshot so later address edits cannot rewrite an invoice/order.

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
begin
  if p_actor_id is null then raise exception using errcode='28000', message='actor_required'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 16 or length(p_idempotency_key) > 128 then raise exception using errcode='22023', message='invalid_idempotency_key'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then raise exception using errcode='22023', message='invalid_items'; end if;

  if exists (select 1 from (select value->>'variant_id' as variant_id from jsonb_array_elements(p_items) group by value->>'variant_id' having count(*) > 1) duplicates) then
    raise exception using errcode='22023', message='duplicate_variant';
  end if;

  select * into v_existing from public.api_idempotency_keys where actor_id=p_actor_id and idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode='23505', message='idempotency_key_reused_with_different_request'; end if;
    if v_existing.response_body is not null then return v_existing.response_body; end if;
    raise exception using errcode='55P03', message='request_already_processing';
  end if;
  insert into public.api_idempotency_keys(actor_id,idempotency_key,request_hash) values(p_actor_id,p_idempotency_key,p_request_hash);

  for v_item in select value from jsonb_array_elements(p_items) loop
    if not (v_item ? 'variant_id') or (v_item->>'variant_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception using errcode='22023',message='invalid_variant_id'; end if;
    begin v_qty := (v_item->>'quantity')::integer; exception when others then raise exception using errcode='22023',message='invalid_quantity'; end;
    if v_qty is null or v_qty < 1 or v_qty > 99 then raise exception using errcode='22023',message='invalid_quantity'; end if;
    select pv.*,p.name as product_name into v_variant from public.product_variants pv join public.products p on p.id=pv.product_id where pv.id=(v_item->>'variant_id')::uuid and pv.is_active=true and p.is_published=true for update of pv;
    if not found then raise exception using errcode='P0001',message='variant_unavailable'; end if;
    select coalesce(sum(im.quantity),0) into v_available from public.inventory_movements im where im.variant_id=v_variant.id;
    if v_available < v_qty then raise exception using errcode='P0001',message='insufficient_stock'; end if;
    v_line_total := v_variant.price_paise*v_qty;
    v_subtotal := v_subtotal+v_line_total;
    v_items := v_items || jsonb_build_object('variant_id',v_variant.id,'product_name',v_variant.product_name,'variant_name',v_variant.name,'sku',v_variant.sku,'quantity',v_qty,'unit_price_paise',v_variant.price_paise,'discount_paise',0,'line_total_paise',v_line_total);
  end loop;

  v_total := v_subtotal;
  v_order_number := 'DT-'||to_char(now() at time zone 'Asia/Kolkata','YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.orders(order_number,customer_id,status,subtotal_paise,discount_paise,shipping_paise,tax_paise,total_paise,billing_address,shipping_address,referral_code)
  values(v_order_number,p_actor_id,'payment_pending',v_subtotal,0,0,0,v_total,p_billing_address,p_shipping_address,nullif(trim(p_referral_code),'')) returning id into v_order_id;
  for v_item in select value from jsonb_array_elements(v_items) loop
    insert into public.order_items(order_id,variant_id,product_name,variant_name,sku,quantity,unit_price_paise,discount_paise,line_total_paise) values(v_order_id,(v_item->>'variant_id')::uuid,v_item->>'product_name',v_item->>'variant_name',nullif(v_item->>'sku',''),(v_item->>'quantity')::integer,(v_item->>'unit_price_paise')::bigint,0,(v_item->>'line_total_paise')::bigint);
    insert into public.inventory_movements(variant_id,movement_type,quantity,reference_type,reference_id,notes,performed_by) values((v_item->>'variant_id')::uuid,'reservation',-(v_item->>'quantity')::integer,'order',v_order_id,'Checkout stock reservation',p_actor_id);
  end loop;
  insert into public.order_status_history(order_id,from_status,to_status,changed_by,reason) values(v_order_id,'cart','payment_pending',p_actor_id,'Order created');
  insert into public.payments(order_id,amount_paise,status) values(v_order_id,v_total,'created') returning id into v_payment_id;
  update public.api_idempotency_keys set response_status=201,resource_type='order',resource_id=v_order_id,response_body=jsonb_build_object('ok',true,'order_id',v_order_id,'order_number',v_order_number,'payment_id',v_payment_id,'status','payment_pending','amount_paise',v_total,'currency','INR') where actor_id=p_actor_id and idempotency_key=p_idempotency_key;
  return (select response_body from public.api_idempotency_keys where actor_id=p_actor_id and idempotency_key=p_idempotency_key);
exception when others then delete from public.api_idempotency_keys where actor_id=p_actor_id and idempotency_key=p_idempotency_key and response_body is null; raise; end;
$$;
revoke all on function public.create_order_atomic(uuid,text,text,jsonb,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.create_order_atomic(uuid,text,text,jsonb,jsonb,jsonb,text,text) to service_role;
