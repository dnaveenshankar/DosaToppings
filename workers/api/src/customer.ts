import type { Env } from './types';
import { supabaseAdminRest, supabaseRpc } from './supabase';

export async function customerCart(env: Env, customerId: string) {
  const carts = await supabaseAdminRest<any[]>(env, `carts?select=id,status,updated_at,cart_items(id,variant_id,quantity,product_variants(id,name,sku,price_paise,product_id,products(name,image_url)))&customer_id=eq.${encodeURIComponent(customerId)}&status=eq.active&limit=1`);
  return carts[0] ?? { id: null, status: 'active', cart_items: [] };
}

export async function customerAddresses(env: Env, customerId: string) {
  return supabaseAdminRest<any[]>(env, `addresses?select=id,label,recipient_name,phone,line1,line2,locality,city,state,postal_code,country,is_default,created_at,updated_at&customer_id=eq.${encodeURIComponent(customerId)}&order=is_default.desc,created_at.desc`);
}

export async function customerAddressSnapshot(env: Env, customerId: string, addressId: string | undefined) {
  if (!addressId) return null;
  const rows = await supabaseAdminRest<any[]>(env, `addresses?select=id,label,recipient_name,phone,line1,line2,locality,city,state,postal_code,country,is_default&id=eq.${encodeURIComponent(addressId)}&customer_id=eq.${encodeURIComponent(customerId)}&limit=1`);
  if (!rows.length) throw new Response('Address not found', { status: 400 });
  const a = rows[0];
  return {
    id: a.id, label: a.label, recipient_name: a.recipient_name, phone: a.phone,
    line1: a.line1, line2: a.line2, locality: a.locality, city: a.city,
    state: a.state, postal_code: a.postal_code, country: a.country,
  };
}

export async function customerOrders(env: Env, customerId: string) {
  return supabaseAdminRest<any[]>(env, `orders?select=id,order_number,status,currency,subtotal_paise,discount_paise,shipping_paise,tax_paise,total_paise,billing_address,shipping_address,referral_code,created_at,updated_at,order_items(id,variant_id,product_name,variant_name,sku,quantity,unit_price_paise,discount_paise,line_total_paise),payments(id,status,method,amount_paise,provider_order_id,created_at)&customer_id=eq.${encodeURIComponent(customerId)}&order=created_at.desc`);
}

export async function customerOrder(env: Env, customerId: string, orderId: string) {
  const rows = await supabaseAdminRest<any[]>(env, `orders?select=id,order_number,status,currency,subtotal_paise,discount_paise,shipping_paise,tax_paise,total_paise,billing_address,shipping_address,referral_code,created_at,updated_at,order_items(id,variant_id,product_name,variant_name,sku,quantity,unit_price_paise,discount_paise,line_total_paise),payments(id,status,method,amount_paise,provider_order_id,created_at),order_status_history(id,from_status,to_status,reason,created_at)&id=eq.${encodeURIComponent(orderId)}&customer_id=eq.${encodeURIComponent(customerId)}&limit=1`);
  if (!rows.length) throw new Response('Order not found', { status: 404 });
  return rows[0];
}

export async function cartSetItem(env: Env, customerId: string, variantId: string, quantity: number) {
  return supabaseRpc(env, 'upsert_cart_item', { p_customer_id: customerId, p_variant_id: variantId, p_quantity: quantity });
}

export async function cartRemoveItem(env: Env, customerId: string, variantId: string) {
  return supabaseRpc(env, 'remove_cart_item', { p_customer_id: customerId, p_variant_id: variantId });
}

export async function saveAddress(env: Env, customerId: string, input: Record<string, unknown>) {
  return supabaseRpc(env, 'save_customer_address', {
    p_customer_id: customerId,
    p_address_id: input.id ?? null,
    p_label: input.label ?? null,
    p_recipient_name: input.recipient_name,
    p_phone: input.phone ?? null,
    p_line1: input.line1,
    p_line2: input.line2 ?? null,
    p_locality: input.locality ?? null,
    p_city: input.city,
    p_state: input.state,
    p_postal_code: input.postal_code,
    p_country: input.country ?? 'India',
    p_is_default: input.is_default === true,
  });
}
