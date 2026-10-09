/*function showLocation(lat, lon) {
    document.getElementById("googleMap").src =
        "https://www.google.com/maps?q=" +
        lat + "," + lon + "&z=14&output=embed";
}*/

const marqueurs = {}; // id -> marqueur affiché
let carte = null;

function afficherVueLocalisation() {
    // ... ton code actuel qui affiche #view-localisation ...
    if (!carte) {
        initCarte();
    } else {
        carte.invalidateSize();
    }
}

const SERVEUR = `${DEV_SERVER}`;

//const SERVEUR = `http://${window.location.hostname}:3001`;
//const SERVEUR = "http://localhost:3001";
const PALETTE = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00acc1'];

function icone(couleur, perime) {
  return L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:50%;
      background:${perime ? '#9e9e9e' : couleur};
      opacity:${perime ? 0.7 : 1};"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function texteAge(s) {
    if (s < 60) return `il y a ${s} s`;
    if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
    return `il y a ${Math.round(s / 3600)} h`;
}

function afficherMoi(nom, code, tel) {
  document.getElementById('nomMoi').textContent = nom;
  document.getElementById('telMoi').textContent = tel ? '+' + tel : '';
  document.getElementById('codeMoi').textContent = code;
  document.getElementById('zoneInscription').style.display = 'none';
  document.getElementById('zoneNom').style.display = 'block';
  document.getElementById('casePartage').disabled = false;
  document.getElementById('zoneSuivi').style.display = 'block';
  if (!timerSuivi) { actualiserSuivi(); timerSuivi = setInterval(actualiserSuivi, 10000); }
}

async function initCarte() {
  carte = L.map('googleMap').setView([34.0, 3.0], 5);
  setTimeout(() => carte.invalidateSize(), 200);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(carte);

  chargerMoi();
}

function creerMarqueur(lieu) {
  marqueurs[lieu.id] = L.marker([lieu.lat, lieu.lon], { icon: icone(lieu.couleur, lieu.perime) })
    .addTo(carte)
    .bindTooltip(lieu.nom, { permanent: true, direction: 'top', offset: [0, -12] });
}

function enleverMarqueur(lieu) {
  if (marqueurs[lieu.id]) {
    carte.removeLayer(marqueurs[lieu.id]);
    delete marqueurs[lieu.id];
  }
}

async function demanderSuivi() {
  const champ = document.getElementById('champCode');
  const code = champ.value.trim();
  if (!/^\d{6}$/.test(code)) { alert('أدخل رمزا من 6 أرقام'); return; }
  try {
    const d = await api('/dev/suivre', { code });
    if (!d.success) { alert(d.error); return; }
    champ.value = '';
    actualiserSuivi();
  } catch (e) { alert('تعذر الاتصال بالخادم'); }
}

async function repondre(demande_id, accepter) {
  await api('/dev/repondre', { demande_id, accepter });
  actualiserSuivi();
}

async function retirer(demande_id) {
  await api('/dev/retirer', { demande_id });
  actualiserSuivi();
}

async function basculerAccepterTous(actif) {
  await api('/dev/accepter-tous', { actif });
  actualiserSuivi();
}

const lignes = {};   // id du suivi -> ligne affichée (elle persiste entre deux mises à jour)

const ICONE_CORBEILLE =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
  '<path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

function boutonIcone(svg, titre, fn) {
  const b = document.createElement('button');
  b.type = 'button';
  b.innerHTML = svg;            // SVG fixe défini ci-dessus, aucune donnée du serveur
  b.title = titre;
  b.setAttribute('aria-label', titre);
  b.onclick = fn;
    b.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;' +
    'padding:6px;border:none;background:none;color:#c62828;cursor:pointer;';
  return b;
}

