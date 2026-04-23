'use strict';

const API = '';
let ownerToken = localStorage.getItem('delivery_owner_token') || '';
let motoboyCode = '';
let motoboysCache = [];
let currentDeliveryId = null;

// ── Helpers ────────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtCurrency(v) {
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
}

function fmtPhone(phone) {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return phone;
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 3000);
}

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (ownerToken) opts.headers['Authorization'] = 'Bearer ' + ownerToken;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.detail || 'Erro desconhecido');
  return json;
}

// ── Screen routing ─────────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  // check query param for motoboy
  const params = new URLSearchParams(location.search);
  const code = params.get('motoboy');
  if (code) {
    enterMotoboyView(code.toUpperCase());
    return;
  }

  const res = await api('GET', '/api/entregas/setup-status').catch(() => null);
  if (!res) { showToast('Servidor indisponível', 'error'); return; }

  if (!res.configured) {
    document.getElementById('login-owner-form').style.display = 'none';
    document.getElementById('login-setup-form').style.display = 'block';
    document.getElementById('login-subtitle').textContent = 'Configure sua senha para começar';
    showScreen('login');
    return;
  }

  if (ownerToken) {
    try {
      await api('GET', '/api/entregas/deliveries?date=' + today());
      enterOwnerView();
      return;
    } catch { ownerToken = ''; localStorage.removeItem('delivery_owner_token'); }
  }

  showScreen('login');
}

// ── Owner auth ─────────────────────────────────────────────────────────────────

async function setupOwner() {
  const pw = document.getElementById('setup-password').value;
  const pw2 = document.getElementById('setup-password2').value;
  if (!pw || pw.length < 4) { showToast('Senha muito curta (mín. 4 caracteres)', 'error'); return; }
  if (pw !== pw2) { showToast('Senhas não coincidem', 'error'); return; }
  try {
    await api('POST', '/api/entregas/setup', { password: pw });
    showToast('Senha criada com sucesso!', 'success');
    document.getElementById('login-owner-form').style.display = '';
    document.getElementById('login-setup-form').style.display = 'none';
    document.getElementById('login-subtitle').textContent = 'Acesse como lojista ou motoboy';
  } catch (e) { showToast(e.message, 'error'); }
}

async function ownerLogin() {
  const pw = document.getElementById('owner-password').value;
  if (!pw) { showToast('Digite a senha', 'error'); return; }
  try {
    const res = await api('POST', '/api/entregas/login', { password: pw });
    ownerToken = res.token;
    localStorage.setItem('delivery_owner_token', ownerToken);
    enterOwnerView();
  } catch (e) { showToast(e.message || 'Senha incorreta', 'error'); }
}

function ownerLogout() {
  ownerToken = '';
  localStorage.removeItem('delivery_owner_token');
  showScreen('login');
}

async function changePassword() {
  const oldPw = document.getElementById('pw-old').value;
  const newPw = document.getElementById('pw-new').value;
  if (!oldPw || !newPw) { showToast('Preencha os campos', 'error'); return; }
  try {
    await api('POST', '/api/entregas/change-password', { old_password: oldPw, new_password: newPw });
    showToast('Senha alterada!', 'success');
    document.getElementById('pw-old').value = '';
    document.getElementById('pw-new').value = '';
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Motoboy auth ───────────────────────────────────────────────────────────────

function motoboyLogin() {
  const code = document.getElementById('motoboy-code-input').value.trim().toUpperCase();
  if (!code || code.length < 4) { showToast('Digite o código do motoboy', 'error'); return; }
  enterMotoboyView(code);
}

function motoboyLogout() {
  motoboyCode = '';
  showScreen('login');
}

// ── Owner view entry ───────────────────────────────────────────────────────────

function enterOwnerView() {
  showScreen('owner');
  document.getElementById('owner-date').textContent = fmtDate(today());
  document.getElementById('filter-date').value = today();
  document.getElementById('summary-date').value = today();
  loadDeliveries();
  loadMotoboys();
  loadSummary();
  switchTab('hoje');
}

// ── Tabs ───────────────────────────────────────────────────────────────────────

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const tabs = ['hoje', 'nova', 'motoboys', 'resumo'];
  document.querySelectorAll('.tab')[tabs.indexOf(name)].classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'nova') populateMotoboySelects();
}

