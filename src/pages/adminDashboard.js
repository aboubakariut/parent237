import { navigate } from '../router.js';
import { getCurrentProfile, getAggregatedStats, signOut, supabase } from '../supabase.js';

export async function renderAdminDashboard(root) {
  root.innerHTML = `<div class="dash-loading"><p class="muted">Chargement…</p></div>`;

  const profile = await getCurrentProfile();
  if (!profile) { navigate('/connexion'); return; }
  if (profile.role !== 'admin') {
    navigate(profile.role === 'editeur' ? '/editeur' : '/facilitateur');
    return;
  }

  const stats = await getAggregatedStats();
  const facilitators = await getFacilitators();

  root.innerHTML = `
    <div class="dash-screen">
      <header class="dash-header">
        <div>
          <div class="eyebrow">Espace administrateur</div>
          <h1>Vue d'ensemble du programme</h1>
          <p class="muted">Toutes zones confondues</p>
        </div>
        <button class="link-btn" id="logoutBtn">Déconnexion</button>
      </header>

      <div class="hero-actions" style="margin-bottom:16px;">
        <button class="btn btn-secondary" id="goEditor">📝 Gérer le contenu pédagogique</button>
      </div>

      ${stats ? `
        <div class="card">
          <div class="eyebrow">Impact global</div>
          <div class="stat-grid">
            <div class="stat"><div class="num">${stats.total}</div><div class="lbl">Modules complétés</div></div>
            <div class="stat"><div class="num">${Object.keys(stats.byZone).length}</div><div class="lbl">Zones actives</div></div>
          </div>
        </div>
        <div class="card">
          <div class="eyebrow">Par zone</div>
          <div class="stat-grid">
            ${Object.entries(stats.byZone).map(([zone, n]) => `
              <div class="stat"><div class="num">${n}</div><div class="lbl">${zone}</div></div>
            `).join('') || '<p class="muted">Aucune donnée.</p>'}
          </div>
        </div>
        <div class="card">
          <div class="eyebrow">Par thème</div>
          <div class="stat-grid">
            ${Object.entries(stats.byTheme).map(([theme, n]) => `
              <div class="stat"><div class="num">${n}</div><div class="lbl">${theme}</div></div>
            `).join('') || '<p class="muted">Aucune donnée.</p>'}
          </div>
        </div>
      ` : `<div class="card"><p>Aucune donnée disponible, ou base non configurée.</p></div>`}

      <div class="card">
        <div class="eyebrow">Facilitateurs inscrits</div>
        ${facilitators.length ? `
          <table class="simple-table">
            <thead><tr><th>Nom</th><th>Zone</th></tr></thead>
            <tbody>
              ${facilitators.map(f => `<tr><td>${f.full_name || '—'}</td><td>${f.zone_code || '—'}</td></tr>`).join('')}
            </tbody>
          </table>
        ` : '<p class="muted">Aucun facilitateur inscrit pour le moment.</p>'}
      </div>
    </div>
  `;

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await signOut();
    navigate('/');
  });
  document.getElementById('goEditor').addEventListener('click', () => navigate('/editeur'));
}

async function getFacilitators() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, zone_code, role')
    .eq('role', 'facilitateur');
  if (error || !data) return [];
  return data;
}
