(() => {
  const esc = (v) => String(v ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const money = (p) => '₹' + (Number(p || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sizeLabel = (v) => v.pack_size_value ? String(v.pack_size_value) + ' ' + String(v.pack_size_unit || '') .trim() : (v.name || 'Standard');
  const page = document.getElementById('inventory');
  if (!page || typeof api !== 'function') return;
  page.innerHTML = '<div class="notice">Stock is maintained per <b>variant</b>. A product such as Chicken Masala can have 50 g, 100 g, 500 g and 1 kg variants, each with its own SKU, price, stock and low-stock threshold. Customer orders always select a specific variant.</div>' +
    '<div class="section grid"><div class="card metric"><span>Total variants</span><strong id="invTotal">—</strong></div><div class="card metric"><span>Units in stock</span><strong id="invUnits">—</strong></div><div class="card metric"><span>Low stock variants</span><strong id="invLow">—</strong></div><div class="card metric"><span>Out of stock</span><strong id="invOut">—</strong></div></div>' +
    '<div class="section card"><div class="toolbar"><input id="invSearch" placeholder="Search product, size or SKU"><button class="primary" id="invMoveBtn">+ Record stock movement</button></div><div id="invStatus" class="status">Loading inventory…</div><div class="table-wrap"><table class="table"><thead><tr><th>Product</th><th>Variant / pack</th><th>SKU</th><th>Price</th><th>Stock</th><th>Threshold</th><th>Status</th><th>Action</th></tr></thead><tbody id="invRows"></tbody></table></div></div>' +
    '<div class="section card"><h2>Recent stock movements</h2><div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>Reason</th></tr></thead><tbody id="invHistory"></tbody></table></div></div>' +
    '<div id="invModal" class="login hidden" style="position:fixed;z-index:80"><div class="loginbox" style="width:min(520px,100%)"><h2>Record stock movement</h2><p class="small">Choose the exact product variant. Opening stock, purchases and returns add units; damage removes units; adjustment accepts a signed quantity.</p><div class="field"><label>Variant</label><select id="invVariant"></select></div><div class="field"><label>Movement type</label><select id="invType"><option value="opening">Opening stock</option><option value="purchase">Purchase / restock</option><option value="return">Customer return</option><option value="damage">Damage / wastage</option><option value="adjustment">Manual adjustment</option></select></div><div class="field"><label>Quantity</label><input id="invQty" type="number" step="1" min="1" placeholder="Units"></div><div class="field"><label>Reason / reference</label><input id="invReason" maxlength="500" placeholder="e.g. Supplier delivery GRN-001"></div><div id="invModalStatus" class="status"></div><div class="actions"><button class="primary" id="invSave">Save movement</button><button class="ghost" id="invCancel">Cancel</button></div></div></div>';

  let rows = [];
  let movements = [];
  const status = (text, error) => { const e = document.getElementById('invStatus'); if (e) { e.textContent = text; e.className = 'status' + (error ? ' error' : ''); } };
  const modalStatus = (text, error) => { const e = document.getElementById('invModalStatus'); if (e) { e.textContent = text; e.className = 'status' + (error ? ' error' : ''); } };
  const canAdjust = () => { try { return !!state.ctx?.permissions?.includes('inventory.adjust'); } catch { return false; } };
  const render = () => {
    const q = (document.getElementById('invSearch').value || '').trim().toLowerCase();
    const filtered = rows.filter(v => (String(v.products?.name || '') + ' ' + sizeLabel(v) + ' ' + String(v.name || '') + ' ' + String(v.sku || '')).toLowerCase().includes(q));
    document.getElementById('invRows').innerHTML = filtered.length ? filtered.map(v => {
      const s = Number(v.current_stock || 0), t = Number(v.stock_threshold || 0), low = !!v.low_stock, out = s <= 0;
      return '<tr><td><b>' + esc(v.products?.name || '—') + '</b></td><td>' + esc(sizeLabel(v)) + (v.name && v.name !== sizeLabel(v) ? '<div class="small">' + esc(v.name) + '</div>' : '') + '</td><td>' + esc(v.sku || '—') + '</td><td>' + money(v.price_paise) + '</td><td><b>' + s + '</b></td><td>' + t + '</td><td><span class="badge ' + (out ? 'danger' : low ? 'warn' : '') + '">' + (out ? 'OUT OF STOCK' : low ? 'LOW STOCK' : 'IN STOCK') + '</span></td><td>' + (canAdjust() ? '<button class="ghost inv-row-move" data-id="' + esc(v.id) + '">Adjust</button>' : '—') + '</td></tr>';
    }).join('') : '<tr><td colspan="8" class="small">No variants found.</td></tr>';
    document.getElementById('invHistory').innerHTML = movements.length ? movements.slice(0, 50).map(m => '<tr><td>' + new Date(m.created_at).toLocaleString('en-IN') + '</td><td><span class="badge">' + esc(m.movement_type) + '</span></td><td>' + (Number(m.quantity) > 0 ? '+' : '') + Number(m.quantity) + '</td><td>' + esc(m.notes || '—') + '</td></tr>').join('') : '<tr><td colspan="4" class="small">No movements recorded yet.</td></tr>';
    document.getElementById('invTotal').textContent = rows.length;
    document.getElementById('invUnits').textContent = rows.reduce((n, v) => n + Math.max(0, Number(v.current_stock || 0)), 0);
    document.getElementById('invLow').textContent = rows.filter(v => v.low_stock).length;
    document.getElementById('invOut').textContent = rows.filter(v => Number(v.current_stock || 0) <= 0).length;
    document.querySelectorAll('.inv-row-move').forEach(b => b.onclick = () => openModal(b.dataset.id));
  };
  async function load() {
    try {
      status('Loading inventory…');
      const data = await api('/v1/admin/catalog/inventory');
      if (!data.ok) throw new Error(data.error || 'Inventory request failed');
      rows = data.variants || []; movements = data.movements || [];
      document.getElementById('invVariant').innerHTML = rows.map(v => '<option value="' + esc(v.id) + '">' + esc(v.products?.name || 'Product') + ' — ' + esc(sizeLabel(v)) + (v.sku ? ' — ' + esc(v.sku) : '') + ' (stock ' + Number(v.current_stock || 0) + ')</option>').join('');
      render(); status('Loaded ' + rows.length + ' variant' + (rows.length === 1 ? '' : 's') + '.');
    } catch (e) { status(e.message || 'Unable to load inventory', true); }
  }
  function openModal(id) {
    const m = document.getElementById('invModal'); m.classList.remove('hidden'); if (id) document.getElementById('invVariant').value = id;
    document.getElementById('invType').value = 'purchase'; document.getElementById('invQty').value = ''; document.getElementById('invReason').value = ''; modalStatus('');
  }
  document.getElementById('invMoveBtn').onclick = () => { if (!canAdjust()) { status('Your role does not have inventory.adjust permission.', true); return; } openModal(); };
  document.getElementById('invCancel').onclick = () => document.getElementById('invModal').classList.add('hidden');
  document.getElementById('invSearch').oninput = render;
  document.getElementById('invSave').onclick = async () => {
    const type = document.getElementById('invType').value;
    let qty = Number(document.getElementById('invQty').value);
    const variant_id = document.getElementById('invVariant').value;
    const reason = document.getElementById('invReason').value.trim();
    if (!Number.isInteger(qty) || qty < 1) { modalStatus('Enter a whole-number quantity of at least 1.', true); return; }
    if (reason.length < 3) { modalStatus('Enter a reason or reference.', true); return; }
    if (type === 'damage') qty = -qty;
    if (type === 'adjustment') {
      const raw = window.prompt('Adjustment quantity: enter positive to add stock or negative to remove stock.', String(qty));
      if (raw === null) return;
      qty = Number(raw);
      if (!Number.isInteger(qty) || qty === 0) { modalStatus('Adjustment must be a non-zero whole number.', true); return; }
    }
    try {
      document.getElementById('invSave').disabled = true; modalStatus('Saving…');
      const data = await api('/v1/admin/catalog/inventory/movement', { method: 'POST', body: JSON.stringify({ variant_id, movement_type: type, quantity: qty, reason }) });
      if (!data.ok) throw new Error(data.error || 'Movement failed');
      document.getElementById('invModal').classList.add('hidden'); await load();
    } catch (e) { modalStatus(e.message || 'Movement failed', true); } finally { document.getElementById('invSave').disabled = false; }
  };
  window.DTInventory = { load };
  window.addEventListener('load', () => setTimeout(load, 250), { once: true });
})();
