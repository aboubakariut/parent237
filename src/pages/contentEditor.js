import { navigate } from '../router.js';
import { pillars } from '../scenarios.js';
import {
  getCurrentProfile, fetchAllScenariosForEditor, upsertScenario, deleteScenario, signOut
} from '../supabase.js';
import { renderPendingNotice } from './pendingNotice.js';

let editingId = null; // null = formulaire vide (création)

export async function renderContentEditor(root) {
  root.innerHTML = `<div class="dash-loading"><p class="muted">Chargement…</p></div>`;

  const profile = await getCurrentProfile();
  if (!profile) { navigate('/connexion'); return; }
  if (profile.status !== 'valide') { renderPendingNotice(root, profile); return; }
  if (!['editeur', 'admin'].includes(profile.role)) {
    navigate(profile.role === 'admin' ? '/admin' : '/facilitateur');
    return;
  }

  const items = await fetchAllScenariosForEditor();
  const editing = editingId ? items.find(i => i.id === editingId) : null;

  root.innerHTML = `
    <div class="dash-screen">
      <header class="dash-header">
        <div>
          <div class="eyebrow">Espace éditeur</div>
          <h1>Publier un module</h1>
          <p class="muted">Connecté : ${profile.full_name || profile.role}</p>
        </div>
        <button class="link-btn" id="logoutBtn">Déconnexion</button>
      </header>

      ${profile.role === 'admin' ? `
        <div class="hero-actions" style="margin-bottom:16px;">
          <button class="btn btn-secondary" id="goAdmin"><i class="fa-solid fa-chart-line"></i> Voir le tableau de bord global</button>
          <button class="btn btn-secondary" id="goProfile"><i class="fa-solid fa-user-gear"></i> Mon profil</button>
        </div>
      ` : `
        <div class="hero-actions" style="margin-bottom:16px;">
          <button class="btn btn-secondary" id="goProfile"><i class="fa-solid fa-user-gear"></i> Mon profil</button>
        </div>
      `}

      <div class="card">
        <div class="eyebrow">${editing ? 'Modifier le module' : 'Nouveau module'}</div>
        <form id="scenarioForm" class="form-stack">
          <label class="field">
            <span>Identifiant unique (slug, sans espace)</span>
            <input name="id" required pattern="[a-z0-9-]+" placeholder="ex : sommeil-nourrisson"
              value="${editing?.id || ''}" ${editing ? 'readonly' : ''} />
          </label>
          <label class="field">
            <span>Pilier UNICEF</span>
            <select name="pillar" required>
              ${pillars.map(p => `<option value="${p.id}" ${editing?.pillar === p.id ? 'selected' : ''}>${p.icon} ${p.label}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span>Thème (titre affiché)</span>
            <input name="theme" required value="${editing?.theme || ''}" placeholder="ex : Le sommeil du nourrisson" />
          </label>
          <label class="field">
            <span>Niveau</span>
            <select name="level">
              <option value="1" ${editing?.level === 1 ? 'selected' : ''}>1 — débutant</option>
              <option value="2" ${editing?.level === 2 ? 'selected' : ''}>2 — intermédiaire</option>
              <option value="3" ${editing?.level === 3 ? 'selected' : ''}>3 — avancé</option>
            </select>
          </label>
          <label class="field">
            <span>Situation (texte affiché à l'écran)</span>
            <textarea name="situation" required rows="2">${editing?.situation || ''}</textarea>
          </label>
          <label class="field">
            <span>Narration (lue à voix haute)</span>
            <textarea name="narration" required rows="2">${editing?.narration || ''}</textarea>
          </label>

          <div class="eyebrow" style="margin-top:6px;">3 choix (un seul correct)</div>
          ${[0, 1, 2].map(i => {
            const c = editing?.choices?.[i] || {};
            return `
            <div class="choice-editor">
              <label class="field">
                <span>Choix ${i + 1} — texte</span>
                <input name="choice${i}_text" required value="${c.text || ''}" />
              </label>
              <label class="field">
                <span>Choix ${i + 1} — retour pédagogique</span>
                <textarea name="choice${i}_feedback" required rows="2">${c.feedback || ''}</textarea>
              </label>
              <label class="field-inline">
                <input type="radio" name="correctChoice" value="${i}" ${c.correct ? 'checked' : ''} required />
                <span>C'est la bonne réponse</span>
              </label>
            </div>
          `;
          }).join('')}

          <label class="field-inline">
            <input type="checkbox" name="published" ${editing ? (editing.published ? 'checked' : '') : 'checked'} />
            <span>Publié (visible immédiatement dans l'app parent)</span>
          </label>

          <p class="error-msg" id="formError" hidden></p>
          <div class="hero-actions">
            <button type="submit" class="btn btn-primary">${editing ? 'Enregistrer les modifications' : 'Publier le module'}</button>
            ${editing ? '<button type="button" class="btn btn-secondary" id="cancelEdit">Annuler</button>' : ''}
          </div>
        </form>
      </div>

      <div class="card">
        <div class="eyebrow">Modules existants (${items.length})</div>
        ${items.length ? `
          <table class="simple-table">
            <thead><tr><th>Thème</th><th>Pilier</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              ${items.map(s => `
                <tr>
                  <td>${s.theme}</td>
                  <td>${pillars.find(p => p.id === s.pillar)?.icon || ''}</td>
                  <td>${s.published ? '✅ publié' : '⏸️ brouillon'}</td>
                  <td>
                    <button class="link-btn" data-edit="${s.id}">Modifier</button>
                    <button class="link-btn" data-delete="${s.id}" style="color:var(--danger);">Supprimer</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<p class="muted">Aucun module pour le moment.</p>'}
      </div>
    </div>
  `;

  document.getElementById('logoutBtn').addEventListener('click', async () => { await signOut(); navigate('/'); });
  const goAdminBtn = document.getElementById('goAdmin');
  if (goAdminBtn) goAdminBtn.addEventListener('click', () => navigate('/admin'));
  document.getElementById('goProfile').addEventListener('click', () => navigate('/profil'));

  const cancelBtn = document.getElementById('cancelEdit');
  if (cancelBtn) cancelBtn.addEventListener('click', () => { editingId = null; renderContentEditor(root); });

  root.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => { editingId = btn.dataset.edit; renderContentEditor(root); });
  });
  root.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer définitivement ce module ?')) return;
      await deleteScenario(btn.dataset.delete);
      renderContentEditor(root);
    });
  });

  document.getElementById('scenarioForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const errorEl = document.getElementById('formError');
    errorEl.hidden = true;

    const correctIndex = Number(form.get('correctChoice'));
    const choices = [0, 1, 2].map(i => ({
      text: form.get(`choice${i}_text`),
      feedback: form.get(`choice${i}_feedback`),
      correct: i === correctIndex
    }));

    const payload = {
      id: form.get('id').trim(),
      pillar: form.get('pillar'),
      theme: form.get('theme'),
      level: Number(form.get('level')),
      situation: form.get('situation'),
      narration: form.get('narration'),
      choices,
      published: form.get('published') === 'on',
      updated_at: new Date().toISOString()
    };

    const result = await upsertScenario(payload);
    if (!result.ok) {
      errorEl.textContent = result.error || 'Erreur lors de la publication.';
      errorEl.hidden = false;
      return;
    }
    editingId = null;
    renderContentEditor(root);
  });
}
