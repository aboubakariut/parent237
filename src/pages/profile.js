import { navigate } from '../router.js';
import {
  getCurrentProfile, getCurrentEmail, updateOwnProfile, changePassword,
  fetchZones, signOut
} from '../supabase.js';
import { renderProfileLoadError } from './profileLoadError.js';
import { toastSuccess, toastError } from '../toast.js';

export async function renderProfile(root) {
  root.innerHTML = `<div class="dash-loading"><p class="muted">Chargement…</p></div>`;

  const { profile, hasSession, error } = await getCurrentProfile();
  if (!hasSession) { navigate('/connexion'); return; }
  if (!profile) { renderProfileLoadError(root, error, () => renderProfile(root)); return; }

  const [email, zones] = await Promise.all([getCurrentEmail(), fetchZones()]);

  const statusLabel = {
    en_attente: 'En attente de validation',
    valide: 'Compte validé',
    refuse: 'Compte non validé'
  }[profile.status] || profile.status;

  const roleLabel = { facilitateur: 'Facilitateur', editeur: 'Éditeur', admin: 'Administrateur' }[profile.role] || profile.role;

  root.innerHTML = `
    <div class="dash-screen">
      <header class="dash-header">
        <div>
          <div class="eyebrow">Mon profil</div>
          <h1>${profile.full_name || 'Compte pro'}</h1>
          <p class="muted">${roleLabel} · ${statusLabel}</p>
        </div>
        <button class="link-btn" id="backBtn"><i class="fa-solid fa-arrow-left"></i> Retour</button>
      </header>

      <div class="card">
        <div class="eyebrow">Informations</div>
        <form id="infoForm" class="form-stack">
          <label class="field">
            <span>Email</span>
            <input type="email" value="${email || ''}" disabled />
          </label>
          <label class="field">
            <span>Nom complet</span>
            <input type="text" name="full_name" value="${profile.full_name || ''}" required />
          </label>
          ${profile.role === 'facilitateur' ? `
            <label class="field">
              <span>Zone d'intervention</span>
              <select name="zone_code">
                <option value="">Aucune</option>
                ${zones.map(z => `<option value="${z.code}" ${profile.zone_code === z.code ? 'selected' : ''}>${z.label}</option>`).join('')}
              </select>
            </label>
          ` : ''}
          <p class="error-msg" id="infoError" hidden></p>
          <p class="muted" id="infoSuccess" style="color:var(--leaf); font-weight:600;" hidden><i class="fa-solid fa-check"></i> Modifications enregistrées.</p>
          <button type="submit" class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button>
        </form>
      </div>

      <div class="card">
        <div class="eyebrow">Sécurité</div>
        <form id="passwordForm" class="form-stack">
          <label class="field">
            <span>Nouveau mot de passe</span>
            <input type="password" name="newPassword" minlength="6" required placeholder="6 caractères minimum" />
          </label>
          <p class="error-msg" id="pwError" hidden></p>
          <p class="muted" id="pwSuccess" style="color:var(--leaf); font-weight:600;" hidden><i class="fa-solid fa-check"></i> Mot de passe mis à jour.</p>
          <button type="submit" class="btn btn-secondary"><i class="fa-solid fa-key"></i> Changer le mot de passe</button>
        </form>
      </div>

      <button class="btn btn-secondary" id="logoutBtn"><i class="fa-solid fa-right-from-bracket"></i> Déconnexion</button>
    </div>
  `;

  document.getElementById('backBtn').addEventListener('click', () => {
    const dest = profile.role === 'admin' ? '/admin' : profile.role === 'editeur' ? '/editeur' : '/facilitateur';
    navigate(dest);
  });
  document.getElementById('logoutBtn').addEventListener('click', async () => { await signOut(); navigate('/'); });

  document.getElementById('infoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const errorEl = document.getElementById('infoError');
    const successEl = document.getElementById('infoSuccess');
    errorEl.hidden = true; successEl.hidden = true;
    const result = await updateOwnProfile({
      full_name: form.get('full_name'),
      zone_code: form.get('zone_code')
    });
    if (!result.ok) { errorEl.textContent = result.error; errorEl.hidden = false; toastError(result.error); return; }
    successEl.hidden = false;
    toastSuccess('Profil mis à jour.');
  });

  document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const errorEl = document.getElementById('pwError');
    const successEl = document.getElementById('pwSuccess');
    errorEl.hidden = true; successEl.hidden = true;
    const result = await changePassword(form.get('newPassword'));
    if (!result.ok) { errorEl.textContent = result.error; errorEl.hidden = false; toastError(result.error); return; }
    e.target.reset();
    successEl.hidden = false;
    toastSuccess('Mot de passe mis à jour.');
  });
}
