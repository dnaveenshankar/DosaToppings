-- DosaToppings admin smoke-test seed.
-- Idempotent, clearly marked SAMPLE records. No auth users or secrets are created.
-- Run this migration only in the intended Supabase environment.

begin;

insert into public.categories (id, name, slug, description, sort_order, is_published)
values
  ('b1000000-0000-4000-8000-000000000001', 'Classic Dosa', 'classic-dosa', 'Traditional dosa favourites for smoke testing.', 10, true),
  ('b1000000-0000-4000-8000-000000000002', 'Toppings & Sides', 'toppings-sides', 'Sample toppings and sides.', 20, true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_published = excluded.is_published,
  updated_at = now();

insert into public.products (id, category_id, name, slug, short_description, description, sku, is_published, is_bestseller, is_featured)
values
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Masala Dosa', 'sample-masala-dosa', 'Crispy dosa with spiced potato masala.', 'SAMPLE DATA — used for DosaToppings admin end-to-end testing.', 'SAMPLE-DOSA-001', true, true, true),
  ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'Cheese Topping', 'sample-cheese-topping', 'Cheesy topping for a loaded dosa.', 'SAMPLE DATA — used for DosaToppings admin end-to-end testing.', 'SAMPLE-TOP-001', true, false, true)
on conflict (slug) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  short_description = excluded.short_description,
  description = excluded.description,
  sku = excluded.sku,
  is_published = excluded.is_published,
  is_bestseller = excluded.is_bestseller,
  is_featured = excluded.is_featured,
  updated_at = now();

insert into public.product_variants (id, product_id, name, sku, price_paise, compare_at_price_paise, stock_threshold, is_active)
values
  ('b3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Regular', 'SAMPLE-DOSA-001-REG', 12900, 14900, 10, true),
  ('b3000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'Single', 'SAMPLE-TOP-001-SGL', 4900, 5900, 5, true)
on conflict (sku) do update set
  product_id = excluded.product_id,
  name = excluded.name,
  price_paise = excluded.price_paise,
  compare_at_price_paise = excluded.compare_at_price_paise,
  stock_threshold = excluded.stock_threshold,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.inventory_movements (id, variant_id, movement_type, quantity, reference_type, notes)
values
  ('b4000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'opening', 50, 'sample_seed', 'SAMPLE DATA — admin inventory smoke test.'),
  ('b4000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000002', 'opening', 25, 'sample_seed', 'SAMPLE DATA — admin inventory smoke test.')
on conflict (id) do nothing;

insert into public.coupons (id, code, discount_type, discount_value, max_discount_paise, min_order_paise, usage_limit, per_customer_limit, starts_at, ends_at, is_active)
values
  ('b5000000-0000-4000-8000-000000000001', 'SAMPLE10', 'percent', 10, 5000, 10000, 100, 2, now() - interval '1 day', now() + interval '30 days', true)
on conflict (code) do update set
  discount_type = excluded.discount_type,
  discount_value = excluded.discount_value,
  max_discount_paise = excluded.max_discount_paise,
  min_order_paise = excluded.min_order_paise,
  usage_limit = excluded.usage_limit,
  per_customer_limit = excluded.per_customer_limit,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  is_active = excluded.is_active,
  updated_at = now();

-- Guest order intentionally has no customer_id, so this seed does not fabricate an auth user.
insert into public.orders (id, order_number, customer_id, status, currency, subtotal_paise, discount_paise, shipping_paise, tax_paise, total_paise, billing_address, shipping_address, referral_code)
values
  ('b6000000-0000-4000-8000-000000000001', 'DT-SAMPLE-1001', null, 'paid', 'INR', 17800, 0, 0, 0, 17800,
   '{"recipient_name":"Sample Customer","phone":"9999999999","line1":"1 Sample Street","city":"Bengaluru","state":"Karnataka","postal_code":"560001","country":"India"}'::jsonb,
   '{"recipient_name":"Sample Customer","phone":"9999999999","line1":"1 Sample Street","city":"Bengaluru","state":"Karnataka","postal_code":"560001","country":"India"}'::jsonb,
   null)
on conflict (id) do update set
  status = excluded.status,
  subtotal_paise = excluded.subtotal_paise,
  total_paise = excluded.total_paise,
  billing_address = excluded.billing_address,
  shipping_address = excluded.shipping_address,
  updated_at = now();

insert into public.order_items (id, order_id, variant_id, product_name, variant_name, sku, quantity, unit_price_paise, discount_paise, line_total_paise)
values
  ('b7000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'Masala Dosa', 'Regular', 'SAMPLE-DOSA-001-REG', 1, 12900, 0, 12900),
  ('b7000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000002', 'Cheese Topping', 'Single', 'SAMPLE-TOP-001-SGL', 1, 4900, 0, 4900)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit_price_paise = excluded.unit_price_paise,
  line_total_paise = excluded.line_total_paise;

insert into public.order_status_history (id, order_id, from_status, to_status, reason)
values
  ('b8000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'processing', 'paid', 'SAMPLE DATA — admin order smoke test.')
on conflict (id) do nothing;

insert into public.payments (id, order_id, provider, provider_order_id, provider_payment_id, amount_paise, status, method)
values
  ('b9000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'sample', 'sample_order_1001', 'sample_payment_1001', 17800, 'paid', 'upi')
on conflict (id) do update set
  amount_paise = excluded.amount_paise,
  status = excluded.status,
  method = excluded.method,
  updated_at = now();

insert into public.payment_events (id, provider, event_id, event_type, payload_hash, payload, processed_at)
values
  ('ba000000-0000-4000-8000-000000000001', 'sample', 'sample-event-1001', 'payment.captured', 'sample-hash-1001', '{"sample":true,"order_number":"DT-SAMPLE-1001"}'::jsonb, now())
on conflict (event_id) do update set
  processed_at = excluded.processed_at,
  payload = excluded.payload;

insert into public.refunds (id, payment_id, provider_refund_id, amount_paise, status, reason)
values
  ('bb000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'sample_refund_1001', 1000, 'processed', 'SAMPLE DATA — refund screen smoke test.')
on conflict (id) do update set
  amount_paise = excluded.amount_paise,
  status = excluded.status,
  reason = excluded.reason,
  updated_at = now();

insert into public.audit_logs (id, actor_id, action, resource_type, resource_id, metadata)
values
  ('bc000000-0000-4000-8000-000000000001', null, 'sample.seeded', 'order', 'b6000000-0000-4000-8000-000000000001', '{"sample":true,"purpose":"admin smoke test"}'::jsonb),
  ('bc000000-0000-4000-8000-000000000002', null, 'sample.seeded', 'product', 'b2000000-0000-4000-8000-000000000001', '{"sample":true,"purpose":"admin smoke test"}'::jsonb)
on conflict (id) do nothing;

insert into public.notifications (id, event_key, event_type, order_id, recipients, status, attempts)
values
  ('bd000000-0000-4000-8000-000000000001', 'sample-order-1001', 'new_order', 'b6000000-0000-4000-8000-000000000001', '[{"email":"sample@example.invalid","name":"Sample Recipient"}]'::jsonb, 'pending', 0)
on conflict (event_key) do update set
  order_id = excluded.order_id,
  recipients = excluded.recipients,
  status = excluded.status,
  updated_at = now();

insert into public.settings (key, value)
values
  ('admin.sample_data', '{"enabled":true,"label":"SAMPLE DATA","seed":"0030_admin_sample_data"}'::jsonb)
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();

commit;
