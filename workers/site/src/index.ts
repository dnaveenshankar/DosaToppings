interface Env {
  SITE_ORIGIN: string;
  API_BASE_URL: string;
  SITE_DOMAIN: string;
}

const DEV_NOTICE = '⚠️ Dosa Toppings is currently under development. Please do not place any orders or make payments.';
const STORE_JS = 'https://raw.githubusercontent.com/dnaveenshankar/DosaToppings/main/apps/site/store-v2.js';

function redirectRoot(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.hostname === 'dosatoppings.in') {
    url.hostname = 'www.dosatoppings.in';
    return Response.redirect(url.toString(), 301);
  }
  return null;
}

function script(apiBase: string, storeCode: string): string {
  const safeApi = JSON.stringify(apiBase.replace(/\/$/, ''));
  const safeNotice = JSON.stringify(DEV_NOTICE);
  return `<script>(function(){const API=${safeApi},NOTICE=${safeNotice};function text(el,value){if(el&&typeof value==='string'&&value.trim())el.textContent=value}function apply(c){const h=c.home||{},hero=h.hero||{};if(typeof hero.title==='string'&&hero.title.trim())document.title=hero.title;const title=document.getElementById('productsTitle');if(h.products_title)text(title,h.products_title);if(h.marquee_items&&Array.isArray(h.marquee_items)){const wrap=document.getElementById('marquee');if(wrap){wrap.innerHTML='';h.marquee_items.forEach(function(x){const d=document.createElement('div');d.className='marq-item';d.textContent=String(x);wrap.appendChild(d)}}}const footer=c.footer||{};if(footer.tagline||footer.developer_label){let f=document.getElementById('dt-managed-footer');if(!f){f=document.createElement('footer');f.id='dt-managed-footer';f.style.cssText='text-align:center;padding:24px 16px;color:#5b6b6b;font-size:13px;background:#fff7e6;border-top:1px solid rgba(29,122,58,.12)';document.body.appendChild(f)}f.innerHTML='';if(footer.tagline){const p=document.createElement('div');p.textContent=footer.tagline;f.appendChild(p)}if(footer.developer_label){const p=document.createElement('div');p.style.marginTop='8px';p.appendChild(document.createTextNode(footer.developer_label+' '));const a=document.createElement('a');a.href=footer.developer_url||'https://www.naveenshankar.in';a.target='_blank';a.rel='noopener';a.textContent='Naveen';a.style.fontWeight='800';p.appendChild(a);f.appendChild(p)}}}function notice(){window.addEventListener('load',function(){setTimeout(function(){alert(NOTICE)},50)})}fetch(API+'/v1/site/content',{credentials:'omit'}).then(function(r){return r.ok?r.json():null}).then(function(x){if(x&&x.content){const map={};x.content.forEach(function(v){map[v.key]=v.content_json||{}});apply(map)}}).catch(function(){});notice()})();</script>${storeCode?`<script>${storeCode}</script>`:''}`;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const redirect = redirectRoot(request);
    if (redirect) return redirect;
    const upstream = await fetch(env.SITE_ORIGIN, { headers: { 'User-Agent': 'DosaToppings-Site-Worker' } });
    let html = await upstream.text();
    const trimmed = html.trimStart();
    if (!upstream.ok || (!/^<!doctype\s+html\b/i.test(trimmed) && !/^<html\b/i.test(trimmed))) return new Response('Site application unavailable', { status: 502 });
    let storeCode = '';
    try {
      const store = await fetch(STORE_JS, { headers: { 'User-Agent': 'DosaToppings-Site-Worker' } });
      if (store.ok) storeCode = await store.text();
    } catch {}
    const injected = html.replace('</body>', `${script(env.API_BASE_URL, storeCode)}</body>`);
    const headers = new Headers(upstream.headers);
    headers.set('content-type', 'text/html; charset=UTF-8');
    headers.set('cache-control', 'no-store');
    headers.set('x-dosatoppings-site', 'live-catalog');
    return new Response(injected, { status: upstream.status, headers });
  }
};
