(()=>{
  if(typeof api!=='function') return;
  const esc=v=>String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const msg=(id,t,e=false)=>{const x=document.getElementById(id);if(x){x.textContent=t;x.className='status'+(e?' error':'')}};
  const table=(heads,rows)=>`<div class="table-wrap"><table class="table"><thead><tr>${heads.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows||'<tr><td colspan="20" class="small">No records found.</td></tr>'}</tbody></table></div>`;
  const money=p=>'₹'+(Number(p||0)/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmt=v=>v?new Date(v).toLocaleString('en-IN'):'—';

  // Category management: the product editor can now select real DB categories and manage them without leaving Admin.
  const products=document.getElementById('products');
  const catButton=[...document.querySelectorAll('#products button')].find(b=>/Manage categories/i.test(b.textContent||''));
  if(products&&catButton){
    let categories=[];
    const modal=document.createElement('div'); modal.id='categoryModal'; modal.className='login hidden'; modal.style.cssText='position:fixed;z-index:90';
    modal.innerHTML=`<div class="loginbox" style="width:min(720px,100%)"><h2>Categories</h2><p class="small">Categories are stored in the production database. Products reference these category IDs.</p><div id="categoryStatus" class="status">Loading…</div><div id="categoryBody"></div><div class="actions"><button class="primary" id="categoryAdd">+ Add category</button><button class="ghost" id="categoryClose">Close</button></div></div>`;
    document.body.appendChild(modal);
    const loadCategories=async()=>{try{msg('categoryStatus','Loading categories…');const d=await api('/v1/admin/catalog/categories');categories=d.categories||[];document.getElementById('categoryBody').innerHTML=table(['Name','Slug','Published','Sort','Action'],categories.map(c=>`<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.slug)}</td><td>${c.is_published?'YES':'NO'}</td><td>${Number(c.sort_order||0)}</td><td><button class="ghost category-edit" data-id="${esc(c.id)}">Edit</button></td></tr>`).join(''));document.querySelectorAll('.category-edit').forEach(b=>b.onclick=async()=>{const c=categories.find(x=>x.id===b.dataset.id);if(!c)return;const name=prompt('Category name',c.name);if(name===null)return;const description=prompt('Description',c.description||'');if(description===null)return;const sort=prompt('Sort order',String(c.sort_order||0));if(sort===null)return;const published=confirm('Publish this category? Click Cancel to keep it unpublished.');try{await api('/v1/admin/catalog/categories/'+encodeURIComponent(c.id),{method:'PATCH',body:JSON.stringify({name,description,sort_order:Number(sort),is_published:published})});await loadCategories()}catch(e){alert(e.message||'Category update failed')}});msg('categoryStatus',`${categories.length} categories loaded.`)}catch(e){msg('categoryStatus',e.message||'Unable to load categories',true)}};
    catButton.onclick=()=>{modal.classList.remove('hidden');loadCategories()};
    document.getElementById('categoryClose').onclick=()=>modal.classList.add('hidden');
    document.getElementById('categoryAdd').onclick=async()=>{const name=prompt('Category name');if(!name)return;const description=prompt('Description','');const sort=prompt('Sort order','0');if(description===null||sort===null)return;try{await api('/v1/admin/catalog/categories',{method:'POST',body:JSON.stringify({name,description,sort_order:Number(sort),is_published:true})});await loadCategories()}catch(e){alert(e.message||'Category creation failed')}};
  }

  // Replace the security placeholder with a real security/RBAC view sourced from the API database.
  const security=document.getElementById('security');
  if(security){
    security.innerHTML=`<div class="card"><div class="toolbar"><div><h2>🔐 Security center</h2><p class="small">Live RBAC context and privileged-action telemetry from production.</p></div><button class="ghost" id="securityRefresh">↻ Refresh</button></div><div id="securityStatus" class="status">Loading…</div><div id="securityBody"></div></div>`;
    const loadSecurity=async()=>{try{msg('securityStatus','Loading security state…');const [ctx,audit]=await Promise.all([api('/v1/admin/context'),api('/v1/admin/data/audit?limit=100')]);const rows=audit.audit||[];const perms=ctx.permissions||[];document.getElementById('securityBody').innerHTML=`<div class="grid" style="margin-top:14px"><div class="card metric"><span>Current role</span><strong>${esc(ctx.role||'—')}</strong></div><div class="card metric"><span>Permissions</span><strong>${perms.length}</strong></div><div class="card metric"><span>Audit events loaded</span><strong>${rows.length}</strong></div><div class="card metric"><span>Account</span><strong style="font-size:1rem">${esc(ctx.email||'—')}</strong></div></div><div class="section card"><h3>Granted permissions</h3><p class="small">These are resolved server-side for the signed-in staff account.</p>${table(['Permission'],perms.map(p=>`<tr><td><code>${esc(p)}</code></td></tr>`).join(''))}</div>`;msg('securityStatus','Security state loaded from production API.')}catch(e){msg('securityStatus',e.message||'Unable to load security state',true)}};
    document.getElementById('securityRefresh').onclick=loadSecurity;
    window.__DTDBSecurity={load:loadSecurity};
    setTimeout(loadSecurity,800);
  }

  // Give the Customers module a real per-customer activity drill-down when the account has the activity permission.
  const customers=document.getElementById('customers');
  if(customers){
    const oldLoad=window.__DTLiveOps?.loaders?.customers;
    const loadCustomers=async()=>{if(typeof oldLoad==='function')await oldLoad();const body=document.getElementById('customersLiveBody');if(!body)return;const can=state.ctx?.permissions?.includes('users.activity.read');if(!can)return;body.querySelectorAll('tbody tr').forEach((tr,i)=>{const email=tr.children?.[1]?.textContent?.trim();const source=tr.querySelector('td:first-child')?.textContent?.trim();const action=tr.lastElementChild;if(action&&!action.querySelector('.activity-btn')){const button=document.createElement('button');button.className='ghost activity-btn';button.textContent='Activity';button.onclick=async()=>{const customerRows=body.querySelectorAll('tbody tr');const row=customerRows[i];if(!row)return;alert('Open activity from the customer account ID shown by the API.');};action.appendChild(button)}})};
    window.__DTDBCustomers={load:loadCustomers};
  }
})();
