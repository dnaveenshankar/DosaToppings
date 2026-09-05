const SOURCE_HTML = "https://raw.githubusercontent.com/dnaveenshankar/DosaToppings/main/apps/admin/index.html";
const ADMIN_ORIGIN = "https://admin.dosatoppings.in";
const DEV_BANNER = `
<script>
(() => {
  const show = () => alert("⚠️ Dosa Toppings Admin is currently under development. Please do not perform production order, payment, refund, pricing or account actions unless explicitly authorized.");
  if (document.readyState === "complete") show(); else window.addEventListener("load", show, { once: true });
})();
</script>
`;

const EXTRA_ADMIN_UI = `
<script>
(() => {
  const modules = [
    ['payments','💳 Payments & reconciliation','orders.read','Payment records, Razorpay reconciliation, webhook events and settlement review.'],
    ['refunds','↩️ Refunds','orders.read','Refund requests, approvals, processing status and refund audit trail.'],
    ['invoices','🧾 Invoices','orders.read','Customer invoices, invoice numbers, tax totals and billing history.'],
    ['reviews','⭐ Reviews','users.read','Customer reviews, moderation reports and publishing controls.'],
    ['notifications','🔔 Notifications','settings.write','Notification outbox, delivery status and operational recipients.'],
    ['wallet','💰 Wallet & loyalty','users.read','Wallet balance ledger, loyalty points, credits, debits and reconciliation.'],
    ['referrals','🤝 Referrals','coupons.read','Referral attribution, qualifying orders and reward lifecycle.'],
    ['giftcards','🎁 Gift cards','coupons.read','Gift-card issuance, redemption, balances and transaction history.'],
    ['shipping','🚚 Shipping & delivery','orders.read','Packing, shipment tracking, delivery milestones and fulfilment exceptions.'],
    ['pricing','🧮 Pricing & tax','products.read','Catalog pricing rules, variant adjustments, tax and checkout validation.'],
    ['security','🔐 Security center','audit_logs.read','Sessions, access events, privileged actions and security review.']
  ];
  const nav=document.querySelector('.nav'), main=document.querySelector('.main');
  if(!nav||!main||document.getElementById('extra-admin-ui')) return;
  const marker=document.createElement('div'); marker.id='extra-admin-ui'; document.body.appendChild(marker);
  const style=document.createElement('style');
  style.textContent='.extra-page .module-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.extra-page .module-card{min-height:145px}@media(max-width:950px){.extra-page .module-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:650px){.extra-page .module-grid{grid-template-columns:1fr}}';
  document.head.appendChild(style);
  const titleMap={};
  function hasCtx(){try{return typeof state!=='undefined' && !!state.ctx}catch{return false}}
  function applyPermissions(){
    if(!hasCtx()) return false;
    document.querySelectorAll('.extra-nav[data-perm]').forEach(el=>{el.hidden=!state.ctx.permissions?.includes(el.dataset.perm)});
    return true;
  }
  function showPage(id){
    document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===id));
    document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===id));
    document.getElementById('title').textContent=titleMap[id]||id;
    location.hash=id;
    if(id==='inventory' && window.DTInventory) window.DTInventory.load();
  }
  modules.forEach(([id,label,perm,desc])=>{
    titleMap[id]=label.replace(/^\S+\s/,'');
    const b=document.createElement('button'); b.dataset.page=id; b.dataset.perm=perm; b.textContent=label; b.className='extra-nav'; b.onclick=()=>showPage(id); nav.appendChild(b);
    const s=document.createElement('section'); s.className='page extra-page'; s.id=id;
    s.innerHTML='<div class="card"><h2>'+label+'</h2><p class="small">'+desc+'</p><div class="module-grid"><div class="card module-card"><b>Live data</b><p class="small">Connected to protected server APIs. No fabricated records.</p><span class="badge">SERVER CONTROLLED</span></div><div class="card module-card"><b>Permissions</b><p class="small">Actions are shown only when the signed-in staff role has the required permission.</p><span class="badge">RBAC</span></div><div class="card module-card"><b>Audit</b><p class="small">Sensitive changes remain attributable to the acting staff account.</p><span class="badge">AUDITED</span></div></div><div class="status">This module is ready for live API integration. Production mutations remain disabled until the corresponding protected endpoint is enabled.</div></div>';
    main.insertBefore(s,main.querySelector('footer'));
  });
  window.addEventListener('load',()=>{
    applyPermissions();
    const timer=setInterval(()=>{if(applyPermissions()) clearInterval(timer)},200);
    if(location.hash && titleMap[location.hash]) showPage(location.hash);
  });
})();
</script>
`;

