// Bandeau de message visible, injecté hors de #app pour survivre aux
// re-rendus de page. Utilisé pour CHAQUE action qui peut réussir ou échouer
// (connexion, sauvegarde, approbation...) — plus jamais d'échec silencieux.
let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.id = 'p237-toast-container';
  container.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
    display: flex; flex-direction: column; align-items: center;
    gap: 8px; padding: 12px; pointer-events: none;
  `;
  document.body.appendChild(container);
  return container;
}

export function showToast(message, { type = 'info', duration = 5000 } = {}) {
  const el = document.createElement('div');
  const colors = {
    error: { bg: '#C4553D', icon: 'fa-circle-exclamation' },
    success: { bg: '#6B9B5E', icon: 'fa-circle-check' },
    info: { bg: '#1B2A4A', icon: 'fa-circle-info' }
  };
  const c = colors[type] || colors.info;
  el.style.cssText = `
    pointer-events: auto;
    background: ${c.bg}; color: white;
    padding: 12px 18px; border-radius: 12px;
    font-family: 'Work Sans', system-ui, sans-serif; font-size: 0.92rem;
    max-width: 92vw; width: fit-content;
    box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    display: flex; align-items: center; gap: 10px;
    animation: p237-toast-in 0.2s ease;
  `;
  el.innerHTML = `<i class="fa-solid ${c.icon}"></i><span>${message}</span>`;

  const style = document.getElementById('p237-toast-style') || (() => {
    const s = document.createElement('style');
    s.id = 'p237-toast-style';
    s.textContent = `@keyframes p237-toast-in { from { opacity:0; transform: translateY(-8px); } to { opacity:1; transform: translateY(0); } }`;
    document.head.appendChild(s);
    return s;
  })();
  void style;

  ensureContainer().appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.2s ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  }, duration);
}

export const toastError = (msg, opts) => showToast(msg, { ...opts, type: 'error' });
export const toastSuccess = (msg, opts) => showToast(msg, { ...opts, type: 'success' });
