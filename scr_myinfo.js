// Verrouille le champ téléphone du formulaire si le compte est vérifié par WhatsApp
function insAppliquerChamp(tel) {
  const champ = document.getElementById('f_telephone');
  if (!champ) return;
  if (tel) {
    champ.value = '+' + tel;
    champ.readOnly = true;
    champ.style.background = '#f0f2f5';
    champ.style.color = '#555';
  } else {
    champ.readOnly = false;
    champ.style.background = '';
    champ.style.color = '';
  }
}

async function insAppliquerTelephone() {
  insAppliquerChamp(localStorage.getItem('telVerifie'));     // tout de suite, même hors ligne

  const id = localStorage.getItem('monId');
  if (!id) return;
  const d = await insPost('/dev/moi', { id });
  if (!d.success) return;                                    // réseau absent : on garde l'état connu

  if (d.tel) localStorage.setItem('telVerifie', d.tel);
  else localStorage.removeItem('telVerifie');
  insAppliquerChamp(d.tel);

  // Le numéro vérifié passe dans le profil (utilisé par le QR code)
  if (d.tel) {
    const brut = localStorage.getItem('pwa_profile');
    if (brut) {
      try {
        const profil = JSON.parse(brut);
        if (profil.telephone !== '+' + d.tel) {
          profil.telephone = '+' + d.tel;
          localStorage.setItem('pwa_profile', JSON.stringify(profil));
        }
      } catch (e) { console.warn('Profil illisible', e); }
    }
  }
}