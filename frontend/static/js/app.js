// ── API helper ────────────────────────────────────────────────────────────────
async function api(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  return res.json();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const colors = { info: '#6366f1', success: '#22c55e', error: '#ef4444', warning: '#f59e0b' };
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:20px;right:20px;background:${colors[type]};color:#fff;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;animation:slideIn .3s ease;max-width:300px;`;
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

// ── Auth check ────────────────────────────────────────────────────────────────
async function checkAuth() {
  const res = await api('GET', '/api/auth/status');
  if (!res.logged_in) {
    showLogin();
  } else {
    showApp();
    navigate('page-dashboard');
    loadDashboard();
  }
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
}

// ── Login ─────────────────────────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true; btn.textContent = 'Entrando...';
  const username = document.getElementById('ig-user').value;
  const password = document.getElementById('ig-pass').value;
  const code2fa = document.getElementById('ig-2fa').value;

  const res = await api('POST', '/api/auth/login', { username, password, verification_code: code2fa || null });
  btn.disabled = false; btn.textContent = 'Entrar';

  if (res.success) {
    toast('Login realizado!', 'success');
    showApp();
    navigate('page-dashboard');
    loadDashboard();
  } else if (res.requires_2fa) {
    document.getElementById('two-fa-row').classList.remove('hidden');
    toast('Insira o código 2FA', 'warning');
  } else {
    toast(res.message || 'Erro no login', 'error');
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('POST', '/api/auth/logout');
  showLogin();
  toast('Logout realizado', 'info');
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

    // Follow stats
    const fs = await api('GET', '/api/analytics/follow-stats');
    document.getElementById('stat-bot-followed').textContent = fs.total_followed_by_bot || 0;
    document.getElementById('stat-bot-unfollowed').textContent = fs.total_unfollowed_by_bot || 0;

    // Recent posts
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
    toast('Erro ao carregar dashboard. Verifique o login.', 'error');
  }
}

document.getElementById('btn-capture').addEventListener('click', async () => {
  const res = await api('POST', '/api/analytics/capture');
  if (res.captured_at) {
    toast('Snapshot salvo!', 'success');
    loadDashboard();
  }
});

// ── Follow ────────────────────────────────────────────────────────────────────
document.getElementById('btn-follow-start').addEventListener('click', async () => {
  const target = document.getElementById('follow-target').value.trim();
  const source = document.getElementById('follow-source').value;
  if (!target) { toast('Informe o usuário alvo', 'warning'); return; }
  const res = await api('POST', '/api/follow/start', { target_username: target, source });
  toast(res.message, res.success ? 'success' : 'error');
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
  toast(res.message, res.success ? 'success' : 'error');
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
  renderIdeas(ideas, 'generated-ideas', true);
});

function renderIdeas(ideas, containerId, showSave = false) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  ideas.forEach(idea => {
    const div = document.createElement('div');
    div.className = 'idea-card';
    div.innerHTML = `
      <div class="idea-type">${idea.content_type || idea.content_type}</div>
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
    title: idea.title,
    description: idea.description,
    hashtags: idea.hashtags,
    content_type: idea.content_type,
  });
  toast(res.message, res.success ? 'success' : 'error');
}

async function loadSavedIdeas() {
  const ideas = await api('GET', '/api/content/ideas');
  renderIdeas(ideas, 'saved-ideas', false);
}

// ── Teleprompter scripts list ─────────────────────────────────────────────────
async function loadScripts() {
  const scripts = await api('GET', '/api/teleprompter/scripts');
  const list = document.getElementById('script-list');
  list.innerHTML = '';
  scripts.forEach(s => {
    const div = document.createElement('div');
    div.className = 'idea-card flex justify-between items-center';
    div.style.cursor = 'pointer';
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
  toast(res.message, res.success ? 'success' : 'error');
  if (res.success) {
    document.getElementById('script-title').value = '';
    document.getElementById('script-content').value = '';
    loadScripts();
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
async function loadSettings() {
  const s = await api('GET', '/api/settings');
  Object.entries(s).forEach(([k, v]) => {
    const el = document.getElementById(`setting-${k}`);
    if (el) el.value = v;
  });
}

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  const keys = ['follow_delay_min','follow_delay_max','follow_amount','daily_follow_limit','daily_unfollow_limit','unfollow_after_days'];
  for (const key of keys) {
    const el = document.getElementById(`setting-${key}`);
    if (el) await api('POST', '/api/settings', { key, value: el.value });
  }
  toast('Configurações salvas!', 'success');
});

// ── History chart (simple text-based) ────────────────────────────────────────
async function loadHistory() {
  const history = await api('GET', '/api/analytics/history');
  const container = document.getElementById('history-list');
  container.innerHTML = '';
  history.forEach(h => {
    container.innerHTML += `
      <div class="flex justify-between items-center" style="padding:10px;border-bottom:1px solid var(--border);font-size:13px;">
        <span>${new Date(h.captured_at).toLocaleString('pt-BR')}</span>
        <span>👥 ${h.followers_count}</span>
        <span>➡️ ${h.following_count}</span>
        <span>📷 ${h.media_count} posts</span>
      </div>`;
  });
}

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
    if (target === 'tab-history') loadHistory();
  });
});

// ── Page nav ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    navigate(page);
    if (page === 'page-dashboard') loadDashboard();
    if (page === 'page-settings') loadSettings();
    if (page === 'page-teleprompter') loadScripts();
  });
});

// ── Speed label ───────────────────────────────────────────────────────────────
document.getElementById('script-speed')?.addEventListener('input', (e) => {
  document.getElementById('speed-label').textContent = e.target.value;
});
document.getElementById('script-fontsize')?.addEventListener('input', (e) => {
  document.getElementById('fontsize-label').textContent = e.target.value + 'px';
});

// ── Init ──────────────────────────────────────────────────────────────────────
checkAuth();

// CSS animation
const style = document.createElement('style');
style.textContent = `@keyframes slideIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }`;
document.head.appendChild(style);
