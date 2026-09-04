import type { AuthContext } from './authz';
import { requirePermission, requireSuperAdminEmail } from './authz';
import { requireIdempotencyKey, json, handleOptions, rejectMethod } from './http';
import { getSupabaseUser, supabaseAdminRest, supabaseRpc } from './supabase';
import { calculateQuote } from './pricing';
import { resolveAuthContext } from './authorization';
import { sha256Hex, normalizeEmail, verifyRazorpaySignature } from './security';
import { customerCart, customerAddresses, customerOrders, cartSetItem, cartRemoveItem, saveAddress } from './customer';
import type { CheckoutInput, Env } from './types';

interface OrderRow { id: string; order_number: string; customer_id: string | null; total_paise: number; status: string; }
interface PaymentRow { id: string; order_id: string; amount_paise: number; status: string; provider_order_id: string | null; }

async function authContext(request: Request, env: Env): Promise<AuthContext> {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) throw new Response('Unauthenticated', { status: 401 });
  const token = header.slice(7).trim();
  if (!token) throw new Response('Unauthenticated', { status: 401 });
  const user = await getSupabaseUser(env, token);
  return resolveAuthContext(env, user.id, user.email);
}

function requireActive(ctx: AuthContext): void {
  if (!ctx.isActive) throw new Response('Account disabled', { status: 403 });
}

function parseJsonBody<T>(value: unknown): T {
  if (!value || typeof value !== 'object') throw new Response('Invalid JSON body', { status: 400 });
  return value as T;
}

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Response(`Invalid ${field}`, { status: 400 });
  return value;
}

async function createRazorpayOrder(env: Env, order: OrderRow, payment: PaymentRow): Promise<Record<string, unknown>> {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw new Error('Razorpay credentials are not configured');
  const credentials = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: payment.amount_paise, currency: 'INR', receipt: order.order_number, notes: { dosatoppings_order_id: order.id, dosatoppings_payment_id: payment.id } }),
  });
  if (!response.ok) { const detail = await response.text(); throw new Error(`Razorpay order creation failed (${response.status}): ${detail.slice(0, 500)}`); }
  return response.json() as Promise<Record<string, unknown>>;
}

