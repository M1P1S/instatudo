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

// ── Investments nav ───────────────────────────────────────────────────────────
document.querySelector('[data-page="page-investments"]').addEventListener('click', () => {
  navigate('page-investments');
  loadInvestments();
});

// ── Investment helpers ────────────────────────────────────────────────────────
const INV_COLORS = {
  acao:       '#818cf8',
  fii:        '#4ade80',
  crypto:     '#fbbf24',
  renda_fixa: '#2dd4bf',
  etf:        '#c084fc',
  bdr:        '#f472b6',
};
const INV_TYPE_LABELS = {
  acao: 'Ações', fii: 'FII', crypto: 'Cripto',
  renda_fixa: 'Renda Fixa', etf: 'ETF', bdr: 'BDR',
};

function fmtBRL(v) {
  if (v == null || isNaN(v)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function fmtPct(v) {
  if (v == null || isNaN(v)) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}
function fmtQty(v) {
  if (v == null || isNaN(v)) return '—';
  return v % 1 === 0 ? v.toLocaleString('pt-BR') : v.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
}

let _invAssets = [];

// ── Load / refresh full investments page ──────────────────────────────────────
async function loadInvestments() {
  const portfolio = await api('GET', '/api/investments/portfolio');
  _invAssets = await api('GET', '/api/investments/assets');
  if (!Array.isArray(_invAssets)) _invAssets = [];

  // Summary cards
  const s = portfolio.summary || {};
  const pnl = s.total_pnl || 0;

  document.getElementById('inv-total-invested').textContent = fmtBRL(s.total_invested);
  document.getElementById('inv-total-current').textContent = fmtBRL(s.total_current);
  document.getElementById('inv-total-dividends').textContent = fmtBRL(s.total_dividends);

  const pnlEl = document.getElementById('inv-total-pnl');
  pnlEl.textContent = fmtBRL(pnl);
  pnlEl.className = 'stat-value ' + (pnl >= 0 ? 'inv-pnl-pos' : 'inv-pnl-neg');

  const pnlPct = document.getElementById('inv-pnl-pct');
  pnlPct.textContent = fmtPct(s.total_pnl_pct);
  pnlPct.className = 'stat-delta ' + (pnl >= 0 ? 'delta-up' : 'delta-down');

  // Holdings table
  renderHoldingsTable(portfolio.holdings || []);

  // Allocation donut + by-type
  renderAllocation(portfolio.by_type || {});
}

function renderHoldingsTable(holdings) {
  const tbody = document.getElementById('inv-holdings-body');
  if (!holdings.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="text-muted" style="text-align:center;padding:32px;">Nenhum ativo na carteira.</td></tr>';
    return;
  }
  tbody.innerHTML = holdings.map(h => {
    const pnlClass = h.pnl >= 0 ? 'inv-pnl-pos' : 'inv-pnl-neg';
    const chgClass = (h.change_pct || 0) >= 0 ? 'inv-change-pos' : 'inv-change-neg';
    const typeClass = `inv-type-badge inv-type-${h.asset_type}`;
    const priceDisplay = h.asset_type === 'renda_fixa'
      ? `${fmtBRL(h.current_price)} <span style="font-size:10px;color:var(--text-muted)">(manual)</span>`
      : `${fmtBRL(h.current_price)} <span class="${chgClass}">${fmtPct(h.change_pct)}</span>`;

    const updateBtn = (h.asset_type === 'renda_fixa' || !h.change_pct)
      ? `<button class="btn btn-outline btn-sm" onclick="openPriceModal(${h.asset_id}, ${h.current_price})" title="Atualizar valor">✏️</button>`
      : '';

    return `
      <tr>
        <td>
          <div class="inv-ticker">${h.ticker}</div>
          <div class="inv-ticker-name">${h.name}</div>
        </td>
        <td><span class="${typeClass}">${h.asset_type_label}</span></td>
        <td>${fmtQty(h.quantity)}</td>
        <td>${fmtBRL(h.avg_cost)}</td>
        <td>${priceDisplay}</td>
        <td>${fmtBRL(h.net_invested)}</td>
        <td><strong>${fmtBRL(h.current_value)}</strong></td>
        <td class="${pnlClass}">${fmtBRL(h.pnl)}<br><small>${fmtPct(h.pnl_pct)}</small></td>
        <td>${fmtBRL(h.dividends_received)}</td>
        <td>${h.dividend_yield > 0 ? fmtPct(h.dividend_yield) : '—'}</td>
        <td style="white-space:nowrap;">
          ${updateBtn}
          <button class="btn btn-outline btn-sm" onclick="invAddTxForAsset(${h.asset_id})" title="Registrar transação">+</button>
          <button class="btn btn-danger btn-sm" onclick="invDeleteAsset(${h.asset_id})" title="Remover ativo">🗑</button>
        </td>
      </tr>`;
  }).join('');
}

function renderAllocation(byType) {
  // Donut SVG
  const svg = document.getElementById('inv-donut');
  const legend = document.getElementById('inv-legend');
  const byTypeTable = document.getElementById('inv-by-type-table');
  if (!svg) return;

  const cx = 100, cy = 100, r = 80, inner = 50;
  const total = Object.values(byType).reduce((s, v) => s + (v.current || 0), 0);

  let segments = '';
  let legendHtml = '';
  let byTypeHtml = '';
  let startAngle = -Math.PI / 2;
  const types = Object.entries(byType).sort((a, b) => b[1].current - a[1].current);

  types.forEach(([type, info]) => {
    const pct = total > 0 ? info.current / total : 0;
    const angle = pct * 2 * Math.PI;
    const endAngle = startAngle + angle;

    if (pct > 0 && types.length > 1) {
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const xi1 = cx + inner * Math.cos(startAngle);
      const yi1 = cy + inner * Math.sin(startAngle);
      const xi2 = cx + inner * Math.cos(endAngle);
      const yi2 = cy + inner * Math.sin(endAngle);
      const large = angle > Math.PI ? 1 : 0;
      const color = INV_COLORS[type] || '#888';

      segments += `<path class="donut-segment" fill="${color}"
        d="M ${xi1} ${yi1} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}
           L ${xi2} ${yi2} A ${inner} ${inner} 0 ${large} 0 ${xi1} ${yi1} Z"
        title="${INV_TYPE_LABELS[type]}: ${info.pct}%" />`;
    } else if (pct > 0) {
      // Single segment: full circle
      const color = INV_COLORS[type] || '#888';
      segments += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" class="donut-segment" />
        <circle cx="${cx}" cy="${cy}" r="${inner}" fill="var(--surface)" />`;
    }

    startAngle = endAngle;

    legendHtml += `
      <div class="inv-legend-item">
        <div class="inv-legend-dot" style="background:${INV_COLORS[type] || '#888'}"></div>
        <span class="inv-legend-label">${info.label}</span>
        <span class="inv-legend-pct">${info.pct}%</span>
      </div>`;

    const pnlType = info.current - info.invested;
    const pnlClass = pnlType >= 0 ? 'inv-pnl-pos' : 'inv-pnl-neg';
    byTypeHtml += `
      <div class="inv-type-row">
        <div>
          <span class="inv-type-badge inv-type-${type}" style="margin-right:8px;">${info.label}</span>
        </div>
        <div style="text-align:right;">
          <div><strong>${fmtBRL(info.current)}</strong></div>
          <div class="${pnlClass}" style="font-size:11px;">${fmtBRL(pnlType)}</div>
        </div>
      </div>`;
  });

  if (!segments) {
    svg.innerHTML = `<circle cx="100" cy="100" r="80" fill="var(--surface2)" />
      <circle cx="100" cy="100" r="50" fill="var(--surface)" />
      <text x="100" y="106" text-anchor="middle" fill="var(--text-muted)" font-size="12">Vazio</text>`;
  } else {
    svg.innerHTML = segments + `<circle cx="${cx}" cy="${cy}" r="${inner}" fill="var(--surface)" />`;
  }

  if (legend) legend.innerHTML = legendHtml || '<div class="text-muted">Sem dados</div>';
  if (byTypeTable) byTypeTable.innerHTML = byTypeHtml || '<div class="text-muted">Sem dados</div>';
}

// ── Transactions tab ──────────────────────────────────────────────────────────
async function loadInvTransactions() {
  const txs = await api('GET', '/api/investments/transactions');
  const tbody = document.getElementById('inv-tx-body');
  if (!Array.isArray(txs) || !txs.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-muted" style="text-align:center;padding:32px;">Nenhuma transação.</td></tr>';
    return;
  }
  tbody.innerHTML = txs.map(t => `
    <tr>
      <td>${t.transaction_date}</td>
      <td>
        <div class="inv-ticker">${t.ticker}</div>
        <div class="inv-ticker-name">${t.name}</div>
      </td>
      <td>
        <span class="badge ${t.transaction_type === 'buy' ? 'badge-green' : 'badge-red'}">
          ${t.transaction_type === 'buy' ? 'Compra' : 'Venda'}
        </span>
      </td>
      <td>${fmtQty(t.quantity)}</td>
      <td>${fmtBRL(t.price)}</td>
      <td>${fmtBRL(t.fees)}</td>
      <td><strong>${fmtBRL(t.total_value)}</strong></td>
      <td style="font-size:12px;color:var(--text-muted);">${t.notes || '—'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="invDeleteTx(${t.id})">🗑</button></td>
    </tr>`).join('');
}

async function invDeleteTx(id) {
  if (!confirm('Remover esta transação?')) return;
  const res = await api('DELETE', `/api/investments/transactions/${id}`);
  toast(res.message, 'info');
  loadInvTransactions();
  loadInvestments();
}

// ── Dividends tab ─────────────────────────────────────────────────────────────
async function loadInvDividends() {
  const divs = await api('GET', '/api/investments/dividends');
  const tbody = document.getElementById('inv-div-body');
  if (!Array.isArray(divs) || !divs.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:32px;">Nenhum dividendo registrado.</td></tr>';
    return;
  }
  tbody.innerHTML = divs.map(d => `
    <tr>
      <td>${d.dividend_date}</td>
      <td>
        <div class="inv-ticker">${d.ticker}</div>
        <div class="inv-ticker-name">${d.name}</div>
      </td>
      <td><span class="inv-type-badge inv-type-${d.asset_type}">${INV_TYPE_LABELS[d.asset_type] || d.asset_type}</span></td>
      <td><strong class="inv-pnl-pos">${fmtBRL(d.amount)}</strong></td>
      <td style="font-size:12px;color:var(--text-muted);">${d.notes || '—'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="invDeleteDiv(${d.id})">🗑</button></td>
    </tr>`).join('');
}

async function invDeleteDiv(id) {
  if (!confirm('Remover este registro?')) return;
  const res = await api('DELETE', `/api/investments/dividends/${id}`);
  toast(res.message, 'info');
  loadInvDividends();
  loadInvestments();
}

// ── Tab events for investments ────────────────────────────────────────────────
document.querySelectorAll('.tab[data-group="inv"]').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    if (target === 'tab-inv-transactions') loadInvTransactions();
    if (target === 'tab-inv-dividends') loadInvDividends();
    if (target === 'tab-inv-allocation') loadInvestments();
    if (target === 'tab-inv-brokers') renderBrokers();
  });
});

// ── Modals ────────────────────────────────────────────────────────────────────
function showInvModal(type) {
  if (type === 'transaction' || type === 'dividend') {
    // Populate asset dropdowns
    const sel = document.getElementById(type === 'transaction' ? 'inv-tx-asset' : 'inv-div-asset');
    sel.innerHTML = _invAssets.length
      ? _invAssets.map(a => `<option value="${a.id}">${a.ticker} — ${a.name}</option>`).join('')
      : '<option value="">Nenhum ativo cadastrado</option>';

    if (type === 'transaction') {
      // Set today's date
      document.getElementById('inv-tx-date').value = new Date().toISOString().slice(0, 10);
      document.getElementById('inv-tx-qty').value = '';
      document.getElementById('inv-tx-price').value = '';
      document.getElementById('inv-tx-fees').value = '0';
      document.getElementById('inv-tx-notes').value = '';
      document.getElementById('inv-tx-total').textContent = 'R$ —';
    }
    if (type === 'dividend') {
      document.getElementById('inv-div-date').value = new Date().toISOString().slice(0, 10);
      document.getElementById('inv-div-amount').value = '';
      document.getElementById('inv-div-notes').value = '';
    }
  }
  if (type === 'asset') {
    document.getElementById('inv-asset-ticker').value = '';
    document.getElementById('inv-asset-name').value = '';
    document.getElementById('inv-asset-sector').value = '';
    document.getElementById('inv-asset-notes').value = '';
    document.getElementById('inv-asset-manual-price').value = '';
    document.getElementById('inv-manual-price-row').classList.add('hidden');
    document.getElementById('inv-ticker-hint').textContent = '';
  }
  document.getElementById(`inv-modal-${type}`).classList.remove('hidden');
}

function closeInvModal(type) {
  document.getElementById(`inv-modal-${type}`).classList.add('hidden');
}

// Close modals on overlay click
['asset','transaction','dividend','price'].forEach(type => {
  const el = document.getElementById(`inv-modal-${type}`);
  if (el) el.addEventListener('click', e => { if (e.target === e.currentTarget) closeInvModal(type); });
});

// Type change — show/hide manual price for renda fixa
function onInvTypeChange() {
  const type = document.getElementById('inv-asset-type').value;
  const row = document.getElementById('inv-manual-price-row');
  row.classList.toggle('hidden', type !== 'renda_fixa');
  document.getElementById('inv-ticker-hint').textContent = type === 'crypto'
    ? 'Use o símbolo internacional: BTC, ETH, SOL, BNB, ADA...'
    : type === 'renda_fixa'
    ? 'Use um nome descritivo, ex: CDB Banco X, Tesouro SELIC 2027'
    : 'Use o código da B3: PETR4, HGLG11, BOVA11, AAPL34...';
}

let _tickerLookupTimeout = null;
function onTickerInput() {
  clearTimeout(_tickerLookupTimeout);
  const ticker = document.getElementById('inv-asset-ticker').value.trim();
  const type = document.getElementById('inv-asset-type').value;
  if (!ticker || type === 'renda_fixa') return;
  _tickerLookupTimeout = setTimeout(async () => {
    const hint = document.getElementById('inv-ticker-hint');
    hint.textContent = 'Buscando...';
    const q = await api('GET', `/api/investments/quote/${encodeURIComponent(ticker)}?asset_type=${type}`).catch(() => null);
    if (q && q.price) {
      hint.textContent = `✅ ${q.name} — Preço atual: ${fmtBRL(q.price)}`;
      if (!document.getElementById('inv-asset-name').value) {
        document.getElementById('inv-asset-name').value = q.name;
      }
    } else if (q && q.detail) {
      hint.textContent = `⚠️ Não encontrado — preencha o nome manualmente`;
    } else {
      hint.textContent = '';
    }
  }, 600);
}

// Transaction type selector
document.querySelectorAll('[data-txtype]').forEach(label => {
  label.addEventListener('click', () => {
    document.querySelectorAll('[data-txtype]').forEach(l => l.classList.remove('selected'));
    label.classList.add('selected');
    label.querySelector('input[type=radio]').checked = true;
  });
});

function updateTxTotal() {
  const qty = parseFloat(document.getElementById('inv-tx-qty').value) || 0;
  const price = parseFloat(document.getElementById('inv-tx-price').value) || 0;
  const fees = parseFloat(document.getElementById('inv-tx-fees').value) || 0;
  const txType = document.querySelector('[name=tx_type]:checked')?.value || 'buy';
  const total = txType === 'buy' ? qty * price + fees : qty * price - fees;
  document.getElementById('inv-tx-total').textContent = fmtBRL(total);
}

async function submitAddAsset() {
  const ticker = document.getElementById('inv-asset-ticker').value.trim();
  const name = document.getElementById('inv-asset-name').value.trim();
  const asset_type = document.getElementById('inv-asset-type').value;
  if (!ticker || !name) { toast('Preencha ticker e nome', 'warning'); return; }
  const manual_price_val = document.getElementById('inv-asset-manual-price').value;
  const res = await api('POST', '/api/investments/assets', {
    ticker, name, asset_type,
    sector: document.getElementById('inv-asset-sector').value.trim(),
    notes: document.getElementById('inv-asset-notes').value.trim(),
    manual_price: manual_price_val ? parseFloat(manual_price_val) : null,
  });
  toast(res.message || res.detail, res.success ? 'success' : 'error');
  if (res.success) { closeInvModal('asset'); loadInvestments(); }
}

async function submitAddTransaction() {
  const asset_id = parseInt(document.getElementById('inv-tx-asset').value);
  const qty = parseFloat(document.getElementById('inv-tx-qty').value);
  const price = parseFloat(document.getElementById('inv-tx-price').value);
  const fees = parseFloat(document.getElementById('inv-tx-fees').value) || 0;
  const tx_date = document.getElementById('inv-tx-date').value;
  const tx_type = document.querySelector('[name=tx_type]:checked')?.value || 'buy';
  if (!asset_id || !qty || !price) { toast('Preencha todos os campos obrigatórios', 'warning'); return; }
  const res = await api('POST', '/api/investments/transactions', {
    asset_id, transaction_type: tx_type, quantity: qty, price, fees,
    transaction_date: tx_date,
    notes: document.getElementById('inv-tx-notes').value.trim(),
  });
  toast(res.message || res.detail, res.success ? 'success' : 'error');
  if (res.success) { closeInvModal('transaction'); loadInvestments(); }
}

async function submitAddDividend() {
  const asset_id = parseInt(document.getElementById('inv-div-asset').value);
  const amount = parseFloat(document.getElementById('inv-div-amount').value);
  const div_date = document.getElementById('inv-div-date').value;
  if (!asset_id || !amount || !div_date) { toast('Preencha todos os campos', 'warning'); return; }
  const res = await api('POST', '/api/investments/dividends', {
    asset_id, amount, dividend_date: div_date,
    notes: document.getElementById('inv-div-notes').value.trim(),
  });
  toast(res.message || res.detail, res.success ? 'success' : 'error');
  if (res.success) { closeInvModal('dividend'); loadInvDividends(); loadInvestments(); }
}

function openPriceModal(assetId, currentPrice) {
  document.getElementById('inv-price-asset-id').value = assetId;
  document.getElementById('inv-price-value').value = currentPrice || '';
  document.getElementById('inv-modal-price').classList.remove('hidden');
}

async function submitUpdatePrice() {
  const asset_id = parseInt(document.getElementById('inv-price-asset-id').value);
  const price = parseFloat(document.getElementById('inv-price-value').value);
  if (!price) { toast('Informe o valor', 'warning'); return; }
  const res = await api('PATCH', `/api/investments/assets/${asset_id}/price`, { price });
  toast(res.message || res.detail, res.success ? 'success' : 'error');
  if (res.success) { closeInvModal('price'); loadInvestments(); }
}

async function invDeleteAsset(id) {
  if (!confirm('Remover ativo e todo o histórico de transações e dividendos?')) return;
  const res = await api('DELETE', `/api/investments/assets/${id}`);
  toast(res.message, 'info');
  loadInvestments();
}

// ── Broker recommendations ────────────────────────────────────────────────────
const BROKERS = [
  // ── Corretoras de valores ─────────────────────────────────────────────────
  {
    id: 'clear',
    name: 'Clear Corretora',
    emoji: '⚡',
    color: '#1e40af',
    type: 'corretora',
    typeLabel: 'Corretora de Valores (B3)',
    rating: 4.5,
    categories: ['acao'],
    tags: ['Ações', 'FIIs', 'ETF', 'BDR', 'Opções', 'Fundos'],
    fee: { label: 'Corretagem Ações', value: 'Gratuita (day trade R$ 10)' },
    highlights: [
      'Taxa zero para ordens de ações no mercado fracionário e lote padrão',
      'Plataforma Profit (gráficos profissionais, análise técnica)',
      'Acesso completo à B3: Ações, FIIs, ETFs, BDRs e Opções',
      'Parte do grupo XP — solidez e estrutura robusta',
    ],
    pros: ['Taxa zero', 'Plataforma profissional', 'Ampla oferta de ativos', 'APP completo'],
    cons: ['Day trade tem taxa', 'Atendimento pode ser lento', 'Poucos produtos de RF'],
    bestFor: ['acao', 'fii', 'etf'],
  },
  {
    id: 'xp',
    name: 'XP Investimentos',
    emoji: '🏆',
    color: '#ea580c',
    type: 'corretora',
    typeLabel: 'Maior Corretora do Brasil',
    rating: 4.5,
    categories: ['acao', 'renda_fixa'],
    tags: ['Ações', 'FIIs', 'ETF', 'CDB', 'LCI', 'LCA', 'Fundos', 'Tesouro'],
    fee: { label: 'Corretagem Ações', value: 'Gratuita (Pro: R$ 4,90)' },
    highlights: [
      'Maior corretora do Brasil com mais de 4 milhões de clientes',
      'Amplo cardápio de renda fixa: CDB, LCI, LCA, Debêntures',
      'Fundos exclusivos e gestão de patrimônio para grandes valores',
      'Conteúdo educacional Xpeed School gratuito',
    ],
    pros: ['Enorme variedade de produtos', 'Assessoria financeira', 'Plataforma sólida', 'Research gratuito'],
    cons: ['Taxas em alguns produtos', 'Foco em grandes clientes', 'Interface pode ser complexa'],
    bestFor: ['acao', 'renda_fixa', 'fii'],
  },
  {
    id: 'inter',
    name: 'Inter Invest',
    emoji: '🟠',
    color: '#ea580c',
    type: 'banco_digital',
    typeLabel: 'Banco Digital + Corretora',
    rating: 4.2,
    categories: ['acao', 'renda_fixa'],
    tags: ['Ações', 'FIIs', 'CDB', 'Tesouro', 'Pix', 'Conta Digital'],
    fee: { label: 'Corretagem', value: 'Gratuita' },
    highlights: [
      'Conta corrente, cartão e investimentos em um só app',
      'Taxa zero de corretagem para todos os ativos',
      'CDB Inter com rentabilidade acima da média do mercado',
      'Cashback em compras com cartão Inter',
    ],
    pros: ['Tudo em um app', 'Zero corretagem', 'Conta digital integrada', 'CDB atrativo'],
    cons: ['Plataforma menos robusta', 'Menos opções de fundos', 'Análise técnica limitada'],
    bestFor: ['acao', 'renda_fixa'],
  },
  {
    id: 'nuinvest',
    name: 'NuInvest (Nubank)',
    emoji: '🟣',
    color: '#7c3aed',
    type: 'banco_digital',
    typeLabel: 'Banco Digital (Nubank)',
    rating: 4.0,
    categories: ['acao', 'renda_fixa'],
    tags: ['Ações', 'FIIs', 'ETF', 'CDB', 'Tesouro', 'Crypto via Nu'],
    fee: { label: 'Corretagem', value: 'Gratuita' },
    highlights: [
      'Integrado ao ecossistema Nubank — maior fintech da América Latina',
      'Criptomoedas disponíveis diretamente no app do Nubank (BTC, ETH, SOL)',
      'Reserva de emergência com liquidez diária automática',
      'Interface extremamente simples, ideal para iniciantes',
    ],
    pros: ['Integração com Nubank', 'Cripto no app', 'Zero corretagem', 'Design clean'],
    cons: ['Seleção limitada de FIIs', 'Sem análise técnica avançada', 'Cripto com taxas altas'],
    bestFor: ['acao', 'renda_fixa', 'crypto'],
  },
  {
    id: 'rico',
    name: 'Rico Investimentos',
    emoji: '🟢',
    color: '#16a34a',
    type: 'corretora',
    typeLabel: 'Corretora (Grupo XP)',
    rating: 3.9,
    categories: ['acao', 'renda_fixa'],
    tags: ['Ações', 'FIIs', 'CDB', 'LCI', 'LCA', 'Tesouro', 'Fundos'],
    fee: { label: 'Corretagem Ações', value: 'Gratuita' },
    highlights: [
      'Foco em educação financeira e investidores iniciantes',
      'Conteúdo educacional Rico para quem está começando',
      'Mesmo cardápio de produtos que a XP (mesmo grupo)',
      'Simuladores e ferramentas de planejamento financeiro',
    ],
    pros: ['Ótimo para iniciantes', 'Conteúdo educacional', 'Zero corretagem', 'Muitos produtos RF'],
    cons: ['Plataforma menos avançada', 'Sem opções complexas', 'Atendimento em horário comercial'],
    bestFor: ['acao', 'renda_fixa'],
  },
  {
    id: 'btg',
    name: 'BTG Pactual Digital',
    emoji: '🔵',
    color: '#1d4ed8',
    type: 'banco',
    typeLabel: 'Banco de Investimentos',
    rating: 4.6,
    categories: ['acao', 'renda_fixa'],
    tags: ['CDB', 'LCI', 'LCA', 'Debêntures', 'Ações', 'FIIs', 'Fundos', 'COE'],
    fee: { label: 'Corretagem Ações', value: 'Gratuita' },
    highlights: [
      'Maior banco de investimentos da América Latina',
      'CDBs e LCIs com taxas entre os melhores do mercado',
      'Acesso a produtos exclusivos: COE, fundos fechados',
      'Plataforma BTG+ com assessoria dedicada para grandes patrimônios',
    ],
    pros: ['Taxas de RF excelentes', 'Produtos exclusivos', 'Alta solidez', 'CDB 100–115% CDI'],
    cons: ['App menos intuitivo', 'Foco em grandes investidores', 'Menos conteúdo educativo'],
    bestFor: ['renda_fixa', 'acao'],
  },
  {
    id: 'toro',
    name: 'Toro Investimentos',
    emoji: '🐂',
    color: '#b45309',
    type: 'corretora',
    typeLabel: 'Corretora Digital',
    rating: 3.8,
    categories: ['acao'],
    tags: ['Ações', 'FIIs', 'ETF', 'BDR', 'Tesouro'],
    fee: { label: 'Corretagem', value: 'Gratuita' },
    highlights: [
      'Plataforma com foco em análise fundamentalista',
      'Copy invest: copie a carteira de investidores experientes',
      'Relatórios e análises de ações em português',
      'Comunidade ativa de investidores na plataforma',
    ],
    pros: ['Copy invest inovador', 'Análises gratuitas', 'Comunidade ativa', 'Zero corretagem'],
    cons: ['Menor liquidez em alguns produtos', 'Sem opções complexas', 'Renda fixa limitada'],
    bestFor: ['acao'],
  },
  {
    id: 'orama',
    name: 'Órama Investimentos',
    emoji: '📈',
    color: '#0891b2',
    type: 'corretora',
    typeLabel: 'Corretora — Foco em Fundos',
    rating: 4.0,
    categories: ['renda_fixa'],
    tags: ['Fundos', 'CDB', 'LCI', 'LCA', 'Tesouro', 'Previdência'],
    fee: { label: 'Fundos', value: 'Sem taxa de entrada' },
    highlights: [
      'Melhor seleção de fundos de investimento do mercado',
      'Acesso a fundos exclusivos de grandes gestoras (Verde, Absolute, SPX)',
      'Previdência privada PGBL/VGBL com fundos diferenciados',
      'Excelente para diversificação via fundos multimercado',
    ],
    pros: ['Maior seleção de fundos', 'Gestoras famosas', 'Previdência robusta', 'Interface clara'],
    cons: ['Sem ações diretas na B3', 'Mínimos elevados em alguns fundos', 'Foco restrito'],
    bestFor: ['renda_fixa'],
  },
  // ── Tesouro Direto ────────────────────────────────────────────────────────
  {
    id: 'tesouro',
    name: 'Tesouro Direto',
    emoji: '🇧🇷',
    color: '#15803d',
    type: 'governo',
    typeLabel: 'Governo Federal — Tesouro Nacional',
    rating: 5.0,
    categories: ['renda_fixa'],
    tags: ['SELIC', 'IPCA+', 'Prefixado', 'Renda Fixa', 'Alta Segurança'],
    fee: { label: 'Taxa de custódia', value: '0,2% a.a. (isenção até R$ 10 mil na SELIC)' },
    highlights: [
      'Investimento mais seguro do Brasil — garantia do Governo Federal',
      'Tesouro SELIC: liquidez diária, ideal para reserva de emergência',
      'Tesouro IPCA+: protege da inflação com rendimento real',
      'Acessível a partir de R$ 30,00 via qualquer corretora habilitada',
    ],
    pros: ['Máxima segurança', 'Liquidez diária (SELIC)', 'Proteção à inflação (IPCA+)', 'Acessível'],
    cons: ['IOF nos primeiros 30 dias', 'IR regressivo até 2 anos', 'Menor rentabilidade que CDB'],
    bestFor: ['renda_fixa'],
  },
  // ── Exchanges de Cripto ───────────────────────────────────────────────────
  {
    id: 'binance',
    name: 'Binance',
    emoji: '🟡',
    color: '#ca8a04',
    type: 'exchange',
    typeLabel: 'Exchange — Maior do Mundo',
    rating: 4.5,
    categories: ['crypto'],
    tags: ['BTC', 'ETH', 'SOL', 'BNB', 'Altcoins', '+350 moedas', 'Staking', 'DeFi'],
    fee: { label: 'Taxa de negociação', value: '0,1% (desconto com BNB)' },
    highlights: [
      'Maior exchange do mundo por volume — mais de US$ 20 bi/dia',
      'Mais de 350 criptomoedas disponíveis para negociação',
      'Staking e earn: gere renda passiva com cripto',
      'P2P para comprar com Pix — sem tarifas intermediárias',
    ],
    pros: ['Maior liquidez', 'Taxa baixa', 'Staking nativo', 'P2P via Pix', 'Mercado futuros'],
    cons: ['Interface complexa para iniciantes', 'Regulação pendente no BR', 'Suporte lento'],
    bestFor: ['crypto'],
  },
  {
    id: 'mercadobitcoin',
    name: 'Mercado Bitcoin',
    emoji: '🪙',
    color: '#d97706',
    type: 'exchange',
    typeLabel: 'Exchange Brasileira (MB)',
    rating: 4.0,
    categories: ['crypto'],
    tags: ['BTC', 'ETH', 'SOL', 'Altcoins', '+200 moedas', 'NFT', 'Token'],
    fee: { label: 'Taxa Maker/Taker', value: '0,3% / 0,7%' },
    highlights: [
      'Maior exchange brasileira, fundada em 2011, regulada no Brasil',
      'Integração fácil com banco brasileiro (Pix, TED)',
      'Ambiente regulado: mais segurança jurídica para investidores BR',
      'Tokenização de ativos: imóveis, precatórios, energia',
    ],
    pros: ['100% regulada no BR', 'Pix instantâneo', 'Mais de 10 anos no mercado', 'Suporte PT-BR'],
    cons: ['Taxa mais alta que Binance', 'Menos moedas', 'Liquidez menor', 'App pode ser lento'],
    bestFor: ['crypto'],
  },
  {
    id: 'foxbit',
    name: 'Foxbit',
    emoji: '🦊',
    color: '#ea580c',
    type: 'exchange',
    typeLabel: 'Exchange Brasileira (Pioneer)',
    rating: 3.7,
    categories: ['crypto'],
    tags: ['BTC', 'ETH', 'Stablecoins', 'DREX', 'P2P'],
    fee: { label: 'Taxa', value: '0,25% – 0,5%' },
    highlights: [
      'Uma das primeiras exchanges do Brasil, desde 2014',
      'Foco em segurança e compliance regulatório',
      'Parceira oficial para projetos DREX (Real Digital)',
      'Boa opção para quem prefere exchange 100% brasileira',
    ],
    pros: ['Pioneira no Brasil', 'Alta segurança', 'Compliance regulatório', 'Projeto DREX'],
    cons: ['Menos moedas', 'Interface menos moderna', 'Taxa mais alta', 'Volume menor'],
    bestFor: ['crypto'],
  },
  // ── Internacional ─────────────────────────────────────────────────────────
  {
    id: 'avenue',
    name: 'Avenue Securities',
    emoji: '🇺🇸',
    color: '#1e3a5f',
    type: 'corretora',
    typeLabel: 'Corretora Internacional (EUA)',
    rating: 4.4,
    categories: ['internacional'],
    tags: ['Ações EUA', 'ETF Global', 'REITs', 'BDR', 'Dólar', 'S&P 500'],
    fee: { label: 'Corretagem', value: 'Gratuita (ações fracionárias)' },
    highlights: [
      'Invista diretamente em ações dos EUA (Apple, Google, Amazon, Tesla)',
      'ETFs globais: S&P 500, Nasdaq, mercados emergentes',
      'REITs americanos — equivalente aos FIIs no mercado dos EUA',
      'Conta em dólar — proteção natural contra desvalorização do real',
    ],
    pros: ['Acesso ao mercado americano', 'Conta em dólar', 'Zero corretagem', 'Diversificação global'],
    cons: ['IRPF na declaração manual', 'Taxa de câmbio', 'Burocracia inicial', 'IR sobre ganhos'],
    bestFor: ['internacional'],
  },
  {
    id: 'nomad',
    name: 'Nomad',
    emoji: '🌎',
    color: '#0f766e',
    type: 'banco_digital',
    typeLabel: 'Conta Global em Dólar',
    rating: 4.2,
    categories: ['internacional'],
    tags: ['Conta EUA', 'ETF Global', 'Ações EUA', 'Dólar', 'Cartão Internacional'],
    fee: { label: 'Câmbio', value: '1,5% (Plano Plus)' },
    highlights: [
      'Conta corrente em dólar nos EUA — cartão Visa internacional',
      'Acesso a ETFs e ações americanas dentro do mesmo app',
      'Câmbio competitivo para envio e recebimento de dólares',
      'Ideal para quem quer diversificar em moeda forte',
    ],
    pros: ['Conta em dólar real', 'Cartão internacional', 'App em português', 'Câmbio competitivo'],
    cons: ['Taxa de câmbio', 'Portfólio menor que Avenue', 'Custo de manutenção'],
    bestFor: ['internacional'],
  },
];

function starsHtml(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  let s = '';
  for (let i = 0; i < 5; i++) {
    if (i < full) s += '★';
    else if (i === full && half) s += '½';
    else s += '☆';
  }
  return `<span class="broker-stars">${s}</span> <span style="font-size:12px;color:var(--text-muted);">${rating.toFixed(1)}</span>`;
}

function renderBrokers(filter = 'all') {
  const container = document.getElementById('broker-cards');
  const list = filter === 'all' ? BROKERS : BROKERS.filter(b => b.categories.includes(filter));
  container.innerHTML = list.map(b => `
    <div class="broker-card">
      <div class="broker-card-header">
        <div class="broker-logo" style="background:${b.color}22;border:1px solid ${b.color}44;">${b.emoji}</div>
        <div style="flex:1;">
          <div class="broker-name">${b.name}</div>
          <div class="broker-type-label">${b.typeLabel}</div>
          <div style="margin-top:4px;">${starsHtml(b.rating)}</div>
        </div>
      </div>
      <div class="broker-tags">
        ${b.tags.map((t, i) => `<span class="broker-tag ${i < 2 ? 'broker-tag-highlight' : ''}">${t}</span>`).join('')}
      </div>
      <div class="broker-fee-row">
        <span>${b.fee.label}</span>
        <strong>${b.fee.value}</strong>
      </div>
      <div class="broker-highlights">
        ${b.highlights.map(h => `<div class="broker-hl-item">${h}</div>`).join('')}
      </div>
      <div class="broker-pros-cons">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--success);margin-bottom:4px;text-transform:uppercase;">Prós</div>
          <ul class="broker-pros">${b.pros.map(p => `<li>${p}</li>`).join('')}</ul>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--danger);margin-bottom:4px;text-transform:uppercase;">Contras</div>
          <ul class="broker-cons">${b.cons.map(c => `<li>${c}</li>`).join('')}</ul>
        </div>
      </div>
    </div>`).join('');
}

// Filter button events
document.getElementById('broker-filter-btns')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.broker-filter-btn');
  if (!btn) return;
  document.querySelectorAll('.broker-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderBrokers(btn.dataset.filter);
});

function invAddTxForAsset(assetId) {
  showInvModal('transaction');
  setTimeout(() => {
    const sel = document.getElementById('inv-tx-asset');
    if (sel) sel.value = assetId;
  }, 50);
}

// ── Init ──────────────────────────────────────────────────────────────────────
init();

const style = document.createElement('style');
style.textContent = `@keyframes slideIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }`;
document.head.appendChild(style);
