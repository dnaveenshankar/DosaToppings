export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  APP_BASE_URL?: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price_paise: number;
  compare_at_price_paise: number | null;
  stock_threshold: number;
  is_active: boolean;
}

export interface CheckoutItemInput {
  variant_id: string;
  quantity: number;
}

export interface CheckoutInput {
  items: CheckoutItemInput[];
  billing_address_id?: string;
  shipping_address_id?: string;
  coupon_code?: string;
  referral_code?: string;
}

export interface PriceLine {
  variant_id: string;
  quantity: number;
  unit_price_paise: number;
  discount_paise: number;
  line_total_paise: number;
}

export interface PriceQuote {
  currency: 'INR';
  lines: PriceLine[];
  subtotal_paise: number;
  discount_paise: number;
  shipping_paise: number;
  tax_paise: number;
  total_paise: number;
}
