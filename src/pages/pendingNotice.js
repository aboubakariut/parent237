import { navigate } from '../router.js';

// Utilisé par toutes les pages protégées (facilitateur, éditeur, admin) quand
// un compte connecté n'a pas (ou plus) le statut 'valide'. Empêche l'accès
// direct par URL à un dashboard, même pour un compte authentifié.
export function renderPendingNotice(root, profile) {
  const isRefused = profile.status === 'refuse';
  root.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card" style="text-align:center;">
        <div class="feature-icon" style="margin-bottom:10px;">
          <i class="fa-solid ${isRefused ? 'fa-circle-xmark' : 'fa-hourglass-half'}" style="color:${isRefused ? 'var(--danger)' : 'var(--gold-deep)'};"></i>
        </div>
        <h1>${isRefused ? 'Compte non validé' : 'Compte en attente de validation'}</h1>
        <p class="muted">
          ${isRefused
            ? "Votre inscription n'a pas été validée par un administrateur du programme. Contactez votre point focal MINPROFF pour plus d'informations."
            : "Un administrateur du programme doit vérifier votre identité avant de vous donner accès aux données réelles. Cela ne prend généralement pas longtemps."}
        </p>
        <button class="btn btn-secondary" id="pendingBack" style="margin-top:14px;">
          <i class="fa-solid fa-arrow-left"></i> Retour à l'accueil
        </button>
      </div>
    </div>
  `;
  document.getElementById('pendingBack').addEventListener('click', () => navigate('/'));
}
