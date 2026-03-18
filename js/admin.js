/* ── Dgames admin — admin.js ─────────────────────── */
const API = '/api/games';

const adminScreen   = document.getElementById('admin-screen');
const forbidden     = document.getElementById('forbidden');
const panelGrid     = document.getElementById('panel-grid');
const addCard       = document.getElementById('add-card');
const modalOverlay  = document.getElementById('modal-overlay');
const gameForm      = document.getElementById('game-form');
const formError     = document.getElementById('form-error');
const modalTitle    = document.getElementById('modal-title');
const saveIndicator = document.getElementById('save-indicator');

let games    = [];
let allUsers = [];

/* ── Init ────────────────────────────────────────── */
async function init() {
  try {
    const res = await fetch(`${API}/me`, { credentials: 'include' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    document.getElementById('welcome').textContent = `@${data.username}`;
    adminScreen.classList.remove('hidden');
    const [,users] = await Promise.all([loadGames(), fetchUsers()]);
    allUsers = users;
  } catch { forbidden.classList.remove('hidden'); }
}

async function fetchUsers() {
  try {
    const r = await fetch(`${API}/users`, { credentials: 'include' });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

/* ── Tabs ────────────────────────────────────────── */
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(`panel-${tab.dataset.panel}`).classList.remove('hidden');
    if (tab.dataset.panel === 'users')    loadUsersPanel();
    if (tab.dataset.panel === 'activity') loadActivityPanel();
  });
});

/* ── Load games ──────────────────────────────────── */
async function loadGames() {
  const res = await fetch(`${API}/all`, { credentials: 'include' });
  games = await res.json();
  renderPanel();
}

/* ── Render cards ────────────────────────────────── */
function renderPanel() {
  panelGrid.querySelectorAll('.game-panel-card').forEach(el => el.remove());
  for (const g of games) panelGrid.insertBefore(buildCard(g), addCard);
}

function buildCard(g) {
  const isAll = g.allowed === 'all';
  const card  = document.createElement('div');
  card.className   = 'panel-card game-panel-card';
  card.dataset.id  = g.id;
  card.draggable   = true;
  card.innerHTML   = `
    <div class="pc-header">
      <span class="pc-icon">${g.icon}</span>
      <div style="overflow:hidden">
        <div class="pc-title">${g.name}</div>
        <div class="pc-url">${g.url}</div>
      </div>
      <span class="drag-handle" title="Glisser pour réordonner">⠿</span>
    </div>
    <div class="pc-divider"></div>

    <div class="pc-row">
      <span class="pc-label">Visible</span>
      <label class="toggle"><input type="checkbox" class="vis-toggle" ${g.visible ? 'checked' : ''} /><span class="toggle-slider"></span></label>
    </div>
    <div class="pc-row">
      <span class="pc-label">Maintenance</span>
      <label class="toggle"><input type="checkbox" class="maint-toggle" ${g.maintenance ? 'checked' : ''} /><span class="toggle-slider toggle-yellow"></span></label>
    </div>

    <div class="pc-row" style="flex-direction:column;align-items:flex-start;gap:.5rem">
      <span class="pc-label">Accès</span>
      <div class="access-wrap" style="width:100%">
        <select class="access-select">
          <option value="all"   ${isAll  ? 'selected':''}>Tous les utilisateurs</option>
          <option value="users" ${!isAll ? 'selected':''}>Utilisateurs spécifiques</option>
        </select>
        <div class="tag-input-container ${isAll ? 'hidden':''}"></div>
      </div>
    </div>
    <div class="pc-divider"></div>
    <div class="pc-actions">
      <button class="btn-edit">Modifier</button>
      <button class="btn-danger">Supprimer</button>
    </div>`;

  // Toggles
  const visTog   = card.querySelector('.vis-toggle');
  const maintTog = card.querySelector('.maint-toggle');
  visTog.addEventListener('change',   () => patchGame(g.id, { visible: visTog.checked }));
  maintTog.addEventListener('change', () => patchGame(g.id, { maintenance: maintTog.checked }));

  // Accès
  const accessSel  = card.querySelector('.access-select');
  const tagWrap    = card.querySelector('.tag-input-container');
  const currentUsers = isAll ? [] : [].concat(g.allowed);
  tagWrap.appendChild(createTagInput(currentUsers, (users) =>
    patchGame(g.id, { allowed: users.length ? users : 'all' })
  ));
  accessSel.addEventListener('change', async () => {
    const all = accessSel.value === 'all';
    tagWrap.classList.toggle('hidden', all);
    if (all) await patchGame(g.id, { allowed: 'all' });
  });

  // Actions
  card.querySelector('.btn-edit').addEventListener('click', () => openEdit(g.id));
  card.querySelector('.btn-danger').addEventListener('click', () => deleteGame(g.id));

  // Drag & drop
  card.addEventListener('dragstart', onDragStart);
  card.addEventListener('dragend',   onDragEnd);
  card.addEventListener('dragover',  onDragOver);
  card.addEventListener('drop',      onDrop);

  return card;
}

