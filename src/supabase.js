import { createClient } from '@supabase/supabase-js';

// La clé "anon" de Supabase est CONÇUE pour être publique — elle n'a aucun pouvoir
// tant que les policies RLS (Row Level Security) sont bien configurées côté BD.
// Ce n'est donc pas l'obfuscation du build qui protège les données : c'est la
// configuration SQL (voir README > "Sécurité réelle").
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Identifiant anonyme stable par appareil, stocké en local (pas de compte requis).
function getDeviceId() {
  let id = localStorage.getItem('p237_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('p237_device_id', id);
  }
  return id;
}

export async function logCompletion({ scenarioId, theme, zoneCode = 'non-renseigne', lang = 'fr' }) {
  if (!supabase) return { ok: false, reason: 'offline-no-config' };
  const payload = {
    device_id: getDeviceId(),
    scenario_id: scenarioId,
    theme,
    zone_code: zoneCode,
    lang,
    created_at: new Date().toISOString()
  };
  try {
    const { error } = await supabase.from('completions').insert(payload);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    // Hors-ligne ou erreur réseau : on garde en file locale pour renvoyer plus tard.
    queueOffline(payload);
    return { ok: false, reason: 'queued-offline' };
  }
}

function queueOffline(payload) {
  const key = 'p237_pending_sync';
  const queue = JSON.parse(localStorage.getItem(key) || '[]');
  queue.push(payload);
  localStorage.setItem(key, JSON.stringify(queue));
}

export async function flushOfflineQueue() {
  if (!supabase) return;
  const key = 'p237_pending_sync';
  const queue = JSON.parse(localStorage.getItem(key) || '[]');
  if (!queue.length) return;
  const { error } = await supabase.from('completions').insert(queue);
  if (!error) localStorage.removeItem(key);
}

// Utilisé par les dashboards : uniquement des compteurs agrégés, jamais de device_id.
// Important : la BD elle-même (policies RLS) filtre déjà les lignes selon le rôle —
// un facilitateur ne reçoit ici que les lignes de SA zone, un admin les reçoit toutes.
// Le JS ne fait qu'agréger ce que Postgres a déjà autorisé à sortir.
export async function getAggregatedStats() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('completions')
    .select('theme, zone_code');
  if (error || !data) return null;

  const byTheme = {};
  const byZone = {};
  for (const row of data) {
    byTheme[row.theme] = (byTheme[row.theme] || 0) + 1;
    byZone[row.zone_code] = (byZone[row.zone_code] || 0) + 1;
  }
  return { total: data.length, byTheme, byZone };
}

// Compteur public pour la page d'accueil (marketing) : passe par une fonction
// Postgres "security definer" qui ne renvoie qu'un total, jamais les lignes brutes.
// Ainsi la clé anon reste utilisable publiquement sans exposer de données.
export async function getPublicCompletionCount() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('public_completion_count');
  if (error) return null;
  return data;
}

/* ---------------- Authentification (facilitateurs / admins) ---------------- */
// Les parents n'ont jamais besoin de compte : friction zéro, c'est voulu.
// Seuls les facilitateurs et administrateurs se connectent, pour accéder à
// des données agrégées sensibles (zones, volumes) protégées par RLS.

export async function signUpFacilitator({ email, password, fullName, zoneCode }) {
  if (!supabase) return { ok: false, error: 'Base non configurée' };
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { ok: false, error: error.message };

  // Le compte créé ici est TOUJOURS role='facilitateur' + status='en_attente' :
  // même si ce code était modifié pour envoyer autre chose, la policy RLS
  // "self-signup is locked to facilitateur + en_attente" côté base rejetterait
  // l'insertion. Un admin doit explicitement approuver le compte (voir
  // setProfileStatus) avant qu'il ne puisse voir la moindre donnée réelle.
  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id,
    full_name: fullName,
    zone_code: zoneCode
  });
  if (profileError) return { ok: false, error: profileError.message };
  return { ok: true, needsEmailConfirm: !data.session };
}

export async function signIn({ email, password }) {
  if (!supabase) return { ok: false, error: 'Base non configurée' };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentProfile() {
  if (!supabase) return null;
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  if (error) return null;
  return data;
}

export function onAuthChange(callback) {
  if (!supabase) return;
  supabase.auth.onAuthStateChange((_event, session) => callback(session));
}

/* ---------------- Contenu pédagogique (table `scenarios`) ---------------- */
// Le contenu réel de l'app vit en base, pas dans le code — un Éditeur (ou un
// admin) peut publier/corriger un module sans redéploiement. `scenarios.js`
// (seedScenarios) ne sert qu'à amorcer la base et de filet hors-ligne.

export async function fetchPublishedScenarios() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('scenarios')
    .select('*')
    .eq('published', true)
    .order('pillar', { ascending: true });
  if (error || !data) return null;
  return data;
}

// Utilisé uniquement par l'interface Éditeur : renvoie aussi les modules non publiés.
export async function fetchAllScenariosForEditor() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('scenarios')
    .select('*')
    .order('pillar', { ascending: true });
  if (error || !data) return [];
  return data;
}

export async function upsertScenario(scenario) {
  if (!supabase) return { ok: false, error: 'Base non configurée' };
  const { error } = await supabase.from('scenarios').upsert(scenario);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteScenario(id) {
  if (!supabase) return { ok: false, error: 'Base non configurée' };
  const { error } = await supabase.from('scenarios').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/* ---------------- Zones officielles ---------------- */
// Le code de zone n'est jamais du texte libre saisi par l'inscrit : il vient
// de cette liste, gérée uniquement par l'admin.
export async function fetchZones() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('zones').select('*').order('code');
  if (error || !data) return [];
  return data;
}

export async function createZone({ code, label }) {
  if (!supabase) return { ok: false, error: 'Base non configurée' };
  const { error } = await supabase.from('zones').insert({ code, label });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/* ---------------- Approbation des comptes (admin uniquement) ---------------- */
// Un compte fraîchement inscrit est 'en_attente' et invisible aux données
// réelles (voir RLS). L'admin l'approuve ou le refuse ici.
export async function fetchPendingFacilitators() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('status', 'en_attente');
  if (error || !data) return [];
  return data;
}

export async function fetchApprovedFacilitators() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'facilitateur')
    .eq('status', 'valide');
  if (error || !data) return [];
  return data;
}

export async function setProfileStatus(id, status) {
  if (!supabase) return { ok: false, error: 'Base non configurée' };
  const { error } = await supabase.from('profiles').update({ status }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setProfileRole(id, role) {
  if (!supabase) return { ok: false, error: 'Base non configurée' };
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
