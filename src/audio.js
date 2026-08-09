// =====================================================================
// Lecture audio du contenu — MP3 d'abord, synthèse vocale en secours.
//
// Le code s'appuyait uniquement sur l'API Web Speech. Or beaucoup
// d'Android d'entrée de gamme n'ont aucune voix française installée, et
// AUCUN n'a de voix fulfuldé ou ewondo. La promesse « contenu audio en
// langue locale pour les non-lettrés » ne tenait donc pas techniquement.
//
// Ordre de résolution :
//   1. /audio/<lang>/<scenarioId>.mp3  — enregistrement humain, précaché
//      par le service worker, donc disponible hors ligne (swRuntime.js).
//   2. Synthèse vocale du navigateur, si et seulement si une voix de la
//      bonne langue existe réellement sur l'appareil.
//   3. Aucun son : on le DIT à l'utilisateur au lieu d'un bouton muet.
// =====================================================================

const BASE_AUDIO = '/audio';
let courant = null;

export function urlAudio(scenarioId, lang = 'fr') {
  return `${BASE_AUDIO}/${lang}/${scenarioId}.mp3`;
}

/** L'enregistrement existe-t-il (en cache ou en ligne) ? */
export async function audioDisponible(scenarioId, lang = 'fr') {
  try {
    const res = await fetch(urlAudio(scenarioId, lang), { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Une voix de synthèse existe-t-elle réellement pour cette langue ? */
export function voixDisponible(lang = 'fr') {
  if (!('speechSynthesis' in window)) return false;
  const voix = window.speechSynthesis.getVoices() || [];
  return voix.some((v) => (v.lang || '').toLowerCase().startsWith(lang.toLowerCase().slice(0, 2)));
}

export function arreter() {
  if (courant && typeof courant.pause === 'function') {
    courant.pause();
    courant.currentTime = 0;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  courant = null;
}

/**
 * Lit la narration. Retourne { ok, source: 'mp3' | 'tts' | 'aucun' } pour
 * que l'interface puisse afficher un message honnête plutôt qu'un bouton
 * qui ne produit aucun son.
 */
export async function lire({ scenarioId, texte, lang = 'fr', onEnd = () => {} }) {
  arreter();

  if (await audioDisponible(scenarioId, lang)) {
    const audio = new Audio(urlAudio(scenarioId, lang));
    audio.preload = 'auto';
    courant = audio;
    audio.addEventListener('ended', onEnd);
    try {
      await audio.play();
      return { ok: true, source: 'mp3' };
    } catch {
      // lecture bloquée par la politique d'autoplay : on tente la synthèse
    }
  }

  if (texte && voixDisponible(lang)) {
    const u = new SpeechSynthesisUtterance(texte);
    const cible = lang.slice(0, 2).toLowerCase();
    const voix = window.speechSynthesis.getVoices().find((v) => (v.lang || '').toLowerCase().startsWith(cible));
    if (voix) u.voice = voix;
    u.rate = 0.95;
    u.onend = onEnd;
    window.speechSynthesis.speak(u);
    return { ok: true, source: 'tts' };
  }

  return {
    ok: false,
    source: 'aucun',
    message: "L'audio n'est pas encore disponible dans cette langue sur cet appareil. Le texte reste lisible ci-dessous."
  };
}

/**
 * Précharge les enregistrements d'une liste de modules — bouton
 * « Préparer la sortie terrain » avant de partir en zone sans réseau.
 */
export async function preloadAudio(scenarioIds = [], langs = ['fr']) {
  if (!('caches' in window)) return { charges: 0, manquants: scenarioIds.length * langs.length };
  const cache = await caches.open('p237-audio');
  let charges = 0, manquants = 0;
  for (const lang of langs) {
    for (const id of scenarioIds) {
      try {
        await cache.add(urlAudio(id, lang));
        charges += 1;
      } catch {
        manquants += 1;   // enregistrement pas encore produit : normal en pilote
      }
    }
  }
  return { charges, manquants };
}
