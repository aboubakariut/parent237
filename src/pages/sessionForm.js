// =====================================================================
// Page « Nouvelle session » — transposition numérique de l'annexe
// « fiche de pointage / présence » du guide MINPROFF.
//
// Accessibilité intégrée dès la première ligne (critère du concours) :
// labels réels liés aux champs, groupes fieldset/legend, erreurs annoncées
// par aria-live, cibles tactiles larges, aucun message porté par la seule
// couleur, parcours entièrement réalisable au clavier.
// =====================================================================

import { saveSession, validateSession, listSessions, aggregateSessions } from '../sessions.js';
import { supabase } from '../supabase.js';

const CHAMPS = [
  { id: 'commune', label: 'Commune', type: 'text', autocomplete: 'address-level2', required: true },
  { id: 'localite', label: 'Localité / village', type: 'text', required: true },
  { id: 'groupe', label: 'Groupe ou promotion', type: 'text', required: true,
    aide: 'Le nom que les parents utilisent entre eux, par exemple « Groupe des mamans de Nkolbisson ».' },
  { id: 'tenue_le', label: 'Date de la session', type: 'date', required: true },
  { id: 'participants_total', label: 'Nombre total de participants', type: 'number', required: true, min: 0, max: 500 },
  { id: 'participants_femmes', label: 'Dont femmes', type: 'number', min: 0 },
  { id: 'participants_hommes', label: 'Dont hommes', type: 'number', min: 0 },
  { id: 'participants_handicap', label: 'Dont personnes en situation de handicap', type: 'number', min: 0,
    aide: 'Participants en situation de handicap, ou parents accompagnant un enfant en situation de handicap.' }
];

function champHtml(c) {
  const aide = c.aide ? `<p class="aide" id="${c.id}-aide">${c.aide}</p>` : '';
  const decrit = c.aide ? ` aria-describedby="${c.id}-aide ${c.id}-err"` : ` aria-describedby="${c.id}-err"`;
  const attrs = [
    `id="${c.id}"`, `name="${c.id}"`, `type="${c.type}"`,
    c.required ? 'required' : '',
    c.min !== undefined ? `min="${c.min}"` : '',
    c.max !== undefined ? `max="${c.max}"` : '',
    c.type === 'number' ? 'inputmode="numeric" step="1"' : '',
    c.autocomplete ? `autocomplete="${c.autocomplete}"` : ''
  ].filter(Boolean).join(' ');
  return `
    <div class="champ">
      <label for="${c.id}">${c.label}${c.required ? ' <span aria-hidden="true">*</span><span class="sr-only">(obligatoire)</span>' : ''}</label>
      ${aide}
      <input ${attrs}${decrit}>
      <p class="erreur" id="${c.id}-err" role="alert"></p>
    </div>`;
}

