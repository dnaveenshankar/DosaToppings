-- Refund provider calls are idempotent. Keep transient failures retryable instead of
-- permanently marking a refund failed after one network/provider error.
alter table public.refund_requests
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz not null default now();

create index if not exists refund_requests_ready_idx
  on public.refund_requests(status, next_attempt_at, created_at);

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
  if v.next_attempt_at > now() then raise exception using errcode='P0001',message='refund_retry_not_ready'; end if;
  update public.refund_requests
    set status='processing', attempt_count=attempt_count+1, updated_at=now()
    where id=v.id returning * into v;
  return v;
end; $$;
revoke all on function public.start_refund_atomic(uuid) from public,anon,authenticated;
grant execute on function public.start_refund_atomic(uuid) to service_role;

create or replace function public.defer_refund_atomic(
  p_refund_id uuid,
  p_error text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v public.refund_requests%rowtype; v_delay interval;
begin
  select * into v from public.refund_requests where id=p_refund_id for update;
  if not found then raise exception using errcode='P0002',message='refund_not_found'; end if;
  if v.status='succeeded' or v.status='failed' or v.status='rejected' then
    return jsonb_build_object('ok',true,'duplicate',true,'status',v.status,'refund_id',v.id);
  end if;
  if v.status<>'processing' then
    raise exception using errcode='P0001',message='refund_not_processing';
  end if;
  v_delay := least(power(2, greatest(v.attempt_count-1,0)) * interval '5 minutes', interval '2 hours');
  update public.refund_requests
    set status='approved',
        last_error=left(coalesce(p_error,'temporary_provider_failure'),1000),
        next_attempt_at=now()+v_delay,
        updated_at=now()
    where id=v.id;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,metadata)
    values(v.approved_by,'refund.deferred','refund',v.id,
      jsonb_build_object('attempt_count',v.attempt_count,'next_attempt_at',now()+v_delay,
                         'error',left(coalesce(p_error,'temporary_provider_failure'),500)));
  return jsonb_build_object('ok',true,'refund_id',v.id,'status','approved','retry_at',now()+v_delay);
end; $$;
revoke all on function public.defer_refund_atomic(uuid,text) from public,anon,authenticated;
grant execute on function public.defer_refund_atomic(uuid,text) to service_role;