// ── Deliveries list ────────────────────────────────────────────────────────────

async function loadDeliveries() {
  const date = document.getElementById('filter-date').value || today();
  const list = document.getElementById('deliveries-list');
  list.innerHTML = '<div class="empty"><div class="empty-icon">⏳</div><p>Carregando...</p></div>';
  try {
    const deliveries = await api('GET', `/api/entregas/deliveries?date=${date}`);
    renderDeliveries(deliveries, list, true);
  } catch (e) { list.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`; }
}

function setTodayFilter() {
  document.getElementById('filter-date').value = today();
  loadDeliveries();
}

function statusLabel(s) {
  const map = { pendente: 'Pendente', em_entrega: 'Em entrega', entregue: 'Entregue', cancelado: 'Cancelado' };
  return map[s] || s;
}

function paymentIcon(p) {
  if (!p) return '💵';
  if (p === 'PIX') return '🟦';
  if (p === 'cartão') return '💳';
  return '💵';
}

function renderDeliveries(deliveries, container, isOwner) {
  if (!deliveries.length) {
    container.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><p>Nenhuma entrega nesta data.</p></div>';
    return;
  }
  container.innerHTML = deliveries.map(d => `
    <div class="card" id="del-${d.id}">
      <div class="card-header">
        <div>
          <div class="card-title">${escHtml(d.client_name)}</div>
          <div class="card-sub">${fmtPhone(d.client_phone) || 'Sem telefone'}</div>
        </div>
        <span class="badge badge-${d.status}">${statusLabel(d.status)}</span>
      </div>
      <div class="detail-row"><span class="detail-icon">📍</span><span class="detail-text">${escHtml(d.address)}</span></div>
      <div class="detail-row"><span class="detail-icon">📦</span><span class="detail-text">${escHtml(d.product)}</span></div>
      <div class="detail-row">
        <span class="detail-icon">${paymentIcon(d.payment_method)}</span>
        <span class="detail-text">${escHtml(d.payment_method || 'dinheiro')}</span>
        <strong style="margin-left:auto;color:var(--green-dark)">${fmtCurrency(d.delivery_fee)}</strong>
      </div>
      ${d.motoboy_name ? `<div class="detail-row"><span class="detail-icon">🛵</span><span class="detail-text">${escHtml(d.motoboy_name)}</span></div>` : ''}
      ${d.notes ? `<div class="detail-row"><span class="detail-icon">📝</span><span class="detail-text"><em>${escHtml(d.notes)}</em></span></div>` : ''}
      ${isOwner ? `
        <div class="delivery-actions">
          <button class="btn btn-secondary btn-sm" onclick="openEditModal(${d.id})">✏️ Editar</button>
          ${d.status === 'pendente' ? `<button class="btn btn-primary btn-sm" onclick="quickStatus(${d.id},'em_entrega')">🛵 Saiu</button>` : ''}
          ${d.status === 'em_entrega' ? `<button class="btn btn-primary btn-sm" onclick="quickStatus(${d.id},'entregue')">✅ Entregue</button>` : ''}
        </div>
      ` : ''}
    </div>
  `).join('');
}

async function quickStatus(id, status) {
  try {
    await api('PATCH', `/api/entregas/deliveries/${id}`, { status });
    await loadDeliveries();
    showToast('Status atualizado!', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Create delivery ────────────────────────────────────────────────────────────

function populateMotoboySelects() {
  const opts = ['<option value="">Sem motoboy</option>',
    ...motoboysCache.map(m => `<option value="${m.id}">${escHtml(m.name)}</option>`)
  ].join('');
  document.getElementById('new-motoboy').innerHTML = opts;
  document.getElementById('edit-motoboy').innerHTML = opts;
}

async function createDelivery() {
  const name = document.getElementById('new-client-name').value.trim();
  const addr = document.getElementById('new-address').value.trim();
  const prod = document.getElementById('new-product').value.trim();
  const fee = parseFloat(document.getElementById('new-fee').value);
  if (!name || !addr || !prod || isNaN(fee)) {
    showToast('Preencha todos os campos obrigatórios (*)', 'error'); return;
  }
  const body = {
    client_name: name,
    address: addr,
    product: prod,
    delivery_fee: fee,
    client_phone: document.getElementById('new-client-phone').value.trim(),
    payment_method: document.getElementById('new-payment').value,
    motoboy_id: parseInt(document.getElementById('new-motoboy').value) || null,
    notes: document.getElementById('new-notes').value.trim(),
  };
  try {
    await api('POST', '/api/entregas/deliveries', body);
    showToast('Entrega registrada!', 'success');
    clearNewForm();
    switchTab('hoje');
    loadDeliveries();
    loadSummary();
  } catch (e) { showToast(e.message, 'error'); }
}

function clearNewForm() {
  ['new-client-name','new-client-phone','new-address','new-product','new-fee','new-notes','wa-text'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('new-payment').value = 'dinheiro';
  document.getElementById('new-motoboy').value = '';
}

// ── WhatsApp parser ────────────────────────────────────────────────────────────

async function parseWhatsApp() {
  const text = document.getElementById('wa-text').value.trim();
  if (!text) { showToast('Cole o texto do WhatsApp primeiro', 'error'); return; }
  try {
    const r = await api('POST', '/api/entregas/parse-whatsapp', { text });
    if (r.client_name) document.getElementById('new-client-name').value = r.client_name;
    if (r.client_phone) document.getElementById('new-client-phone').value = r.client_phone;
    if (r.address) document.getElementById('new-address').value = r.address;
    if (r.product) document.getElementById('new-product').value = r.product;
    if (r.payment_method) {
      const sel = document.getElementById('new-payment');
      for (const opt of sel.options) if (opt.value === r.payment_method) sel.value = r.payment_method;
    }
    if (r.delivery_fee) document.getElementById('new-fee').value = r.delivery_fee;
    showToast('Campos preenchidos! Confira e ajuste.', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Edit modal ─────────────────────────────────────────────────────────────────

async function openEditModal(id) {
  currentDeliveryId = id;
  populateMotoboySelects();
  try {
    const deliveries = await api('GET', `/api/entregas/deliveries?date=${document.getElementById('filter-date').value || today()}`);
    const d = deliveries.find(x => x.id === id);
    if (!d) return;
    document.getElementById('edit-id').value = d.id;
    document.getElementById('edit-status').value = d.status;
    document.getElementById('edit-client-name').value = d.client_name;
    document.getElementById('edit-client-phone').value = d.client_phone || '';
    document.getElementById('edit-address').value = d.address;
    document.getElementById('edit-product').value = d.product;
    document.getElementById('edit-payment').value = d.payment_method || 'dinheiro';
    document.getElementById('edit-fee').value = d.delivery_fee;
    document.getElementById('edit-motoboy').value = d.motoboy_id || '';
    document.getElementById('edit-notes').value = d.notes || '';
    document.getElementById('modal-edit').classList.add('open');
  } catch (e) { showToast(e.message, 'error'); }
}

function closeEditModal(event) {
  if (event && event.target !== document.getElementById('modal-edit')) return;
  document.getElementById('modal-edit').classList.remove('open');
}

async function saveEdit() {
  const id = currentDeliveryId;
  const body = {
    status: document.getElementById('edit-status').value,
    client_name: document.getElementById('edit-client-name').value.trim(),
    client_phone: document.getElementById('edit-client-phone').value.trim(),
    address: document.getElementById('edit-address').value.trim(),
    product: document.getElementById('edit-product').value.trim(),
    payment_method: document.getElementById('edit-payment').value,
    delivery_fee: parseFloat(document.getElementById('edit-fee').value),
    motoboy_id: parseInt(document.getElementById('edit-motoboy').value) || null,
    notes: document.getElementById('edit-notes').value.trim(),
  };
  try {
    await api('PATCH', `/api/entregas/deliveries/${id}`, body);
    document.getElementById('modal-edit').classList.remove('open');
    showToast('Entrega atualizada!', 'success');
    loadDeliveries();
    loadSummary();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteDelivery() {
  if (!confirm('Excluir esta entrega?')) return;
  try {
    await api('DELETE', `/api/entregas/deliveries/${currentDeliveryId}`);
    document.getElementById('modal-edit').classList.remove('open');
    showToast('Entrega excluída.', 'success');
    loadDeliveries();
    loadSummary();
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Motoboys management ────────────────────────────────────────────────────────

async function loadMotoboys() {
  try {
    motoboysCache = await api('GET', '/api/entregas/motoboys');
    renderMotoboys();
    populateMotoboySelects();
  } catch (e) { console.error(e); }
}

function renderMotoboys() {
  const list = document.getElementById('motoboys-list');
  if (!motoboysCache.length) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">👤</div><p>Nenhum motoboy cadastrado.</p></div>';
    return;
  }
  const shareBase = location.origin + '/entregas?motoboy=';
  list.innerHTML = motoboysCache.map(m => `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">🛵 ${escHtml(m.name)}</div>
          <div class="card-sub">${fmtPhone(m.phone) || 'Sem telefone'}</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="removeMotoboy(${m.id})">Remover</button>
      </div>
      <div class="detail-row" style="margin-top:8px">
        <span class="detail-icon">🔑</span>
        <span class="detail-text">
          <span class="detail-label">Link de acesso do motoboy</span>
          <a href="${shareBase}${m.access_code}" target="_blank" style="color:var(--blue);word-break:break-all">
            ${location.hostname}/entregas?motoboy=<strong>${m.access_code}</strong>
          </a>
        </span>
        <button class="btn btn-secondary btn-sm" onclick="copyLink('${shareBase}${m.access_code}')">📋</button>
      </div>
    </div>
  `).join('');
}

function copyLink(url) {
  navigator.clipboard.writeText(url).then(() => showToast('Link copiado!', 'success'));
}

async function addMotoboy() {
  const name = document.getElementById('new-motoboy-name').value.trim();
  const phone = document.getElementById('new-motoboy-phone').value.trim();
  if (!name) { showToast('Digite o nome do motoboy', 'error'); return; }
  try {
    await api('POST', '/api/entregas/motoboys', { name, phone });
    document.getElementById('new-motoboy-name').value = '';
    document.getElementById('new-motoboy-phone').value = '';
    showToast('Motoboy cadastrado!', 'success');
    await loadMotoboys();
  } catch (e) { showToast(e.message, 'error'); }
}

async function removeMotoboy(id) {
  if (!confirm('Remover motoboy? Ele não poderá mais acessar o sistema.')) return;
  try {
    await api('DELETE', `/api/entregas/motoboys/${id}`);
    showToast('Motoboy removido.', 'success');
    await loadMotoboys();
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Summary ────────────────────────────────────────────────────────────────────

function setTodaySummary() {
  document.getElementById('summary-date').value = today();
  loadSummary();
}

async function loadSummary() {
  const date = document.getElementById('summary-date').value || today();
  const el = document.getElementById('summary-content');
  try {
    const s = await api('GET', `/api/entregas/summary?date=${date}`);
    let motoboysHtml = '';
    for (const [name, data] of Object.entries(s.by_motoboy || {})) {
      motoboysHtml += `
        <div class="card" style="margin-bottom:8px">
          <div class="card-header">
            <div><div class="card-title">🛵 ${escHtml(name)}</div></div>
            <strong style="color:var(--green-dark)">${fmtCurrency(data.total_fee)}</strong>
          </div>
          <div class="card-sub">${data.deliveries} entrega(s)</div>
        </div>
      `;
    }

    let payHtml = Object.entries(s.by_payment || {})
      .map(([p, c]) => `<div class="detail-row"><span class="detail-icon">${paymentIcon(p)}</span><span class="detail-text">${p}</span><strong>${c}</strong></div>`)
      .join('');

    el.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${s.total}</div>
          <div class="stat-label">Total</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--yellow)">${s.pending + s.in_transit}</div>
          <div class="stat-label">Pendentes</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${s.delivered}</div>
          <div class="stat-label">Entregues</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="font-size:1.4rem">${fmtCurrency(s.total_fees)}</div>
          <div class="stat-label">Total taxas</div>
        </div>
      </div>

      ${payHtml ? `<div class="card"><div class="card-title" style="margin-bottom:10px">💳 Formas de pagamento</div>${payHtml}</div>` : ''}

      ${motoboysHtml ? `<div class="section-title">Acerto com motoboys</div>${motoboysHtml}` : ''}

      <button class="btn btn-outline btn-full" style="margin-top:8px" onclick="printSummary()">🖨️ Imprimir resumo</button>
    `;
  } catch (e) { el.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`; }
}

function printSummary() {
  window.print();
}

// ── Motoboy view ───────────────────────────────────────────────────────────────

async function enterMotoboyView(code) {
  motoboyCode = code;
  showScreen('motoboy');
  document.getElementById('motoboy-date').textContent = fmtDate(today());
  await loadMotoboyDeliveries();
}

async function loadMotoboyDeliveries() {
  const hero = document.getElementById('motoboy-hero-card');
  const list = document.getElementById('motoboy-deliveries-list');
  hero.innerHTML = '';
  list.innerHTML = '<div class="empty"><div class="empty-icon">⏳</div><p>Carregando...</p></div>';
  try {
    const data = await fetch(`/api/entregas/motoboy/${motoboyCode}?date=${today()}`).then(r => {
      if (!r.ok) throw new Error('Código inválido');
      return r.json();
    });
    document.getElementById('motoboy-name-title').textContent = `🛵 ${data.motoboy.name}`;
    hero.innerHTML = `
      <div class="motoboy-hero">
        <h2>Olá, ${escHtml(data.motoboy.name)}!</h2>
        <div class="fee">${fmtCurrency(data.total_fee)}</div>
        <div class="sub">${data.delivered_count} de ${data.total_count} entrega(s) concluída(s)</div>
      </div>
    `;

    if (!data.deliveries.length) {
      list.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><p>Nenhuma entrega hoje.</p></div>';
      return;
    }

    list.innerHTML = data.deliveries
      .filter(d => d.status !== 'cancelado')
      .map(d => `
        <div class="card" id="mdel-${d.id}">
          <div class="card-header">
            <div>
              <div class="card-title">${escHtml(d.client_name)}</div>
              <div class="card-sub">${fmtPhone(d.client_phone) || ''}</div>
            </div>
            <span class="badge badge-${d.status}">${statusLabel(d.status)}</span>
          </div>
          <div class="detail-row"><span class="detail-icon">📍</span>
            <span class="detail-text">
              <a href="https://maps.google.com/?q=${encodeURIComponent(d.address)}" target="_blank" style="color:var(--blue)">${escHtml(d.address)}</a>
            </span>
          </div>
          <div class="detail-row"><span class="detail-icon">📦</span><span class="detail-text">${escHtml(d.product)}</span></div>
          <div class="detail-row">
            <span class="detail-icon">${paymentIcon(d.payment_method)}</span>
            <span class="detail-text">${escHtml(d.payment_method || 'dinheiro')}</span>
            <strong style="margin-left:auto;color:var(--green-dark)">${fmtCurrency(d.delivery_fee)}</strong>
          </div>
          ${d.notes ? `<div class="detail-row"><span class="detail-icon">📝</span><span class="detail-text"><em>${escHtml(d.notes)}</em></span></div>` : ''}
          <div class="delivery-actions">
            ${d.status === 'pendente' ? `<button class="btn btn-primary btn-sm" onclick="motoboyUpdateStatus(${d.id},'em_entrega')">🛵 Saí para entrega</button>` : ''}
            ${d.status === 'em_entrega' ? `<button class="btn btn-primary btn-sm" onclick="motoboyUpdateStatus(${d.id},'entregue')">✅ Entregue!</button>` : ''}
            ${d.status === 'entregue' ? `<button class="btn btn-secondary btn-sm" onclick="motoboyUpdateStatus(${d.id},'pendente')">↩ Desfazer</button>` : ''}
          </div>
        </div>
      `).join('');
  } catch (e) {
    hero.innerHTML = '';
    list.innerHTML = `<div class="empty"><div class="empty-icon">❌</div><p>${e.message}</p></div>`;
  }
}

async function motoboyUpdateStatus(deliveryId, status) {
  try {
    await fetch(`/api/entregas/motoboy/${motoboyCode}/${deliveryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await loadMotoboyDeliveries();
    showToast('Status atualizado!', 'success');
  } catch (e) { showToast('Erro ao atualizar', 'error'); }
}

// ── Utils ──────────────────────────────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Boot ───────────────────────────────────────────────────────────────────────
init();
