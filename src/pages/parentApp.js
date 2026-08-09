import { seedScenarios, languages, pillars } from '../scenarios.js';
import { drawScene } from '../canvasEngine.js';
import { renderBadge, shareBadge } from '../badge.js';
import { speak, stopSpeaking } from '../voice.js';
import { logCompletion, flushOfflineQueue, fetchPublishedScenarios } from '../supabase.js';
import { navigate } from '../router.js';
import { requestNotificationPermission, notifyLocal } from '../notifications.js';

let root;
let currentLang = localStorage.getItem('p237_lang') || 'fr';
let progress = JSON.parse(localStorage.getItem('p237_progress') || '{}');
let sceneCleanup = null;
let scenarios = seedScenarios; // valeur par défaut le temps du premier chargement

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

function shell(content, activeTab) {
  if (sceneCleanup) { sceneCleanup(); sceneCleanup = null; }
  stopSpeaking();
  root.innerHTML = `
    <div id="app-shell">
      <header class="appbar">
        <button class="icon-btn" id="homeLink" aria-label="Accueil du site"><i class="fa-solid fa-arrow-left"></i></button>
        <span class="logo-dot"></span>
        <strong>Parent+237</strong>
        <span class="offline-pill"><i class="fa-solid ${navigator.onLine ? 'fa-wifi' : 'fa-wifi-slash'}"></i> ${navigator.onLine ? 'En ligne' : 'Hors ligne · sauvegardé'}</span>
      </header>
      <main>${content}</main>
      <nav class="tabbar">
        <button data-tab="home" class="${activeTab === 'home' ? 'active' : ''}"><span class="icon"><i class="fa-solid fa-house"></i></span>Accueil</button>
        <button data-tab="parcours" class="${activeTab === 'parcours' ? 'active' : ''}"><span class="icon"><i class="fa-solid fa-compass"></i></span>Parcours</button>
        <button data-tab="badge" class="${activeTab === 'badge' ? 'active' : ''}"><span class="icon"><i class="fa-solid fa-award"></i></span>Mon badge</button>
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
  shell(`
    <div class="eyebrow">Bienvenue</div>
    <h1>Le coach parental accessible à tous</h1>
    <p class="muted">Un mini-parcours de 5 minutes par semaine. Fonctionne même sans connexion.</p>

    <div class="lang-row">
      ${languages.map(l => `<button class="lang-chip ${l.code === currentLang ? 'active' : ''}" data-lang="${l.code}">${l.label}</button>`).join('')}
    </div>

    <div class="card">
      <div class="eyebrow">Votre progression</div>
      <div class="stat-grid">
        <div class="stat"><div class="num">${completedCount}</div><div class="lbl">Modules terminés</div></div>
        <div class="stat"><div class="num">${scenarios.length - completedCount}</div><div class="lbl">À découvrir</div></div>
      </div>
    </div>

    <button class="btn btn-primary" id="startBtn">Commencer un module</button>
  `, 'home');

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
    <div class="eyebrow">Parcours</div>
    <h1>Choisissez un thème</h1>
    <p class="muted">Organisé selon les 4 piliers du Portail UNICEF consacré à la parentalité.</p>
    ${pillars.map(p => {
      const items = scenarios.filter(s => s.pillar === p.id);
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
  const s = scenarios.find(x => x.id === id);
  shell(`
    <div class="eyebrow">${s.theme}</div>
    <div class="scene-wrap">
      <canvas id="scene" width="480" height="320"></canvas>
    </div>
    <div class="card">
      <p>${s.situation}</p>
      <button class="btn btn-secondary" id="listenBtn"><i class="fa-solid fa-volume-high"></i> Écouter</button>
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
        <div class="eyebrow">${s.choices[pickedIndex].correct ? 'Bien vu' : 'On y réfléchit'}</div>
        <p>${s.choices[pickedIndex].feedback}</p>
        <button class="btn btn-primary" id="continueBtn">Continuer</button>
      </div>
    ` : ''}
  `, 'parcours');

  const canvas = document.getElementById('scene');
  sceneCleanup = drawScene(canvas, { mood });

  document.getElementById('listenBtn').addEventListener('click', () => speak(s.narration));

  if (pickedIndex === null) {
    root.querySelectorAll('#choices [data-i]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.i);
        const chosen = s.choices[i];
        screenScenario(id, chosen.correct ? 'calm' : 'tense', i);
        if (chosen.correct) {
          progress[id] = true;
          saveProgress();
          logCompletion({ scenarioId: s.id, theme: s.theme, lang: currentLang });
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
  const completedThemes = scenarios.filter(s => progress[s.id]).map(s => s.theme);
  const latestTheme = theme || completedThemes[completedThemes.length - 1] || 'Premier pas';
  shell(`
    <div class="eyebrow">Bravo</div>
    <h1>Votre certificat est prêt</h1>
    <div class="badge-preview">
      <canvas id="badgeCanvas" width="360" height="440"></canvas>
    </div>
    <button class="btn btn-primary" id="shareBtn"><i class="fa-brands fa-whatsapp"></i> Partager sur WhatsApp</button>
    <p class="muted" style="text-align:center; margin-top:10px;">Chaque partage aide un autre parent à découvrir Parent+237.</p>
  `, 'badge');

  const canvas = document.getElementById('badgeCanvas');
  renderBadge(canvas, {
    name: localStorage.getItem('p237_name') || 'Un parent de +237',
    theme: latestTheme,
    level: Object.keys(progress).length || 1
  });
  notifyLocal('Certificat prêt 🏅', { body: 'Votre certificat est prêt à être partagé sur WhatsApp.' });
  document.getElementById('shareBtn').addEventListener('click', () => shareBadge(canvas, { theme: latestTheme }));
}

const tabs = {
  home: screenHome,
  parcours: screenParcours,
  badge: () => screenBadge()
};

export async function renderParentApp(rootEl) {
  root = rootEl;
  flushOfflineQueue();
  root.innerHTML = `<div class="dash-loading"><p class="muted">Chargement des modules…</p></div>`;
  await loadScenarios();
  screenHome();
}
