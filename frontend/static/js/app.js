// ── Token storage ─────────────────────────────────────────────────────────────
const TOKEN_KEY = 'instatudo_token';
let _currentUser = null;

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

// ── API helper ────────────────────────────────────────────────────────────────
async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  const tok = getToken();
  if (tok) opts.headers['Authorization'] = `Bearer ${tok}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 401) { doLogout(); return {}; }
  return res.json();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const colors = { info: '#6366f1', success: '#22c55e', error: '#ef4444', warning: '#f59e0b' };
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:20px;right:20px;background:${colors[type]};color:#fff;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;animation:slideIn .3s ease;max-width:320px;`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── Navigation ────────────────────────────────────────────────────────────────
function navigate(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById(pageId);
  if (page) page.classList.add('active');
  const nav = document.querySelector(`[data-page="${pageId}"]`);
  if (nav) nav.classList.add('active');
}

// ── Screen control ────────────────────────────────────────────────────────────
function showAuthScreen(tab = 'login') {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('ig-login-modal').classList.add('hidden');
  switchAuthTab(tab);
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
}

function showIgModal() {
  document.getElementById('ig-login-modal').classList.remove('hidden');
}

function hideIgModal() {
  document.getElementById('ig-login-modal').classList.add('hidden');
}

function showUpgradeModal() {
  document.getElementById('upgrade-modal').classList.remove('hidden');
}

function closeUpgradeModal() {
  document.getElementById('upgrade-modal').classList.add('hidden');
}

// Click outside modal to close
document.getElementById('upgrade-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeUpgradeModal();
});

// ── Auth tabs ─────────────────────────────────────────────────────────────────
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-tab').forEach(t => {
    if (t.dataset.auth === tab + '-form-wrap') t.classList.add('active');
  });
  document.getElementById('login-form-wrap').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form-wrap').classList.toggle('hidden', tab !== 'register');
}

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.auth.replace('-form-wrap', '');
    switchAuthTab(target);
  });
});

// ── Plan UI ───────────────────────────────────────────────────────────────────
function updatePlanUI(plan, usage = {}) {
  const label = document.getElementById('plan-badge-label');
  const hint = document.getElementById('plan-upgrade-hint');
  const box = document.getElementById('plan-badge-box');

  if (plan === 'pro') {
    label.textContent = '⭐ Pro';
    hint.classList.add('hidden');
    box.style.cursor = 'default';
    box.style.background = 'linear-gradient(135deg,rgba(225,48,108,.3),rgba(131,58,180,.3))';
  } else {
    label.textContent = 'Gratuito';
    hint.classList.remove('hidden');
    box.style.cursor = 'pointer';
    box.style.background = 'var(--surface2)';
  }

  // Lock/unlock Pro-only nav items (follow, unfollow, settings)
  document.querySelectorAll('.pro-feature').forEach(el => {
    if (plan === 'pro') {
      el.classList.remove('nav-locked');
      el.title = '';
    } else {
      el.classList.add('nav-locked');
      el.title = 'Requer plano Pro';
    }
  });

  // Show usage counters for free plan
  if (plan !== 'pro' && usage) {
    _renderUsageBanners(usage);
  }
}

function _renderUsageBanners(usage) {
  // Content usage banner
  const contentBanner = document.getElementById('content-usage-banner');
  if (contentBanner && usage.content_saves_this_month != null) {
    const used = usage.content_saves_this_month;
    const limit = usage.content_saves_limit;
    const pct = Math.round((used / limit) * 100);
    const color = pct >= 100 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--success)';
    contentBanner.innerHTML = `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--text-muted);display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <span>💾 Ideias salvas este mês: <strong style="color:${color}">${used}/${limit}</strong></span>
        ${pct >= 100 ? '<button class="btn btn-primary btn-sm" onclick="showUpgradeModal()">Upgrade Pro</button>' : ''}
      </div>`;
  }
  // Teleprompter usage banner
  const tpBanner = document.getElementById('tp-usage-banner');
  if (tpBanner && usage.teleprompter_scripts != null) {
    const used = usage.teleprompter_scripts;
    const limit = usage.teleprompter_scripts_limit;
    const pct = Math.round((used / limit) * 100);
    const color = pct >= 100 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--success)';
    tpBanner.innerHTML = `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--text-muted);display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <span>📝 Roteiros salvos: <strong style="color:${color}">${used}/${limit}</strong></span>
        ${pct >= 100 ? '<button class="btn btn-primary btn-sm" onclick="showUpgradeModal()">Upgrade Pro</button>' : ''}
      </div>`;
  }
}

