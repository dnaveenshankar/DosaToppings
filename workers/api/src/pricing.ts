import type { CheckoutInput, Env, PriceQuote, ProductVariant } from './types';
import { supabaseRest } from './supabase';

function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new Response('Invalid quantity', { status: 400 });
  }
}

export async function calculateQuote(env: Env, input: CheckoutInput): Promise<PriceQuote> {
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 100) {
    throw new Response('Cart is empty or invalid', { status: 400 });
  }

  const ids = [...new Set(input.items.map((item) => item.variant_id))];
  if (ids.length !== input.items.length) throw new Response('Duplicate cart item', { status: 400 });
  input.items.forEach((item) => assertQuantity(item.quantity));

  const filter = ids.map((id) => `"${id}"`).join(',');
  const variants = await supabaseRest<ProductVariant[]>(
    env,
    `product_variants?select=id,product_id,name,sku,price_paise,compare_at_price_paise,stock_threshold,is_active&id=in.(${filter})&is_active=eq.true`,
  );

  if (variants.length !== ids.length) throw new Response('One or more products are unavailable', { status: 409 });
  const byId = new Map(variants.map((variant) => [variant.id, variant]));

  const lines = input.items.map((item) => {
    const variant = byId.get(item.variant_id)!;
    const lineTotal = variant.price_paise * item.quantity;
    return {
      variant_id: variant.id,
      quantity: item.quantity,
      unit_price_paise: variant.price_paise,
      discount_paise: 0,
      line_total_paise: lineTotal,
    };
  });

  const subtotal = lines.reduce((sum, line) => sum + line.line_total_paise, 0);
  // Coupon/promotion/referral/tax/shipping rules are intentionally evaluated here,
  // server-side, in later policy modules. Never accept client totals.
  return {
    currency: 'INR',
    lines,
    subtotal_paise: subtotal,
    discount_paise: 0,
    shipping_paise: 0,
    tax_paise: 0,
    total_paise: subtotal,
  };
}
