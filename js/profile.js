/* ── Dgames profile ──────────────────────────────── */
const AUTH_API  = '/api/auth';
const GAMES_API = '/api/games';

function avatarStyle(username) {
  let h = 0;
  for (const c of username) h = c.charCodeAt(0) + ((h << 5) - h);
  return { bg: `hsl(${Math.abs(h) % 360},55%,40%)`, letter: username[0].toUpperCase() };
}

async function init() {
  try {
    const res  = await fetch(`${AUTH_API}/me`, { credentials: 'include' });
    if (!res.ok) { window.location.href = '/'; return; }
    const data = await res.json();
    const { bg, letter } = avatarStyle(data.username);

    document.getElementById('avatar-big').style.background = bg;
    document.getElementById('avatar-big').textContent      = letter;
    document.getElementById('profile-username').textContent = data.username;

    document.getElementById('app').classList.remove('hidden');
  } catch { window.location.href = '/'; }
}

const pwdForm    = document.getElementById('pwd-form');
const pwdBtn     = document.getElementById('pwd-btn');
const pwdError   = document.getElementById('pwd-error');
const pwdSuccess = document.getElementById('pwd-success');

pwdForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  pwdError.classList.add('hidden');
  pwdSuccess.classList.add('hidden');

  const current = document.getElementById('current-pwd').value;
  const newPwd  = document.getElementById('new-pwd').value;
  const confirm = document.getElementById('confirm-pwd').value;

  if (newPwd !== confirm) {
    pwdError.textContent = 'Les mots de passe ne correspondent pas';
    pwdError.classList.remove('hidden');
    return;
  }

  pwdBtn.disabled    = true;
  pwdBtn.textContent = 'Mise à jour…';

  try {
    const res = await fetch(`${GAMES_API}/users/me/password`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: current, new_password: newPwd }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || 'Erreur serveur');
    pwdSuccess.textContent = 'Mot de passe mis à jour.';
    pwdSuccess.classList.remove('hidden');
    pwdForm.reset();
  } catch (err) {
    pwdError.textContent = err.message;
    pwdError.classList.remove('hidden');
  } finally {
    pwdBtn.disabled    = false;
    pwdBtn.textContent = 'Mettre à jour';
  }
});

init();
