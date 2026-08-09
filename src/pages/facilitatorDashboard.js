import { navigate } from '../router.js';
import { getCurrentProfile, getAggregatedStats, signOut } from '../supabase.js';
import { renderPendingNotice } from './pendingNotice.js';

export async function renderFacilitatorDashboard(root) {
  root.innerHTML = `<div class="dash-loading"><p class="muted">Chargement de votre espace…</p></div>`;

  const profile = await getCurrentProfile();
  if (!profile) {
    navigate('/connexion');
    return;
  }

  // Verrou d'accès direct par URL : un compte non approuvé ne voit jamais le
  // dashboard, même s'il est authentifié et connaît la route.
  if (profile.status !== 'valide') {
    renderPendingNotice(root, profile);
    return;
  }

  if (profile.role === 'admin') {
    navigate('/admin');
    return;
  }
  if (profile.role === 'editeur') {
    navigate('/editeur');
    return;
  }

  const stats = await getAggregatedStats();

  root.innerHTML = `
    <div class="dash-screen">
      <header class="dash-header">
        <div>
          <div class="eyebrow">Espace facilitateur</div>
          <h1>${profile.full_name || 'Facilitateur'}</h1>
          <p class="muted">Zone : ${profile.zone_code || 'non renseignée'}</p>
        </div>
        <div class="hero-actions" style="gap:8px;">
          <button class="link-btn" id="profileBtn"><i class="fa-solid fa-user-gear"></i> Mon profil</button>
          <button class="link-btn" id="logoutBtn">Déconnexion</button>
        </div>
      </header>

      ${stats ? `
        <div class="card">
          <div class="eyebrow">Vue d'ensemble — votre zone</div>
          <div class="stat-grid">
            <div class="stat"><div class="num">${stats.total}</div><div class="lbl">Modules complétés</div></div>
            <div class="stat"><div class="num">${Object.keys(stats.byTheme).length}</div><div class="lbl">Thèmes couverts</div></div>
          </div>
        </div>
        <div class="card">
          <div class="eyebrow">Répartition par thème</div>
          <div class="stat-grid">
            ${Object.entries(stats.byTheme).map(([theme, n]) => `
              <div class="stat"><div class="num">${n}</div><div class="lbl">${theme}</div></div>
            `).join('') || '<p class="muted">Aucune donnée pour le moment.</p>'}
          </div>
        </div>
      ` : `
        <div class="card"><p>Aucune donnée disponible pour l'instant, ou base non configurée.</p></div>
      `}

      <button class="btn btn-secondary" id="backParent">Voir l'app parent</button>
    </div>
  `;

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await signOut();
    navigate('/');
  });
  document.getElementById('profileBtn').addEventListener('click', () => navigate('/profil'));
  document.getElementById('backParent').addEventListener('click', () => navigate('/app'));
}