// ── Register ──────────────────────────────────────────────────────────────────
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true; btn.textContent = 'Criando conta...';

  const res = await fetch('/api/app/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: document.getElementById('reg-email').value,
      password: document.getElementById('reg-password').value,
      name: document.getElementById('reg-name').value,
    }),
  }).then(r => r.json());

  btn.disabled = false; btn.textContent = 'Criar conta grátis';

  if (res.success) {
    setToken(res.token);
    _currentUser = { id: res.user_id, plan: res.plan, name: res.name };
    toast('Conta criada! Conecte seu Instagram.', 'success');
    showApp();
    navigate('page-dashboard');
    updatePlanUI(res.plan, {});
    showIgModal();
  } else {
    toast(res.message || 'Erro ao criar conta', 'error');
  }
});

// ── App Login ─────────────────────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true; btn.textContent = 'Entrando...';

  const res = await fetch('/api/app/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: document.getElementById('app-email').value,
      password: document.getElementById('app-password').value,
    }),
  }).then(r => r.json());

  btn.disabled = false; btn.textContent = 'Entrar';

  if (res.success) {
    setToken(res.token);
    _currentUser = { id: res.user_id, plan: res.plan, name: res.name };
    showApp();
    navigate('page-dashboard');
    updatePlanUI(res.plan, {});

    const igStatus = await api('GET', '/api/auth/status');
    if (!igStatus.logged_in) {
      showIgModal();
    } else {
      loadDashboard();
    }
  } else {
    toast(res.message || 'Erro no login', 'error');
  }
});

