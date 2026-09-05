-- Database-backed content blocks for the public DosaToppings frontend.
-- The public site may read only published content; staff edits are audited by the API.

create table if not exists public.site_content (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null default '',
  content_json jsonb not null default '{}'::jsonb,
  is_published boolean not null default true,
  version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists site_content_published_idx on public.site_content(is_published, key);

alter table public.site_content enable row level security;

-- No direct browser writes. Public reads are intentionally narrow and can be served
-- by the service-role API after applying the publication filter.
drop policy if exists site_content_public_read on public.site_content;

insert into public.permissions(code, description)
values ('content.read', 'View managed frontend content'),
       ('content.write', 'Create and update managed frontend content')
on conflict(code) do update set description = excluded.description;

insert into public.role_permissions(role, permission_code)
values
  ('super_admin'::public.app_role, 'content.read'),
  ('super_admin'::public.app_role, 'content.write'),
  ('admin_manager'::public.app_role, 'content.read'),
  ('content_manager'::public.app_role, 'content.read'),
  ('content_manager'::public.app_role, 'content.write')
on conflict(role, permission_code) do nothing;

insert into public.site_content(key, title, content_json, is_published)
values
('home', 'Homepage', '{"hero":{"eyebrow":"Healthy twist for every dosa","title":"Dosa Toppings","subtitle":"Delicious toppings and accompaniments made for everyday dosa moments.","cta_text":"Shop now"},"announcement":"⚠️ Dosa Toppings is currently under development. Please do not place any orders or make payments.","footer":{"tagline":"Healthy twist for every dosa","copyright":"© Dosa Toppings","developer_label":"Developed by Naveen"}}'::jsonb, true),
('footer', 'Footer', '{"tagline":"Healthy twist for every dosa","links":[],"developer_label":"Developed by Naveen","developer_url":"https://www.naveenshankar.in"}'::jsonb, true)
on conflict(key) do nothing;

create or replace function public.touch_site_content_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.version = old.version + 1;
  return new;
end;
$$;

drop trigger if exists site_content_touch_updated_at on public.site_content;
create trigger site_content_touch_updated_at
before update on public.site_content
for each row execute function public.touch_site_content_updated_at();
