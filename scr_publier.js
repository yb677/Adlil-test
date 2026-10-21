let pjFichier = null;

const EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😎','🤔','😢','😭','😡','🙄','😴','🤗','😉',
  '👍','👎','👏','🙏','💪','🤝','👌','✌️','❤️','💔','🔥','⭐','🎉','🎁','✅','❌',
  '⚠️','📢','📌','📍','🚌','🚗','🕒','📅','📞','💬','📎','🌙','☀️','🌧️','🕌','🤲'];

function construireEmojis() {
  const p = document.getElementById('panneauEmoji');
  if (p.children.length) return;
  EMOJIS.forEach(e => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = e;
    b.style.cssText = 'border:none;background:none;font-size:24px;cursor:pointer;padding:4px;';
    b.onclick = () => insererEmoji(e);
    p.append(b);
  });
}

function basculerEmojis() {
  construireEmojis();
  const p = document.getElementById('panneauEmoji');
  p.style.display = p.style.display === 'grid' ? 'none' : 'grid';
}

function insererEmoji(e) {
  const c = document.getElementById('champAdmin');
  c.setRangeText(e, c.selectionStart, c.selectionEnd, 'end');   // à l'endroit du curseur
  ajusterChamp();
  c.focus();
}

// Le champ grandit avec le texte, puis défile au-delà de 130 px
function ajusterChamp() {
  const MAX = 260;
  const feed = document.getElementById('feed-container');
  const enBas = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;

  const c = document.getElementById('champAdmin');
  c.style.height = 'auto';
  c.style.height = Math.min(c.scrollHeight, MAX) + 'px';
  c.style.overflowY = c.scrollHeight > MAX ? 'auto' : 'hidden';

  if (enBas) feed.scrollTop = feed.scrollHeight;
}

function choisirPJ(input) {
  const f = input.files[0];
  input.value = '';
  if (!f) return;
  if (!/\.(jpe?g|png|gif|pdf)$/i.test(f.name)) { alert('صور أو PDF فقط'); return; }
  pjFichier = f;
  document.getElementById('pjNom').textContent = '📎 ' + f.name;
  document.getElementById('pjBarre').style.display = 'flex';
}

function retirerPJ() {
  pjFichier = null;
  document.getElementById('pjBarre').style.display = 'none';
}

function montrerAdmin() {
  document.getElementById('zoneAdmin').style.display = 'block';
  ajusterChamp();
  const feed = document.getElementById('feed-container');
  feed.scrollTop = feed.scrollHeight;
}

// Vide la barre mais la laisse affichée
function viderAdmin() {
  retirerPJ();
  const c = document.getElementById('champAdmin');
  c.value = '';
  document.getElementById('panneauEmoji').style.display = 'none';
  ajusterChamp();
}

const idHeaders = () => {
  const id = localStorage.getItem('monId');
  return id ? { 'x-user-id': id } : {};
};

let monRole = 'utilisateur';
const estAdmin = () => monRole === 'admin' || monRole === 'superadmin';

// Affiche ou masque la barre de saisie selon le rôle (sans toucher à une saisie en cours)
function appliquerRole(role) {
  monRole = role || 'utilisateur';
  localStorage.setItem('monRole', monRole);
  const zone = document.getElementById('zoneAdmin');
  if (!zone) return;
  const visible = zone.style.display !== 'none';
  if (estAdmin() && !visible) montrerAdmin();
  else if (!estAdmin() && visible) { viderAdmin(); zone.style.display = 'none'; }
}

async function envoyerAdmin() {
  const texte = document.getElementById('champAdmin').value.trim();
  if (!texte && !pjFichier) return;

  const btn = document.getElementById('btnEnvoiAdmin');
  btn.disabled = true;
  try {
    if (pjFichier) {
      const fd = new FormData();
      fd.append('file', pjFichier);
      const r = await fetch(SERVER + '/dev/file', { method: 'POST', headers: idHeaders(), body: fd });
      if (r.status === 403) { appliquerRole('utilisateur'); alert('ليست لديك صلاحية النشر'); return; }
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'file');
      retirerPJ();
    }
    if (texte) {
      const r = await fetch(SERVER + '/dev/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...idHeaders() },
        body: JSON.stringify({ text: texte })
      });
      if (r.status === 403) { appliquerRole('utilisateur'); alert('ليست لديك صلاحية النشر'); return; }
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'text');
    }
    viderAdmin();
    if (typeof loadDevFeed === 'function') loadDevFeed();
  } catch (e) {
    alert('فشل الإرسال: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

localStorage.removeItem('mdpAdmin');                      // l'ancien mot de passe n'est plus utilisé
appliquerRole(localStorage.getItem('monRole'));            // dernier rôle connu, même hors ligne