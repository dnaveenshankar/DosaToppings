(()=>{
  if(typeof api!=='function') return;
  const esc=v=>String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const table=(heads,rows)=>`<div class="table-wrap"><table class="table"><thead><tr>${heads.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows||'<tr><td colspan="20" class="small">No records found.</td></tr>'}</tbody></table></div>`;
  const products=document.getElementById('products');
  const catButton=[...document.querySelectorAll('#products button')].find(b=>/Manage categories/i.test(b.textContent||''));
  if(products&&catButton){
    let categories=[];
    const modal=document.createElement('div'); modal.id='categoryModal'; modal.className='login hidden'; modal.style.cssText='position:fixed;z-index:90';
    modal.innerHTML=`<div class="loginbox" style="width:min(720px,100%)"><h2>Categories</h2><p class="small">Categories are stored in the production database. Products reference these category IDs.</p><div id="categoryStatus" class="status">Loading…</div><div id="categoryBody"></div><div class="actions"><button class="primary" id="categoryAdd">+ Add category</button><button class="ghost" id="categoryClose">Close</button></div></div>`;
    document.body.appendChild(modal);
    const loadCategories=async()=>{try{const x=document.getElementById('categoryStatus');x.textContent='Loading categories…';x.className='status';const d=await api('/v1/admin/catalog/categories');categories=d.categories||[];document.getElementById('categoryBody').innerHTML=table(['Name','Slug','Published','Sort','Action'],categories.map(c=>`<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.slug)}</td><td>${c.is_published?'YES':'NO'}</td><td>${Number(c.sort_order||0)}</td><td><button class="ghost category-edit" data-id="${esc(c.id)}">Edit</button></td></tr>`).join(''));document.querySelectorAll('.category-edit').forEach(b=>b.onclick=async()=>{const c=categories.find(x=>x.id===b.dataset.id);if(!c)return;const name=prompt('Category name',c.name);if(name===null)return;const description=prompt('Description',c.description||'');if(description===null)return;const sort=prompt('Sort order',String(c.sort_order||0));if(sort===null)return;const published=confirm('Publish this category? Click Cancel to keep it unpublished.');try{await api('/v1/admin/catalog/categories/'+encodeURIComponent(c.id),{method:'PATCH',body:JSON.stringify({name,description,sort_order:Number(sort),is_published:published})});await loadCategories()}catch(e){alert(e.message||'Category update failed')}});x.textContent=`${categories.length} categories loaded.`}catch(e){const x=document.getElementById('categoryStatus');x.textContent=e.message||'Unable to load categories';x.className='status error'}};
    catButton.onclick=()=>{modal.classList.remove('hidden');loadCategories()};
    document.getElementById('categoryClose').onclick=()=>modal.classList.add('hidden');
    document.getElementById('categoryAdd').onclick=async()=>{const name=prompt('Category name');if(!name)return;const description=prompt('Description','');const sort=prompt('Sort order','0');if(description===null||sort===null)return;try{await api('/v1/admin/catalog/categories',{method:'POST',body:JSON.stringify({name,description,sort_order:Number(sort),is_published:true})});await loadCategories()}catch(e){alert(e.message||'Category creation failed')}};
  }

  const installDeleteActions=()=>{
    const rows=document.querySelectorAll('#products #prodRows tr');
    rows.forEach(row=>{
      if(row.querySelector('[data-delete-product],[data-delete-variant]')) return;
      const add=row.querySelector('[data-add-var]');
      const edit=row.querySelector('[data-edit-var]');
      const actionCell=row.lastElementChild;
      if(!actionCell) return;
      if(add){
        const id=add.dataset.addVar;
        if(id){const b=document.createElement('button');b.className='ghost';b.dataset.deleteProduct=id;b.textContent='🗑 Delete';b.style.cssText='margin-left:6px;color:#b42318!important;font-weight:800';actionCell.appendChild(b)}
      } else if(edit){
        const id=edit.dataset.editVar;
        if(id){const b=document.createElement('button');b.className='ghost';b.dataset.deleteVariant=id;b.textContent='🗑 Delete';b.style.cssText='margin-left:6px;color:#b42318!important;font-weight:800';actionCell.appendChild(b)}
      }
    });
    rows.forEach(row=>{
      const pb=row.querySelector('[data-delete-product]');
      if(pb&&!pb.dataset.bound){pb.dataset.bound='1';pb.onclick=async()=>{if(!confirm('Delete this product?\n\nThis permanently removes it only when it has no inventory, order, or cart history. Historical products are protected.'))return;pb.disabled=true;try{await api('/v1/admin/catalog/products/'+encodeURIComponent(pb.dataset.deleteProduct),{method:'DELETE'});window.DTProducts?.load?.()}catch(e){alert(e.message||'Product could not be deleted')}finally{pb.disabled=false}}}
      const vb=row.querySelector('[data-delete-variant]');
      if(vb&&!vb.dataset.bound){vb.dataset.bound='1';vb.onclick=async()=>{if(!confirm('Delete this variant?\n\nHistorical inventory, orders and carts are protected.'))return;vb.disabled=true;try{await api('/v1/admin/catalog/variants/'+encodeURIComponent(vb.dataset.deleteVariant),{method:'DELETE'});window.DTProducts?.load?.()}catch(e){alert(e.message||'Variant could not be deleted')}finally{vb.disabled=false}}}
    });
  };
  const installStyle=()=>{if(document.getElementById('dtDeleteStyle'))return;const s=document.createElement('style');s.id='dtDeleteStyle';s.textContent='#products [data-delete-product],#products [data-delete-variant]{border:1px solid #f3a5a0;background:#fff7f6;color:#b42318!important;font-weight:800}#products [data-delete-product]:hover,#products [data-delete-variant]:hover{background:#fdeceb}';document.head.appendChild(s)};
  installStyle();
  const observer=new MutationObserver(installDeleteActions);const tbody=document.getElementById('prodRows');if(tbody){observer.observe(tbody,{childList:true,subtree:true});installDeleteActions()}

  const security=document.getElementById('security');
  if(security){
    security.innerHTML=`<div class="card"><div class="toolbar"><div><h2>🔐 Security center</h2><p class="small">Live RBAC context and privileged-action telemetry from production.</p></div><button class="ghost" id="securityRefresh">↻ Refresh</button></div><div id="securityStatus" class="status">Loading…</div><div id="securityBody"></div></div>`;
    const loadSecurity=async()=>{try{const x=document.getElementById('securityStatus');x.textContent='Loading security state…';x.className='status';const [ctx,audit]=await Promise.all([api('/v1/admin/context'),api('/v1/admin/data/audit?limit=100')]);const rows=audit.audit||[];const perms=ctx.permissions||[];document.getElementById('securityBody').innerHTML=`<div class="grid" style="margin-top:14px"><div class="card metric"><span>Current role</span><strong>${esc(ctx.role||'—')}</strong></div><div class="card metric"><span>Permissions</span><strong>${perms.length}</strong></div><div class="card metric"><span>Audit events loaded</span><strong>${rows.length}</strong></div><div class="card metric"><span>Account</span><strong style="font-size:1rem">${esc(ctx.email||'—')}</strong></div></div><div class="section card"><h3>Granted permissions</h3><p class="small">These are resolved server-side for the signed-in staff account.</p>${table(['Permission'],perms.map(p=>`<tr><td><code>${esc(p)}</code></td></tr>`).join(''))}</div>`;x.textContent='Security state loaded from production API.'}catch(e){const x=document.getElementById('securityStatus');x.textContent=e.message||'Unable to load security state';x.className='status error'}};
    document.getElementById('securityRefresh').onclick=loadSecurity;
    window.__DTDBSecurity={load:loadSecurity};
    setTimeout(loadSecurity,800);
  }
})();