async function chargerMoi() {
    const id = localStorage.getItem('monId');
    if (!id) { reprendreVerif(); return; }
    try {
        const r = await fetch(SERVEUR + "/dev/moi", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const d = await r.json();
        if (d.success) {
            afficherMoi(d.nom, d.code, d.tel);
            document.getElementById('caseTous').checked = !!d.accepte_tous;
        }
        else if (r.status === 404) localStorage.removeItem('monId');
    } catch (e) { console.error(e); }
}

const NUMERO_WA = "213XXXXXXXXX";   // ← numéro WhatsApp du serveur, sans le « + »
let timerVerif = null;

const RAISONS = {
  numero_deja_inscrit: 'هذا الرقم مسجل من قبل، استعمل الاسترجاع',
  numero_inconnu: 'هذا الرقم غير مسجل، قم بالتسجيل أولا'
};

function afficherVerif(code) {
  document.getElementById('codeVerif').textContent = code;
  document.getElementById('numWa').textContent = '+' + NUMERO_WA;
  document.getElementById('lienWa').href =
    'https://wa.me/' + NUMERO_WA + '?text=' + encodeURIComponent(code);
  document.getElementById('etatVerif').textContent = 'في انتظار الرسالة...';
  document.getElementById('zoneVerif').style.display = 'block';
  clearInterval(timerVerif);
  timerVerif = setInterval(verifierStatut, 3000);
}

async function demarrerVerif(chemin, corps) {
  try {
    const r = await fetch(SERVEUR + chemin, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps)
    });
    const d = await r.json();
    if (!d.success) { alert(d.error); return; }
    localStorage.setItem('attente', JSON.stringify({ id: d.id, code: d.code_verif }));
    afficherVerif(d.code_verif);
  } catch (e) { alert('تعذر الاتصال بالخادم'); }
}

function sInscrire() {
  const nom = document.getElementById('champNom').value.trim();
  if (!nom) { alert('أدخل الاسم'); return; }
  demarrerVerif('/dev/demande-inscription', { nom });
}

function recuperer() {
  demarrerVerif('/dev/demande-recup', {});
}

async function verifierStatut() {
  const a = JSON.parse(localStorage.getItem('attente') || 'null');
  if (!a) { clearInterval(timerVerif); return; }
  try {
    const r = await fetch(SERVEUR + '/dev/statut-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id })
    });
    const d = await r.json();
    if (!d.success) return;

    if (d.statut === 'valide') {
      clearInterval(timerVerif);
      localStorage.setItem('monId', a.id);
      localStorage.removeItem('attente');
      document.getElementById('zoneVerif').style.display = 'none';
      chargerMoi();
    } else if (d.statut === 'attente') {
      return;
    } else {
      clearInterval(timerVerif);
      localStorage.removeItem('attente');
      document.getElementById('etatVerif').textContent =
        d.statut === 'refuse' ? (RAISONS[d.raison] || 'تم الرفض') : 'انتهت صلاحية الرمز';
    }
  } catch (e) { console.error(e); }
}

function annulerVerif() {
  clearInterval(timerVerif);
  localStorage.removeItem('attente');
  document.getElementById('zoneVerif').style.display = 'none';
}

function reprendreVerif() {       // si la page est rechargée pendant l'attente
  const a = JSON.parse(localStorage.getItem('attente') || 'null');
  if (!a) return;
  afficherVerif(a.code);
  verifierStatut();
}

function ajusterVue() {
    const liste = Object.values(marqueurs);
    if (liste.length === 0) return;
    if (liste.length === 1) {
        carte.setView(liste[0].getLatLng(), 12);
        return;
    }
    carte.fitBounds(L.featureGroup(liste).getBounds().pad(0.2));
}

//document.addEventListener('DOMContentLoaded', initCarte);

function majPastille(l) {
  l.pastille.style.background = l.case.checked ? l.couleur : '#bdbdbd';
/*
  l.pastille.style.boxShadow = l.case.checked
    ? '0 0 3px rgba(0,0,0,.5)'
    : 'none';
*/
}

function creerLigne(s) {
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px;' +
                      'border:1px solid #ccc;border-radius:8px;margin-top:6px;';

  const l = { id: s.id, couleur: PALETTE[s.id % PALETTE.length], div,
              lat: null, lon: null, perime: false, accepte: false };

  l.case = { checked: true };   // état affiché / masqué, piloté par le rond

  l.pastille = document.createElement('span');
  l.pastille.setAttribute('role', 'button');
  l.pastille.style.cssText =
    'width:28px;height:28px;border-radius:50%;flex:none;cursor:pointer;' +
    'transition:background .2s;';
  majPastille(l);

  const bloc = document.createElement('span');
  bloc.style.cssText = 'flex:1;display:flex;align-items:baseline;gap:8px;min-width:0;';

  l.elNom = document.createElement('span');
  l.elNom.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

  l.elStatut = document.createElement('small');
  l.elStatut.style.cssText = 'white-space:nowrap;flex:none;';

  bloc.append(l.elNom, l.elStatut);

  const corbeille = boutonIcone(ICONE_CORBEILLE, 'إزالة', () => retirer(s.id));

  div.append(l.pastille, bloc, corbeille);
  document.getElementById('listeSuivis').append(div);

  l.pastille.addEventListener('click', () => {
    l.case.checked = !l.case.checked;
    majPastille(l);
    if (l.case.checked) {
      if (l.lat !== null) creerMarqueur(l);
    } else {
      enleverMarqueur(l);
    }
    ajusterVue();
  });

  lignes[s.id] = l;
  return l;
}

