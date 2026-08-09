import { navigate } from '../router.js';
import { signOut } from '../supabase.js';

// Cas distinct de "pas connecté" : la session existe, mais la lecture du
// profil a échoué (RLS, réseau, base pas encore migrée...). Avant, ce cas
// renvoyait silencieusement vers /connexion — ce qui donnait l'impression
// que la connexion elle-même échouait, sans aucune explication.
export function renderProfileLoadError(root, message, retry) {
  root.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card" style="text-align:center;">
        <div class="feature-icon" style="margin-bottom:10px;">
          <i class="fa-solid fa-triangle-exclamation" style="color:var(--danger);"></i>
        </div>
        <h1>Impossible de charger votre profil</h1>
        <p class="muted">Vous êtes bien connecté, mais la lecture de vos données a échoué :</p>
        <p class="error-msg" style="text-align:left; background:#FBE9E4; padding:10px 14px; border-radius:10px;">${message || 'Erreur inconnue'}</p>
        <div class="hero-actions" style="justify-content:center; margin-top:14px;">
          <button class="btn btn-primary" id="retryBtn"><i class="fa-solid fa-rotate-right"></i> Réessayer</button>
          <button class="btn btn-secondary" id="logoutBtn"><i class="fa-solid fa-right-from-bracket"></i> Déconnexion</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('retryBtn').addEventListener('click', () => retry());
  document.getElementById('logoutBtn').addEventListener('click', async () => { await signOut(); navigate('/'); });
}
