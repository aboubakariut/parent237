import { navigate } from '../router.js';
import { getPublicCompletionCount } from '../supabase.js';
import { drawScene } from '../canvasEngine.js';

export async function renderLanding(root) {
  root.innerHTML = `
    <div class="landing">
      <header class="landing-nav">
        <div class="brand"><span class="logo-dot"></span><strong>Parent+237</strong></div>
        <button class="link-btn" id="navLogin">Espace facilitateur</button>
      </header>

      <section class="hero">
        <div class="eyebrow">UNICEF Cameroon × MINPROFF</div>
        <h1>Le coach parental accessible à tous, même hors ligne.</h1>
        <p class="lead">Des mini-parcours de 5 minutes pour accompagner chaque parent, dans son quartier
          comme dans les zones les plus enclavées — sans compte, sans connexion permanente.</p>
        <div class="hero-actions">
          <button class="btn btn-primary" id="ctaStart">Commencer comme parent</button>
          <button class="btn btn-secondary" id="ctaFacilitator">Je suis facilitateur</button>
        </div>
        <div class="scene-wrap hero-scene">
          <canvas id="heroScene" width="480" height="260"></canvas>
        </div>
      </section>

      <section class="stats-band" id="statsBand">
        <div class="stat"><div class="num" id="statCount">—</div><div class="lbl">Modules déjà complétés</div></div>
        <div class="stat"><div class="num">100%</div><div class="lbl">Disponible hors ligne</div></div>
        <div class="stat"><div class="num">4</div><div class="lbl">Langues au pilote</div></div>
      </section>

      <section class="features">
        <div class="feature-card">
          <div class="feature-icon">🎭</div>
          <h3>Situations vécues, pas des textes à lire</h3>
          <p>Scènes animées et narration audio : accessible même aux parents peu alphabétisés.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">📶</div>
          <h3>Pensé pour le réseau faible</h3>
          <p>L'app s'installe et continue de fonctionner sans connexion, une fois ouverte une première fois.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">💬</div>
          <h3>Diffusion communautaire</h3>
          <p>Chaque parent qui termine un module peut le partager en un geste sur WhatsApp.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">📊</div>
          <h3>Suivi pour les facilitateurs</h3>
          <p>Un tableau de bord anonymisé, filtré par zone, pour mesurer l'impact réel du programme.</p>
        </div>
      </section>

      <footer class="landing-footer">
        <p class="muted">Prototype développé pour le Concours d'Innovation « Parentalité Positive ».</p>
      </footer>
    </div>
  `;

  const canvas = document.getElementById('heroScene');
  drawScene(canvas, { mood: 'calm' });

  document.getElementById('ctaStart').addEventListener('click', () => navigate('/app'));
  document.getElementById('ctaFacilitator').addEventListener('click', () => navigate('/connexion'));
  document.getElementById('navLogin').addEventListener('click', () => navigate('/connexion'));

  const count = await getPublicCompletionCount();
  const el = document.getElementById('statCount');
  if (el) el.textContent = count === null ? '—' : count;
}