export async function renderSessionForm(container, { profile, modules = [] } = {}) {
  const aujourdhui = new Date().toISOString().slice(0, 10);

  container.innerHTML = `
    <section class="page" aria-labelledby="titre-session">
      <h1 id="titre-session">Enregistrer une session de formation</h1>
      <p class="intro">
        Cette fiche remplace le pointage papier. Elle fonctionne sans réseau :
        remplissez-la sur place, elle remontera automatiquement dès que la
        connexion revient.
      </p>

      <p class="statut-reseau" id="statut-reseau" role="status"></p>

      <form id="form-session" novalidate>
        <fieldset>
          <legend>Où et quand</legend>
          ${CHAMPS.slice(0, 4).map(champHtml).join('')}
        </fieldset>

        <fieldset>
          <legend>Module animé</legend>
          <div class="champ">
            <label for="module_id">Module du guide</label>
            <select id="module_id" name="module_id" aria-describedby="module_id-err">
              <option value="">— Choisir un module —</option>
              ${modules.map((m) => `<option value="${m.id}">${m.theme}</option>`).join('')}
              <option value="autre">Autre (préciser ci-dessous)</option>
            </select>
            <p class="erreur" id="module_id-err" role="alert"></p>
          </div>
          <div class="champ">
            <label for="module_libelle">Intitulé du module <span aria-hidden="true">*</span><span class="sr-only">(obligatoire)</span></label>
            <input id="module_libelle" name="module_libelle" type="text" required aria-describedby="module_libelle-err">
            <p class="erreur" id="module_libelle-err" role="alert"></p>
          </div>
        </fieldset>

        <fieldset>
          <legend>Participants</legend>
          ${CHAMPS.slice(4).map(champHtml).join('')}
        </fieldset>

        <fieldset>
          <legend>Observations</legend>
          <div class="champ">
            <label for="observations">Remarques du facilitateur</label>
            <p class="aide" id="observations-aide">
              Difficultés rencontrées, points à signaler. N'inscrivez jamais le nom
              d'un enfant ni une situation individuelle : utilisez le circuit
              d'orientation prévu.
            </p>
            <textarea id="observations" name="observations" rows="4"
                      maxlength="1000" aria-describedby="observations-aide"></textarea>
          </div>
        </fieldset>

        <button type="submit" class="btn-principal">Enregistrer la session</button>
        <p class="resultat" id="resultat" role="status" aria-live="polite"></p>
      </form>

      <h2>Dernières sessions de votre zone</h2>
      <div id="recap-sessions" aria-live="polite">Chargement…</div>
    </section>
  `;

  const form = container.querySelector('#form-session');
  const resultat = container.querySelector('#resultat');
  const statut = container.querySelector('#statut-reseau');
  form.tenue_le.value = aujourdhui;
  form.tenue_le.max = aujourdhui;

  const majReseau = () => {
    const enLigne = navigator.onLine !== false;
    statut.textContent = enLigne
      ? 'Connexion active : les fiches partent immédiatement.'
      : 'Hors ligne : la fiche sera conservée sur l’appareil et envoyée au retour du réseau.';
    statut.classList.toggle('hors-ligne', !enLigne);
  };
  majReseau();
  window.addEventListener('online', majReseau);
  window.addEventListener('offline', majReseau);

  // Le choix du module remplit l'intitulé, tout en le laissant modifiable.
  form.module_id.addEventListener('change', () => {
    const m = modules.find((x) => x.id === form.module_id.value);
    if (m) form.module_libelle.value = m.theme;
    if (form.module_id.value === 'autre') form.module_libelle.value = '';
  });

  const afficherErreurs = (errors) => {
    container.querySelectorAll('.erreur').forEach((p) => { p.textContent = ''; });
    container.querySelectorAll('input, select, textarea').forEach((el) => el.removeAttribute('aria-invalid'));
    const cles = Object.keys(errors);
    cles.forEach((k) => {
      const p = container.querySelector(`#${k}-err`);
      const el = form[k];
      if (p) p.textContent = errors[k];
      if (el) el.setAttribute('aria-invalid', 'true');
    });
    if (cles.length && form[cles[0]]) form[cles[0]].focus();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (data.module_id === 'autre') data.module_id = null;

    const check = validateSession(data);
    if (!check.valid) {
      afficherErreurs(check.errors);
      resultat.textContent = 'La fiche contient des erreurs : corrigez les champs signalés.';
      return;
    }
    afficherErreurs({});

    const bouton = form.querySelector('button[type="submit"]');
    bouton.disabled = true;
    bouton.textContent = 'Enregistrement…';

    const res = await saveSession(data, profile);

    bouton.disabled = false;
    bouton.textContent = 'Enregistrer la session';

    if (res.ok && res.queued) {
      resultat.textContent = 'Fiche enregistrée sur l’appareil. Elle partira automatiquement dès le retour du réseau.';
      form.reset();
      form.tenue_le.value = aujourdhui;
    } else if (res.ok) {
      resultat.textContent = 'Session enregistrée. Elle apparaît dès maintenant sur le tableau de bord.';
      form.reset();
      form.tenue_le.value = aujourdhui;
      chargerRecap();
    } else if (res.reason === 'no-zone') {
      resultat.textContent = 'Aucune zone n’est associée à votre compte. Contactez l’administrateur avant de saisir une session.';
    } else if (res.reason === 'not-authenticated') {
      resultat.textContent = 'Votre session a expiré. Reconnectez-vous, la fiche n’a pas été perdue.';
    } else {
      resultat.textContent = 'Enregistrement refusé par le serveur. Vérifiez que votre compte est bien approuvé.';
    }
  });

  async function chargerRecap() {
    const zone = container.querySelector('#recap-sessions');
    const rows = await listSessions({ limit: 20 });
    if (!rows.length) {
      zone.innerHTML = '<p>Aucune session enregistrée pour le moment.</p>';
      return;
    }
    const agg = aggregateSessions(rows);
    zone.innerHTML = `
      <p class="agg">
        <strong>${agg.sessions}</strong> session(s) · <strong>${agg.participants}</strong> participants ·
        <strong>${agg.localites}</strong> localité(s) · <strong>${agg.handicap}</strong> en situation de handicap
      </p>
      <table>
        <caption class="sr-only">Dernières sessions enregistrées dans votre zone</caption>
        <thead>
          <tr><th scope="col">Date</th><th scope="col">Localité</th><th scope="col">Module</th><th scope="col">Participants</th></tr>
        </thead>
        <tbody>
          ${rows.map((r) => `<tr>
            <td>${r.tenue_le}</td>
            <td>${r.commune} — ${r.localite}</td>
            <td>${r.module_libelle}</td>
            <td>${r.participants_total}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  if (supabase) chargerRecap();
}