/* ── Drag & drop ─────────────────────────────────── */
let dragSrc = null;

function onDragStart(e) {
  dragSrc = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.id);
}

function onDragEnd() {
  this.classList.remove('dragging');
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  saveOrder();
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  if (this !== dragSrc) this.classList.add('drag-over');
}

function onDrop(e) {
  e.preventDefault();
  if (this === dragSrc || this === addCard) return;
  // Swap dans le DOM
  const allCards = [...panelGrid.querySelectorAll('.game-panel-card')];
  const srcIdx   = allCards.indexOf(dragSrc);
  const tgtIdx   = allCards.indexOf(this);
  if (srcIdx < tgtIdx) panelGrid.insertBefore(dragSrc, this.nextSibling);
  else                  panelGrid.insertBefore(dragSrc, this);
  this.classList.remove('drag-over');
}

async function saveOrder() {
  const ids = [...panelGrid.querySelectorAll('.game-panel-card')].map(c => c.dataset.id);
  setSaveState('saving', 'Enregistrement…');
  try {
    const res = await fetch(`${API}/order`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids),
    });
    if (!res.ok) throw new Error();
    // Sync games array
    const map = Object.fromEntries(games.map(g => [g.id, g]));
    games = ids.map(id => map[id]).filter(Boolean);
    setSaveState('saved', 'Ordre sauvegardé ✓');
    setTimeout(() => setSaveState('', ''), 2000);
  } catch { setSaveState('error', 'Erreur sauvegarde'); }
}

