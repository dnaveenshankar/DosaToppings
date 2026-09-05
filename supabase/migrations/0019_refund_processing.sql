-- Provider refund processing is a separate state transition so provider calls are never
-- performed while holding a database transaction.
create or replace function public.start_refund_atomic(p_refund_id uuid)
returns public.refund_requests
language plpgsql security definer set search_path=public
as $$
declare v public.refund_requests%rowtype;
begin
  select * into v from public.refund_requests where id=p_refund_id for update;
  if not found then raise exception using errcode='P0002',message='refund_not_found'; end if;
  if v.status='processing' then return v; end if;
  if v.status<>'approved' then raise exception using errcode='P0001',message='refund_not_ready'; end if;
  update public.refund_requests set status='processing',updated_at=now() where id=v.id returning * into v;
  return v;
end; $$;
revoke all on function public.start_refund_atomic(uuid) from public,anon,authenticated;
grant execute on function public.start_refund_atomic(uuid) to service_role;

create or replace function public.finish_refund_atomic(
  p_refund_id uuid,p_success boolean,p_provider_refund_id text default null,p_provider_payload jsonb default null,p_error text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.refund_requests%rowtype; v_refunded bigint;
begin
  select * into v from public.refund_requests where id=p_refund_id for update;
  if not found then raise exception using errcode='P0002',message='refund_not_found'; end if;
  if v.status='succeeded' or v.status='failed' then return jsonb_build_object('ok',true,'duplicate',true,'status',v.status,'refund_id',v.id); end if;
  if p_success then
    update public.refund_requests set status='succeeded',provider_refund_id=p_provider_refund_id,provider_payload=p_provider_payload,last_error=null,updated_at=now() where id=v.id;
    select coalesce(sum(amount_paise),0) into v_refunded from public.refund_requests where payment_id=v.payment_id and status='succeeded';
    update public.payments set status=case when v_refunded >= amount_paise then 'refunded'::public.payment_status else 'partially_refunded'::public.payment_status end,updated_at=now() where id=v.payment_id;
    update public.orders set status=case when v_refunded >= total_paise then 'refunded'::public.order_status else 'partially_refunded'::public.order_status end,updated_at=now() where id=v.order_id;
    insert into public.audit_logs(actor_id,action,resource_type,resource_id,metadata) values(v.approved_by,'refund.succeeded','refund',v.id,jsonb_build_object('amount_paise',v.amount_paise,'provider_refund_id',p_provider_refund_id));
  else
    update public.refund_requests set status='failed',last_error=left(coalesce(p_error,'provider_refund_failed'),1000),updated_at=now() where id=v.id;
    insert into public.audit_logs(actor_id,action,resource_type,resource_id,metadata) values(v.approved_by,'refund.failed','refund',v.id,jsonb_build_object('error',left(coalesce(p_error,'provider_refund_failed'),500)));
  end if;
  return jsonb_build_object('ok',true,'refund_id',v.id,'status',case when p_success then 'succeeded' else 'failed' end);
end; $$;
revoke all on function public.finish_refund_atomic(uuid,boolean,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.finish_refund_atomic(uuid,boolean,text,jsonb,text) to service_role;
