-- Central audit writer used by server-side admin workflows.
-- The function is service_role-only so clients cannot forge audit entries.
create or replace function public.write_audit_log(
  p_actor uuid,
  p_action text,
  p_resource_type text default null,
  p_resource_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare v_id uuid;
begin
  if p_actor is null or p_action is null or length(trim(p_action))=0 or length(p_action)>120 then
    raise exception using errcode='22023',message='invalid_audit_entry';
  end if;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,metadata)
  values(p_actor,left(trim(p_action),120),left(p_resource_type,80),p_resource_id,coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.write_audit_log(uuid,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.write_audit_log(uuid,text,text,uuid,jsonb) to service_role;