/* ── Patch ───────────────────────────────────────── */
async function patchGame(id, partial) {
  const game = games.find(g => g.id === id);
  if (!game) return;
  const updated = { ...game, ...partial };
  setSaveState('saving', 'Enregistrement…');
  try {
    const res = await fetch(`${API}/${id}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (!res.ok) throw new Error();
    Object.assign(game, updated);
    setSaveState('saved', 'Enregistré ✓');
    setTimeout(() => setSaveState('', ''), 2000);
  } catch { setSaveState('error', 'Erreur'); setTimeout(() => setSaveState('', ''), 3000); }
}

function setSaveState(cls, txt) {
  saveIndicator.className   = cls;
  saveIndicator.textContent = txt;
}

/* ── Tag input ───────────────────────────────────── */
function createTagInput(initial, onChange) {
  const wrap      = document.createElement('div');
  wrap.className  = 'tag-input-wrap';
  const textInput = document.createElement('input');
  textInput.type        = 'text';
  textInput.className   = 'tag-text-input';
  textInput.placeholder = 'Ajouter un user…';
  const dropdown = document.createElement('div');
  dropdown.className = 'tag-dropdown hidden';
  wrap.append(textInput, dropdown);

  let tags = [...initial], activeIdx = -1;

  const renderTags = () => {
    wrap.querySelectorAll('.tag').forEach(t => t.remove());
    tags.forEach((u, i) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.innerHTML = `${u}<button class="tag-remove">×</button>`;
      tag.querySelector('.tag-remove').addEventListener('click', () => {
        tags.splice(i, 1); renderTags(); onChange(tags);
      });
      wrap.insertBefore(tag, textInput);
    });
  };

  const showDropdown = q => {
    const filtered = allUsers.filter(u => u.toLowerCase().includes(q.toLowerCase()) && !tags.includes(u));
    dropdown.innerHTML = ''; activeIdx = -1;
    if (!filtered.length || !q) { dropdown.classList.add('hidden'); return; }
    filtered.slice(0, 8).forEach(u => {
      const opt = document.createElement('div');
      opt.className   = 'tag-option';
      opt.textContent = u;
      opt.addEventListener('mousedown', e => { e.preventDefault(); addTag(u); });
      dropdown.appendChild(opt);
    });
    dropdown.classList.remove('hidden');
  };

  const addTag = u => {
    const val = u.trim();
    if (val && !tags.includes(val)) { tags.push(val); renderTags(); onChange(tags); }
    textInput.value = ''; dropdown.classList.add('hidden'); textInput.focus();
  };

  textInput.addEventListener('input',  () => showDropdown(textInput.value));
  textInput.addEventListener('blur',   () => setTimeout(() => dropdown.classList.add('hidden'), 150));
  textInput.addEventListener('focus',  () => { if (textInput.value) showDropdown(textInput.value); });
  textInput.addEventListener('keydown', e => {
    const opts = [...dropdown.querySelectorAll('.tag-option')];
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx+1, opts.length-1); opts.forEach((o,i) => o.classList.toggle('active', i===activeIdx)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx-1, 0); opts.forEach((o,i) => o.classList.toggle('active', i===activeIdx)); }
    else if (e.key === 'Enter') { e.preventDefault(); activeIdx >= 0 && opts[activeIdx] ? addTag(opts[activeIdx].textContent) : textInput.value.trim() && addTag(textInput.value); }
    else if (e.key === 'Backspace' && !textInput.value && tags.length) { tags.pop(); renderTags(); onChange(tags); }
  });
  wrap.addEventListener('click', () => textInput.focus());
  renderTags();
  return wrap;
}

/* ── Modal ───────────────────────────────────────── */
function openAdd() {
  modalTitle.textContent = 'Ajouter un jeu';
  gameForm.reset();
  document.getElementById('f-original-id').value = '';
  document.getElementById('f-id').disabled = false;
  updatePreview();
  formError.classList.add('hidden');
  modalOverlay.classList.remove('hidden');
}

function openEdit(id) {
  const g = games.find(x => x.id === id);
  if (!g) return;
  modalTitle.textContent = 'Modifier';
  document.getElementById('f-original-id').value = g.id;
  document.getElementById('f-id').value           = g.id;
  document.getElementById('f-id').disabled        = true;
  document.getElementById('f-icon').value         = g.icon;
  document.getElementById('f-name').value         = g.name;
  document.getElementById('f-desc').value         = g.description;
  document.getElementById('f-url').value          = g.url;
  updatePreview();
  formError.classList.add('hidden');
  modalOverlay.classList.remove('hidden');
}

function closeModal() { modalOverlay.classList.add('hidden'); }
document.getElementById('cancel-btn').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

// Live preview
function updatePreview() {
  document.getElementById('preview-icon').textContent = document.getElementById('f-icon').value || '🎮';
  document.getElementById('preview-name').textContent = document.getElementById('f-name').value || 'Nom du jeu';
  document.getElementById('preview-desc').textContent = document.getElementById('f-desc').value || 'Description…';
}
['f-icon','f-name','f-desc'].forEach(id =>
  document.getElementById(id).addEventListener('input', updatePreview)
);

gameForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.classList.add('hidden');
  const originalId = document.getElementById('f-original-id').value;
  const id         = originalId || document.getElementById('f-id').value.trim();
  const existing   = games.find(g => g.id === originalId);
  const payload    = {
    id, name: document.getElementById('f-name').value.trim(),
    icon: document.getElementById('f-icon').value.trim(),
    description: document.getElementById('f-desc').value.trim(),
    url: document.getElementById('f-url').value.trim(),
    visible: existing?.visible ?? true,
    maintenance: existing?.maintenance ?? false,
    allowed: existing?.allowed ?? 'all',
  };
  const method = originalId ? 'PUT' : 'POST';
  const url    = originalId ? `${API}/${originalId}` : `${API}/`;
  try {
    const res = await fetch(url, { method, credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.detail || 'Erreur serveur'); }
    closeModal(); await loadGames();
  } catch (err) { formError.textContent = err.message; formError.classList.remove('hidden'); }
});

/* ── Delete ──────────────────────────────────────── */
async function deleteGame(id) {
  const g = games.find(x => x.id === id);
  if (!confirm(`Supprimer "${g?.name}" ?`)) return;
  await fetch(`${API}/${id}`, { method: 'DELETE', credentials: 'include' });
  await loadGames();
}

/* ── Users panel ─────────────────────────────────── */
async function loadUsersPanel() {
  const tbody = document.getElementById('users-body');
  tbody.innerHTML = '<tr><td colspan="5" style="color:var(--muted);padding:1rem">Chargement…</td></tr>';
  try {
    const res   = await fetch(`${API}/users/details`, { credentials: 'include' });
    const users = await res.json();
    tbody.innerHTML = '';
    for (const u of users) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${u.username}</strong></td>
        <td>${u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '—'}</td>
        <td>${u.last_seen  ? new Date(u.last_seen).toLocaleString('fr-FR')       : '—'}</td>
        <td>${u.banned ? '<span class="pill pill-red">Banni</span>' : '<span class="pill pill-green">Actif</span>'}</td>
        <td>
          ${u.banned
            ? `<button class="btn-sm btn-sm-sm" onclick="unbanUser('${u.username}')">Débannir</button>`
            : `<button class="btn-danger-sm" onclick="banUser('${u.username}')">Bannir</button>`}
        </td>`;
      tbody.appendChild(tr);
    }
  } catch { tbody.innerHTML = '<tr><td colspan="5" style="color:var(--error)">Erreur de chargement</td></tr>'; }
}