// ── Instagram login ───────────────────────────────────────────────────────────
document.getElementById('ig-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true; btn.textContent = 'Conectando...';

  const res = await api('POST', '/api/auth/login', {
    username: document.getElementById('ig-user').value,
    password: document.getElementById('ig-pass').value,
    verification_code: document.getElementById('ig-2fa').value || null,
  });

  btn.disabled = false; btn.textContent = 'Conectar';

  if (res.success) {
    toast('Instagram conectado!', 'success');
    hideIgModal();
    loadDashboard();
  } else if (res.requires_2fa) {
    document.getElementById('two-fa-row').classList.remove('hidden');
    toast('Insira o código 2FA', 'warning');
  } else {
    toast(res.message || 'Erro ao conectar Instagram', 'error');
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────
function doLogout() {
  clearToken();
  _currentUser = null;
  showAuthScreen('login');
  toast('Logout realizado', 'info');
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('POST', '/api/auth/logout').catch(() => {});
  doLogout();
});

// ── Upgrade / Checkout ────────────────────────────────────────────────────────
document.getElementById('btn-checkout').addEventListener('click', async () => {
  const btn = document.getElementById('btn-checkout');
  btn.disabled = true; btn.textContent = 'Gerando link...';

  const res = await api('GET', '/api/subscriptions/checkout');

  btn.disabled = false; btn.textContent = 'Assinar Pro — R$ 49,90/mês';

  if (res.success && res.url) {
    window.open(res.url, '_blank');
    toast('Link de pagamento aberto!', 'success');
  } else if (res.manual) {
    toast('Configure ASAAS_API_KEY no servidor para habilitar pagamentos.', 'warning');
  } else {
    toast(res.message || 'Erro ao gerar link', 'error');
  }
});

// ── Init / Check auth ─────────────────────────────────────────────────────────
async function init() {
  const token = getToken();
  if (!token) { showAuthScreen(); return; }

  const me = await fetch('/api/app/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(r => r.ok ? r.json() : null).catch(() => null);

  if (!me) { showAuthScreen(); return; }

  _currentUser = me;
  showApp();
  navigate('page-dashboard');
  updatePlanUI(me.plan, me.usage);

  const igStatus = await api('GET', '/api/auth/status');
  if (!igStatus.logged_in) {
    showIgModal();
  } else {
    loadDashboard();
  }
}

// ── Pro-gated nav items (follow, unfollow, settings) ─────────────────────────
document.querySelectorAll('.pro-feature').forEach(item => {
  item.addEventListener('click', (e) => {
    if (item.classList.contains('nav-locked')) {
      e.preventDefault();
      e.stopPropagation();
      showUpgradeModal();
      return;
    }
    const page = item.dataset.page;
    navigate(page);
    if (page === 'page-settings') loadSettings();
  });
});

// ── Free nav items (content + teleprompter — available with limits) ───────────
document.querySelector('[data-page="page-content"]').addEventListener('click', () => {
  navigate('page-content');
});

document.querySelector('[data-page="page-teleprompter"]').addEventListener('click', () => {
  navigate('page-teleprompter');
  loadScripts();
});

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const s = await api('GET', '/api/analytics/summary');
    document.getElementById('stat-followers').textContent = (s.followers || 0).toLocaleString();
    document.getElementById('stat-following').textContent = (s.following || 0).toLocaleString();
    document.getElementById('stat-posts').textContent = (s.media_count || 0).toLocaleString();
    document.getElementById('stat-engagement').textContent = s.avg_engagement_per_post || 0;

    const growth = s.growth_since_last_capture || 0;
    const el = document.getElementById('stat-growth');
    el.textContent = (growth >= 0 ? '+' : '') + growth;
    el.className = growth >= 0 ? 'stat-delta delta-up' : 'stat-delta delta-down';

    const fs = await api('GET', '/api/analytics/follow-stats');
    document.getElementById('stat-bot-followed').textContent = fs.total_followed_by_bot || 0;
    document.getElementById('stat-bot-unfollowed').textContent = fs.total_unfollowed_by_bot || 0;

    const grid = document.getElementById('recent-posts');
    grid.innerHTML = '';
    (s.posts || []).slice(0, 6).forEach(p => {
      const icon = p.media_type === 2 ? '🎬' : p.media_type === 8 ? '📷' : '🖼️';
      grid.innerHTML += `
        <div class="post-card">
          <div style="font-size:24px;text-align:center;margin-bottom:8px">${icon}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">${(p.caption||'Sem legenda').slice(0,60)}...</div>
          <div class="post-stat"><span>❤️ ${p.likes}</span><span>💬 ${p.comments}</span><span>👁️ ${p.views}</span></div>
        </div>`;
    });
  } catch(e) {
    // silent — user may not have Instagram connected yet
  }
}

document.getElementById('btn-capture').addEventListener('click', async () => {
  const res = await api('POST', '/api/analytics/capture');
  if (res.captured_at) { toast('Snapshot salvo!', 'success'); loadDashboard(); }
});

// ── Follow ────────────────────────────────────────────────────────────────────
document.getElementById('btn-follow-start').addEventListener('click', async () => {
  const target = document.getElementById('follow-target').value.trim();
  const source = document.getElementById('follow-source').value;
  if (!target) { toast('Informe o usuário alvo', 'warning'); return; }
  const res = await api('POST', '/api/follow/start', { target_username: target, source });
  toast(res.message || res.detail, res.success ? 'success' : 'error');
  if (res.success) pollFollowStatus();
});

document.getElementById('btn-follow-stop').addEventListener('click', async () => {
  const res = await api('POST', '/api/follow/stop');
  toast(res.message, 'info');
});

let followPollInterval = null;
function pollFollowStatus() {
  if (followPollInterval) clearInterval(followPollInterval);
  followPollInterval = setInterval(async () => {
    const s = await api('GET', '/api/follow/status');
    document.getElementById('follow-count').textContent = s.followed_today || 0;
    document.getElementById('follow-last').textContent = s.last_action || '-';
    document.getElementById('follow-badge').innerHTML = s.running
      ? '<span class="badge badge-green"><span class="dot"></span>Ativo</span>'
      : '<span class="badge badge-red"><span class="dot"></span>Parado</span>';
    const log = document.getElementById('follow-log');
    if (s.log && s.log.length) log.innerHTML = s.log.slice(-20).reverse().map(l => `<div>${l}</div>`).join('');
    if (!s.running) clearInterval(followPollInterval);
  }, 3000);
}

