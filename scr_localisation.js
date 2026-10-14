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

function afficherMoi(nom, code, tel) {
  document.getElementById('nomMoi').textContent = nom;
  document.getElementById('codeMoi').textContent = code;
  document.getElementById('telMoi').textContent = tel ? '+' + tel : '';
  document.getElementById('casePartage').disabled = false;
  if (!timerSuivi) { actualiserSuivi(); timerSuivi = setInterval(actualiserSuivi, 10000); }
}

async function chargerMoi(essai = 0) {
  let id = localStorage.getItem('monId');
  if (!id) {                                       // pas encore de compte : on le crée
    if (typeof insCreerCompte === 'function' && !(await insCreerCompte())) return;
    id = localStorage.getItem('monId');
    if (!id) return;
  }
  try {
    const r = await fetch(SERVER + "/dev/moi", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const d = await r.json();
    if (d.success) {
      afficherMoi(d.nom, d.code, d.tel);
      document.getElementById('caseTous').checked = !!d.accepte_tous;
    } else if (r.status === 404 && essai < 1) {    // compte inconnu du serveur : on en recrée un
      localStorage.removeItem('monId');
      chargerMoi(1);
    }
  } catch (e) { console.error(e); }
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
    fetch(SERVER + "/dev/arret-partage", {
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
      const r = await fetch(SERVER + "/dev/ma-position", {
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