async function banUser(username) {
  if (!confirm(`Bannir ${username} ?`)) return;
  await fetch(`${API}/users/${username}/ban`, { method: 'POST', credentials: 'include' });
  loadUsersPanel();
}
async function unbanUser(username) {
  await fetch(`${API}/users/${username}/unban`, { method: 'POST', credentials: 'include' });
  loadUsersPanel();
}

/* ── Activity panel ──────────────────────────────── */
async function loadActivityPanel() {
  const tbody = document.getElementById('activity-body');
  tbody.innerHTML = '<tr><td colspan="4" style="color:var(--muted);padding:1rem">Chargement…</td></tr>';
  try {
    const res      = await fetch(`${API}/activity`, { credentials: 'include' });
    const activity = await res.json();
    tbody.innerHTML = '';
    if (!activity.length) { tbody.innerHTML = '<tr><td colspan="4" style="color:var(--muted)">Aucune activité</td></tr>'; return; }
    for (const e of activity) {
      const tr  = document.createElement('tr');
      const dt  = new Date(e.ts).toLocaleString('fr-FR');
      const evt = e.type === 'play' ? '<span class="pill pill-blue">Jouer</span>' : `<span class="pill">${e.type}</span>`;
      tr.innerHTML = `<td>${dt}</td><td>${e.username}</td><td>${evt}</td><td>${e.game_id || '—'}</td>`;
      tbody.appendChild(tr);
    }
  } catch { tbody.innerHTML = '<tr><td colspan="4" style="color:var(--error)">Erreur de chargement</td></tr>'; }
}

init();
