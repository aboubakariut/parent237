// =====================================================================
// Complétions parent — écriture idempotente + synchronisation hors ligne
//
// Remplace `logCompletion` / `queueOffline` / `flushOfflineQueue` qui
// vivaient dans src/supabase.js. Trois défauts corrigés :
//
//  1. L'ancien code ne distinguait pas une coupure réseau d'un rejet
//     définitif : une ligne refusée par une contrainte repartait en file
//     et y restait pour toujours.
//  2. Le flush insérait le lot ENTIER et ne vidait la file que si tout
//     passait : une seule ligne invalide bloquait définitivement la
//     remontée de toutes les autres.
//  3. Aucune idempotence : un insert réussi côté serveur dont la réponse
//     se perd au retour produisait un doublon au flush suivant.
//
// L'écriture passe désormais par la RPC `record_completion` (migration
// 0004) : le scénario et la zone y sont validés, un quota horaire par
// appareil s'applique, et le `client_id` garantit l'unicité.
// =====================================================================

import { supabase } from './supabase.js';
import { enqueue, pending, remove, markFailure, newClientId, migrateFromLocalStorage } from './offlineQueue.js';

const DEVICE_KEY = 'p237_device_id';

/** Identifiant d'appareil stable, sans aucune donnée personnelle. */
export function getDeviceId() {
  let id = null;
  try {
    id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = newClientId();
      localStorage.setItem(DEVICE_KEY, id);
    }
  } catch {
    id = newClientId(); // navigation privée : identifiant éphémère
  }
  return id;
}

/**
 * Une erreur mérite-t-elle un nouvel essai ?
 * Réseau, 5xx, 408, 429 -> oui. Validation, contrainte, RLS -> non :
 * réessayer ne changera rien, et la file se remplirait indéfiniment.
 */
function isRetryable(error) {
  if (!error) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;

  const status = Number(error.status || error.statusCode || 0);
  if (status === 408 || status === 429 || status >= 500) return true;
  if (status >= 400 && status < 500) return false;

  const code = String(error.code || '');
  if (code === '54000') return true;                 // quota horaire : on retentera plus tard
  if (/^(22|23|42|P0)/.test(code)) return false;     // validation, contrainte, droits, plpgsql

  const msg = String(error.message || '').toLowerCase();
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout')) return true;

  return true; // inconnu : on garde, le compteur d'essais finira par l'abandonner
}

function buildPayload({ scenarioId, theme, zoneCode = 'non-renseigne', lang = 'fr' }) {
  return {
    p_device_id: getDeviceId(),
    p_scenario_id: scenarioId,
    p_theme: theme,
    p_zone_code: zoneCode || 'non-renseigne',
    p_lang: lang || 'fr',
    p_created_at: new Date().toISOString()
  };
}

async function send(clientId, payload) {
  const { error } = await supabase.rpc('record_completion', { p_client_id: clientId, ...payload });
  return error;
}

/**
 * Enregistre une complétion. Ne jette jamais : hors ligne, la progression
 * est mise en file et remontera toute seule au retour du réseau.
 */
export async function logCompletion(input) {
  const clientId = newClientId();
  const payload = buildPayload(input);

  if (!supabase || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    await enqueue('completion', payload, clientId);
    return { ok: false, reason: 'queued-offline', clientId };
  }

  let error;
  try {
    error = await send(clientId, payload);
  } catch (e) {
    error = e;
  }

  if (!error) return { ok: true, clientId };

  if (isRetryable(error)) {
    await enqueue('completion', payload, clientId);
    return { ok: false, reason: 'queued-offline', clientId };
  }

  console.error('[completions] rejet définitif, non mis en file :', error.message || error);
  return { ok: false, reason: 'rejected', error };
}

/**
 * Vide la file, élément par élément. Un échec définitif sur une ligne ne
 * bloque plus les suivantes ; un succès la retire immédiatement.
 */
export async function flushOfflineQueue() {
  if (!supabase) return { sent: 0, kept: 0, dropped: 0 };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { sent: 0, kept: 0, dropped: 0 };

  const items = await pending('completion');
  let sent = 0, kept = 0, dropped = 0;

  for (const item of items) {
    let error;
    try {
      error = await send(item.client_id, item.payload);
    } catch (e) {
      error = e;
    }

    if (!error) {
      await remove(item.client_id);
      sent += 1;
      continue;
    }
    if (!isRetryable(error)) {
      await remove(item.client_id);
      dropped += 1;
      console.warn('[completions] élément abandonné :', error.message || error);
      continue;
    }
    const res = await markFailure(item, error.message || error);
    if (res.dropped) dropped += 1; else kept += 1;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
  }

  return { sent, kept, dropped };
}

let started = false;

/**
 * Déclenche la synchronisation au bon moment. L'ancienne version ne
 * rappelait jamais le flush : la file pouvait ne se vider jamais.
 * À appeler une fois depuis src/main.js.
 */
export function startAutoSync({ intervalMs = 5 * 60 * 1000 } = {}) {
  if (started) return;
  started = true;

  const run = () => {
    flushOfflineQueue().catch((e) => console.warn('[sync]', e));
  };

  migrateFromLocalStorage()
    .then((n) => { if (n) console.info(`[sync] ${n} élément(s) repris de l'ancienne file`); })
    .catch(() => {})
    .finally(run);

  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });
  setInterval(run, intervalMs);
}
