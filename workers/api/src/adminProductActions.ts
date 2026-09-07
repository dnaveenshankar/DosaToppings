import type { Env } from './types';
import type { AuthContext } from './authz';
import { requirePermission } from './authz';
import { supabaseAdminHeaders, supabaseAdminRest } from './supabase';

const BUCKET='dosatoppings-products';
const MAX_FILES=8, MAX_BYTES=5*1024*1024;
const ok=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const uuid=(v:unknown,n:string)=>{if(typeof v!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))throw new Response(`Invalid ${n}`,{status:400});return v};
async function storage(env:Env,path:string,init:RequestInit={}){const r=await fetch(`${env.SUPABASE_URL}/storage/v1/${path}`,{...init,headers:{...supabaseAdminHeaders(env),...(init.headers||{})}});if(!r.ok){const t=await r.text();throw new Error(`Storage request failed (${r.status}): ${t.slice(0,400)}`)}return r.status===204?null:r.json()}
async function ensureBucket(env:Env){try{await storage(env,`bucket/${BUCKET}`)}catch{const r=await fetch(`${env.SUPABASE_URL}/storage/v1/bucket`,{method:'POST',headers:supabaseAdminHeaders(env),body:JSON.stringify({id:BUCKET,name:BUCKET,public:true,file_size_limit:MAX_BYTES,allowed_mime_types:['image/jpeg','image/png','image/webp','image/gif']})});if(!r.ok&&r.status!==409){const t=await r.text();throw new Error(`Unable to create image bucket (${r.status}): ${t.slice(0,300)}`)}}}
const publicUrl=(env:Env,path:string)=>`${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
export async function adminProductActionsRoute(request:Request,env:Env,ctx:AuthContext):Promise<Response|null>{
 const u=new URL(request.url); if(!u.pathname.startsWith('/v1/admin/catalog/products/'))return null;
 const parts=u.pathname.split('/').filter(Boolean); const productId=uuid(parts[4],'product_id');
 if(request.method==='DELETE'&&parts.length===5){requirePermission(ctx,'products.write');
   const variants=await supabaseAdminRest<any[]>(env,`product_variants?select=id&product_id=eq.${productId}`);
   for(const v of variants){const q=encodeURIComponent(v.id);const [orders,carts,moves]=await Promise.all([
     supabaseAdminRest<any[]>(env,`order_items?select=id&variant_id=eq.${q}&limit=1`),supabaseAdminRest<any[]>(env,`cart_items?select=id&variant_id=eq.${q}&limit=1`),supabaseAdminRest<any[]>(env,`inventory_movements?select=id&variant_id=eq.${q}&limit=1`)]);
     if(orders.length||carts.length||moves.length)throw new Response('Product has transaction or inventory history and cannot be deleted. Deactivate it instead.',{status:409});
   }
   await supabaseAdminRest(env,`products?id=eq.${encodeURIComponent(productId)}`,{method:'DELETE'}); return ok({ok:true,deleted:true});
 }
 if(parts.length===6&&parts[5]==='images'){
   requirePermission(ctx,request.method==='GET'?'products.read':'products.write'); await ensureBucket(env);
   if(request.method==='GET'){
     const listed=await storage(env,`object/list/${BUCKET}`,{method:'POST',body:JSON.stringify({prefix:`${productId}/`,limit:50,offset:0,sortBy:{column:'created_at',order:'desc'}})}) as any[];
     return ok({ok:true,images:(listed||[]).map(x=>({name:x.name,path:`${productId}/${x.name}`,url:publicUrl(env,`${productId}/${x.name}`),created_at:x.created_at}))});
   }
   if(request.method==='POST'){
     const form=await request.formData();const files=form.getAll('files').filter(x=>x instanceof File) as File[];if(!files.length)throw new Response('Select at least one image',{status:400});if(files.length>MAX_FILES)throw new Response(`Maximum ${MAX_FILES} images per upload`,{status:400});
     const images=[] as any[];for(const file of files){if(file.size<1||file.size>MAX_BYTES||!/^image\/(jpeg|png|webp|gif)$/i.test(file.type))throw new Response(`${file.name}: unsupported image or file too large (max 5 MB)`,{status:400});const ext=(file.type.split('/')[1]||'jpg').replace('jpeg','jpg');const safe=file.name.replace(/[^a-zA-Z0-9._-]+/g,'-').slice(0,80);const path=`${productId}/${crypto.randomUUID()}-${safe||'image'}.${ext}`;await storage(env,`object/${BUCKET}/${path}`,{method:'POST',headers:{'Content-Type':file.type,'x-upsert':'false'},body:file});images.push({name:safe,path,url:publicUrl(env,path)});}
     const current=await supabaseAdminRest<any[]>(env,`products?select=image_url&id=eq.${encodeURIComponent(productId)}&limit=1`);if(current[0]&&!current[0].image_url&&images[0])await supabaseAdminRest(env,`products?id=eq.${encodeURIComponent(productId)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({image_url:images[0].url})});return ok({ok:true,images},201);
   }
   if(request.method==='DELETE'){
     const path=u.searchParams.get('path')||'';if(!path.startsWith(`${productId}/`))throw new Response('Invalid image path',{status:400});await storage(env,`object/${BUCKET}`,{method:'DELETE',body:JSON.stringify([path])});const product=await supabaseAdminRest<any[]>(env,`products?select=image_url&id=eq.${encodeURIComponent(productId)}&limit=1`);if(product[0]?.image_url&&product[0].image_url.endsWith(path)){const listed=await storage(env,`object/list/${BUCKET}`,{method:'POST',body:JSON.stringify({prefix:`${productId}/`,limit:1,offset:0,sortBy:{column:'created_at',order:'asc'}})}) as any[];await supabaseAdminRest(env,`products?id=eq.${encodeURIComponent(productId)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({image_url:listed?.[0]?publicUrl(env,`${productId}/${listed[0].name}`):null})});}return ok({ok:true,deleted:true});
   }
 }
 if(parts.length===6&&parts[5]==='variants'&&request.method==='DELETE'){requirePermission(ctx,'products.write');const variantId=uuid(parts[4],'variant_id');throw new Response(`Use the variant endpoint: /v1/admin/catalog/variants/${variantId}`,{status:400})}
 return null;
}

export async function adminVariantDeleteRoute(request:Request,env:Env,ctx:AuthContext):Promise<Response|null>{
 const u=new URL(request.url);const m=u.pathname.match(/^\/v1\/admin\/catalog\/variants\/([^/]+)$/);if(request.method!=='DELETE'||!m)return null;requirePermission(ctx,'products.write');const id=uuid(m[1],'variant_id');
 const [orders,carts,moves]=await Promise.all([supabaseAdminRest<any[]>(env,`order_items?select=id&variant_id=eq.${encodeURIComponent(id)}&limit=1`),supabaseAdminRest<any[]>(env,`cart_items?select=id&variant_id=eq.${encodeURIComponent(id)}&limit=1`),supabaseAdminRest<any[]>(env,`inventory_movements?select=id&variant_id=eq.${encodeURIComponent(id)}&limit=1`)]);
 if(orders.length||carts.length||moves.length)throw new Response('Variant has transaction or inventory history and cannot be deleted. Deactivate it instead.',{status:409});
 await supabaseAdminRest(env,`product_variants?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});return ok({ok:true,deleted:true});
}