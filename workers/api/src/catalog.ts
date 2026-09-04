import type { Env } from './types';
import { supabaseAdminRest } from './supabase';

export interface CatalogFilters {
  search?: string;
  category?: string;
  limit: number;
}

export async function publicCatalog(env: Env, filters: CatalogFilters) {
  const limit = Math.min(Math.max(filters.limit || 24, 1), 60);
  const params = new URLSearchParams();
  params.set('select', 'id,name,slug,short_description,description,image_url,sku,is_bestseller,is_featured,category_id,categories(id,name,slug),product_variants(id,name,sku,price_paise,compare_at_price_paise,is_active)');
  params.set('is_published', 'eq.true');
  params.set('product_variants.is_active', 'eq.true');
  params.set('order', 'sort_order.asc,created_at.asc');
  params.set('limit', String(limit));

  if (filters.search) {
    const q = filters.search.trim().replace(/[(),]/g, ' ').replace(/\s+/g, ' ');
    if (q) params.set('or', `(name.ilike.*${q}*,short_description.ilike.*${q}*)`);
  }
  if (filters.category) {
    const category = filters.category.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (category) params.set('category_id', `in.(${category})`);
  }

  const products = await supabaseAdminRest<any[]>(env, `products?${params.toString()}`);
  return products.map((product) => ({
    ...product,
    product_variants: Array.isArray(product.product_variants) ? product.product_variants.filter((v: any) => v.is_active) : [],
  }));
}

export async function publicCategories(env: Env) {
  return supabaseAdminRest<any[]>(env, 'categories?select=id,name,slug,description,sort_order&is_published=eq.true&order=sort_order.asc,name.asc');
}
