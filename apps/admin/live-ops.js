(()=>{
  if(typeof api!=='function') return;
  const esc=v=>String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const money=p=>'₹'+(Number(p||0)/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmt=v=>v?new Date(v).toLocaleString('en-IN'):'—';
  const st=(id,text,error=false)=>{const x=document.getElementById(id);if(x){x.textContent=text;x.className='status'+(error?' error':'')}};
  const table=(heads,rows)=>`<div class="table-wrap"><table class="table"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows||'<tr><td colspan="20" class="small">No records found.</td></tr>'}</tbody></table></div>`;

  function replacePage(id,title,perm,body){
    const page=document.getElementById(id); if(!page)return null;
    page.innerHTML=`<div class="card"><div class="toolbar"><div><h2>${title}</h2><p class="small">Live production data. Actions remain server-authorized.</p></div><button class="ghost" id="${id}Reload">↻ Refresh</button></div><div id="${id}Status" class="status">Loading…</div>${body}</div>`;
    const b=document.getElementById(id+'Reload');if(b)b.onclick=()=>loaders[id]?.();
    return page;
  }
  const loaders={};

  replacePage('orders','📦 Orders','orders.read',`<div class="toolbar" style="margin-top:14px"><input id="liveOrderSearch" placeholder="Search order ID / customer / status"><select id="liveOrderStatus"><option value="">All statuses</option><option>payment_pending</option><option>paid</option><option>processing</option><option>packed</option><option>shipped</option><option>delivered</option><option>cancelled</option><option>payment_failed</option><option>payment_review</option><option>refund_pending</option></select></div><div id="ordersLiveBody"></div>`);
  let orders=[];
  loaders.orders=async()=>{try{st('ordersStatus','Loading orders…');const d=await api('/v1/admin/orders?limit=500');orders=d.orders||[];renderOrders();st('ordersStatus',`${orders.length} orders loaded.`)}catch(e){st('ordersStatus',e.message||'Unable to load orders',true)}};
  function renderOrders(){const q=(document.getElementById('liveOrderSearch')?.value||'').toLowerCase();const s=document.getElementById('liveOrderStatus')?.value||'';const rows=orders.filter(o=>(!s||o.status===s)&&(`${o.id} ${o.user_id} ${o.status}`.toLowerCase().includes(q))).map(o=>{const can=['orders.update'];const next=o.status==='paid'?'processing':o.status==='processing'?'packed':o.status==='packed'?'shipped':o.status==='shipped'?'delivered':'';return `<tr><td><b>${esc(o.id)}</b></td><td>${esc(o.user_id)}</td><td>${money(o.total_paise)}</td><td><span class="badge">${esc(o.status)}</span></td><td>${fmt(o.created_at)}</td><td>${next?`<button class="ghost order-next" data-id="${esc(o.id)}" data-next="${next}">${next}</button>`:'—'}</td></tr>`}).join('');document.getElementById('ordersLiveBody').innerHTML=table(['Order','Customer','Total','Status','Created','Next'],rows);document.querySelectorAll('.order-next').forEach(b=>b.onclick=async()=>{if(!confirm(`Move order to ${b.dataset.next}?`))return;b.disabled=true;try{await api('/v1/admin/orders/'+encodeURIComponent(b.dataset.id)+'/status',{method:'POST',body:JSON.stringify({status:b.dataset.next,reason:'Admin console status update'})});await loaders.orders()}catch(e){alert(e.message||'Order update failed')}finally{b.disabled=false}})};
  document.getElementById('liveOrderSearch')?.addEventListener('input',renderOrders);document.getElementById('liveOrderStatus')?.addEventListener('change',renderOrders);

  replacePage('customers','👥 Customers','users.read',`<div class="toolbar" style="margin-top:14px"><input id="customerSearch" placeholder="Search email or name"></div><div id="customersLiveBody"></div>`);
  loaders.customers=async()=>{try{st('customersStatus','Loading customers…');const q=document.getElementById('customerSearch')?.value||'';const d=await api('/v1/admin/data/customers?limit=500'+(q?'&q='+encodeURIComponent(q):''));const rows=d.customers||[];document.getElementById('customersLiveBody').innerHTML=table(['Name','Email','Phone','Active','Joined'],rows.map(x=>`<tr><td>${esc(x.display_name||'—')}</td><td>${esc(x.email||'—')}</td><td>${esc(x.phone||'—')}</td><td><span class="badge ${x.is_active?'':'danger'}">${x.is_active?'ACTIVE':'DISABLED'}</span></td><td>${fmt(x.created_at)}</td></tr>`).join(''));st('customersStatus',`${rows.length} customers loaded.`)}catch(e){st('customersStatus',e.message||'Unable to load customers',true)}};
  document.getElementById('customerSearch')?.addEventListener('change',()=>loaders.customers());

  replacePage('reports','📈 Reports','reports.read',`<div id="reportsLiveBody"></div>`);
  loaders.reports=async()=>{try{st('reportsStatus','Loading reports…');const [dash,pay]=await Promise.all([api('/v1/admin/dashboard'),api('/v1/admin/data/payments?limit=500')]);const s=dash.summary||{};const ps=pay.payments||[];const by={};ps.forEach(p=>by[p.status]=(by[p.status]||0)+1);document.getElementById('reportsLiveBody').innerHTML=`<div class="grid" style="margin-top:14px"><div class="card metric"><span>Orders today</span><strong>${Number(s.orders_today||0)}</strong></div><div class="card metric"><span>Revenue today</span><strong>${money(s.revenue_today_paise)}</strong></div><div class="card metric"><span>Pending orders</span><strong>${Number(s.pending_orders||0)}</strong></div><div class="card metric"><span>Published products</span><strong>${Number(s.published_products||0)}</strong></div></div><div class="section card"><h3>Payment status</h3>${table(['Status','Count'],Object.entries(by).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join(''))}</div>`;st('reportsStatus','Live report data loaded.')}catch(e){st('reportsStatus',e.message||'Unable to load reports',true)}};

  replacePage('audit','🧾 Audit log','audit_logs.read',`<div id="auditLiveBody"></div>`);
  loaders.audit=async()=>{try{st('auditStatus','Loading audit log…');const d=await api('/v1/admin/data/audit?limit=500');const rows=d.audit||[];document.getElementById('auditLiveBody').innerHTML=table(['Time','Actor','Action','Resource','ID','Metadata'],rows.map(x=>`<tr><td>${fmt(x.created_at)}</td><td>${esc(x.actor_id)}</td><td><b>${esc(x.action)}</b></td><td>${esc(x.resource_type)}</td><td>${esc(x.resource_id||'—')}</td><td><code>${esc(JSON.stringify(x.metadata||{}))}</code></td></tr>`).join(''));st('auditStatus',`${rows.length} audit entries loaded.`)}catch(e){st('auditStatus',e.message||'Unable to load audit log',true)}};

  replacePage('inventory','🏷️ Inventory','inventory.read',`<div id="inventoryLiveBody"></div>`);
  loaders.inventory=async()=>{try{st('inventoryStatus','Loading inventory ledger…');const d=await api('/v1/admin/data/inventory?limit=500');const rows=d.movements||[];document.getElementById('inventoryLiveBody').innerHTML=table(['Time','Variant','Movement','Qty','Reference','Notes'],rows.map(x=>`<tr><td>${fmt(x.created_at)}</td><td>${esc(x.variant_id)}</td><td>${esc(x.movement_type)}</td><td>${Number(x.quantity||0)}</td><td>${esc(x.reference_type||'—')} ${esc(x.reference_id||'')}</td><td>${esc(x.notes||'—')}</td></tr>`).join(''));st('inventoryStatus',`${rows.length} inventory movements loaded.`)}catch(e){st('inventoryStatus',e.message||'Unable to load inventory ledger',true)}};

  replacePage('settings','⚙️ Settings','settings.write',`<div class="notice">Production settings are intentionally server-owned. This console exposes only settings backed by an audited API operation; it will never write arbitrary environment variables or credentials from the browser.</div><div class="section grid"><div class="card"><b>Environment</b><p class="small">Production API: api.dosatoppings.in</p></div><div class="card"><b>Customer site</b><p class="small">www.dosatoppings.in</p></div><div class="card"><b>Admin site</b><p class="small">admin.dosatoppings.in</p></div><div class="card"><b>Security</b><p class="small">RBAC and server-side permission checks enabled.</p></div></div>`);

  Object.keys(loaders).forEach(k=>{const old=loaders[k];loaders[k]=old});
  const oldShow=window.__DTShowPage;
  const activate=id=>{if(window.__DTAdminActivateOriginal)window.__DTAdminActivateOriginal(id);else{document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===id));document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===id));}loaders[id]?.()};
  window.__DTLiveOps={load:activate,loaders};
  document.querySelectorAll('.nav button[data-page]').forEach(b=>{const old=b.onclick;b.onclick=()=>{if(old)old.call(b);activate(b.dataset.page)}});
  const originalHash=location.hash?.slice(1);if(originalHash&&loaders[originalHash])setTimeout(()=>activate(originalHash),250);
  setTimeout(()=>{if(location.hash==='')loaders.orders?.()},500);
})();
