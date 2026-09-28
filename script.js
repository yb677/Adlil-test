let deferredPrompt;
let qrcodeInstance = null;

// --- VARIABLES ---
const installScreen = document.getElementById('install-screen');
const msgAndroid = document.getElementById('msg-android');
const msgIos = document.getElementById('msg-ios');
const iosArrow = document.getElementById('ios-arrow-help');

const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// ============================================================
// INDEXEDDB INIT
// ============================================================
const DB_NAME = 'adlil-db';
const DB_VERSION = 1;
const STORE_NAME = 'publications';
let idb;

function openIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('date', 'date', { unique: false });
            }
        };
        req.onsuccess = (e) => { idb = e.target.result; resolve(idb); };
        req.onerror = (e) => reject(e);
    });
}

// ============================================================
// FIRESTORE SYNC
// ============================================================
async function syncPublications() {
    try {
        const snapshot = await db.collection('publications').orderBy('date', 'asc').get();

        // Vider IndexedDB complètement avant de réécrire (supprime les docs effacés)
        await new Promise((resolve, reject) => {
            const tx = idb.transaction(STORE_NAME, 'readwrite');
            const req = tx.objectStore(STORE_NAME).clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });

        if (snapshot.empty) { console.log('ℹ️ Aucune publication'); return; }

        await new Promise((resolve, reject) => {
            const tx = idb.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            snapshot.forEach(doc => {
                store.put({ id: doc.id, ...doc.data(), date: doc.data().date.toDate().toISOString() });
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });

        localStorage.removeItem('adlil_read');
        console.log(`✅ ${snapshot.size} publication(s) synchronisée(s)`);
    } catch (err) {
        console.warn('⚠️ Sync error:', err);
        throw err;
    }
}

// Écran installation mobile (l'app est affichée dans window.onload après init IDB)
if (isMobile && !isStandalone) {
    installScreen.style.display = 'block';
    if (isIOS) {
        msgIos.style.display = 'block';
        msgAndroid.style.display = 'none';
        iosArrow.style.display = 'block';
    } else {
        msgAndroid.style.display = 'block';
        msgIos.style.display = 'none';
        iosArrow.style.display = 'none';
    }
}

function showMainApp() {
    document.getElementById('install-screen').style.display = 'none';
    document.getElementById('success-screen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('burgerBtn').style.display = 'flex';
    iosArrow.style.display = 'none'; 
}

// --- INSTALLATION ---
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

document.getElementById('btnInstallLarge').onclick = () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((res) => {
            if (res.outcome === 'accepted') {
                document.getElementById('install-screen').style.display = 'none';
                document.getElementById('success-screen').style.display = 'block';
            }
        });
    }
};

// --- NAVIGATION ---
document.getElementById('burgerBtn').onclick = () => document.getElementById('sideMenu').classList.toggle('active');

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + viewId).classList.add('active');
    document.getElementById('sideMenu').classList.remove('active');
    if (viewId === 'qr') {
        generateQR();       // génère le canvas
        renderFamilleQR();  // construit la liste (une seule fois, sans toucher le canvas)
    }
    if (viewId === 'welcome') refreshFeed();
}

// Convertit YYYY-MM-DD → JJ/MM/AA
function toDisplayDate(iso) {
    if (!iso) return '';
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
}

function scramble(text) {
    let shifted = '';
    for (let i = 0; i < text.length; i++) {
        shifted += String.fromCharCode(text.charCodeAt(i) + 3);
    }
    const reversed = shifted.split('').reverse().join('');
    return btoa(unescape(encodeURIComponent(reversed)));
}

// Construit la chaîne complète du QR
// MD5 des 4 premiers octets — équivalent de la fonction Kotlin calculateChecksum
async function calculateChecksum(input) {
    const bytes = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('MD5', bytes);
    // MD5 non supporté par crypto.subtle — implémentation manuelle
    return md5(input).substring(0, 8); // 4 octets = 8 hex chars
}

