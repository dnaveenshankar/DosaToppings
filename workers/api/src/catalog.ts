import type { Env } from './types';
import { supabaseAdminRest, supabaseRpc } from './supabase';

export interface CatalogFilters {
  search?: string;
  category?: string;
  limit: number;
}

function safeSearch(value: string): string {
  return value.trim().replace(/[(),*]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
}

function safeSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80);
}

export async function publicCatalog(env: Env, filters: CatalogFilters) {
  const limit = Math.min(Math.max(filters.limit || 24, 1), 60);
  const category = filters.category ? safeSlug(filters.category) : '';
  const categorySelect = category ? 'categories!inner(id,name,slug)' : 'categories(id,name,slug)';
  const params = new URLSearchParams();
  params.set('select', `id,name,slug,short_description,description,image_url,sku,is_bestseller,is_featured,category_id,${categorySelect},product_variants(id,name,sku,price_paise,compare_at_price_paise,pack_size_value,pack_size_unit,is_active)`);
  params.set('is_published', 'eq.true');
  params.set('product_variants.is_active', 'eq.true');
  params.set('order', 'created_at.asc');
  params.set('limit', String(limit));

  const search = filters.search ? safeSearch(filters.search) : '';
  if (search) params.set('or', `(name.ilike.*${search}*,short_description.ilike.*${search}*)`);
  if (category) params.set('categories.slug', `eq.${category}`);

  const [products, inventory] = await Promise.all([
    supabaseAdminRest<any[]>(env, `products?${params.toString()}`),
    supabaseRpc<any[]>(env, 'admin_inventory_snapshot', {}),
  ]);
  const stockByVariant = new Map<string, number>(inventory.map((row: any) => [String(row.id), Number(row.current_stock || 0)]));

  return products
    .map((product) => ({
      ...product,
      product_variants: Array.isArray(product.product_variants)
        ? product.product_variants
            .filter((v: any) => v.is_active)
            .map((v: any) => ({ ...v, current_stock: stockByVariant.get(String(v.id)) ?? 0 }))
        : [],
    }))
    .filter((product) => product.product_variants.length > 0);
}

export async function publicCategories(env: Env) {
  return supabaseAdminRest<any[]>(env, 'categories?select=id,name,slug,description,sort_order&is_published=eq.true&order=sort_order.asc,name.asc');
}
