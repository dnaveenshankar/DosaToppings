-- 0029: customer growth, account tracing and admin-controlled feature flags.
-- Safe to run repeatedly. Tokens/passwords are never stored here; Supabase Auth owns recovery tokens.

create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.feature_flags(key,enabled,config) values
  ('referrals', false, '{"customer_codes":true,"reward_after_paid_order":true}'::jsonb),
  ('wishlist', true, '{}'::jsonb),
  ('customer_activity_trace', true, '{"retention_days":365}'::jsonb),
  ('order_tracking', true, '{}'::jsonb)
on conflict (key) do nothing;

create table if not exists public.wishlists (
  customer_id uuid not null references public.profiles(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(customer_id,variant_id)
);

create table if not exists public.customer_activity_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists wishlists_customer_created_idx on public.wishlists(customer_id,created_at desc);
create index if not exists customer_activity_customer_created_idx on public.customer_activity_events(customer_id,created_at desc);
create index if not exists customer_activity_entity_idx on public.customer_activity_events(entity_type,entity_id,created_at desc);

alter table public.feature_flags enable row level security;
alter table public.wishlists enable row level security;
alter table public.customer_activity_events enable row level security;

-- Application APIs use service_role after authentication/authorization checks.
revoke all on public.feature_flags from anon,authenticated;
revoke all on public.wishlists from anon,authenticated;
revoke all on public.customer_activity_events from anon,authenticated;
grant all on public.feature_flags to service_role;
grant all on public.wishlists to service_role;
grant all on public.customer_activity_events to service_role;

-- Ensure the concrete permissions needed by the new admin controls exist.
insert into public.permissions(code,description) values
 ('referrals.read','Read referral attribution and rewards'),
 ('referrals.write','Enable, disable and manage referral configuration'),
 ('users.activity.read','Read customer activity history and security trace'),
 ('settings.features.write','Change customer feature flags')
on conflict(code) do nothing;

insert into public.role_permissions(role,permission_code)
select r.role,p.code
from (values ('super_admin'::public.app_role),('admin_manager'::public.app_role)) r(role)
cross join public.permissions p
where p.code in ('referrals.read','users.activity.read')
on conflict(role,permission_code) do nothing;

insert into public.role_permissions(role,permission_code)
select 'super_admin'::public.app_role,p.code
from public.permissions p
where p.code in ('referrals.write','settings.features.write')
on conflict(role,permission_code) do nothing;
