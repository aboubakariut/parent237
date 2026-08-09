// =====================================================================
// Sessions de formation — la fiche de pointage du guide MINPROFF
//
// C'est la donnée non falsifiable du tableau de bord : elle est saisie
// par un compte authentifié ET approuvé, dans sa propre zone (policies
// RLS, migration 0004). Contrairement aux complétions anonymes, elle est
// défendable devant le MINPROFF.
//
// Saisie hors ligne comprise : le facilitateur remplit sa fiche dans un
// village sans réseau, elle remonte au retour de la connexion.
// =====================================================================

import { supabase } from './supabase.js';
import { enqueue, pending, remove, markFailure, newClientId } from './offlineQueue.js';

function isRetryable(error) {
  if (!error) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const status = Number(error.status || error.statusCode || 0);
  if (status === 408 || status === 429 || status >= 500) return true;
  if (status >= 400 && status < 500) return false;
  const code = String(error.code || '');
  if (/^(22|23|42|P0)/.test(code)) return false;
  return true;
}

/** Validation côté client — la base revalide tout, ceci est pour l'utilisateur. */
export function validateSession(s) {
  const errors = {};
  if (!s.commune || !s.commune.trim()) errors.commune = 'Commune obligatoire.';
  if (!s.localite || !s.localite.trim()) errors.localite = 'Localité obligatoire.';
  if (!s.groupe || !s.groupe.trim()) errors.groupe = 'Nom du groupe obligatoire.';
  if (!s.module_libelle || !s.module_libelle.trim()) errors.module_libelle = 'Module obligatoire.';
  if (!s.tenue_le) errors.tenue_le = 'Date obligatoire.';

  const total = Number(s.participants_total);
  const f = Number(s.participants_femmes || 0);
  const h = Number(s.participants_hommes || 0);
  const hc = Number(s.participants_handicap || 0);

  if (!Number.isInteger(total) || total < 0) errors.participants_total = 'Nombre de participants invalide.';
  else if (total > 500) errors.participants_total = 'Maximum 500 participants par session.';
  if (f + h > total) errors.participants_femmes = 'Femmes + hommes dépasse le total des participants.';
  if (hc > total) errors.participants_handicap = 'Participants en situation de handicap : dépasse le total.';

  if (s.tenue_le) {
    const d = new Date(s.tenue_le + 'T00:00:00Z');
    const demain = new Date(Date.now() + 24 * 3600 * 1000);
    if (Number.isNaN(d.getTime())) errors.tenue_le = 'Date invalide.';
    else if (d > demain) errors.tenue_le = 'Une session ne peut pas être datée dans le futur.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

function toRow(s, clientId, facilitatorId, zoneCode) {
  return {
    client_id: clientId,
    facilitator_id: facilitatorId,
    zone_code: zoneCode,
    commune: s.commune.trim(),
    localite: s.localite.trim(),
    groupe: s.groupe.trim(),
    module_id: s.module_id || null,
    module_libelle: s.module_libelle.trim(),
    tenue_le: s.tenue_le,
    participants_total: Number(s.participants_total),
    participants_femmes: Number(s.participants_femmes || 0),
    participants_hommes: Number(s.participants_hommes || 0),
    participants_handicap: Number(s.participants_handicap || 0),
    observations: (s.observations || '').trim() || null
  };
}

async function insertRow(row) {
  const { error } = await supabase
    .from('sessions')
    .upsert(row, { onConflict: 'client_id', ignoreDuplicates: true });
  return error;
}

/**
 * Enregistre une session. `profile` doit porter { id, zone_code } — c'est
 * le profil approuvé de l'utilisateur connecté.
 */
export async function saveSession(input, profile) {
  const check = validateSession(input);
  if (!check.valid) return { ok: false, reason: 'invalid', errors: check.errors };
  if (!profile || !profile.id) return { ok: false, reason: 'not-authenticated' };

  const clientId = newClientId();
  const row = toRow(input, clientId, profile.id, input.zone_code || profile.zone_code);

  if (!row.zone_code) return { ok: false, reason: 'no-zone' };

  if (!supabase || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    await enqueue('session', row, clientId);
    return { ok: true, queued: true, clientId };
  }

  let error;
  try {
    error = await insertRow(row);
  } catch (e) {
    error = e;
  }

  if (!error) return { ok: true, queued: false, clientId };

  if (isRetryable(error)) {
    await enqueue('session', row, clientId);
    return { ok: true, queued: true, clientId };
  }
  return { ok: false, reason: 'rejected', error };
}

export async function flushSessionQueue() {
  if (!supabase) return { sent: 0, kept: 0, dropped: 0 };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { sent: 0, kept: 0, dropped: 0 };

  const items = await pending('session');
  let sent = 0, kept = 0, dropped = 0;

  for (const item of items) {
    let error;
    try {
      error = await insertRow(item.payload);
    } catch (e) {
      error = e;
    }
    if (!error) { await remove(item.client_id); sent += 1; continue; }
    if (!isRetryable(error)) {
      await remove(item.client_id);
      dropped += 1;
      console.warn('[sessions] fiche abandonnée :', error.message || error);
      continue;
    }
    const res = await markFailure(item, error.message || error);
    if (res.dropped) dropped += 1; else kept += 1;
  }
  return { sent, kept, dropped };
}

/** Sessions visibles par l'utilisateur — RLS filtre déjà par zone et par rôle. */
export async function listSessions({ limit = 50 } = {}) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('sessions')
    .select('id, commune, localite, groupe, module_libelle, tenue_le, participants_total, participants_femmes, participants_hommes, participants_handicap, zone_code')
    .order('tenue_le', { ascending: false })
    .limit(limit);
  if (error) { console.error('[sessions]', error.message); return []; }
  return data || [];
}

/** Agrégats pour le tableau de bord. Le JS ne fait que compter ce que Postgres a autorisé à sortir. */
export function aggregateSessions(rows) {
  const out = {
    sessions: rows.length,
    participants: 0,
    femmes: 0,
    hommes: 0,
    handicap: 0,
    localites: new Set(),
    parLocalite: {}
  };
  for (const r of rows) {
    out.participants += r.participants_total || 0;
    out.femmes += r.participants_femmes || 0;
    out.hommes += r.participants_hommes || 0;
    out.handicap += r.participants_handicap || 0;
    out.localites.add(`${r.commune} / ${r.localite}`);
    const k = r.localite || '—';
    out.parLocalite[k] = (out.parLocalite[k] || 0) + (r.participants_total || 0);
  }
  out.localites = out.localites.size;
  return out;
}
