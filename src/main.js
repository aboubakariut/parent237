import './style.css';
import { registerRoute, registerNotFound, startRouter, navigate } from './router.js';
import { renderLanding } from './pages/landing.js';
import { renderAuth } from './pages/auth.js';
import { renderParentApp } from './pages/parentApp.js';
import { renderFacilitatorDashboard } from './pages/facilitatorDashboard.js';
import { renderAdminDashboard } from './pages/adminDashboard.js';
import { renderContentEditor } from './pages/contentEditor.js';
import { renderProfile } from './pages/profile.js';

const root = document.getElementById('app');

registerRoute('/', () => renderLanding(root));
registerRoute('/connexion', () => renderAuth(root));
registerRoute('/app', () => renderParentApp(root));
registerRoute('/facilitateur', () => renderFacilitatorDashboard(root));
registerRoute('/admin', () => renderAdminDashboard(root));
registerRoute('/editeur', () => renderContentEditor(root));
registerRoute('/profil', () => renderProfile(root));
registerNotFound(() => navigate('/'));

startRouter();

// Enregistrement du service worker (offline-first).
// vite-plugin-pwa injecte automatiquement le script d'enregistrement dans le
// HTML buildé (injectRegister: 'auto', comportement par défaut) — pas besoin
// d'importer 'virtual:pwa-register' manuellement ici. Cet import direct
// provoquait une erreur CORS en production car le module virtuel n'est résolu
// qu'au moment du build, pas à l'exécution dans le navigateur.
