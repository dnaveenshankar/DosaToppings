-- DosaToppings initial relational schema
-- Safe baseline: no secrets, no production credentials.

create extension if not exists pgcrypto;

create type public.app_role as enum ('super_admin','admin_manager','store_manager','billing_staff','order_staff','inventory_staff','content_manager','support_staff','review_moderator','report_viewer');
create type public.order_status as enum ('cart','checkout','payment_pending','paid','processing','packed','shipped','delivered','payment_failed','cancelled','refund_pending','partially_refunded','refunded','payment_review');
create type public.payment_status as enum ('created','pending','authorized','paid','failed','refunded','partially_refunded','cancelled');
create type public.inventory_movement_type as enum ('opening','purchase','sale','return','damage','adjustment','transfer_in','transfer_out','reservation','release');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_lower check (email = lower(email))
);

create table public.staff_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role public.app_role not null,
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.permissions (
  code text primary key,
  description text not null
);

create table public.role_permissions (
  role public.app_role not null,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role, permission_code)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  short_description text,
  description text,
  image_url text,
  sku text unique,
  is_published boolean not null default false,
  is_bestseller boolean not null default false,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sku text unique,
  price_paise bigint not null check (price_paise >= 0),
  compare_at_price_paise bigint check (compare_at_price_paise is null or compare_at_price_paise >= price_paise),
  stock_threshold integer not null default 0 check (stock_threshold >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  label text,
  recipient_name text not null,
  phone text,
  line1 text not null,
  line2 text,
  locality text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'India',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id),
  movement_type public.inventory_movement_type not null,
  quantity integer not null check (quantity <> 0),
  reference_type text,
  reference_id uuid,
  notes text,
  performed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active','converted','abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cart_id, variant_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references public.profiles(id) on delete set null,
  status public.order_status not null default 'cart',
  currency char(3) not null default 'INR',
  subtotal_paise bigint not null default 0 check (subtotal_paise >= 0),
  discount_paise bigint not null default 0 check (discount_paise >= 0),
  shipping_paise bigint not null default 0 check (shipping_paise >= 0),
  tax_paise bigint not null default 0 check (tax_paise >= 0),
  total_paise bigint not null default 0 check (total_paise >= 0),
  billing_address jsonb,
  shipping_address jsonb,
  referral_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  product_name text not null,
  variant_name text not null,
  sku text,
  quantity integer not null check (quantity > 0),
  unit_price_paise bigint not null check (unit_price_paise >= 0),
  discount_paise bigint not null default 0 check (discount_paise >= 0),
  line_total_paise bigint not null check (line_total_paise >= 0)
);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  changed_by uuid references public.profiles(id),
  reason text,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'razorpay',
  provider_order_id text,
  provider_payment_id text unique,
  amount_paise bigint not null check (amount_paise >= 0),
  status public.payment_status not null default 'created',
  method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null unique,
  event_type text not null,
  payload_hash text,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  provider_refund_id text unique,
  amount_paise bigint not null check (amount_paise > 0),
  status text not null default 'pending' check (status in ('pending','processed','failed')),
  reason text,
  requested_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('fixed','percent')),
  discount_value bigint not null check (discount_value > 0),
  max_discount_paise bigint,
  min_order_paise bigint not null default 0,
  usage_limit integer,
  per_customer_limit integer,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coupon_usage (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id),
  customer_id uuid references public.profiles(id),
  order_id uuid references public.orders(id),
  discount_paise bigint not null check (discount_paise >= 0),
  created_at timestamptz not null default now(),
  unique(coupon_id, order_id)
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id),
  referred_id uuid references public.profiles(id),
  code text not null unique,
  status text not null default 'issued' check (status in ('issued','attributed','qualified','rewarded','reversed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.referral_events (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals(id) on delete cascade,
  event_type text not null,
  order_id uuid references public.orders(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.wallets (
  customer_id uuid primary key references public.profiles(id) on delete cascade,
  balance_paise bigint not null default 0 check (balance_paise >= 0),
  updated_at timestamptz not null default now()
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  amount_paise bigint not null check (amount_paise <> 0),
  transaction_type text not null,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create table public.loyalty_accounts (
  customer_id uuid primary key references public.profiles(id) on delete cascade,
  points bigint not null default 0 check (points >= 0),
  updated_at timestamptz not null default now()
);

create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  points bigint not null check (points <> 0),
  transaction_type text not null,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create table public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  initial_value_paise bigint not null check (initial_value_paise > 0),
  balance_paise bigint not null check (balance_paise >= 0),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.gift_card_transactions (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references public.gift_cards(id),
  amount_paise bigint not null check (amount_paise <> 0),
  transaction_type text not null,
  order_id uuid references public.orders(id),
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id),
  rating integer not null check (rating between 1 and 5),
  title text,
  body text,
  is_verified_purchase boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  reason text not null,
  status text not null default 'open' check (status in ('open','reviewed','dismissed')),
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  invoice_number text not null unique,
  issued_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  order_id uuid references public.orders(id),
  recipients jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  provider_message_id text,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text,
  enabled boolean not null default true,
  event_types text[] not null default array['new_order'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(email)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  resource_type text,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create index products_category_idx on public.products(category_id);
create index variants_product_idx on public.product_variants(product_id);
create index inventory_variant_created_idx on public.inventory_movements(variant_id, created_at desc);
create index orders_customer_created_idx on public.orders(customer_id, created_at desc);
create index orders_status_created_idx on public.orders(status, created_at desc);
create index order_items_order_idx on public.order_items(order_id);
create index payments_order_idx on public.payments(order_id);
create index payment_events_created_idx on public.payment_events(created_at desc);
create index audit_logs_actor_created_idx on public.audit_logs(actor_id, created_at desc);
create index notifications_status_attempt_idx on public.notifications(status, next_attempt_at);

-- Seed granular permissions. Role assignment is intentionally server-controlled.
insert into public.permissions(code, description) values
('users.read','Read customer/staff users'),('users.create','Create staff/users'),('users.update','Update users'),('users.disable','Disable staff/users'),
('products.read','Read products'),('products.write','Create/update products'),('categories.read','Read categories'),('categories.write','Create/update categories'),
('orders.read','Read orders'),('orders.update','Update permitted order states'),('orders.print','Print orders'),('orders.cancel','Cancel orders'),
('inventory.read','Read inventory'),('inventory.adjust','Adjust inventory'),('inventory.transfer','Transfer inventory'),
('billing.create','Create POS bills'),('billing.refund','Process authorized refunds'),('coupons.read','Read coupons'),('coupons.write','Manage coupons'),
('promotions.write','Manage promotions'),('referrals.read','Read referrals'),('rewards.adjust','Adjust rewards'),('reviews.moderate','Moderate reviews'),
('reports.read','Read reports'),('settings.write','Change protected settings'),('audit_logs.read','Read audit logs')
on conflict (code) do nothing;

-- RLS: no client-side policy grants are added here. Application access is denied until
-- explicit policies are designed and reviewed alongside the API authorization layer.
alter table public.profiles enable row level security;
alter table public.staff_roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.addresses enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.refunds enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_usage enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_events enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.gift_cards enable row level security;
alter table public.gift_card_transactions enable row level security;
alter table public.reviews enable row level security;
alter table public.review_reports enable row level security;
alter table public.invoices enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.audit_logs enable row level security;
alter table public.settings enable row level security;

-- NOTE: privileged writes are intended to use the trusted server/API role after
-- authorization. Customer-facing policies will be added only for explicitly safe
-- ownership/public-catalog operations in a reviewed follow-up migration.
