(() => {
  const page=document.getElementById('products');if(!page||typeof api!=='function')return;
  const esc=v=>String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const money=p=>'₹'+(Number(p||0)/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const canWrite=()=>{try{return state.ctx?.permissions?.includes('products.write')}catch{return false}};
  const slugify=v=>String(v||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,200);
  let products=[];
  let editProduct=null;
  let editVariant=null;
  let slugTouched=false;

  page.innerHTML=`<div class="card"><div class="toolbar"><div><h2>Products & variants</h2><p class="small">Products define what you sell; variants define each sellable pack, SKU, price and stock threshold.</p></div><button class="primary" id="prodAdd" data-perm="products.write">+ Add product</button></div><div id="prodStatus" class="status">Loading catalog…</div></div><div class="section card"><div class="toolbar"><input id="prodSearch" placeholder="Search product, pack or SKU"><span id="prodCount" class="small"></span></div><div class="table-wrap"><table class="table"><thead><tr><th>Product</th><th>Variant / pack</th><th>SKU</th><th>Price</th><th>Threshold</th><th>Active</th><th>Action</th></tr></thead><tbody id="prodRows"></tbody></table></div></div><div id="prodModal" class="login hidden"><div class="loginbox" style="width:min(640px,100%)"><h2 id="prodModalTitle">Add product</h2><p class="small">Save the product first, then add one or more variants.</p><div class="field"><label>Product name</label><input id="pName" autocomplete="off"></div><div class="field"><label>Description</label><textarea id="pDesc" style="min-height:100px"></textarea></div><div class="field"><label>Slug</label><input id="pSlug" autocomplete="off"><div class="small">Leave blank to generate it from the product name.</div></div><div class="field"><label>Category ID (optional)</label><input id="pCategory" autocomplete="off"></div><label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input id="pPublished" type="checkbox"> Publish on customer site</label><div class="actions"><button class="primary" id="pSave">Save product</button><button class="ghost" id="pCancel">Cancel</button></div><div id="pStatus" class="status"></div></div></div><div id="varModal" class="login hidden"><div class="loginbox" style="width:min(580px,100%)"><h2 id="varTitle">Add variant</h2><p id="varProduct" class="small"></p><div class="field"><label>Variant name</label><input id="vName" placeholder="50 g" autocomplete="off"></div><div class="field"><label>SKU</label><input id="vSku" placeholder="CHM-50G" autocomplete="off"></div><div class="field"><label>Price (₹)</label><input id="vPrice" type="number" step="0.01" min="0"></div><div class="field"><label>Compare-at price (₹)</label><input id="vCompare" type="number" step="0.01" min="0"></div><div class="field"><label>Pack size</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input id="vPack" type="number" step="0.001" min="0" placeholder="50"><select id="vUnit"><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">l</option><option value="pcs">pcs</option></select></div><div class="small">Use the actual sellable quantity, e.g. 50 g or 250 g.</div></div><div class="field"><label>Low-stock threshold (units)</label><input id="vThreshold" type="number" step="1" min="0" value="5"></div><label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input id="vActive" type="checkbox" checked> Variant active</label><div class="actions"><button class="primary" id="vSave">Save variant</button><button class="ghost" id="vCancel">Cancel</button></div><div id="vStatus" class="status"></div></div></div>`;

  const st=(id,t,e=false)=>{const x=document.getElementById(id);if(x){x.textContent=t;x.className='status'+(e?' error':'')}};

  const variantLabel=v=>v.pack_size_value!=null&&v.pack_size_unit?`${v.pack_size_value} ${v.pack_size_unit}`:v.name;

  const render=()=>{
    const q=(document.getElementById('prodSearch').value||'').toLowerCase().trim();
    const flat=[];
    products.forEach(p=>{
      const vars=p.product_variants||[];
      if(!vars.length) flat.push({p,v:null});
      else vars.forEach(v=>flat.push({p,v}));
    });
    const rows=flat.filter(x=>{
      const text=x.p.name+' '+(x.p.slug||'')+' '+(x.v?.name||'')+' '+(x.v?.sku||'')+' '+(x.v?variantLabel(x.v):'');
      return text.toLowerCase().includes(q);
    });
    document.getElementById('prodCount').textContent=`${products.length} product${products.length===1?'':'s'} · ${flat.filter(x=>x.v).length} variant${flat.filter(x=>x.v).length===1?'':'s'}`;
    document.getElementById('prodRows').innerHTML=rows.length?rows.map(({p,v})=>v?`<tr><td><b>${esc(p.name)}</b><div class="small">${esc(p.slug||'')}${p.is_published?' · PUBLISHED':' · DRAFT'}</div></td><td>${esc(variantLabel(v))}</td><td>${esc(v.sku||'—')}</td><td>${money(v.price_paise)}</td><td>${Number(v.stock_threshold||0)}</td><td><span class="badge">${v.is_active?'ACTIVE':'INACTIVE'}</span></td><td><button class="ghost" data-edit-var="${esc(v.id)}">Edit variant</button></td></tr>`:`<tr><td><b>${esc(p.name)}</b><div class="small">${esc(p.slug||'')}${p.is_published?' · PUBLISHED':' · DRAFT'}</div></td><td colspan="5" class="small">No variants yet — add the first sellable pack.</td><td><button class="primary" data-add-var="${esc(p.id)}">+ Add variant</button></td></tr>`).join(''):'<tr><td colspan="7" class="small">No products or variants found.</td></tr>';
    document.querySelectorAll('[data-edit-var]').forEach(b=>b.onclick=()=>openVariant(null,b.dataset.editVar));
    document.querySelectorAll('[data-add-var]').forEach(b=>b.onclick=()=>openVariant(b.dataset.addVar,null));
  };

  async function load(){
    try{st('prodStatus','Loading catalog…');const x=await api('/v1/admin/catalog/products');products=Array.isArray(x.products)?x.products:[];render();st('prodStatus',`${products.length} product${products.length===1?'':'s'} loaded.`)}
    catch(e){st('prodStatus',e.message||'Unable to load catalog',true);document.getElementById('prodRows').innerHTML='<tr><td colspan="7" class="small">Catalog could not be loaded. Fix the API connection and refresh.</td></tr>'}
  }

  function openProduct(product){
    editProduct=product||null;slugTouched=false;
    document.getElementById('prodModalTitle').textContent=product?'Edit product':'Add product';
    document.getElementById('pName').value=product?.name||'';
    document.getElementById('pDesc').value=product?.description||'';
    document.getElementById('pSlug').value=product?.slug||'';
    document.getElementById('pCategory').value=product?.category_id||'';
    document.getElementById('pPublished').checked=product?.is_published===true;
    document.getElementById('prodModal').classList.remove('hidden');st('pStatus','');
  }

  function openVariant(productId,variantId){
    let p,v;
    if(variantId){for(const pp of products){const vv=(pp.product_variants||[]).find(x=>x.id===variantId);if(vv){p=pp;v=vv;break}}}
    else p=products.find(x=>x.id===productId);
    if(!p)return;
    editVariant=v||null;
    document.getElementById('varTitle').textContent=v?'Edit variant':'Add variant';
    document.getElementById('varProduct').textContent=p.name;
    document.getElementById('vName').value=v?.name||'';
    document.getElementById('vSku').value=v?.sku||'';
    document.getElementById('vPrice').value=v?(Number(v.price_paise||0)/100):'';
    document.getElementById('vCompare').value=v?.compare_at_price_paise!=null?Number(v.compare_at_price_paise)/100:'';
    document.getElementById('vPack').value=v?.pack_size_value??'';
    document.getElementById('vUnit').value=v?.pack_size_unit||'g';
    document.getElementById('vThreshold').value=v?.stock_threshold??5;
    document.getElementById('vActive').checked=v?.is_active!==false;
    document.getElementById('varModal').dataset.product=p.id;
    document.getElementById('varModal').classList.remove('hidden');st('vStatus','');
  }

  document.getElementById('prodAdd').onclick=()=>{if(canWrite())openProduct(null)};
  document.getElementById('pName').oninput=()=>{if(!slugTouched&&!editProduct)document.getElementById('pSlug').value=slugify(document.getElementById('pName').value)};
  document.getElementById('pSlug').oninput=()=>{slugTouched=true};
  document.getElementById('pCancel').onclick=()=>document.getElementById('prodModal').classList.add('hidden');
  document.getElementById('pSave').onclick=async()=>{
    try{
      const name=document.getElementById('pName').value.trim();if(!name)throw new Error('Product name is required');
      const body={name,description:document.getElementById('pDesc').value.trim(),slug:document.getElementById('pSlug').value.trim()||slugify(name),category_id:document.getElementById('pCategory').value.trim()||null,is_published:document.getElementById('pPublished').checked};
      const path=editProduct?'/v1/admin/catalog/products/'+encodeURIComponent(editProduct.id):'/v1/admin/catalog/products';
      const x=await api(path,{method:editProduct?'PATCH':'POST',body:JSON.stringify(body)});
      document.getElementById('prodModal').classList.add('hidden');await load();
      const saved=x.product;
      if(!editProduct&&saved?.id)openVariant(saved.id,null);
    }catch(e){st('pStatus',e.message||'Unable to save product',true)}
  };

  document.getElementById('vCancel').onclick=()=>document.getElementById('varModal').classList.add('hidden');
  document.getElementById('vSave').onclick=async()=>{
    try{
      const product_id=document.getElementById('varModal').dataset.product;
      const packRaw=document.getElementById('vPack').value.trim();
      const priceRaw=document.getElementById('vPrice').value.trim();
      const compareRaw=document.getElementById('vCompare').value.trim();
      const pack=packRaw?Number(packRaw):null;
      const price=priceRaw?Number(priceRaw):NaN;
      const compare=compareRaw?Number(compareRaw):null;
      if(!product_id)throw new Error('Product is required');
      if(!document.getElementById('vName').value.trim())throw new Error('Variant name is required');
      if(!Number.isFinite(price)||price<0)throw new Error('Enter a valid price');
      if(compare!==null&&(!Number.isFinite(compare)||compare<price))throw new Error('Compare-at price must be at least the selling price');
      if(pack!==null&&(!Number.isFinite(pack)||pack<=0))throw new Error('Pack size must be greater than 0');
      const body={product_id,name:document.getElementById('vName').value.trim(),sku:document.getElementById('vSku').value.trim()||null,price_paise:Math.round(price*100),compare_at_price_paise:compare===null?null:Math.round(compare*100),pack_size_value:pack,pack_size_unit:pack===null?null:document.getElementById('vUnit').value,stock_threshold:Math.max(0,Math.floor(Number(document.getElementById('vThreshold').value||0))),is_active:document.getElementById('vActive').checked};
      const path=editVariant?'/v1/admin/catalog/variants/'+encodeURIComponent(editVariant.id):'/v1/admin/catalog/variants';
      await api(path,{method:editVariant?'PATCH':'POST',body:JSON.stringify(editVariant?{name:body.name,sku:body.sku,price_paise:body.price_paise,compare_at_price_paise:body.compare_at_price_paise,pack_size_value:body.pack_size_value,pack_size_unit:body.pack_size_unit,stock_threshold:body.stock_threshold,is_active:body.is_active}:body)});
      document.getElementById('varModal').classList.add('hidden');await load();
    }catch(e){st('vStatus',e.message||'Unable to save variant',true)}
  };

  document.getElementById('prodSearch').oninput=render;
  window.DTProducts={load,openProduct,openVariant};
  window.addEventListener('load',()=>setTimeout(load,300),{once:true});
})();
