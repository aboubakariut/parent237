import { navigate } from '../router.js';
import { signIn, signUpFacilitator, getCurrentProfile, fetchZones } from '../supabase.js';
import { renderPendingNotice } from './pendingNotice.js';

let mode = 'login'; // 'login' | 'signup'

export async function renderAuth(root) {
  const zones = mode === 'signup' ? await fetchZones() : [];
  root.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="eyebrow">Espace pro</div>
        <h1>${mode === 'login' ? 'Connexion facilitateur' : 'Créer un compte facilitateur'}</h1>
        <p class="muted">Réservé aux facilitateurs et administrateurs du programme. Les parents n'ont pas
          besoin de compte.</p>

        <div class="tab-switch">
          <button class="tab-btn ${mode === 'login' ? 'active' : ''}" data-mode="login">Connexion</button>
          <button class="tab-btn ${mode === 'signup' ? 'active' : ''}" data-mode="signup">Inscription</button>
        </div>

        <form id="authForm" class="form-stack">
          ${mode === 'signup' ? `
            <label class="field">
              <span>Nom complet</span>
              <input type="text" name="fullName" required placeholder="Ex : Awa Ngo Bakoa" />
            </label>
            <label class="field">
              <span>Zone d'intervention ${zones.length ? '' : '(optionnel — aucune zone configurée pour le moment)'}</span>
              <select name="zoneCode" ${zones.length ? 'required' : ''} ${!zones.length ? 'disabled' : ''}>
                <option value="" ${zones.length ? 'disabled selected' : 'selected'}>${zones.length ? 'Choisissez votre zone' : 'Aucune zone disponible'}</option>
                ${zones.map(z => `<option value="${z.code}">${z.label}</option>`).join('')}
              </select>
              ${!zones.length ? `
                <span class="muted" style="font-weight:400;">
                  Aucune zone n'existe encore en base. Votre compte sera créé sans zone — un
                  administrateur pourra vous en assigner une plus tard depuis /admin.
                  (Si vous créez le tout premier compte admin, c'est normal et sans conséquence :
                  ce champ ne sert plus une fois le compte élevé en admin.)
                </span>
              ` : ''}
            </label>
            <p class="muted" style="margin-top:-6px;">
              Votre compte sera <strong>en attente</strong> jusqu'à validation par un administrateur
              du programme — c'est volontaire, pour vérifier chaque facilitateur avant de lui
              donner accès aux données de sa zone.
            </p>
          ` : ''}
          <label class="field">
            <span>Email</span>
            <input type="email" name="email" required placeholder="vous@exemple.cm" />
          </label>
          <label class="field">
            <span>Mot de passe</span>
            <input type="password" name="password" required minlength="6" placeholder="6 caractères minimum" />
          </label>
          <p class="error-msg" id="authError" hidden></p>
          <button type="submit" class="btn btn-primary">${mode === 'login' ? 'Se connecter' : "S'inscrire"}</button>
        </form>

        <button class="link-btn" id="backHome"><i class="fa-solid fa-arrow-left"></i> Retour à l'accueil</button>
      </div>
    </div>
  `;

  root.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => { mode = btn.dataset.mode; renderAuth(root); });
  });

  document.getElementById('backHome').addEventListener('click', () => navigate('/'));

  document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const errorEl = document.getElementById('authError');
    errorEl.hidden = true;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Un instant…';

    let result;
    if (mode === 'login') {
      result = await signIn({ email: form.get('email'), password: form.get('password') });
    } else {
      result = await signUpFacilitator({
        email: form.get('email'),
        password: form.get('password'),
        fullName: form.get('fullName'),
        zoneCode: form.get('zoneCode') || null
      });
    }

    if (!result.ok) {
      errorEl.textContent = result.error || "Une erreur est survenue.";
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'login' ? 'Se connecter' : "S'inscrire";
      return;
    }

    if (result.needsEmailConfirm) {
      errorEl.style.color = 'var(--leaf)';
      errorEl.textContent = "Compte créé. Vérifiez votre email pour confirmer avant de vous connecter.";
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "S'inscrire";
      return;
    }

    const profile = await getCurrentProfile();

    // Un compte 'en_attente' n'a accès à aucune donnée réelle (verrouillé côté
    // base par RLS) — on l'informe clairement plutôt que de l'envoyer sur un
    // dashboard vide, ce qui serait confus.
    if (profile && profile.status !== 'valide') {
      renderPendingNotice(root, profile);
      return;
    }

    const destination = profile?.role === 'admin' ? '/admin'
      : profile?.role === 'editeur' ? '/editeur'
      : '/facilitateur';
    navigate(destination);
  });
}
