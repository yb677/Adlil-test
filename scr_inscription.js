let insTimer = null;
let insCreation = false;

const INS_RAISONS = { situation_changee: 'تغيّرت الوضعية، أعد المحاولة' };

async function insPost(chemin, corps) {
  try {
    const r = await fetch(SERVER + chemin, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps)
    });
    const d = await r.json();
    d._status = r.status;
    return d;
  } catch (e) {
    console.error('insPost :', e);
    return { success: false, error: 'تعذر الاتصال بالخادم', _status: 0 };
  }
}

// L'application tourne-t-elle en mode installé ? (ou en mode test)
const INS_AUTO_EN_NAVIGATEUR = false;   // true : crée le compte même dans le navigateur (tests) / false : seulement si installée

function insEstInstallee() {
  return INS_AUTO_EN_NAVIGATEUR
      || window.matchMedia('(display-mode: standalone)').matches
      || navigator.standalone === true;
}

// Création silencieuse du compte anonyme
async function insCreerCompte() {
  if (localStorage.getItem('monId')) return true;
  if (insCreation) return false;
  insCreation = true;
  const d = await insPost('/dev/inscription-anonyme', {});
  insCreation = false;
  if (!d.success) return false;
  localStorage.setItem('monId', d.id);
  return true;
}

function insMontrer(nom) {
  ['compte', 'verif', 'choisir', 'echec'].forEach(n => {
    document.getElementById('ins-' + n).style.display = n === nom ? 'block' : 'none';
  });
}

function insEchec(msg) {
  document.getElementById('insMsgEchec').textContent = msg;
  insMontrer('echec');
}

async function insOuvrir() {
  document.getElementById('ecranIns').style.display = 'flex';

  const att = JSON.parse(localStorage.getItem('insAttente') || 'null');
  if (att) {                                   // vérification en cours : on la reprend
    insMontrer('verif');
    insAfficherVerif(att.code);
    insVerifierStatut();
    return;
  }
  if (!localStorage.getItem('monId')) {
    insEchec('جارٍ إنشاء الحساب...');
    if (!(await insCreerCompte())) { insEchec('تعذر إنشاء الحساب، تحقق من الاتصال'); return; }
  }
  insAfficherCompte();
}

function insFermer() {
  clearInterval(insTimer);
  document.getElementById('ecranIns').style.display = 'none';
}

// --- Mon compte ---
async function insAfficherCompte() {
  insMontrer('compte');
  const d = await insPost('/dev/moi', { id: localStorage.getItem('monId') });

  if (!d.success) {
    if (d._status === 404) {                   // compte inconnu du serveur : on en recrée un
      localStorage.removeItem('monId');
      if (await insCreerCompte()) return insAfficherCompte();
      insEchec('تعذر إنشاء الحساب، تحقق من الاتصال');
    } else {
      alert(d.error);
    }
    return;
  }

  const verifie = !!d.tel;
  document.getElementById('insCodeCompte').textContent = d.code;
  document.getElementById('insNomEdit').value = d.nom;
  document.getElementById('insTelCompte').textContent = verifie ? '+' + d.tel + ' ✓' : '- - -';
  document.getElementById('insBlocRattacher').style.display = verifie ? 'none' : 'block';
  if (typeof chargerMoi === 'function') chargerMoi();
  insAppliquerTelephone();
  if (typeof fcmEnregistrer === 'function') fcmEnregistrer();
}

async function insEnregistrerNom() {
  const nom = document.getElementById('insNomEdit').value.trim();
  if (!nom) { alert('أدخل الاسم'); return; }
  const d = await insPost('/dev/modifier-nom', { id: localStorage.getItem('monId'), nom });
  if (!d.success) { alert(d.error); return; }

  const b = document.getElementById('insBtnNom');
  b.textContent = '✓';
  setTimeout(() => { b.textContent = 'حفظ'; }, 1500);
  if (typeof chargerMoi === 'function') chargerMoi();    // met à jour la ligne du haut de la carte
}

// --- Ajout du numéro WhatsApp ---
async function insRattacher() {
  const d = await insPost('/dev/demande-rattachement', { id: localStorage.getItem('monId') });
  if (!d.success) {
    if (d._status === 404) { localStorage.removeItem('monId'); insOuvrir(); return; }
    alert(d.error);
    return;
  }
  localStorage.setItem('insAttente', JSON.stringify({ code: d.code_verif }));
  insMontrer('verif');
  insAfficherVerif(d.code_verif);
}

function insAfficherVerif(code) {
  document.getElementById('insCodeVerif').textContent = code;
  document.getElementById('insLienWa').href =
    'https://wa.me/' + NUMERO_WA + '?text=' + encodeURIComponent(code);
  document.getElementById('insEtat').textContent = 'في انتظار الرسالة';
  clearInterval(insTimer);
  insTimer = setInterval(insVerifierStatut, 3000);
}

async function insVerifierStatut() {
  const att = JSON.parse(localStorage.getItem('insAttente') || 'null');
  const id = localStorage.getItem('monId');
  if (!att || !id) { clearInterval(insTimer); return; }

  const d = await insPost('/dev/statut-verification', { id });
  if (!d.success || d.statut === 'attente') return;

  clearInterval(insTimer);

  if (d.statut === 'choix') {                  // numéro déjà lié : l'utilisateur doit choisir
    document.getElementById('insAncienNom').textContent = d.ancien_nom || '';
    document.getElementById('insAncienCode').textContent = d.ancien_code || '';
    insMontrer('choisir');
    return;
  }

  localStorage.removeItem('insAttente');
  if (d.statut === 'valide') { insAfficherCompte(); return; }
  document.getElementById('insEtat').textContent =
    d.statut === 'refuse' ? (INS_RAISONS[d.raison] || 'تم الرفض') : 'انتهت صلاحية الرمز';
}

function insAnnuler() {
  clearInterval(insTimer);
  localStorage.removeItem('insAttente');
  insAfficherCompte();
}

// --- Choix : récupérer l'ancien compte ou garder le compte actuel ---
async function insResoudre(choix) {
  if (choix === 'garder' &&
      !confirm('الحساب القديم سيفقد رقمه ولن يمكن استرجاعه. هل تريد المتابعة؟')) return;

  const d = await insPost('/dev/resoudre-rattachement', { id: localStorage.getItem('monId'), choix });
  localStorage.removeItem('insAttente');
  if (!d.success) alert(d.error);
  insAfficherCompte();       // dans les deux cas l'ID de ce téléphone reste valide
}

// Création automatique au lancement (application installée), puis à chaque retour du réseau
if (insEstInstallee()) insCreerCompte();
window.addEventListener('online', () => { if (insEstInstallee()) insCreerCompte(); });

insAppliquerTelephone();