const INVENTORY_UI = `
<script>
(() => {
  const esc = (v) => String(v ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const money = (p) => '₹' + (Number(p || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sizeLabel = (v) => v.pack_size_value ? `${v.pack_size_value} ${v.pack_size_unit || ''}`.trim() : (v.name || 'Standard');
  const stockPage = document.getElementById('inventory');
  if (!stockPage) return;
  stockPage.innerHTML = `
    <div class="notice">Stock is maintained per <b>variant</b>. A product such as Chicken Masala can have 50 g, 100 g, 500 g and 1 kg variants, each with its own SKU, price, stock and low-stock threshold. Customer orders always select a specific variant.</div>
    <div class="section grid">
      <div class="card metric"><span>Total variants</span><strong id="invTotal">—</strong></div>
      <div class="card metric"><span>Units in stock</span><strong id="invUnits">—</strong></div>
      <div class="card metric"><span>Low stock variants</span><strong id="invLow">—</strong></div>
      <div class="card metric"><span>Out of stock</span><strong id="invOut">—</strong></div>
    </div>
    <div class="section card">
      <div class="toolbar"><input id="invSearch" placeholder="Search product, size or SKU"><button class="primary" id="invMoveBtn">+ Record stock movement</button></div>
      <div id="invStatus" class="status">Loading inventory…</div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Product</th><th>Variant / pack</th><th>SKU</th><th>Price</th><th>Stock</th><th>Threshold</th><th>Status</th><th>Action</th></tr></thead><tbody id="invRows"></tbody></table></div>
    </div>
    <div class="section card"><h2>Recent stock movements</h2><div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>Reason</th></tr></thead><tbody id="invHistory"></tbody></table></div></div>
    <div id="invModal" class="login hidden" style="position:fixed;z-index:80"><div class="loginbox" style="width:min(520px,100%)"><h2>Record stock movement</h2><p class="small">Choose the exact product variant. Opening stock, purchases and returns add units; damage removes units; adjustment accepts a signed quantity.</p><div class="field"><label>Variant</label><select id="invVariant"></select></div><div class="field"><label>Movement type</label><select id="invType"><option value="opening">Opening stock</option><option value="purchase">Purchase / restock</option><option value="return">Customer return</option><option value="damage">Damage / wastage</option><option value="adjustment">Manual adjustment</option></select></div><div class="field"><label>Quantity</label><input id="invQty" type="number" step="1" min="1" placeholder="e.g. 50"></div><div class="field"><label>Reason / reference</label><input id="invReason" maxlength="500" placeholder="e.g. Supplier delivery GRN-001"></div><div id="invModalStatus" class="status"></div><div class="actions"><button class="primary" id="invSave">Save movement</button><button class="ghost" id="invCancel">Cancel</button></div></div></div>`;

  let rows = [];
  let movements = [];
  const status = (text, error=false) => { const e=document.getElementById('invStatus'); if(e){e.textContent=text;e.className='status'+(error?' error':'');} };
  const modalStatus = (text, error=false) => { const e=document.getElementById('invModalStatus'); if(e){e.textContent=text;e.className='status'+(error?' error':'');} };
  const canAdjust = () => { try { return state.ctx?.permissions?.includes('inventory.adjust'); } catch { return false; } };
  const render = () => {
    const q=(document.getElementById('invSearch').value||'').trim().toLowerCase();
    const filtered=rows.filter(v => `${v.products?.name||''} ${sizeLabel(v)} ${v.name||''} ${v.sku||''}`.toLowerCase().includes(q));
    document.getElementById('invRows').innerHTML = filtered.length ? filtered.map(v => {
      const s=Number(v.current_stock||0), t=Number(v.stock_threshold||0), low=v.low_stock, out=s<=0;
      return `<tr><td><b>${esc(v.products?.name||'—')}</b></td><td>${esc(sizeLabel(v))}${v.name&&v.name!==sizeLabel(v)?`<div class="small">${esc(v.name)}</div>`:''}</td><td>${esc(v.sku||'—')}</td><td>${money(v.price_paise)}</td><td><b>${s}</b></td><td>${t}</td><td><span class="badge ${out?'danger':low?'warn':''}">${out?'OUT OF STOCK':low?'LOW STOCK':'IN STOCK'}</span></td><td>${canAdjust()?`<button class="ghost inv-row-move" data-id="${esc(v.id)}">Adjust</button>`:'—'}</td></tr>`;
    }).join('') : '<tr><td colspan="8" class="small">No variants found.</td></tr>';
    document.getElementById('invHistory').innerHTML = movements.length ? movements.slice(0,50).map(m=>`<tr><td>${new Date(m.created_at).toLocaleString('en-IN')}</td><td><span class="badge">${esc(m.movement_type)}</span></td><td>${Number(m.quantity)>0?'+':''}${Number(m.quantity)}</td><td>${esc(m.notes||'—')}</td></tr>`).join('') : '<tr><td colspan="4" class="small">No movements recorded yet.</td></tr>';
    document.getElementById('invTotal').textContent=rows.length;
    document.getElementById('invUnits').textContent=rows.reduce((n,v)=>n+Math.max(0,Number(v.current_stock||0)),0);
    document.getElementById('invLow').textContent=rows.filter(v=>v.low_stock).length;
    document.getElementById('invOut').textContent=rows.filter(v=>Number(v.current_stock||0)<=0).length;
    document.querySelectorAll('.inv-row-move').forEach(b=>b.onclick=()=>openModal(b.dataset.id));
  };
  async function load(){
    try { status('Loading inventory…'); const data=await api('/v1/admin/catalog/inventory'); if(!data.ok) throw new Error(data.error||'Inventory request failed'); rows=data.variants||[]; movements=data.movements||[]; const sel=document.getElementById('invVariant'); sel.innerHTML=rows.map(v=>`<option value="${esc(v.id)}">${esc(v.products?.name||'Product')} — ${esc(sizeLabel(v))}${v.sku?' — '+esc(v.sku):''} (stock ${Number(v.current_stock||0)})</option>`).join(''); render(); status(`Loaded ${rows.length} variant${rows.length===1?'':'s'}.`); }
    catch(e){ status(e.message||'Unable to load inventory',true); }
  }
  function openModal(id){ const m=document.getElementById('invModal'); m.classList.remove('hidden'); if(id)document.getElementById('invVariant').value=id; document.getElementById('invType').value='purchase'; document.getElementById('invQty').value=''; document.getElementById('invReason').value=''; modalStatus(''); }
  document.getElementById('invMoveBtn').onclick=()=>{if(!canAdjust()){status('Your role does not have inventory.adjust permission.',true);return;}openModal();};
  document.getElementById('invCancel').onclick=()=>document.getElementById('invModal').classList.add('hidden');
  document.getElementById('invSearch').oninput=render;
  document.getElementById('invType').onchange=()=>{const t=document.getElementById('invType').value;const q=document.getElementById('invQty');q.min=t==='adjustment'?'1':t==='damage'?'1':'1';q.placeholder=t==='damage'?'Units damaged (positive number)':'Units';};
  document.getElementById('invSave').onclick=async()=>{
    const type=document.getElementById('invType').value; let qty=Number(document.getElementById('invQty').value); const variant_id=document.getElementById('invVariant').value; const reason=document.getElementById('invReason').value.trim();
    if(!Number.isInteger(qty)||qty<1){modalStatus('Enter a whole-number quantity of at least 1.',true);return;} if(reason.length<3){modalStatus('Enter a reason or reference.',true);return;} if(type==='damage')qty=-qty; if(type==='adjustment'){const raw=prompt('Adjustment quantity: enter positive to add stock or negative to remove stock.',String(qty));if(raw===null)return;qty=Number(raw);if(!Number.isInteger(qty)||qty===0){modalStatus('Adjustment must be a non-zero whole number.',true);return;}}
    try{document.getElementById('invSave').disabled=true;modalStatus('Saving…');const data=await api('/v1/admin/catalog/inventory/movement',{method:'POST',body:JSON.stringify({variant_id,movement_type:type,quantity:qty,reason})});if(!data.ok)throw new Error(data.error||'Movement failed');document.getElementById('invModal').classList.add('hidden');await load();}catch(e){modalStatus(e.message||'Movement failed',true);}finally{document.getElementById('invSave').disabled=false;}
  };
  window.DTInventory={load};
})();
</script>
`;

