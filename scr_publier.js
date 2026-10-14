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

const mdpEnregistre = () => localStorage.getItem('mdpAdmin');

async function verifierMdp(mdp) {
  const r = await fetch(SERVER + '/dev/admin-check', {
    method: 'POST',
    headers: { 'x-admin-password': mdp }
  });
  return r.status;
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

// Quitte le mode admin sur cet appareil
function deconnecterAdmin() {
  localStorage.removeItem('mdpAdmin');
  viderAdmin();
  document.getElementById('zoneAdmin').style.display = 'none';
}

async function ouvrirAdmin() {
  const zone = document.getElementById('zoneAdmin');
  if (zone.style.display !== 'none') {                    // déjà admin : le logo permet de sortir
    if (confirm('الخروج من وضع المشرف ؟')) deconnecterAdmin();
    return;
  }
  try {
    let mdp = mdpEnregistre();
    let statut = mdp ? await verifierMdp(mdp) : 401;

    if (statut === 401) {
      localStorage.removeItem('mdpAdmin');
      mdp = prompt('كلمة سر المشرف');
      if (!mdp) return;
      statut = await verifierMdp(mdp);
      if (statut === 401) { alert('كلمة السر غير صحيحة'); return; }
    }
    if (statut === 429) { alert('محاولات كثيرة، أعد المحاولة لاحقا'); return; }
    if (statut !== 200) { alert('تعذر الاتصال بالخادم'); return; }

    localStorage.setItem('mdpAdmin', mdp);
    montrerAdmin();
    document.getElementById('champAdmin').focus();
  } catch (e) { alert('تعذر الاتصال بالخادم'); }
}

// Au lancement : si cet appareil est déjà admin, la barre apparaît tout de suite
async function initAdmin() {
  const mdp = mdpEnregistre();
  if (!mdp) return;
  montrerAdmin();
  try { if (await verifierMdp(mdp) === 401) deconnecterAdmin(); } catch (e) { /* hors ligne : on garde */ }
}

async function envoyerAdmin() {
  const texte = document.getElementById('champAdmin').value.trim();
  if (!texte && !pjFichier) return;
  const mdp = mdpEnregistre();
  if (!mdp) { deconnecterAdmin(); return; }

  const btn = document.getElementById('btnEnvoiAdmin');
  btn.disabled = true;
  try {
    if (pjFichier) {
      const fd = new FormData();
      fd.append('file', pjFichier);
      const r = await fetch(SERVER + '/dev/file', {
        method: 'POST', headers: { 'x-admin-password': mdp }, body: fd
      });
      if (r.status === 401) { deconnecterAdmin(); alert('كلمة السر لم تعد صالحة'); return; }
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'file');
      retirerPJ();
    }
    if (texte) {
      const r = await fetch(SERVER + '/dev/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': mdp },
        body: JSON.stringify({ text: texte })
      });
      if (r.status === 401) { deconnecterAdmin(); alert('كلمة السر لم تعد صالحة'); return; }
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

initAdmin();