// ── Unfollow ──────────────────────────────────────────────────────────────────
document.getElementById('btn-unfollow-start').addEventListener('click', async () => {
  const mode = document.getElementById('unfollow-mode').value;
  const res = await api('POST', '/api/unfollow/start', { mode });
  toast(res.message || res.detail, res.success ? 'success' : 'error');
  if (res.success) pollUnfollowStatus();
});

document.getElementById('btn-unfollow-stop').addEventListener('click', async () => {
  const res = await api('POST', '/api/unfollow/stop');
  toast(res.message, 'info');
});

let unfollowPollInterval = null;
function pollUnfollowStatus() {
  if (unfollowPollInterval) clearInterval(unfollowPollInterval);
  unfollowPollInterval = setInterval(async () => {
    const s = await api('GET', '/api/unfollow/status');
    document.getElementById('unfollow-count').textContent = s.unfollowed_today || 0;
    document.getElementById('unfollow-last').textContent = s.last_action || '-';
    document.getElementById('unfollow-badge').innerHTML = s.running
      ? '<span class="badge badge-green"><span class="dot"></span>Ativo</span>'
      : '<span class="badge badge-red"><span class="dot"></span>Parado</span>';
    const log = document.getElementById('unfollow-log');
    if (s.log && s.log.length) log.innerHTML = s.log.slice(-20).reverse().map(l => `<div>${l}</div>`).join('');
    if (!s.running) clearInterval(unfollowPollInterval);
  }, 3000);
}

// ── Content ideas ─────────────────────────────────────────────────────────────
document.getElementById('btn-generate').addEventListener('click', async () => {
  const topic = document.getElementById('content-topic').value.trim();
  const niche = document.getElementById('content-niche').value.trim();
  if (!topic) { toast('Informe o tema', 'warning'); return; }
  const ideas = await api('POST', '/api/content/generate', { topic, niche, count: 8 });
  renderIdeas(Array.isArray(ideas) ? ideas : [], 'generated-ideas', true);
});

function renderIdeas(ideas, containerId, showSave = false) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (!ideas.length) { container.innerHTML = '<div class="text-muted">Nenhuma ideia encontrada.</div>'; return; }
  ideas.forEach(idea => {
    const div = document.createElement('div');
    div.className = 'idea-card';
    div.innerHTML = `
      <div class="idea-type">${idea.content_type}</div>
      <div class="idea-title">${idea.title}</div>
      <div class="idea-desc">${idea.description || ''}</div>
      <div class="idea-tags">${(idea.hashtags || '').split(' ').slice(0,6).join(' ')}</div>
      ${showSave ? `<button class="btn btn-outline btn-sm mt-12" onclick='saveIdea(${JSON.stringify(idea)})'>💾 Salvar</button>` : ''}
      ${!showSave ? `<span class="badge badge-purple mt-12">${idea.status || 'pending'}</span>` : ''}
    `;
    container.appendChild(div);
  });
}

async function saveIdea(idea) {
  const res = await api('POST', '/api/content/save', {
    title: idea.title, description: idea.description,
    hashtags: idea.hashtags, content_type: idea.content_type,
  });
  if (res.detail && res.detail.includes('Limite')) {
    toast(res.detail, 'warning');
    showUpgradeModal();
    return;
  }
  toast(res.message, res.success ? 'success' : 'error');
  // Refresh usage
  const me = await api('GET', '/api/app/me');
  if (me.usage) _renderUsageBanners(me.usage);
}

async function loadSavedIdeas() {
  const ideas = await api('GET', '/api/content/ideas');
  renderIdeas(Array.isArray(ideas) ? ideas : [], 'saved-ideas', false);
}

