import { seedScenarios, languages, pillars } from '../scenarios.js';
import { drawScene } from '../canvasEngine.js';
import { renderBadge, shareBadge } from '../badge.js';
import { speak, stopSpeaking } from '../voice.js';
import { logCompletion, flushOfflineQueue, fetchPublishedScenarios, fetchZones, upsertParentProfile, getDeviceId } from '../supabase.js';
import { navigate } from '../router.js';
import { requestNotificationPermission, notifyLocal } from '../notifications.js';
import { toastError, toastSuccess } from '../toast.js';
import { t, isTranslationPending, voiceLangTag, localizeScenario } from '../i18n.js';

let root;
let currentLang = localStorage.getItem('p237_lang') || 'fr';
let progress = JSON.parse(localStorage.getItem('p237_progress') || '{}');
let sceneCleanup = null;
let scenarios = seedScenarios; // valeur par défaut le temps du premier chargement

function tr(key) { return t(key, currentLang); }

function getParentProfile() {
  return {
    name: localStorage.getItem('p237_parent_name') || '',
    phone: localStorage.getItem('p237_parent_phone') || '',
    zone: localStorage.getItem('p237_parent_zone') || ''
  };
}

function saveParentProfileLocal({ name, phone, zone }) {
  localStorage.setItem('p237_parent_name', name);
  localStorage.setItem('p237_parent_phone', phone || '');
  localStorage.setItem('p237_parent_zone', zone || '');
}

// Le contenu réel vit en base (table `scenarios`, gérée par l'Éditeur).
// On le met en cache localement pour qu'il reste disponible hors-ligne après
// la première visite ; sans base configurée ou hors-ligne au 1er lancement,
// on retombe sur le contenu embarqué (seedScenarios).
async function loadScenarios() {
  const remote = await fetchPublishedScenarios();
  if (remote && remote.length) {
    scenarios = remote;
    localStorage.setItem('p237_scenarios_cache', JSON.stringify(remote));
    return;
  }
  const cached = localStorage.getItem('p237_scenarios_cache');
  scenarios = cached ? JSON.parse(cached) : seedScenarios;
}

function saveProgress() {
  localStorage.setItem('p237_progress', JSON.stringify(progress));
}

// Bandeau honnête pour les langues pas encore traduites (fulfulde, ewondo) :
// on affiche quand même l'app (en français) plutôt que de la bloquer, mais on
// le dit clairement au lieu de faire semblant que c'est traduit.
function pendingLangBanner() {
  if (!isTranslationPending(currentLang)) return '';
  const langLabel = languages.find(l => l.code === currentLang)?.label || currentLang;
  return `
    <div class="card" style="background:#FFF7E6; border:1px solid #F0DBA6;">
      <p style="margin:0; font-size:0.86rem;">
        <i class="fa-solid fa-language" style="color:var(--gold-deep);"></i>
        La traduction en <strong>${langLabel}</strong> est en préparation, en attente de validation
        par un locuteur natif. En attendant, le contenu s'affiche en français.
      </p>
    </div>
  `;
}

function shell(content, activeTab) {
  if (sceneCleanup) { sceneCleanup(); sceneCleanup = null; }
  stopSpeaking();
  root.innerHTML = `
    <div id="app-shell">
      <header class="appbar">
        <button class="icon-btn" id="homeLink" aria-label="Accueil du site"><i class="fa-solid fa-arrow-left"></i></button>
        <span class="logo-dot"></span>
        <strong>Parent+237</strong>
        <span class="offline-pill"><i class="fa-solid ${navigator.onLine ? 'fa-wifi' : 'fa-wifi-slash'}"></i> ${navigator.onLine ? tr('online') : tr('offline')}</span>
      </header>
      <main>${content}</main>
      <nav class="tabbar">
        <button data-tab="home" class="${activeTab === 'home' ? 'active' : ''}"><span class="icon"><i class="fa-solid fa-house"></i></span>${tr('nav_home')}</button>
        <button data-tab="parcours" class="${activeTab === 'parcours' ? 'active' : ''}"><span class="icon"><i class="fa-solid fa-compass"></i></span>${tr('nav_journey')}</button>
        <button data-tab="badge" class="${activeTab === 'badge' ? 'active' : ''}"><span class="icon"><i class="fa-solid fa-award"></i></span>${tr('nav_badge')}</button>
      </nav>
    </div>
  `;
  root.querySelector('#homeLink').addEventListener('click', () => navigate('/'));
  root.querySelectorAll('.tabbar button').forEach(btn => {
    btn.addEventListener('click', () => tabs[btn.dataset.tab]());
  });
}

