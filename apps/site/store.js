(() => {
  const API = 'https://api.dosatoppings.in';
  const AUTH_KEY = 'dt_customer_auth';
  const money = p => '₹' + (Number(p || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = v => String(v ?? '').replace(/[&<>\"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;' }[c]));
  const pack = v => v.pack_size_value ? `${v.pack_size_value} ${v.pack_size_unit || ''}`.trim() : (v.name || 'Standard');
  const readAuth = () => { try { return JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null') || {}; } catch { return {}; } };
  const saveAuth = x => { if (x?.access_token) sessionStorage.setItem(AUTH_KEY, JSON.stringify({ access_token:x.access_token, refresh_token:x.refresh_token || null })); };
  const clearAuth = () => sessionStorage.removeItem(AUTH_KEY);
  let products = [];
  let cart = null;
  let auth = readAuth();
  let pendingVariant = null;
  let pendingQty = 1;

  const request = async (path, options = {}, retry = true) => {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (auth.access_token) headers.set('Authorization', `Bearer ${auth.access_token}`);
    let r = await fetch(API + path, { ...options, headers });
    if (r.status === 401 && retry && auth.refresh_token) {
      const rr = await fetch(API + '/v1/auth/refresh', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({refresh_token:auth.refresh_token}) });
      if (rr.ok) { const x = await rr.json(); saveAuth(x); auth = readAuth(); return request(path, options, false); }
      clearAuth(); auth = {};
    }
    const text = await r.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error:text || 'Request failed' }; }
    if (!r.ok) throw new Error(data.error || data.message || `Request failed (${r.status})`);
    return data;
  };

  const style = document.createElement('style');
  style.textContent = `
    #dt-live-store{margin:28px 0;padding:22px 0;position:relative}
    #dt-live-store .dt-store-head{display:flex;justify-content:space-between;gap:14px;align-items:end;margin-bottom:14px;flex-wrap:wrap}
    #dt-live-store h3{margin:0;color:var(--brand-1,#1d7a3a);font-size:24px}
    #dt-live-store .dt-store-sub{color:var(--muted,#5b6b6b);font-size:14px;margin-top:4px}
    .dt-cart-btn{border:0;background:linear-gradient(90deg,var(--brand-1,#1d7a3a),var(--brand-2,#f3c02b));color:#fff;border-radius:999px;padding:10px 15px;font-weight:900;box-shadow:0 8px 22px rgba(29,122,58,.16)}
    .dt-product-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
    .dt-product{background:linear-gradient(180deg,#fff,#fffef7);border-radius:14px;box-shadow:0 10px 36px rgba(8,12,20,.08);overflow:hidden;border:1px solid rgba(29,122,58,.08)}
    .dt-product img{width:100%;height:190px;object-fit:cover;background:#eee}
    .dt-product-body{padding:15px}.dt-product h4{margin:0 0 5px;color:var(--brand-1,#1d7a3a);font-size:19px}.dt-product p{margin:0 0 10px;color:var(--muted,#5b6b6b);font-size:14px}
    .dt-pack-label{font-size:12px;font-weight:900;color:#50625b;margin-bottom:5px}.dt-pack{width:100%;border:1px solid rgba(29,122,58,.2);border-radius:9px;padding:9px;background:#fff;font-weight:800}.dt-buy{width:100%;margin-top:9px;border:0;background:var(--brand-1,#1d7a3a);color:#fff;border-radius:9px;padding:10px;font-weight:900}.dt-buy:disabled{opacity:.5;cursor:not-allowed}
    .dt-stock{font-size:12px;margin-top:7px;color:#5b6b6b}.dt-stock.out{color:#b42318;font-weight:800}
    #dt-drawer{position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.34);display:none;justify-content:flex-end}#dt-drawer.open{display:flex}
    .dt-drawer-box{width:min(440px,100%);height:100%;background:#fff;overflow:auto;padding:20px;box-shadow:-12px 0 36px rgba(0,0,0,.16)}
    .dt-drawer-top{display:flex;justify-content:space-between;align-items:center;gap:8px}.dt-drawer-top h3{margin:0;color:var(--brand-1,#1d7a3a)}.dt-close{border:0;background:#f3f5f3;border-radius:50%;width:36px;height:36px;font-size:20px}.dt-cart-row{padding:12px 0;border-bottom:1px solid #e5ebe6}.dt-cart-row strong{display:block}.dt-cart-controls{display:flex;align-items:center;gap:8px;margin-top:8px}.dt-qty{border:1px solid #dfe7e0;border-radius:7px;padding:5px 8px}.dt-remove{border:0;background:#fdecec;color:#b42318;border-radius:7px;padding:6px 9px;font-weight:800}.dt-total{display:flex;justify-content:space-between;font-weight:950;font-size:18px;margin:18px 0}.dt-checkout{width:100%;border:0;background:var(--brand-1,#1d7a3a);color:#fff;border-radius:10px;padding:12px;font-weight:900}.dt-login-note{background:#fff8dc;border:1px solid #f0dda0;padding:11px;border-radius:10px;color:#6d5700;font-size:13px;margin:12px 0}.dt-auth{margin-top:12px}.dt-auth input{width:100%;padding:10px;border:1px solid #dfe7e0;border-radius:9px;margin-top:7px}.dt-auth button{width:100%;margin-top:9px}.dt-switch{border:0;background:none;color:var(--brand-1,#1d7a3a);font-weight:800;padding:7px 0}.dt-status{font-size:13px;padding:8px 0;color:#5b6b6b}.dt-status.err{color:#b42318}.dt-user{font-size:12px;color:#5b6b6b;margin-top:8px}
    @media(max-width:900px){.dt-product-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:600px){.dt-product-grid{grid-template-columns:1fr}.dt-product img{height:210px}}
  `;
  document.head.appendChild(style);

  const root = document.createElement('section');
  root.id = 'dt-live-store';
  root.innerHTML = `<div class="conater"><div class="dt-store-head"><div><h3>Shop Dosa Toppings</h3><div class="dt-store-sub">Choose the exact pack size before adding to your cart.</div></div><button class="dt-cart-btn" id="dtOpenCart">🛒 Cart <span id="dtCartCount">0</span></button></div><div id="dtStoreStatus" class="dt-status">Loading products…</div><div id="dtProducts" class="dt-product-grid"></div></div>`;
  const marker = document.getElementById('marquee') || document.querySelector('.marquee-wrap');
  const section = marker?.closest('.marquee-wrap') || marker?.parentElement;
  if (section?.parentNode) section.parentNode.insertBefore(root, section.nextSibling); else document.body.insertBefore(root, document.body.firstChild);

  const drawer = document.createElement('div');
  drawer.id = 'dt-drawer';
  drawer.innerHTML = `<div class="dt-drawer-box"><div class="dt-drawer-top"><h3>Your Cart</h3><button class="dt-close" id="dtCloseCart" aria-label="Close cart">×</button></div><div id="dtCartUser"></div><div id="dtCartBody"></div><div id="dtAuthBox" class="dt-auth"></div></div>`;
  document.body.appendChild(drawer);

  const status = (t, err=false) => { const e=document.getElementById('dtStoreStatus'); if(e){e.textContent=t;e.className='dt-status'+(err?' err':'');} };
  const authBox = () => {
    const box = document.getElementById('dtAuthBox');
    if (!box) return;
    if (auth.access_token) { box.innerHTML='<button class="dt-switch" id="dtLogout">Sign out</button>'; document.getElementById('dtLogout').onclick=()=>{clearAuth();auth={};renderCart();}; return; }
    box.innerHTML = `<div class="dt-login-note">Sign in to keep your cart on your account and continue to checkout.</div><input id="dtEmail" type="email" autocomplete="email" placeholder="Email address"><input id="dtPassword" type="password" autocomplete="current-password" placeholder="Password"><div style="display:flex;gap:8px"><button class="dt-buy" id="dtAuthSubmit">Sign in</button><button class="dt-switch" id="dtAuthMode">Create account</button></div><div id="dtAuthStatus" class="dt-status"></div>`;
    let signup=false;
    document.getElementById('dtAuthMode').onclick=()=>{signup=!signup;document.getElementById('dtAuthSubmit').textContent=signup?'Create account':'Sign in';document.getElementById('dtAuthMode').textContent=signup?'Use existing account':'Create account';};
    document.getElementById('dtAuthSubmit').onclick=async()=>{
      const email=document.getElementById('dtEmail').value.trim(), password=document.getElementById('dtPassword').value;
      const s=document.getElementById('dtAuthStatus'); if(!email||password.length<10){s.textContent='Enter a valid email and a password of at least 10 characters.';s.className='dt-status err';return;}
      try{s.textContent=signup?'Creating account…':'Signing in…';s.className='dt-status';const x=await request(signup?'/v1/auth/signup':'/v1/auth/login',{method:'POST',body:JSON.stringify({email,password})});if(!x.access_token){if(signup){s.textContent='Account created. Check your email if confirmation is enabled, then sign in.';return;}throw new Error('Authentication response did not include an access token');}saveAuth(x);auth=readAuth();await refreshCart();if(pendingVariant){const id=pendingVariant;pendingVariant=null;await addVariant(id,pendingQty);}renderCart();}catch(e){s.textContent=e.message||'Authentication failed';s.className='dt-status err';}
    };
  };

  const renderProducts = () => {
    const host=document.getElementById('dtProducts');
    if(!host)return;
    if(!products.length){host.innerHTML='<div class="dt-status">No published products are available yet.</div>';return;}
    host.innerHTML=products.map(p=>{
      const vars=(p.product_variants||[]).filter(v=>v.is_active);
      const first=vars[0];
      return `<article class="dt-product"><img src="${esc(p.image_url||'https://cdn.jsdelivr.net/gh/dnaveenshankar/DosaToppings/assets/icon-2.png')}" alt="${esc(p.name)}"><div class="dt-product-body"><h4>${esc(p.name)}</h4><p>${esc(p.short_description||p.description||'Dosa topping made for everyday meals.')}</p><div class="dt-pack-label">Choose pack size</div><select class="dt-pack" data-product="${esc(p.id)}">${vars.map(v=>`<option value="${esc(v.id)}">${esc(pack(v))} — ${money(v.price_paise)}</option>`).join('')}</select><div class="dt-stock" data-stock-for="${esc(p.id)}">Select a pack to see stock.</div><button class="dt-buy" data-add-product="${esc(p.id)}" ${first?'':'disabled'}>Add selected pack to cart</button></div></article>`;
    }).join('');
    host.querySelectorAll('.dt-pack').forEach(sel=>{const update=()=>{const p=products.find(x=>x.id===sel.dataset.product);const v=(p?.product_variants||[]).find(x=>x.id===sel.value);const stock=document.querySelector(`[data-stock-for="${sel.dataset.product}"]`);if(stock)stock.textContent=v?'Stock is validated securely when added to cart.':'No variant selected.';};sel.onchange=update;update();});
    host.querySelectorAll('[data-add-product]').forEach(btn=>btn.onclick=async()=>{const sel=host.querySelector(`.dt-pack[data-product="${btn.dataset.addProduct}"]`);const id=sel?.value;if(id)await addVariant(id,1);});
  };

  const refreshCart = async () => { if(!auth.access_token){cart=null;updateCount();return;} try{const x=await request('/v1/customer/cart');cart=x.cart||null;updateCount();}catch(e){cart=null;updateCount();} };
  const updateCount = () => { const n=(cart?.items||[]).reduce((a,i)=>a+Number(i.quantity||0),0);const e=document.getElementById('dtCartCount');if(e)e.textContent=n; };
  const addVariant = async (id, qty) => {
    if(!auth.access_token){pendingVariant=id;pendingQty=qty;openCart();authBox();return;}
    try{await request('/v1/customer/cart/items',{method:'POST',body:JSON.stringify({variant_id:id,quantity:qty})});await refreshCart();openCart();}catch(e){alert(e.message||'Unable to add this pack to cart.');}
  };
  const renderCart = () => {
    const body=document.getElementById('dtCartBody'), user=document.getElementById('dtCartUser');
    if(user)user.innerHTML=auth.access_token?'<div class="dt-user">Signed in. Cart is linked to your customer account.</div>':'';
    if(!body)return;
    if(!auth.access_token){body.innerHTML='<div class="dt-login-note">Your cart requires a customer account. Sign in or create an account below.</div>';authBox();return;}
    const items=cart?.items||[];
    if(!items.length){body.innerHTML='<div class="dt-status">Your cart is empty. Choose a pack size above to add an item.</div>';authBox();return;}
    body.innerHTML=items.map(i=>`<div class="dt-cart-row"><strong>${esc(i.product_name||i.name||'Product')}</strong><span>${esc(i.variant_name||'Variant')} · ${money(i.unit_price_paise||i.price_paise)}</span><div class="dt-cart-controls"><span>Qty ${Number(i.quantity||0)}</span><button class="dt-remove" data-remove="${esc(i.variant_id)}">Remove</button></div></div>`).join('')+`<div class="dt-total"><span>Cart subtotal</span><span>${money(cart.subtotal_paise||0)}</span></div><button class="dt-checkout" id="dtCheckout">Continue to checkout</button><div id="dtCheckoutStatus" class="dt-status">Checkout will validate price, stock, discounts, address and payment server-side.</div>`;
    body.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{try{await request('/v1/customer/cart/items?variant_id='+encodeURIComponent(b.dataset.remove),{method:'DELETE'});await refreshCart();renderCart();}catch(e){alert(e.message||'Unable to remove item');}});
    document.getElementById('dtCheckout').onclick=()=>{const s=document.getElementById('dtCheckoutStatus');s.textContent='Checkout address and payment screens are being connected next. Your cart is saved safely on the server.';};
    authBox();
  };
  const openCart=()=>{drawer.classList.add('open');renderCart();};
  document.getElementById('dtOpenCart').onclick=openCart;
  document.getElementById('dtCloseCart').onclick=()=>drawer.classList.remove('open');
  drawer.addEventListener('click',e=>{if(e.target===drawer)drawer.classList.remove('open');});

  fetch(API+'/v1/catalog?limit=60').then(r=>r.ok?r.json():Promise.reject(new Error('Catalog unavailable'))).then(x=>{products=x.products||[];renderProducts();status(products.length+' product'+(products.length===1?'':'s')+' loaded.');}).catch(e=>status(e.message||'Unable to load products.',true));
  window.addEventListener('load',()=>{refreshCart();}, { once:true });
})();
