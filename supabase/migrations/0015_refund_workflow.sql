-- Refund requests are separate from payment reconciliation so a refund can
-- never silently turn into an inventory or accounting mutation.
create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  payment_id uuid not null references public.payments(id),
  amount_paise bigint not null check (amount_paise > 0),
  reason text,
  status text not null default 'requested' check (status in ('requested','approved','processing','succeeded','failed','rejected')),
  requested_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  provider_refund_id text,
  idempotency_key text not null unique,
  provider_payload jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists refund_requests_order_idx on public.refund_requests(order_id,created_at desc);

create or replace function public.request_refund_atomic(
  p_order_id uuid,p_actor uuid,p_amount_paise bigint,p_reason text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype; v_payment public.payments%rowtype; v_existing public.refund_requests%rowtype; v_id uuid;
begin
  if p_amount_paise is null or p_amount_paise<=0 or p_idempotency_key is null then raise exception using errcode='22023',message='invalid_refund_request'; end if;
  select * into v_existing from public.refund_requests where idempotency_key=p_idempotency_key for update;
  if found then return jsonb_build_object('ok',true,'duplicate',true,'refund_id',v_existing.id,'status',v_existing.status); end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0002',message='order_not_found'; end if;
  if v_order.status not in ('paid','processing','packed','shipped','delivered','partially_refunded') then raise exception using errcode='P0001',message='order_not_refundable'; end if;
  select * into v_payment from public.payments where order_id=p_order_id and status='paid' order by created_at desc limit 1 for update;
  if not found then raise exception using errcode='P0002',message='paid_payment_not_found'; end if;
  if p_amount_paise > v_payment.amount_paise - coalesce((select sum(amount_paise) from public.refund_requests where payment_id=v_payment.id and status in ('requested','approved','processing','succeeded')),0) then raise exception using errcode='22003',message='refund_exceeds_paid_amount'; end if;
  insert into public.refund_requests(order_id,payment_id,amount_paise,reason,requested_by,idempotency_key) values(p_order_id,v_payment.id,p_amount_paise,left(p_reason,1000),p_actor,p_idempotency_key) returning id into v_id;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,metadata) values(p_actor,'refund.requested','order',p_order_id,jsonb_build_object('refund_id',v_id,'amount_paise',p_amount_paise));
  return jsonb_build_object('ok',true,'refund_id',v_id,'status','requested','amount_paise',p_amount_paise);
end; $$;
revoke all on function public.request_refund_atomic(uuid,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.request_refund_atomic(uuid,uuid,bigint,text,text) to service_role;

create or replace function public.approve_refund_atomic(p_refund_id uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.refund_requests%rowtype;
begin
  if not exists(select 1 from public.staff_roles where user_id=p_actor and role in ('super_admin','admin_manager','store_manager')) then raise exception using errcode='42501',message='refund_approval_required'; end if;
  select * into v from public.refund_requests where id=p_refund_id for update;
  if not found then raise exception using errcode='P0002',message='refund_not_found'; end if;
  if v.status='approved' or v.status='processing' then return jsonb_build_object('ok',true,'duplicate',true,'refund_id',v.id,'status',v.status); end if;
  if v.status<>'requested' then raise exception using errcode='P0001',message='refund_not_approvable'; end if;
  update public.refund_requests set status='approved',approved_by=p_actor,updated_at=now() where id=v.id;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,metadata) values(p_actor,'refund.approved','refund',v.id,jsonb_build_object('amount_paise',v.amount_paise));
  return jsonb_build_object('ok',true,'refund_id',v.id,'status','approved');
end; $$;
revoke all on function public.approve_refund_atomic(uuid,uuid) from public,anon,authenticated;
grant execute on function public.approve_refund_atomic(uuid,uuid) to service_role;