async function staffOrAdmin(request: Request, env: Env, permission: Parameters<typeof requirePermission>[1]): Promise<AuthContext> {
  const ctx = await authContext(request, env); requireActive(ctx); requirePermission(ctx, permission); requireSuperAdminEmail(ctx); return ctx;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const options = handleOptions(request);
    if (options) return options;
    try {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, service: 'dosatoppings-api' }, 200, origin);

      if (request.method === 'GET' && url.pathname === '/v1/me') {
        const ctx = await authContext(request, env);
        return json({ user_id: ctx.userId, email: ctx.email ? normalizeEmail(ctx.email) : null, role: ctx.role ?? null, is_active: ctx.isActive }, 200, origin);
      }

      if (request.method === 'GET' && url.pathname === '/v1/customer/cart') {
        const ctx = await authContext(request, env); requireActive(ctx);
        return json({ ok: true, cart: await customerCart(env, ctx.userId) }, 200, origin);
      }

      if (request.method === 'POST' && url.pathname === '/v1/customer/cart/items') {
        const ctx = await authContext(request, env); requireActive(ctx);
        const body = parseJsonBody<{ variant_id: string; quantity: number }>(await request.json());
        requireUuid(body.variant_id, 'variant_id');
        return json(await cartSetItem(env, ctx.userId, body.variant_id, body.quantity), 200, origin);
      }

      if (request.method === 'DELETE' && url.pathname === '/v1/customer/cart/items') {
        const ctx = await authContext(request, env); requireActive(ctx);
        const variantId = requireUuid(url.searchParams.get('variant_id'), 'variant_id');
        return json(await cartRemoveItem(env, ctx.userId, variantId), 200, origin);
      }

      if (request.method === 'GET' && url.pathname === '/v1/customer/addresses') {
        const ctx = await authContext(request, env); requireActive(ctx);
        return json({ ok: true, addresses: await customerAddresses(env, ctx.userId) }, 200, origin);
      }

      if (request.method === 'POST' && url.pathname === '/v1/customer/addresses') {
        const ctx = await authContext(request, env); requireActive(ctx);
        return json({ ok: true, address: await saveAddress(env, ctx.userId, parseJsonBody<Record<string, unknown>>(await request.json())) }, 200, origin);
      }

      if (request.method === 'GET' && url.pathname === '/v1/customer/orders') {
        const ctx = await authContext(request, env); requireActive(ctx);
        return json({ ok: true, orders: await customerOrders(env, ctx.userId) }, 200, origin);
      }

      if (request.method === 'POST' && url.pathname === '/v1/checkout/quote') {
        const ctx = await authContext(request, env); requireActive(ctx);
        const body = parseJsonBody<CheckoutInput>(await request.json());
        const quote = await calculateQuote(env, body);
        return json({ ok: true, quote, customer_id: ctx.userId }, 200, origin);
      }

      if (request.method === 'POST' && url.pathname === '/v1/orders') {
        const ctx = await authContext(request, env); requireActive(ctx);
        const idempotencyKey = requireIdempotencyKey(request);
        const body = parseJsonBody<CheckoutInput>(await request.json());
        const requestHash = await sha256Hex(JSON.stringify(body));
        const result = await supabaseRpc<Record<string, unknown>>(env, 'create_order_atomic', {
          p_actor_id: ctx.userId, p_idempotency_key: idempotencyKey, p_request_hash: requestHash,
          p_items: body.items, p_billing_address: null, p_shipping_address: null,
          p_coupon_code: body.coupon_code ?? null, p_referral_code: body.referral_code ?? null,
        });
        return json(result, 201, origin);
      }

      if (request.method === 'POST' && url.pathname === '/v1/payments/razorpay/order') {
        const ctx = await authContext(request, env); requireActive(ctx);
        const body = parseJsonBody<{ order_id: string }>(await request.json());
        const orderId = requireUuid(body.order_id, 'order_id');
        const orders = await supabaseAdminRest<OrderRow[]>(env, `orders?select=id,order_number,customer_id,total_paise,status&id=eq.${orderId}&limit=1`);
        if (!orders.length || orders[0].customer_id !== ctx.userId) throw new Response('Order not found', { status: 404 });
        const order = orders[0];
        if (order.status !== 'payment_pending') throw new Response('Order is not payable', { status: 409 });
        const payments = await supabaseAdminRest<PaymentRow[]>(env, `payments?select=id,order_id,amount_paise,status,provider_order_id&order_id=eq.${orderId}&order(created_at).desc&limit=1`);
        if (!payments.length) throw new Response('Payment record not found', { status: 404 });
        const payment = payments[0];
        if (payment.amount_paise !== order.total_paise) throw new Response('Payment amount mismatch', { status: 409 });
        if (payment.provider_order_id) return json({ ok: true, razorpay_order_id: payment.provider_order_id, amount_paise: payment.amount_paise, currency: 'INR' }, 200, origin);
        const razorpayOrder = await createRazorpayOrder(env, order, payment);
        const providerOrderId = typeof razorpayOrder.id === 'string' ? razorpayOrder.id : '';
        if (!providerOrderId) throw new Error('Razorpay did not return an order id');
        await supabaseAdminRest(env, `payments?id=eq.${payment.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ provider_order_id: providerOrderId, status: 'pending', updated_at: new Date().toISOString() }) });
        return json({ ok: true, razorpay_order_id: providerOrderId, amount_paise: payment.amount_paise, currency: 'INR', key_id: env.RAZORPAY_KEY_ID }, 200, origin);
      }

      if (request.method === 'POST' && url.pathname === '/v1/payments/webhook/razorpay') {
        if (!env.RAZORPAY_WEBHOOK_SECRET) throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured');
        const signature = request.headers.get('X-Razorpay-Signature') || '';
        const eventId = request.headers.get('x-razorpay-event-id') || '';
        const rawBody = await request.text();
        if (!signature || !(await verifyRazorpaySignature(rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET))) return json({ error: 'invalid_signature' }, 401, origin);
        if (!eventId) return json({ error: 'event_id_required' }, 400, origin);
        let payload: Record<string, unknown>;
        try { payload = parseJsonBody<Record<string, unknown>>(JSON.parse(rawBody)); } catch { return json({ error: 'invalid_json' }, 400, origin); }
        const eventType = typeof payload.event === 'string' ? payload.event : '';
        if (!eventType) return json({ error: 'event_type_required' }, 400, origin);
        const result = await supabaseRpc<Record<string, unknown>>(env, 'process_razorpay_event_atomic', { p_event_id: eventId, p_event_type: eventType, p_payload: payload, p_payload_hash: await sha256Hex(rawBody) });
        return json(result, 200, origin);
      }

      if (request.method === 'GET' && url.pathname === '/v1/admin/orders') {
        const ctx = await staffOrAdmin(request, env, 'orders.read');
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 100);
        const status = url.searchParams.get('status');
        const filter = status ? `&status=eq.${encodeURIComponent(status)}` : '';
        const orders = await supabaseAdminRest<any[]>(env, `orders?select=id,order_number,customer_id,status,currency,subtotal_paise,discount_paise,shipping_paise,tax_paise,total_paise,created_at,updated_at&order=created_at.desc&limit=${limit}${filter}`);
        return json({ ok: true, orders, actor_role: ctx.role }, 200, origin);
      }

      if (request.method === 'PATCH' && url.pathname.startsWith('/v1/admin/orders/')) {
        const ctx = await staffOrAdmin(request, env, 'orders.update');
        const orderId = requireUuid(url.pathname.split('/').pop(), 'order_id');
        const body = parseJsonBody<{ status: string; reason?: string }>(await request.json());
        const allowed = ['processing','packed','shipped','delivered','cancelled'];
        if (!allowed.includes(body.status)) throw new Response('Invalid order status transition', { status: 400 });
        const result = await supabaseRpc<any>(env, 'admin_update_order_status', { p_order_id: orderId, p_to_status: body.status, p_actor: ctx.userId, p_reason: body.reason ?? null });
        return json({ ok: true, order: result }, 200, origin);
      }

      if (request.method === 'POST' && url.pathname === '/v1/admin/inventory/adjust') {
        const ctx = await staffOrAdmin(request, env, 'inventory.adjust');
        const body = parseJsonBody<{ variant_id: string; quantity: number; reason: string }>(await request.json());
        requireUuid(body.variant_id, 'variant_id');
        const result = await supabaseRpc<any>(env, 'admin_adjust_inventory', { p_variant_id: body.variant_id, p_quantity: body.quantity, p_actor: ctx.userId, p_reason: body.reason });
        return json(result, 200, origin);
      }

      if (request.method === 'GET' && url.pathname === '/v1/admin/inventory') {
        await staffOrAdmin(request, env, 'inventory.read');
        const rows = await supabaseAdminRest<any[]>(env, `product_variants?select=id,name,sku,price_paise,stock_threshold,is_active,products(name)&is_active=eq.true&order=created_at.asc`);
        return json({ ok: true, variants: rows }, 200, origin);
      }

      return rejectMethod(origin);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error(error);
      return json({ error: 'internal_error' }, 500, origin);
    }
  },
};
