import './style.css';
import { registerRoute, registerNotFound, startRouter, navigate } from './router.js';
import { renderLanding } from './pages/landing.js';
import { renderAuth } from './pages/auth.js';
import { renderParentApp } from './pages/parentApp.js';
import { renderFacilitatorDashboard } from './pages/facilitatorDashboard.js';
import { renderAdminDashboard } from './pages/adminDashboard.js';
import { renderContentEditor } from './pages/contentEditor.js';

const root = document.getElementById('app');

registerRoute('/', () => renderLanding(root));
registerRoute('/connexion', () => renderAuth(root));
registerRoute('/app', () => renderParentApp(root));
registerRoute('/facilitateur', () => renderFacilitatorDashboard(root));
registerRoute('/admin', () => renderAdminDashboard(root));
registerRoute('/editeur', () => renderContentEditor(root));
registerNotFound(() => navigate('/'));

startRouter();

// Enregistrement du service worker généré par vite-plugin-pwa (offline-first)
if ('serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}
