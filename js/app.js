/* ── Dgames portal ───────────────────────────────── */
const AUTH_API  = '/api/auth';
const GAMES_API = '/api/games';

const authScreen  = document.getElementById('auth-screen');
const portalScreen= document.getElementById('portal-screen');
const authForm    = document.getElementById('auth-form');
const authBtn     = document.getElementById('auth-btn');
const authError   = document.getElementById('auth-error');
const gameGrid    = document.getElementById('game-grid');

let currentUsername = null;
let statusInterval  = null;

/* ── Avatar ──────────────────────────────────────── */
function avatarStyle(username) {
  let h = 0;
  for (const c of username) h = c.charCodeAt(0) + ((h << 5) - h);
  return { bg: `hsl(${Math.abs(h) % 360},55%,40%)`, letter: username[0].toUpperCase() };
}

function setAvatar(username) {
  const el = document.getElementById('avatar-link');
  if (!el) return;
  const { bg, letter } = avatarStyle(username);
  el.style.cssText = `background:${bg};color:#fff;width:28px;height:28px;border-radius:50%;
    display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;
    text-decoration:none;flex-shrink:0;`;
  el.textContent = letter;
  el.title = username;
}

/* ── Tabs ────────────────────────────────────────── */
let currentTab = 'login';
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    currentTab = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
    authBtn.textContent = currentTab === 'login' ? 'Connexion' : "S'inscrire";
    hideError();
  });
});

/* ── Screens ─────────────────────────────────────── */
async function showPortal(username) {
  currentUsername = username;
  setAvatar(username);
  authScreen.classList.add('hidden');
  portalScreen.classList.remove('hidden');
  fetch(`${GAMES_API}/me`, { credentials: 'include' })
    .then(r => { if (r.ok) document.getElementById('admin-link').classList.remove('hidden'); })
    .catch(() => {});
  await loadGames();
  startStatusPolling();
}

function showAuth() {
  stopStatusPolling();
  portalScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
}

function showError(msg) { authError.textContent = msg; authError.classList.remove('hidden'); }
function hideError()     { authError.classList.add('hidden'); }

/* ── Games ───────────────────────────────────────── */
async function loadGames() {
  gameGrid.innerHTML = '<p class="loading-msg">Chargement…</p>';
  try {
    const res   = await fetch(GAMES_API, { credentials: 'include' });
    const games = await res.json();
    if (!games.length) { gameGrid.innerHTML = '<p class="loading-msg">Aucun jeu disponible.</p>'; return; }
    gameGrid.innerHTML = '';
    for (const g of games) gameGrid.appendChild(buildGameCard(g));
    updateStatus(await fetchStatus());
  } catch {
    gameGrid.innerHTML = '<p class="loading-msg">Impossible de charger les jeux.</p>';
  }
}

function buildGameCard(g) {
  const a = document.createElement('a');
  a.className    = 'card game-card';
  a.dataset.id   = g.id;
  a.dataset.url  = g.url;
  a.target       = '_blank';
  a.rel          = 'noopener';

  if (g.maintenance) {
    a.classList.add('maintenance');
    a.innerHTML = `
      <div class="game-icon">${g.icon}</div>
      <h2>${g.name}</h2>
      <p class="maintenance-msg">🔧 En maintenance</p>`;
  } else {
    a.href = g.url;
    a.innerHTML = `
      <div class="status-dot" data-id="${g.id}"></div>
      <div class="game-icon">${g.icon}</div>
      <h2>${g.name}</h2>
      <p>${g.description}</p>
      <span class="btn">Jouer</span>`;
    a.addEventListener('click', () => trackPlay(g.id));
  }
  return a;
}

async function trackPlay(gameId) {
  fetch(`${GAMES_API}/activity/play`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_id: gameId }),
  }).catch(() => {});
}

/* ── Status polling ──────────────────────────────── */
async function fetchStatus() {
  try {
    const r = await fetch(`${GAMES_API}/status`, { credentials: 'include' });
    return r.ok ? await r.json() : {};
  } catch { return {}; }
}

function updateStatus(statusMap) {
  document.querySelectorAll('.status-dot[data-id]').forEach(dot => {
    const s = statusMap[dot.dataset.id];
    dot.className = 'status-dot ' + (!s ? 'dot-unknown' : s.up ? 'dot-up' : 'dot-down');
    dot.title     = !s ? 'Vérification…' : s.up ? `En ligne (${s.ms}ms)` : 'Hors ligne';
  });
}

function startStatusPolling() {
  statusInterval = setInterval(async () => updateStatus(await fetchStatus()), 30000);
}
function stopStatusPolling() {
  if (statusInterval) { clearInterval(statusInterval); statusInterval = null; }
}

/* ── Auth API ────────────────────────────────────── */
async function apiFetch(path, opts = {}) {
  const res  = await fetch(`${AUTH_API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Erreur serveur');
  return data;
}

async function checkSession() {
  try {
    const data = await apiFetch('/me');
    await showPortal(data.username);
  } catch { showAuth(); }
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();
  authBtn.disabled    = true;
  authBtn.textContent = currentTab === 'login' ? 'Connexion…' : 'Inscription…';
  try {
    const data = await apiFetch(currentTab === 'login' ? '/login' : '/register', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value,
      }),
    });
    await showPortal(data.username);
  } catch (err) {
    showError(err.message);
  } finally {
    authBtn.disabled    = false;
    authBtn.textContent = currentTab === 'login' ? 'Connexion' : "S'inscrire";
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  try { await apiFetch('/logout', { method: 'POST' }); } catch { /* best-effort */ }
  showAuth();
});

checkSession();