function supprimerLigne(l) {
  enleverMarqueur(l);
  l.div.remove();
  delete lignes[l.id];
}

function majSuivis(suivis, positions) {
  const ids = new Set(suivis.map(s => s.id));
  Object.values(lignes).filter(l => !ids.has(l.id)).forEach(supprimerLigne);

  let recadrer = false;

  suivis.forEach(s => {
    const l = lignes[s.id] || creerLigne(s);

    // Demande en attente ou refusée : pas de rond
    if (s.statut !== 'accepte') {
      enleverMarqueur(l);
      l.accepte = false;
      l.pastille.style.visibility = 'hidden';
      l.elNom.textContent = s.statut === 'refuse' ? 'مرفوض' : 'في الانتظار';
      l.elStatut.textContent = s.code;
      l.elStatut.style.color = '#757575';
      return;
    }

    l.pastille.style.visibility = 'visible';
    l.nom = s.nom;
    l.elNom.textContent = s.nom;
    if (!l.accepte) { l.accepte = true; recadrer = true; }

    const p = positions.find(x => x.id === s.id);
    if (!p || p.lat === null) {
      l.lat = null; l.lon = null;
      enleverMarqueur(l);
      l.elStatut.textContent = 'لا يشارك موقعه';
      l.elStatut.style.color = '#757575';
      return;
    }

    l.lat = p.lat;
    l.lon = p.lon;
    l.perime = p.perime;
    l.elStatut.textContent = texteAge(p.age_s);
    l.elStatut.style.color = p.perime ? '#c62828' : '#2e7d32';

    if (l.case.checked) {
      if (marqueurs[l.id]) {
        marqueurs[l.id].setLatLng([l.lat, l.lon]);
        marqueurs[l.id].setIcon(icone(l.couleur, l.perime));
      } else {
        creerMarqueur(l);
        recadrer = true;
      }
    }
  });

  if (recadrer) ajusterVue();
}

function majDemandes(demandes) {
  document.getElementById('listeDemandes').replaceChildren(...demandes.map(d => {
    if (d.statut === 'attente') {
      return ligne(d.nom + ' يطلب متابعتك',
                   [['قبول', () => repondre(d.id, true)], ['رفض', () => repondre(d.id, false)]]);
    }
    const div = ligne(d.nom + ' يتابعك', []);
    div.lastChild.append(boutonIcone(ICONE_CORBEILLE, 'إلغاء', () => retirer(d.id)));
    return div;
  }));
}

async function actualiserSuivi() {
  if (!carte) return;
  try {
    const [a, b, c] = await Promise.all([
      api('/dev/mes-suivis', {}),
      api('/dev/demandes-recues', {}),
      api('/dev/positions-suivies', {})
    ]);
    if (a.success) majSuivis(a.suivis, c.success ? c.positions : []);
    if (b.success) majDemandes(b.demandes);
  } catch (e) { console.error(e); }
}

const TEST_SANS_GPS = false;   // true : la page n'envoie rien (tests PowerShell) / false : envoi réel
let timerPartage = null;

function etatPartage(texte) {
  document.getElementById('etatPartage').textContent = texte;
}

function basculerPartage(actif) {
  const id = localStorage.getItem('monId');
  if (TEST_SANS_GPS) {
    etatPartage('وضع الاختبار — لا إرسال');
    return;
  }

  if (actif) {
    envoyerPosition();
    timerPartage = setInterval(envoyerPosition, 10000);
  } else {
    clearInterval(timerPartage);
    timerPartage = null;
    etatPartage('');
    fetch(SERVEUR + "/dev/arret-partage", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    }).catch(console.error);
  }
}

function envoyerPosition() {
  if (!navigator.geolocation) { etatPartage('GPS غير متوفر'); return; }
  navigator.geolocation.getCurrentPosition(async pos => {
    if (!timerPartage) return;   // partage arrêté entre-temps
    try {
      const r = await fetch(SERVEUR + "/dev/ma-position", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: localStorage.getItem('monId'),
          lat: pos.coords.latitude,
          lon: pos.coords.longitude
        })
      });
      const d = await r.json();
      etatPartage(d.success ? 'يتم الإرسال ✓' : d.error);
    } catch (e) {
      etatPartage('تعذر الإرسال');
    }
  }, () => etatPartage('تعذر تحديد الموقع'),
  { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 });
}
