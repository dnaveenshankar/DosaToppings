-- Keep the application identity record in sync when a Supabase Auth user is created.
-- Staff roles are still assigned separately by a privileged administrator process.

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id,email,is_active)
  values(new.id, lower(coalesce(new.email,'')), true)
  on conflict (id) do update set email=excluded.email, updated_at=now();
  return new;
end;
$$;

revoke all on function public.handle_auth_user_created() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_auth_user_created();