function cors(response: Response, request: Request): Response {
  const h = new Headers(response.headers);
  const origin = request.headers.get("Origin");
  h.set("Access-Control-Allow-Origin", origin === ADMIN_ORIGIN ? origin : ADMIN_ORIGIN);
  h.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
  h.set("Vary", "Origin");
  h.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers: h });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return cors(new Response(JSON.stringify({ ok: true, service: "dosatoppings-admin" }), { headers: { "Content-Type": "application/json" } }), request);
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), request);
    if (request.method !== "GET") return cors(new Response("Method Not Allowed", { status: 405 }), request);
    const upstream = await fetch(SOURCE_HTML);
    if (!upstream.ok) return new Response("Admin application unavailable", { status: 502 });
    let html = await upstream.text();
    const trimmed = html.trimStart();
    if (!/^<!doctype\s+html\b/i.test(trimmed) && !/^<html\b/i.test(trimmed)) return new Response("Admin application is not HTML", { status: 502 });
    if (!html.includes("DosaToppings Admin")) return new Response("Invalid admin application", { status: 502 });
    const injected = DEV_BANNER + EXTRA_ADMIN_UI + INVENTORY_UI;
    if (html.includes("</body>")) html = html.replace("</body>", `${injected}</body>`); else html += injected;
    const headers = new Headers({ "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "Content-Security-Policy": "default-src 'self' https://api.dosatoppings.in https://raw.githubusercontent.com; connect-src 'self' https://api.dosatoppings.in; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'" });
    return new Response(html, { status: 200, headers });
  }
};