function screenHome() {
  const completedCount = Object.keys(progress).length;
  const parent = getParentProfile();
  shell(`
    <div class="eyebrow">${tr('welcome')}${parent.name ? ', ' + parent.name.split(' ')[0] : ''}</div>
    <h1>${tr('app_title')}</h1>
    <p class="muted">${tr('app_tagline')}</p>

    <div class="lang-row">
      ${languages.map(l => `<button class="lang-chip ${l.code === currentLang ? 'active' : ''}" data-lang="${l.code}">${l.label}</button>`).join('')}
    </div>

    ${pendingLangBanner()}

    <div class="card">
      <div class="eyebrow">${tr('progress_label')}</div>
      <div class="stat-grid">
        <div class="stat"><div class="num">${completedCount}</div><div class="lbl">${tr('modules_done')}</div></div>
        <div class="stat"><div class="num">${scenarios.length - completedCount}</div><div class="lbl">${tr('modules_todo')}</div></div>
      </div>
    </div>

    <button class="btn btn-primary" id="startBtn">${tr('start_module')}</button>
    <button class="link-btn" id="editInfoBtn" style="display:block; margin:12px auto 0;">
      <i class="fa-solid fa-user-pen"></i> ${tr('edit_info')}
    </button>
  `, 'home');

  document.getElementById('editInfoBtn').addEventListener('click', async () => {
    const zones = await fetchZones();
    screenOnboarding(zones);
  });
  root.querySelectorAll('.lang-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      currentLang = chip.dataset.lang;
      localStorage.setItem('p237_lang', currentLang);
      screenHome();
    });
  });
  document.getElementById('startBtn').addEventListener('click', screenParcours);
}

function screenParcours() {
  shell(`
    <div class="eyebrow">${tr('nav_journey')}</div>
    <h1>${tr('choose_theme')}</h1>
    <p class="muted">${tr('taxonomy_note')}</p>
    ${pendingLangBanner()}
    ${pillars.map(p => {
      const items = scenarios.filter(s => s.pillar === p.id).map(s => localizeScenario(s, currentLang));
      if (!items.length) return '';
      return `
        <div class="pillar-block">
          <div class="pillar-title"><i class="fa-solid ${p.icon}"></i> ${p.label}</div>
          <div class="btn-stack">
            ${items.map(s => `
              <button class="btn btn-choice" data-id="${s.id}">
                ${progress[s.id] ? '<i class="fa-solid fa-circle-check" style="color:var(--leaf);"></i> ' : ''}${s.theme}
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }).join('')}
  `, 'parcours');

  root.querySelectorAll('[data-id]').forEach(btn => {
    btn.addEventListener('click', () => screenScenario(btn.dataset.id));
  });
}

function screenScenario(id, mood = 'tense', pickedIndex = null) {
  const base = scenarios.find(x => x.id === id);
  const s = localizeScenario(base, currentLang);
  shell(`
    <div class="eyebrow">${s.theme}</div>
    <div class="scene-wrap">
      <canvas id="scene" width="480" height="320"></canvas>
    </div>
    <div class="card">
      <p>${s.situation}</p>
      <button class="btn btn-secondary" id="listenBtn"><i class="fa-solid fa-volume-high"></i> ${tr('listen')}</button>
    </div>
    <div class="btn-stack" id="choices">
      ${s.choices.map((c, i) => `
        <button class="btn btn-choice ${pickedIndex === i ? (c.correct ? 'correct' : 'wrong') : ''}" data-i="${i}" ${pickedIndex !== null ? 'disabled' : ''}>
          ${c.text}
        </button>
      `).join('')}
    </div>
    ${pickedIndex !== null ? `
      <div class="card">
        <div class="eyebrow">${s.choices[pickedIndex].correct ? tr('well_done') : tr('lets_think')}</div>
        <p>${s.choices[pickedIndex].feedback}</p>
        <button class="btn btn-primary" id="continueBtn">${tr('continue_btn')}</button>
      </div>
    ` : ''}
  `, 'parcours');

  const canvas = document.getElementById('scene');
  sceneCleanup = drawScene(canvas, { mood });

  document.getElementById('listenBtn').addEventListener('click', () => speak(s.narration, voiceLangTag(currentLang)));

  if (pickedIndex === null) {
    root.querySelectorAll('#choices [data-i]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.i);
        const chosen = s.choices[i];
        screenScenario(id, chosen.correct ? 'calm' : 'tense', i);
        if (chosen.correct) {
          progress[id] = true;
          saveProgress();
          const parent = getParentProfile();
          // On journalise toujours le thème en français (base.theme) pour que
          // les agrégats du dashboard restent cohérents quelle que soit la
          // langue d'affichage du parent.
          logCompletion({ scenarioId: base.id, theme: base.theme, lang: currentLang, zoneCode: parent.zone || undefined });
          requestNotificationPermission().then((granted) => {
            if (granted) notifyLocal('Module terminé 🎉', { body: `Bravo, vous avez terminé « ${s.theme} ».` });
          });
        }
      });
    });
  } else {
    document.getElementById('continueBtn').addEventListener('click', () => {
      if (progress[id]) {
        screenBadge(s.theme);
      } else {
        screenParcours();
      }
    });
  }
}