// Implémentation MD5 pure JS (RFC 1321)
function md5(input) {
    function safeAdd(x, y) { const lsw = (x & 0xffff) + (y & 0xffff); return ((x >> 16) + (y >> 16) + (lsw >> 16)) << 16 | lsw & 0xffff; }
    function bitRotateLeft(num, cnt) { return num << cnt | num >>> (32 - cnt); }
    function md5cmn(q, a, b, x, s, t) { return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
    function md5ff(a,b,c,d,x,s,t){return md5cmn(b&c|~b&d,a,b,x,s,t);}
    function md5gg(a,b,c,d,x,s,t){return md5cmn(b&d|c&~d,a,b,x,s,t);}
    function md5hh(a,b,c,d,x,s,t){return md5cmn(b^c^d,a,b,x,s,t);}
    function md5ii(a,b,c,d,x,s,t){return md5cmn(c^(b|~d),a,b,x,s,t);}
    function utf8Encode(str) {
        return unescape(encodeURIComponent(str));
    }
    function str2binl(str) {
        const bin = [];
        for (let i = 0; i < str.length * 8; i += 8)
            bin[i >> 5] |= (str.charCodeAt(i / 8) & 0xff) << i % 32;
        return bin;
    }
    function binl2hex(binarray) {
        const hex = '0123456789abcdef';
        let str = '';
        for (let i = 0; i < binarray.length * 4; i++)
            str += hex.charAt(binarray[i >> 2] >> i % 4 * 8 + 4 & 0xf) + hex.charAt(binarray[i >> 2] >> i % 4 * 8 & 0xf);
        return str;
    }
    function coreMD5(x, len) {
        x[len >> 5] |= 0x80 << len % 32;
        x[(len + 64 >>> 9 << 4) + 14] = len;
        let a=1732584193,b=-271733879,c=-1732584194,d=271733878;
        for (let i = 0; i < x.length; i += 16) {
            const [oa,ob,oc,od]=[a,b,c,d];
            a=md5ff(a,b,c,d,x[i+0],7,-680876936);d=md5ff(d,a,b,c,x[i+1],12,-389564586);c=md5ff(c,d,a,b,x[i+2],17,606105819);b=md5ff(b,c,d,a,x[i+3],22,-1044525330);
            a=md5ff(a,b,c,d,x[i+4],7,-176418897);d=md5ff(d,a,b,c,x[i+5],12,1200080426);c=md5ff(c,d,a,b,x[i+6],17,-1473231341);b=md5ff(b,c,d,a,x[i+7],22,-45705983);
            a=md5ff(a,b,c,d,x[i+8],7,1770035416);d=md5ff(d,a,b,c,x[i+9],12,-1958414417);c=md5ff(c,d,a,b,x[i+10],17,-42063);b=md5ff(b,c,d,a,x[i+11],22,-1990404162);
            a=md5ff(a,b,c,d,x[i+12],7,1804603682);d=md5ff(d,a,b,c,x[i+13],12,-40341101);c=md5ff(c,d,a,b,x[i+14],17,-1502002290);b=md5ff(b,c,d,a,x[i+15],22,1236535329);
            a=md5gg(a,b,c,d,x[i+1],5,-165796510);d=md5gg(d,a,b,c,x[i+6],9,-1069501632);c=md5gg(c,d,a,b,x[i+11],14,643717713);b=md5gg(b,c,d,a,x[i+0],20,-373897302);
            a=md5gg(a,b,c,d,x[i+5],5,-701558691);d=md5gg(d,a,b,c,x[i+10],9,38016083);c=md5gg(c,d,a,b,x[i+15],14,-660478335);b=md5gg(b,c,d,a,x[i+4],20,-405537848);
            a=md5gg(a,b,c,d,x[i+9],5,568446438);d=md5gg(d,a,b,c,x[i+14],9,-1019803690);c=md5gg(c,d,a,b,x[i+3],14,-187363961);b=md5gg(b,c,d,a,x[i+8],20,1163531501);
            a=md5gg(a,b,c,d,x[i+13],5,-1444681467);d=md5gg(d,a,b,c,x[i+2],9,-51403784);c=md5gg(c,d,a,b,x[i+7],14,1735328473);b=md5gg(b,c,d,a,x[i+12],20,-1926607734);
            a=md5hh(a,b,c,d,x[i+5],4,-378558);d=md5hh(d,a,b,c,x[i+8],11,-2022574463);c=md5hh(c,d,a,b,x[i+11],16,1839030562);b=md5hh(b,c,d,a,x[i+14],23,-35309556);
            a=md5hh(a,b,c,d,x[i+1],4,-1530992060);d=md5hh(d,a,b,c,x[i+4],11,1272893353);c=md5hh(c,d,a,b,x[i+7],16,-155497632);b=md5hh(b,c,d,a,x[i+10],23,-1094730640);
            a=md5hh(a,b,c,d,x[i+13],4,681279174);d=md5hh(d,a,b,c,x[i+0],11,-358537222);c=md5hh(c,d,a,b,x[i+3],16,-722521979);b=md5hh(b,c,d,a,x[i+6],23,76029189);
            a=md5hh(a,b,c,d,x[i+9],4,-640364487);d=md5hh(d,a,b,c,x[i+12],11,-421815835);c=md5hh(c,d,a,b,x[i+15],16,530742520);b=md5hh(b,c,d,a,x[i+2],23,-995338651);
            a=md5ii(a,b,c,d,x[i+0],6,-198630844);d=md5ii(d,a,b,c,x[i+7],10,1126891415);c=md5ii(c,d,a,b,x[i+14],15,-1416354905);b=md5ii(b,c,d,a,x[i+5],21,-57434055);
            a=md5ii(a,b,c,d,x[i+12],6,1700485571);d=md5ii(d,a,b,c,x[i+3],10,-1894986606);c=md5ii(c,d,a,b,x[i+10],15,-1051523);b=md5ii(b,c,d,a,x[i+1],21,-2054922799);
            a=md5ii(a,b,c,d,x[i+8],6,1873313359);d=md5ii(d,a,b,c,x[i+15],10,-30611744);c=md5ii(c,d,a,b,x[i+6],15,-1560198380);b=md5ii(b,c,d,a,x[i+13],21,1309151649);
            a=md5ii(a,b,c,d,x[i+4],6,-145523070);d=md5ii(d,a,b,c,x[i+11],10,-1120210379);c=md5ii(c,d,a,b,x[i+2],15,718787259);b=md5ii(b,c,d,a,x[i+9],21,-343485551);
            a=safeAdd(a,oa);b=safeAdd(b,ob);c=safeAdd(c,oc);d=safeAdd(d,od);
        }
        return [a,b,c,d];
    }
    const str = utf8Encode(input);
    const result = coreMD5(str2binl(str), str.length * 8);
    return binl2hex(result);
}

function calculateChecksum(input) {
    // MD5 des 4 premiers octets (8 caractères hex) — identique à la fonction Kotlin
    return md5(input).substring(0, 8);
}

function buildQRData(accompList) {
    const d = JSON.parse(localStorage.getItem('pwa_profile') || '{}');

    // ── Partie claire ──────────────────────────────────────
    const telephone = d.telephone || '';
    const nom       = d.nom       || '';
    const prenom    = d.prenom    || '';
    const partieClaire = [nom, prenom, telephone].join('#');

    // ── Accompagnants : index séparés par virgule (remplace '/') ──
    const accompStr = accompList && accompList.length > 0
        ? accompList.join(',')
        : '';

    // ── Famille : conjoints + enfants depuis la mémoire ───
    const famData = famille.length > 0 ? famille : (d.famille || []);
    let familleStr = '';
    famData.forEach(conjoint => {
        familleStr += '#*';
        familleStr += '#' + (conjoint.nom    || '');
        familleStr += '#' + (conjoint.prenom || '');
        familleStr += '#' + toDisplayDate(conjoint.dateNaissance || '');
        const enfantsTries = [...(conjoint.enfants || [])].sort((a, b) => {
            if (!a.dateNaissance) return 1;
            if (!b.dateNaissance) return -1;
            return new Date(a.dateNaissance) - new Date(b.dateNaissance);
        });
        enfantsTries.forEach(enfant => {
            familleStr += '#' + (enfant.prenom || '');
            familleStr += '#' + toDisplayDate(enfant.dateNaissance || '');
        });
    });

    // ── Partie scrambled ───────────────────────────────────
    // '/' remplacé par les index des accompagnants cochés
    const partieScrambledRaw = [
        'PWA',
        d.pere              || '',
        d.grandpere         || '',
        d.mereNom           || '',
        d.merePrenom        || '',
        toDisplayDate(d.datenaissance) || '',
        d.groupesanguin     || '',
        d.niveauInstruction || '',
        d.profession        || '',
        d.adresseResidence  || '',
        d.adresseActivite   || '',
        d.maitrise          || '',
        d.offres            || '',
        '-',
        accompStr           // ← à la place de '/'
    ].join('#') + familleStr;

    const partieScrambled = scramble(partieScrambledRaw);
    const checksum = calculateChecksum('ybm' + nom + prenom + telephone); // + '#');

    return checksum + '#' + partieClaire + '#' + partieScrambled;
}

// Génère uniquement le canvas QR
function generateQR(accompList) {
    accompList = accompList || [];
    const container = document.getElementById('qrcode-container');
    if (!container) return;

    const d = JSON.parse(localStorage.getItem('pwa_profile') || '{}');
    const nom       = d.nom       || '';
    const prenom    = d.prenom    || '';
    const telephone = d.telephone || '';

    if (!nom && !prenom) {
        container.innerHTML = `<p style="color:#999; text-align:center;">لا توجد بيانات. يرجى ملء معلوماتك أولاً.</p>`;
        return;
    }

    const data = buildQRData(accompList);

    container.innerHTML = `
        <div id="qr-canvas"></div>
        <p style="text-align:center; margin-top:12px; font-size:14px; color:#555;">
            <strong>${prenom} ${nom}</strong><br>
            <span style="color:#999; font-size:12px;">${telephone}</span>
        </p>`;

    setTimeout(() => {
        const canvas = document.getElementById('qr-canvas');
        if (!canvas) return;
        try {
            new QRCode(canvas, {
                text: data,
                width: 220,
                height: 220,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
            setTimeout(() => {
                const cvs = canvas.querySelector('canvas');
                if (cvs) {
                    const dataUrl = cvs.toDataURL('image/png');
                    if (dataUrl && dataUrl.length > 100) {
                        canvas.innerHTML = `<img src="${dataUrl}" width="220" height="220" style="display:block;" alt="QR Code">`;
                    }
                }
            }, 200);
        } catch(err) {
            console.warn('QRCode lib error:', err);
            canvas.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data)}"
                width="220" height="220" alt="QR Code"
                onerror="this.parentElement.innerHTML='<p style=color:red>QR Code indisponible</p>'">`;
        }
    }, 100);
}

// Construit la liste des membres depuis la variable famille en mémoire
function renderFamilleQR() {
    const list = document.getElementById('famille-qr-list');
    if (!list) return;

    const membres = [];

    famille.forEach(conjoint => {
        if (conjoint.prenom || conjoint.nom)
            membres.push(`${conjoint.prenom} ${conjoint.nom}`.trim());
        const enfantsTries = [...(conjoint.enfants || [])].sort((a, b) => {
            if (!a.dateNaissance) return 1;
            if (!b.dateNaissance) return -1;
            return new Date(a.dateNaissance) - new Date(b.dateNaissance);
        });
        enfantsTries.forEach(enfant => {
            if (enfant.prenom) membres.push(enfant.prenom);
        });
    });

    if (membres.length === 0) {
        list.innerHTML = `<p style="color:#999; font-size:0.9rem;">لا يوجد أفراد عائلة مسجلون.</p>`;
        return;
    }

    list.innerHTML = membres.map((nom, i) => `
        <label style="display:flex; align-items:center; gap:10px; padding:8px 4px;
                       border-bottom:1px solid #eee; cursor:pointer; font-size:0.97rem;">
            <input type="checkbox" data-index="${i+1}"
                onchange="onFamilleQRChange()"
                style="width:18px; height:18px; accent-color:#007bff; flex-shrink:0;">
            <span>${nom}</span>
        </label>
    `).join('');
}

// À chaque coche : met à jour le compteur et régénère UNIQUEMENT le canvas
function onFamilleQRChange() {
    const checkboxes = document.querySelectorAll('#famille-qr-list input[type=checkbox]');
    const checked = [...checkboxes].filter(c => c.checked);
    const accompList = checked.map(c => c.dataset.index); // ex: ['1','4','5']
    document.getElementById('qr-accomp-count').textContent = checked.length;
    generateQR(accompList);
}

// Fonction de secours qui dessine un QR stylisé si le réseau est bloqué
function generateInternalQR(img, name, email) {
    const parent = img.parentElement;
    parent.innerHTML = `
        <div style="width:200px; height:200px; background:#f0f0f0; border:2px solid #333; position:relative; display:flex; align-items:center; justify-content:center;">
            <!-- Petit dessin simulant un QR Code -->
            <div style="position:absolute; top:5px; left:5px; width:40px; height:40px; border:4px solid #333;"></div>
            <div style="position:absolute; top:5px; right:5px; width:40px; height:40px; border:4px solid #333;"></div>
            <div style="position:absolute; bottom:5px; left:5px; width:40px; height:40px; border:4px solid #333;"></div>
            <div style="text-align:center; font-size:12px; font-weight:bold; color:#333; padding:10px;">
                DÉTAILS<br>AFFICHÉS<br>CI-DESSOUS
            </div>
        </div>
        <div style="margin-top:15px; text-align:left; font-size:14px; border-top:1px solid #eee; padding-top:10px;">
            <strong>${name}</strong><br>
            <span style="color:#666; font-size:12px;">${email}</span>
        </div>`;
}

function showOfflineQR(img, name, email) {
    // Si l'image externe échoue encore, on affiche un QR Code de secours
    // ou un message stylisé très clair.
    img.parentElement.innerHTML = `
        <div style="width:200px; height:200px; background:white; border:2px solid #007bff; display:flex; align-items:center; justify-content:center; padding:10px; box-sizing:border-box;">
            <div style="text-align:center;">
                <div style="font-size:40px;">⚠️</div>
                <p style="font-size:12px; margin:5px 0; color:#333;"><strong>Mode Hors-ligne</strong></p>
                <p style="font-size:10px; color:#666;">Connectez-vous une fois pour générer l'image.</p>
            </div>
        </div>
        <div style="margin-top:15px; font-size:14px; text-align:left; background:#eee; padding:10px; border-radius:5px;">
            <strong>Données stockées :</strong><br>
            ${name}<br>${email}
        </div>`;
}

function showManualQR(img, name, email) {
    // Si l'image est bloquée, on affiche les données clairement en texte
    img.parentElement.innerHTML = `
        <div style="border:2px dashed #ccc; padding:20px; background:#fff;">
            <p style="color:red; font-weight:bold;">QR Code non disponible hors-ligne</p>
            <hr>
            <p><strong>Données :</strong></p>
            <p>${name}</p>
            <p>${email}</p>
        </div>`;
}

// --- INITIALISATION ---
// --- SERVICE WORKER ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
        // Lire la version du SW actif
        const sw = reg.active || reg.installing || reg.waiting;
        if (sw) {
            const channel = new MessageChannel();
            channel.port1.onmessage = e => {
                if (e.data && e.data.version) {
                    const el = document.getElementById('nav-version');
                    if (el) el.textContent = 'v' + e.data.version;
                }
            };
            sw.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
        }
    });
}

const QRMaker = (text) => {
    const size = 256;
    // ✅ URL correcte
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
};

// ----------- with Claude ----

// ============================================================
// GESTION FAMILLE (conjoints + enfants)
// ============================================================
let famille = []; // tableau de conjoints: { id, nom, prenom, dateNaissance, enfants: [{id,prenom,dateNaissance}] }
let conjointCounter = 0;
let enfantCounter = 0;

const conjointLabels = ['الزوجة الأولى','الزوجة الثانية','الزوجة الثالثة','الزوجة الرابعة'];

function renderFamille() {
    const zone = document.getElementById('famille-zone');
    const btn = document.getElementById('btnAddConjoint');
    zone.innerHTML = '';

    famille.forEach((conjoint, index) => {
        // Afficher les enfants dans l'ordre d'insertion (pas de tri ici)
        // Le tri par âge est appliqué uniquement dans le QR
        const enfantsAffiches = conjoint.enfants;

        const hasEnfants = conjoint.enfants.length > 0;
        const label = conjointLabels[index] || `الزوجة ${index + 1}`;

        const cDiv = document.createElement('fieldset');
        cDiv.innerHTML = `
            <legend>
                ${label}
                ${!hasEnfants ? `<button type="button" class="btn-trash" onclick="removeConjoint('${conjoint.id}')" title="crcssذف">🗑</button>` : ''}
            </legend>
            <div class="field-row">
                <div class="field-group">
                    <label>لقب</label>
                    <input type="text" placeholder="لقب" value="${conjoint.nom}" oninput="updateConjoint('${conjoint.id}','nom',this.value)">
                </div>
                <div class="field-group">
                    <label>إسم</label>
                    <input type="text" placeholder="إسم" value="${conjoint.prenom}" oninput="updateConjoint('${conjoint.id}','prenom',this.value)">
                </div>
            </div>
            <div class="field-full">
                <label>تاريخ الميلاد</label>
                <input type="date" value="${conjoint.dateNaissance || ''}" oninput="updateConjoint('${conjoint.id}','dateNaissance',this.value)">
            </div>
        `;

        // Enfants dans l'ordre d'insertion
        enfantsAffiches.forEach((enfant) => {
            const eDiv = document.createElement('div');
            eDiv.className = 'enfant-row';
            eDiv.innerHTML = `
                <button type="button" class="btn-trash" onclick="removeEnfant('${conjoint.id}','${enfant.id}')" title="حذف الولد">🗑</button>
                <div class="field-row" style="flex:1; margin-bottom:0;">
                    <div class="field-group">
                        <label>إسم الولد</label>
                        <input type="text" placeholder="إسم الولد" value="${enfant.prenom}" oninput="updateEnfant('${conjoint.id}','${enfant.id}','prenom',this.value)">
                    </div>
                    <div class="field-group">
                        <label>تاريخ الميلاد</label>
                        <input type="date" value="${enfant.dateNaissance}" oninput="updateEnfant('${conjoint.id}','${enfant.id}','dateNaissance',this.value)">
                    </div>
                </div>
            `;
            cDiv.appendChild(eDiv);
        });

        // Bouton ajouter enfant
        const btnEnfant = document.createElement('button');
        btnEnfant.type = 'button';
        btnEnfant.className = 'action-btn-sm';
        btnEnfant.textContent = '+ إضافة ولد';
        btnEnfant.onclick = () => addEnfant(conjoint.id);
        cDiv.appendChild(btnEnfant);

        zone.appendChild(cDiv);
    });

    zone.parentElement.insertBefore(btn, zone.nextSibling);
}

function addConjoint() {
    famille.push({ id: 'c' + (++conjointCounter), nom: '', prenom: '', dateNaissance: '', enfants: [] });
    renderFamille();
}

function removeConjoint(id) {
    famille = famille.filter(c => c.id !== id);
    renderFamille();
}

function updateConjoint(id, field, val) {
    const c = famille.find(c => c.id === id);
    if (c) c[field] = val;
}

function addEnfant(conjointId) {
    const c = famille.find(c => c.id === conjointId);
    if (c) {
        c.enfants.push({ id: 'e' + (++enfantCounter), prenom: '', dateNaissance: '' });
        renderFamille();
    }
}

function removeEnfant(conjointId, enfantId) {
    const c = famille.find(c => c.id === conjointId);
    if (c) {
        c.enfants = c.enfants.filter(e => e.id !== enfantId);
        renderFamille();
    }
}

function updateEnfant(conjointId, enfantId, field, val) {
    const c = famille.find(c => c.id === conjointId);
    if (c) { const e = c.enfants.find(e => e.id === enfantId); if (e) e[field] = val; }
}

// ============================================================
// FORMULAIRE — SAVE / LOAD
// ============================================================
document.getElementById('userForm').onsubmit = (e) => {
    e.preventDefault();
    const data = {
        nom:               document.getElementById('f_nom').value,
        prenom:            document.getElementById('f_prenom').value,
        pere:              document.getElementById('f_pere').value,
        grandpere:         document.getElementById('f_grandpere').value,
        mereNom:           document.getElementById('f_mereNom').value,
        merePrenom:        document.getElementById('f_merePrenom').value,
        datenaissance:     document.getElementById('f_datenaissance').value,
        groupesanguin:     document.getElementById('f_groupesanguin').value,
        telephone:         document.getElementById('f_telephone').value,
        familleAlger:      document.getElementById('f_familleAlger').value,
        niveauInstruction: document.getElementById('f_niveauInstruction').value,
        profession:        document.getElementById('f_profession').value,
        adresseResidence:  document.getElementById('f_adresseResidence').value,
        adresseActivite:   document.getElementById('f_adresseActivite').value,
        mokataa:           document.getElementById('f_mokataa').value,
        maitrise:          document.getElementById('f_maitrise').value,
        offres:            document.getElementById('f_offres').value,
        famille:           famille
    };
    // Copie profonde de famille pour le tri — ne pas muter le tableau en mémoire
    const familleSauvegarde = JSON.parse(JSON.stringify(famille));
    familleSauvegarde.forEach(conjoint => {
        conjoint.enfants.sort((a, b) => {
            if (!a.dateNaissance) return 1;
            if (!b.dateNaissance) return -1;
            return new Date(a.dateNaissance) - new Date(b.dateNaissance);
        });
    });

    data.famille = familleSauvegarde;
    localStorage.setItem('pwa_profile', JSON.stringify(data));
    document.getElementById('welcomeUser').innerText = `مرحباً بك، ${data.prenom} ${data.nom}`;

    // Bulle "تم الحفظ !"
    const toast = document.createElement('div');
    toast.textContent = '✓ تم الحفظ !';
    toast.style.cssText = `
        position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
        background: #28a745; color: white; padding: 12px 28px;
        border-radius: 25px; font-size: 15px; font-weight: bold;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 9999;
        opacity: 1; transition: opacity 0.5s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; }, 2000);
    setTimeout(() => { toast.remove(); }, 2600);
};

window.onload = async () => {
    await openIDB();
    if (!isMobile || isStandalone) {
        showMainApp();
        iosArrow.style.display = 'none';
    }
    await refreshFeed();
    const raw = localStorage.getItem('pwa_profile');
    if (!raw) return;
    const d = JSON.parse(raw);
    const fields = ['nom','prenom','pere','grandpere','mereNom','merePrenom',
                    'datenaissance','groupesanguin','telephone','familleAlger',
                    'niveauInstruction','profession','adresseResidence',
                    'adresseActivite','mokataa','maitrise','offres'];
    fields.forEach(f => {
        const el = document.getElementById('f_' + f);
        if (el && d[f]) el.value = d[f];
    });
    if (d.nom) document.getElementById('welcomeUser').innerText = `مرحباً بك، ${d.prenom} ${d.nom}`;
    if (d.famille) {
        famille = d.famille;
        // Réinitialiser les compteurs à partir des IDs existants pour éviter les collisions
        famille.forEach(c => {
            const cNum = parseInt(c.id.replace('c', '')) || 0;
            if (cNum > conjointCounter) conjointCounter = cNum;
            (c.enfants || []).forEach(e => {
                const eNum = parseInt(e.id.replace('e', '')) || 0;
                if (eNum > enfantCounter) enfantCounter = eNum;
            });
        });
        renderFamille();
    }
};

// ============================================================
// DISPLAY FEED
// ============================================================

async function loadFeed() {
    const container = document.getElementById('feed-container');
    if (!container) return;
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('date');
    const publications = await new Promise(res => {
        const req = index.getAll();
        req.onsuccess = () => res(req.result);
    });
    if (publications.length === 0) {
        container.innerHTML = `<p style="color:#999; text-align:center;">Aucune publication.</p>`;
        return;
    }
    const readIds = JSON.parse(localStorage.getItem('adlil_read') || '[]');
    let firstUnreadIndex = -1;
    let html = '';
    publications.forEach((pub, i) => {
        const isRead = readIds.includes(pub.id);
        if (!isRead && firstUnreadIndex === -1) firstUnreadIndex = i;
        const dateStr = new Date(pub.date).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
        html += `
            <div class="pub-bubble ${isRead ? 'pub-read' : 'pub-unread'}" id="pub-${pub.id}" onclick="markRead('${pub.id}')">
                <div class="pub-type">${pub.type}</div>
                <div class="pub-contenu">${pub.contenu}</div>
                <div class="pub-meta">${pub.auteur} · ${dateStr}</div>
            </div>`;
    });
    container.innerHTML = html;
    const allIds = publications.map(p => p.id);
    localStorage.setItem('adlil_read', JSON.stringify(allIds));
    if (firstUnreadIndex !== -1) {
        const el = document.getElementById('pub-' + publications[firstUnreadIndex].id);
        if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    }
}

async function refreshFeed() {
    const container = document.getElementById('feed-container');
    if (!container) return;
    await loadFeed();
    if (!navigator.onLine) return;
    const indicator = document.createElement('div');
    indicator.id = 'sync-indicator';
    indicator.style.cssText = 'text-align:center;font-size:12px;color:#aaa;padding:4px;';
    indicator.textContent = '🔄 Mise à jour...';
    container.prepend(indicator);
    try {
        await syncPublications();
        await loadFeed();
    } catch (err) {
        console.warn('Sync failed:', err);
    } finally {
        const ind = document.getElementById('sync-indicator');
        if (ind) ind.remove();
    }
}

function markRead(id) {
    const readIds = JSON.parse(localStorage.getItem('adlil_read') || '[]');
    if (!readIds.includes(id)) {
        readIds.push(id);
        localStorage.setItem('adlil_read', JSON.stringify(readIds));
    }
}

async function testFCM() {
        //alert("1 - testFCM démarre ...");

    try {
        const permission = await Notification.requestPermission();
        //alert("2 - permission = " + permission);

        if (permission !== 'granted') {
            console.log('❌ Notifications refusées');
            return;
        }

        const registration = await navigator.serviceWorker.ready;
        //alert("3 - service worker OK");

        const token = await messaging.getToken({
            vapidKey: 'BPjhdG-Dm7svZ-boXobNX1cxRtDae-2WruRMynUsLCEf3qJ-RbF91BUSVhHhtPxBew7NHASQgdv4CD1-a7ROcM0',
            serviceWorkerRegistration: registration
        });

        console.log('✅ TOKEN FCM :', token);
        //alert("4 - TOKEN FCM :\n\n" + token);
    } catch (err) {
        //console.error('❌ Erreur FCM :', err);
        //alert("ERREUR FCM :\n\n" + err);
    }
}

testFCM();
//alert("VERSION TEST FCM : 14");