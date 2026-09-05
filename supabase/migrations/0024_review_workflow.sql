-- Verified-purchase reviews are created through a server-side transaction so a
-- browser cannot mark an unpurchased product as verified.
create unique index if not exists reviews_customer_order_product_uq
  on public.reviews(customer_id, order_id, product_id)
  where order_id is not null;

create or replace function public.submit_review_atomic(
  p_customer uuid,
  p_product_id uuid,
  p_order_id uuid,
  p_rating integer,
  p_title text default null,
  p_body text default null
) returns public.reviews
language plpgsql security definer set search_path=public
as $$
declare v_order public.orders%rowtype; v public.reviews%rowtype;
begin
  if p_customer is null or p_product_id is null or p_order_id is null then
    raise exception using errcode='22023',message='review_identity_required';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception using errcode='22023',message='invalid_rating';
  end if;
  select * into v_order from public.orders where id=p_order_id and customer_id=p_customer for update;
  if not found then raise exception using errcode='P0002',message='customer_order_not_found'; end if;
  if v_order.status <> 'delivered' then raise exception using errcode='P0001',message='review_requires_delivered_order'; end if;
  if not exists(
    select 1
    from public.order_items oi
    join public.product_variants pv on pv.id=oi.variant_id
    where oi.order_id=p_order_id and pv.product_id=p_product_id
  ) then
    raise exception using errcode='42501',message='product_not_purchased';
  end if;
  insert into public.reviews(product_id,customer_id,order_id,rating,title,body,is_verified_purchase,is_published)
  values(p_product_id,p_customer,p_order_id,p_rating,left(nullif(trim(p_title),''),160),left(nullif(trim(p_body),''),3000),true,false)
  returning * into v;
  return v;
exception when unique_violation then
  raise exception using errcode='23505',message='review_already_exists';
end; $$;
revoke all on function public.submit_review_atomic(uuid,uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.submit_review_atomic(uuid,uuid,uuid,integer,text,text) to service_role;

create or replace function public.moderate_review_atomic(
  p_review_id uuid,
  p_actor uuid,
  p_is_published boolean
) returns public.reviews
language plpgsql security definer set search_path=public
as $$
declare v public.reviews%rowtype;
begin
  if not exists(select 1 from public.staff_roles where user_id=p_actor and role in ('super_admin','admin_manager','store_manager','support_staff','review_moderator')) then
    raise exception using errcode='42501',message='review_moderation_required';
  end if;
  update public.reviews
    set is_published=p_is_published,updated_at=now()
    where id=p_review_id
    returning * into v;
  if not found then raise exception using errcode='P0002',message='review_not_found'; end if;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,metadata)
    values(p_actor,'review.moderated','review',p_review_id,jsonb_build_object('is_published',p_is_published));
  return v;
end; $$;
revoke all on function public.moderate_review_atomic(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.moderate_review_atomic(uuid,uuid,boolean) to service_role;