// ── Teleprompter ──────────────────────────────────────────────────────────────
async function loadScripts() {
  const scripts = await api('GET', '/api/teleprompter/scripts');
  const list = document.getElementById('script-list');
  list.innerHTML = '';
  if (!Array.isArray(scripts) || !scripts.length) {
    list.innerHTML = '<div class="text-muted">Nenhum roteiro salvo.</div>';
    return;
  }
  scripts.forEach(s => {
    const div = document.createElement('div');
    div.className = 'idea-card flex justify-between items-center';
    div.innerHTML = `
      <div>
        <div style="font-weight:600">${s.title}</div>
        <div style="font-size:12px;color:var(--text-muted)">${s.content.slice(0,60)}...</div>
      </div>
      <div class="flex gap-8">
        <button class="btn btn-outline btn-sm" onclick="openTeleprompter(${s.id})">▶ Usar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteScript(${s.id})">🗑</button>
      </div>`;
    list.appendChild(div);
  });
}

document.getElementById('script-save-btn').addEventListener('click', async () => {
  const title = document.getElementById('script-title').value.trim();
  const content = document.getElementById('script-content').value.trim();
  const speed = parseInt(document.getElementById('script-speed').value);
  const font_size = parseInt(document.getElementById('script-fontsize').value);
  if (!title || !content) { toast('Preencha título e roteiro', 'warning'); return; }
  const res = await api('POST', '/api/teleprompter/scripts', { title, content, speed, font_size });
  if (res.detail && res.detail.includes('Limite')) {
    toast(res.detail, 'warning');
    showUpgradeModal();
    return;
  }
  toast(res.message, res.success ? 'success' : 'error');
  if (res.success) {
    document.getElementById('script-title').value = '';
    document.getElementById('script-content').value = '';
    loadScripts();
    // Refresh usage
    const me = await api('GET', '/api/app/me');
    if (me.usage) _renderUsageBanners(me.usage);
  }
});

async function deleteScript(id) {
  await api('DELETE', `/api/teleprompter/scripts/${id}`);
  toast('Roteiro excluído', 'info');
  loadScripts();
}

function openTeleprompter(id) {
  window.open(`/teleprompter-page?id=${id}`, '_blank', 'width=900,height=700');
}

// ── Settings ──────────────────────────────────────────────────────────────────
const DAY_LABELS = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
let _activeDays = new Set([0,1,2,3,4,5,6]);

function buildDaysSelector() {
  const container = document.getElementById('days-selector');
  if (!container) return;
  container.innerHTML = '';
  DAY_LABELS.forEach((label, i) => {
    const btn = document.createElement('button');
    btn.className = 'day-btn' + (_activeDays.has(i) ? ' active' : '');
    btn.textContent = label;
    btn.dataset.day = i;
    btn.type = 'button';
    btn.addEventListener('click', () => {
      if (_activeDays.has(i)) { if (_activeDays.size > 1) _activeDays.delete(i); }
      else { _activeDays.add(i); }
      btn.classList.toggle('active', _activeDays.has(i));
    });
    container.appendChild(btn);
  });
}

function buildHourTimeline() {
  const container = document.getElementById('hour-timeline');
  if (!container) return;
  container.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const block = document.createElement('div');
    block.className = 'hour-block';
    block.dataset.hour = h;
    block.title = `${String(h).padStart(2,'0')}:00`;
    container.appendChild(block);
  }
}

function updateHourTimeline() {
  const start = parseInt(document.getElementById('setting-active_hours_start')?.value) || 0;
  const end = parseInt(document.getElementById('setting-active_hours_end')?.value) || 23;
  document.querySelectorAll('.hour-block').forEach(b => {
    const h = parseInt(b.dataset.hour);
    const active = start <= end ? (h >= start && h <= end) : (h >= start || h <= end);
    b.classList.toggle('active-hour', active);
  });
}

