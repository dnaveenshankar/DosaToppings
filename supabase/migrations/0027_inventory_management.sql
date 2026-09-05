-- 0027: inventory management and variant pack-size metadata.
-- Inventory remains a movement ledger; the current balance is the sum of movements.

alter table public.product_variants
  add column if not exists pack_size_value numeric(12,3),
  add column if not exists pack_size_unit text;

alter table public.product_variants
  drop constraint if exists product_variants_pack_size_unit_check;

alter table public.product_variants
  add constraint product_variants_pack_size_unit_check
  check (pack_size_unit is null or pack_size_unit in ('g','kg','ml','l','pcs'));

alter table public.product_variants
  drop constraint if exists product_variants_pack_size_value_check;

alter table public.product_variants
  add constraint product_variants_pack_size_value_check
  check (pack_size_value is null or pack_size_value > 0);

create index if not exists product_variants_pack_size_idx
  on public.product_variants(product_id, pack_size_value, pack_size_unit);

create or replace function public.admin_record_inventory_movement(
  p_variant_id uuid,
  p_movement_type public.inventory_movement_type,
  p_quantity integer,
  p_actor uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_balance bigint;
  v_movement_id uuid;
begin
  if p_actor is null then
    raise exception using errcode='28000', message='actor_required';
  end if;
  if not exists(select 1 from public.product_variants where id=p_variant_id) then
    raise exception using errcode='P0002', message='variant_not_found';
  end if;
  if p_quantity = 0 then
    raise exception using errcode='22023', message='quantity_cannot_be_zero';
  end if;
  if length(trim(coalesce(p_reason,''))) < 3 then
    raise exception using errcode='22023', message='reason_required';
  end if;
  if p_movement_type in ('opening','purchase','return') and p_quantity < 1 then
    raise exception using errcode='22023', message='movement_quantity_must_be_positive';
  end if;
  if p_movement_type = 'damage' and p_quantity > -1 then
    raise exception using errcode='22023', message='damage_quantity_must_be_negative';
  end if;
  if p_movement_type in ('sale','reservation','release','transfer_in','transfer_out') then
    raise exception using errcode='22023', message='movement_type_is_system_managed';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_variant_id::text,20260905));
  select coalesce(sum(quantity),0) into v_balance
  from public.inventory_movements
  where variant_id=p_variant_id;

  if v_balance + p_quantity < 0 then
    raise exception using errcode='P0001', message='stock_cannot_be_negative';
  end if;

  insert into public.inventory_movements(
    variant_id,movement_type,quantity,reference_type,notes,performed_by
  ) values (
    p_variant_id,p_movement_type,p_quantity,'admin',trim(p_reason),p_actor
  ) returning id into v_movement_id;

  v_balance := v_balance + p_quantity;
  return jsonb_build_object(
    'ok',true,
    'movement_id',v_movement_id,
    'variant_id',p_variant_id,
    'movement_type',p_movement_type,
    'quantity',p_quantity,
    'balance',v_balance
  );
end;
$$;

revoke all on function public.admin_record_inventory_movement(uuid,public.inventory_movement_type,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_record_inventory_movement(uuid,public.inventory_movement_type,integer,uuid,text) to service_role;
