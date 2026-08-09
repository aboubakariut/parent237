import { navigate } from '../router.js';
import {
  getCurrentProfile, getAggregatedStats, signOut,
  fetchPendingFacilitators, fetchApprovedFacilitators, setProfileStatus,
  fetchZones, createZone
} from '../supabase.js';
import { renderPendingNotice } from './pendingNotice.js';
import { renderProfileLoadError } from './profileLoadError.js';
import { subscribeToPush } from '../notifications.js';
import { toastSuccess, toastError } from '../toast.js';

export async function renderAdminDashboard(root) {
  root.innerHTML = `<div class="dash-loading"><p class="muted">Chargement…</p></div>`;

  const { profile, hasSession, error } = await getCurrentProfile();
  if (!hasSession) { navigate('/connexion'); return; }
  if (!profile) { renderProfileLoadError(root, error, () => renderAdminDashboard(root)); return; }

  // Verrou d'accès direct par URL : même un compte "admin" en base doit être
  // status='valide' pour accéder au dashboard (voir README > créer un admin).
  if (profile.status !== 'valide') { renderPendingNotice(root, profile); return; }

  if (profile.role !== 'admin') {
    navigate(profile.role === 'editeur' ? '/editeur' : '/facilitateur');
    return;
  }

  const [stats, pending, approved, zones] = await Promise.all([
    getAggregatedStats(),
    fetchPendingFacilitators(),
    fetchApprovedFacilitators(),
    fetchZones()
  ]);

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
        <button class="btn btn-secondary" id="goEditor"><i class="fa-solid fa-pen-to-square"></i> Gérer le contenu pédagogique</button>
        <button class="btn btn-secondary" id="goProfile"><i class="fa-solid fa-user-gear"></i> Mon profil</button>
        <button class="btn btn-secondary" id="notifyBtn"><i class="fa-solid fa-bell"></i> Alertes push (nouvelles demandes)</button>
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
      ` : `<div class="card"><p>Aucune donnée disponible, ou base non configurée.</p></div>`}

      <div class="card">
        <div class="eyebrow"><i class="fa-solid fa-user-clock"></i> Facilitateurs en attente d'approbation (${pending.length})</div>
        <p class="muted">Un compte en attente ne voit AUCUNE donnée tant qu'il n'est pas approuvé ici.</p>
        ${pending.length ? `
          <table class="simple-table">
            <thead><tr><th>Nom</th><th>Zone demandée</th><th></th></tr></thead>
            <tbody>
              ${pending.map(f => `
                <tr>
                  <td>${f.full_name || '—'}</td>
                  <td>${f.zone_code || '—'}</td>
                  <td>
                    <button class="link-btn" data-approve="${f.id}" style="color:var(--leaf);">
                      <i class="fa-solid fa-check"></i> Approuver
                    </button>
                    <button class="link-btn" data-reject="${f.id}" style="color:var(--danger);">
                      <i class="fa-solid fa-xmark"></i> Refuser
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<p class="muted">Aucune demande en attente.</p>'}
      </div>

      <div class="card">
        <div class="eyebrow"><i class="fa-solid fa-users"></i> Facilitateurs approuvés (${approved.length})</div>
        ${approved.length ? `
          <table class="simple-table">
            <thead><tr><th>Nom</th><th>Zone</th></tr></thead>
            <tbody>
              ${approved.map(f => `<tr><td>${f.full_name || '—'}</td><td>${f.zone_code || '—'}</td></tr>`).join('')}
            </tbody>
          </table>
        ` : '<p class="muted">Aucun facilitateur approuvé pour le moment.</p>'}
      </div>

      <div class="card">
        <div class="eyebrow"><i class="fa-solid fa-map-location-dot"></i> Zones officielles (${zones.length})</div>
        <p class="muted">Ce sont les seules zones proposées à l'inscription — personne ne peut en inventer une.</p>
        ${zones.length ? `
          <table class="simple-table">
            <thead><tr><th>Code</th><th>Libellé</th></tr></thead>
            <tbody>${zones.map(z => `<tr><td>${z.code}</td><td>${z.label}</td></tr>`).join('')}</tbody>
          </table>
        ` : '<p class="muted">Aucune zone définie.</p>'}
        <form id="zoneForm" class="form-stack" style="margin-top:14px;">
          <label class="field">
            <span>Code (ex : DLA-BONABERI-01)</span>
            <input name="code" required pattern="[A-Z0-9-]+" placeholder="DLA-BONABERI-01" />
          </label>
          <label class="field">
            <span>Libellé</span>
            <input name="label" required placeholder="Douala — Bonabéri" />
          </label>
          <p class="error-msg" id="zoneError" hidden></p>
          <button type="submit" class="btn btn-secondary"><i class="fa-solid fa-plus"></i> Ajouter la zone</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('logoutBtn').addEventListener('click', async () => { await signOut(); navigate('/'); });
  document.getElementById('goEditor').addEventListener('click', () => navigate('/editeur'));
  document.getElementById('goProfile').addEventListener('click', () => navigate('/profil'));
  document.getElementById('notifyBtn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    const result = await subscribeToPush();
    e.target.innerHTML = result.ok
      ? '<i class="fa-solid fa-check"></i> Alertes activées'
      : '<i class="fa-solid fa-xmark"></i> Indisponible sur cet appareil';
  });

  root.querySelectorAll('[data-approve]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const result = await setProfileStatus(btn.dataset.approve, 'valide');
      if (!result.ok) { toastError(result.error || "Échec de l'approbation."); return; }
      toastSuccess('Facilitateur approuvé.');
      renderAdminDashboard(root);
    });
  });
  root.querySelectorAll('[data-reject]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const result = await setProfileStatus(btn.dataset.reject, 'refuse');
      if (!result.ok) { toastError(result.error || "Échec du refus."); return; }
      toastSuccess('Demande refusée.');
      renderAdminDashboard(root);
    });
  });

  document.getElementById('zoneForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const errorEl = document.getElementById('zoneError');
    const result = await createZone({ code: form.get('code').trim().toUpperCase(), label: form.get('label') });
    if (!result.ok) {
      errorEl.textContent = result.error || "Erreur lors de l'ajout.";
      errorEl.hidden = false;
      toastError(result.error || "Erreur lors de l'ajout de la zone.");
      return;
    }
    toastSuccess('Zone ajoutée.');
    renderAdminDashboard(root);
  });
}