function screenBadge(theme) {
  const completedThemes = scenarios.filter(s => progress[s.id]).map(s => localizeScenario(s, currentLang).theme);
  const latestTheme = theme || completedThemes[completedThemes.length - 1] || 'Premier pas';
  shell(`
    <div class="eyebrow">${tr('congrats_eyebrow')}</div>
    <h1>${tr('certificate_ready')}</h1>
    <div class="badge-preview">
      <canvas id="badgeCanvas" width="360" height="440"></canvas>
    </div>
    <button class="btn btn-primary" id="shareBtn"><i class="fa-brands fa-whatsapp"></i> ${tr('share_whatsapp')}</button>
    <p class="muted" style="text-align:center; margin-top:10px;">${tr('share_note')}</p>
  `, 'badge');

  const canvas = document.getElementById('badgeCanvas');
  const parent = getParentProfile();
  renderBadge(canvas, {
    name: parent.name || 'Un parent de +237',
    theme: latestTheme,
    level: Object.keys(progress).length || 1
  });
  notifyLocal('Certificat prêt 🏅', { body: 'Votre certificat est prêt à être partagé sur WhatsApp.' });
  document.getElementById('shareBtn').addEventListener('click', () => shareBadge(canvas, { theme: latestTheme }));
}

function screenOnboarding(zones) {
  const existing = getParentProfile();
  const isEditing = !!existing.name;
  root.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="eyebrow">${isEditing ? tr('onboarding_edit_title') : tr('welcome')}</div>
        <h1>${isEditing ? tr('onboarding_edit_title') : tr('onboarding_title')}</h1>
        <p class="muted">${tr('onboarding_note')}</p>
        <form id="onboardForm" class="form-stack">
          <label class="field">
            <span>${tr('name_label')}</span>
            <input type="text" name="name" required placeholder="Ex : Marie Etoundi" value="${existing.name}" />
          </label>
          <label class="field">
            <span>${tr('phone_label')}</span>
            <input type="tel" name="phone" required placeholder="Ex : 6XX XX XX XX" value="${existing.phone}" />
          </label>
          <label class="field">
            <span>${tr('region_label')}</span>
            <select name="zone" ${zones.length ? 'required' : 'disabled'}>
              <option value="" ${existing.zone ? '' : 'disabled selected'}>${zones.length ? tr('region_placeholder') : tr('region_none')}</option>
              ${zones.map(z => `<option value="${z.code}" ${existing.zone === z.code ? 'selected' : ''}>${z.label}</option>`).join('')}
            </select>
          </label>
          <button type="submit" class="btn btn-primary"><i class="fa-solid fa-arrow-right"></i> ${isEditing ? tr('save_btn') : tr('start_btn')}</button>
          ${isEditing ? `<button type="button" class="link-btn" id="cancelEdit">${tr('cancel_btn')}</button>` : ''}
        </form>
      </div>
    </div>
  `;

  const cancelBtn = document.getElementById('cancelEdit');
  if (cancelBtn) cancelBtn.addEventListener('click', () => screenHome());

  document.getElementById('onboardForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const name = form.get('name').trim();
    const phone = form.get('phone').trim();
    const zone = form.get('zone') || '';

    saveParentProfileLocal({ name, phone, zone });

    const result = await upsertParentProfile({ deviceId: getDeviceId(), fullName: name, phone, zoneCode: zone });
    if (!result.ok) {
      // On ne bloque JAMAIS l'usage de l'app pour un souci réseau : le profil
      // est déjà sauvegardé en local, on informe juste que la synchro attend.
      toastError(`Profil enregistré localement (synchro en attente : ${result.error}).`);
    } else {
      toastSuccess('Bienvenue sur Parent+237 !');
    }
    screenHome();
  });
}

const tabs = {
  home: screenHome,
  parcours: screenParcours,
  badge: () => screenBadge()
};

export async function renderParentApp(rootEl) {
  root = rootEl;
  flushOfflineQueue();
  root.innerHTML = `<div class="dash-loading"><p class="muted">Chargement…</p></div>`;
  await loadScenarios();

  const parent = getParentProfile();
  if (!parent.name) {
    const zones = await fetchZones();
    screenOnboarding(zones);
    return;
  }
  screenHome();
}
