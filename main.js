const form = document.getElementById('userForm');
const display = document.getElementById('displayArea');
const welcomeMsg = document.getElementById('welcome-msg');

// Éléments de navigation
const menuIcon = document.getElementById('menu-icon');
const sidebar = document.getElementById('sidebar');
const viewWelcome = document.getElementById('view-welcome');
const viewForm = document.getElementById('view-form');

// 1. Affichage au chargement
window.onload = () => {
  const savedName = localStorage.getItem('user_name') || "Invité";
  welcomeMsg.innerText = `Bienvenue, ${savedName}`;
};

// 2. Gestion du Menu (Toggle)
menuIcon.onclick = () => {
  sidebar.style.display = sidebar.style.display === 'none' ? 'block' : 'none';
};

// 3. Navigation entre les pages
document.getElementById('nav-welcome').onclick = () => {
  viewWelcome.style.display = 'block';
  viewForm.style.display = 'none';
  sidebar.style.display = 'none';
};

document.getElementById('nav-form').onclick = () => {
  viewWelcome.style.display = 'none';
  viewForm.style.display = 'block';
  sidebar.style.display = 'none';
};

// 4. Ton code de formulaire original (adapté)
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('username').value;
  
  localStorage.setItem('user_name', name);
  display.innerText = `Donnée mise à jour : ${name}`;
  welcomeMsg.innerText = `Bienvenue, ${name}`; // Met à jour l'accueil aussi
  form.reset();
});


