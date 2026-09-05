-- Durable notification outbox. Business transactions enqueue notifications;
-- delivery is a separate retryable side effect.
create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','dead')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notification_outbox_ready_idx on public.notification_outbox(status,next_attempt_at);
create index if not exists notification_outbox_aggregate_idx on public.notification_outbox(aggregate_type,aggregate_id);

create or replace function public.enqueue_notification(
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_idempotency_key text,
  p_payload jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if p_event_type is null or p_aggregate_type is null or p_aggregate_id is null or p_idempotency_key is null then
    raise exception using errcode='22023',message='invalid_notification';
  end if;
  insert into public.notification_outbox(event_type,aggregate_type,aggregate_id,idempotency_key,payload)
  values(p_event_type,p_aggregate_type,p_aggregate_id,p_idempotency_key,coalesce(p_payload,'{}'::jsonb))
  on conflict(idempotency_key) do update set updated_at=now()
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.enqueue_notification(text,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_notification(text,text,uuid,text,jsonb) to service_role;

-- Claim a bounded batch without exposing queue rows to clients.
create or replace function public.claim_notification_batch(p_limit integer default 20)
returns setof public.notification_outbox language plpgsql security definer set search_path=public as $$
begin
  return query
  with claimed as (
    select id from public.notification_outbox
    where status in ('pending','failed') and next_attempt_at <= now() and attempts < 8
    order by next_attempt_at,created_at
    for update skip locked limit greatest(1,least(coalesce(p_limit,20),50))
  )
  update public.notification_outbox n
  set status='processing',attempts=attempts+1,updated_at=now()
  from claimed c where n.id=c.id returning n.*;
end; $$;
revoke all on function public.claim_notification_batch(integer) from public,anon,authenticated;
grant execute on function public.claim_notification_batch(integer) to service_role;

create or replace function public.finish_notification(
  p_id uuid,p_status text,p_provider_message_id text default null,p_error text default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('sent','failed','dead') then raise exception using errcode='22023',message='invalid_notification_status'; end if;
  update public.notification_outbox set status=p_status,provider_message_id=coalesce(p_provider_message_id,provider_message_id),last_error=left(p_error,1000),next_attempt_at=case when p_status='failed' then now()+least(power(2,attempts)*interval '1 minute',interval '1 hour') else next_attempt_at end,updated_at=now() where id=p_id;
end; $$;
revoke all on function public.finish_notification(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_notification(uuid,text,text,text) to service_role;
