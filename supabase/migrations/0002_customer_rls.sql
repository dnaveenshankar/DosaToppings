-- Customer-safe policies. Privileged business mutations remain server-controlled.

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_roles sr
    join public.profiles p on p.id = sr.user_id
    where sr.user_id = auth.uid() and p.is_active = true
  );
$$;

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select sr.role from public.staff_roles sr
  join public.profiles p on p.id = sr.user_id
  where sr.user_id = auth.uid() and p.is_active = true
  limit 1;
$$;

-- Public catalog reads: only published records.
create policy products_public_read on public.products
  for select using (is_published = true or public.is_staff());

create policy categories_public_read on public.categories
  for select using (is_published = true or public.is_staff());

create policy variants_public_read on public.product_variants
  for select using (
    is_active = true and exists (
      select 1 from public.products p
      where p.id = product_variants.product_id and p.is_published = true
    )
    or public.is_staff()
  );

-- A customer may see and manage only their own profile/address/cart.
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_staff());

create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy addresses_self_read on public.addresses
  for select using (customer_id = auth.uid() or public.is_staff());

create policy addresses_self_insert on public.addresses
  for insert with check (customer_id = auth.uid());

create policy addresses_self_update on public.addresses
  for update using (customer_id = auth.uid()) with check (customer_id = auth.uid());

create policy addresses_self_delete on public.addresses
  for delete using (customer_id = auth.uid());

create policy carts_self_read on public.carts
  for select using (customer_id = auth.uid());

create policy cart_items_self_read on public.cart_items
  for select using (exists (select 1 from public.carts c where c.id = cart_id and c.customer_id = auth.uid()));

create policy cart_items_self_insert on public.cart_items
  for insert with check (exists (select 1 from public.carts c where c.id = cart_id and c.customer_id = auth.uid() and c.status = 'active'));

create policy cart_items_self_update on public.cart_items
  for update using (exists (select 1 from public.carts c where c.id = cart_id and c.customer_id = auth.uid() and c.status = 'active'))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.customer_id = auth.uid() and c.status = 'active'));

create policy cart_items_self_delete on public.cart_items
  for delete using (exists (select 1 from public.carts c where c.id = cart_id and c.customer_id = auth.uid() and c.status = 'active'));

-- Customers may read their own orders and items. Creation/payment mutation is API-controlled.
create policy orders_self_read on public.orders
  for select using (customer_id = auth.uid() or public.is_staff());

create policy order_items_customer_read on public.order_items
  for select using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_staff())));

create policy order_status_customer_read on public.order_status_history
  for select using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_staff())));

create policy reviews_public_read on public.reviews
  for select using (is_published = true or customer_id = auth.uid() or public.is_staff());

create policy reviews_self_insert on public.reviews
  for insert with check (customer_id = auth.uid());

create policy reviews_self_update on public.reviews
  for update using (customer_id = auth.uid()) with check (customer_id = auth.uid());

-- Wallet/loyalty balances are readable by their owner; ledger mutation stays server-controlled.
create policy wallets_self_read on public.wallets
  for select using (customer_id = auth.uid() or public.is_staff());

create policy wallet_transactions_self_read on public.wallet_transactions
  for select using (customer_id = auth.uid() or public.is_staff());

create policy loyalty_self_read on public.loyalty_accounts
  for select using (customer_id = auth.uid() or public.is_staff());

create policy loyalty_transactions_self_read on public.loyalty_transactions
  for select using (customer_id = auth.uid() or public.is_staff());

-- Explicitly do not create client policies for payments, refunds, inventory, audit logs,
-- notification recipients, settings, roles or payment events. These remain privileged.