function updateDelayPreview() {
  const minEl = document.getElementById('setting-follow_delay_min');
  const maxEl = document.getElementById('setting-follow_delay_max');
  const checked = document.querySelector('input[name="delay_unit"]:checked');
  const unit = checked?.value || 'seconds';
  const unitLabel = { seconds: 'segundo(s)', minutes: 'minuto(s)', hours: 'hora(s)' }[unit];
  const preMin = document.getElementById('preview-min');
  const preMax = document.getElementById('preview-max');
  if (preMin) preMin.textContent = `${minEl?.value || '?'} ${unitLabel}`;
  if (preMax) preMax.textContent = `${maxEl?.value || '?'} ${unitLabel}`;
}

document.getElementById('unit-selector')?.addEventListener('click', (e) => {
  const label = e.target.closest('.unit-option');
  if (!label) return;
  document.querySelectorAll('.unit-option').forEach(l => l.classList.remove('selected'));
  label.classList.add('selected');
  label.querySelector('input[type=radio]').checked = true;
  updateDelayPreview();
});

['setting-follow_delay_min','setting-follow_delay_max'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', updateDelayPreview);
});
['setting-active_hours_start','setting-active_hours_end'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', updateHourTimeline);
});

async function loadSettings() {
  const s = await api('GET', '/api/settings');
  const directKeys = ['follow_delay_min','follow_delay_max','follow_amount',
    'daily_follow_limit','daily_unfollow_limit','unfollow_after_days',
    'active_hours_start','active_hours_end'];
  directKeys.forEach(k => {
    const el = document.getElementById(`setting-${k}`);
    if (el && s[k] != null) el.value = s[k];
  });

  const unit = s['follow_delay_unit'] || 'seconds';
  document.querySelectorAll('.unit-option').forEach(l => {
    const match = l.dataset.unit === unit;
    l.classList.toggle('selected', match);
    const radio = l.querySelector('input[type=radio]');
    if (radio) radio.checked = match;
  });

  const daysRaw = s['active_days'] || '0,1,2,3,4,5,6';
  _activeDays = new Set(daysRaw.split(',').map(Number));
  buildDaysSelector();
  buildHourTimeline();
  updateHourTimeline();
  updateDelayPreview();
}

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  const directKeys = ['follow_delay_min','follow_delay_max','follow_amount',
    'daily_follow_limit','daily_unfollow_limit','unfollow_after_days',
    'active_hours_start','active_hours_end'];
  for (const key of directKeys) {
    const el = document.getElementById(`setting-${key}`);
    if (el) await api('POST', '/api/settings', { key, value: el.value });
  }
  const unit = document.querySelector('input[name="delay_unit"]:checked')?.value || 'seconds';
  await api('POST', '/api/settings', { key: 'follow_delay_unit', value: unit });
  await api('POST', '/api/settings', { key: 'active_days', value: [..._activeDays].sort().join(',') });
  toast('Configurações salvas!', 'success');
  updateHourTimeline();
  updateDelayPreview();
});

// ── Tab system ────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const group = tab.dataset.group;
    const target = tab.dataset.tab;
    document.querySelectorAll(`.tab[data-group="${group}"]`).forEach(t => t.classList.remove('active'));
    document.querySelectorAll(`.tab-pane[data-group="${group}"]`).forEach(p => p.classList.add('hidden'));
    tab.classList.add('active');
    document.getElementById(target).classList.remove('hidden');
    if (target === 'tab-saved') loadSavedIdeas();
    if (target === 'tab-scripts-list') loadScripts();
  });
});

// ── Dashboard nav item (non-pro) ──────────────────────────────────────────────
document.querySelector('[data-page="page-dashboard"]').addEventListener('click', () => {
  navigate('page-dashboard');
  loadDashboard();
});

// ── Speed/font labels ─────────────────────────────────────────────────────────
document.getElementById('script-speed')?.addEventListener('input', (e) => {
  document.getElementById('speed-label').textContent = e.target.value;
});
document.getElementById('script-fontsize')?.addEventListener('input', (e) => {
  document.getElementById('fontsize-label').textContent = e.target.value + 'px';
});

// ── Init ──────────────────────────────────────────────────────────────────────
init();

const style = document.createElement('style');
style.textContent = `@keyframes slideIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }`;
document.head.appendChild(style);
