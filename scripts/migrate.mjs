#!/usr/bin/env node
// =====================================================================
// Applique les migrations SQL de supabase/migrations/ contre la base.
//
// Trois problèmes corrigés par rapport à la version précédente :
//
//  1. GARDE-FOU DE BRANCHE. `npm run build` s'exécute sur CHAQUE
//     déploiement Vercel, y compris les previews de branche. Les
//     migrations partaient donc en production depuis n'importe quelle
//     branche : un essai pouvait casser la base pendant une démonstration
//     au jury. Désormais seule la production (ou un forçage explicite)
//     applique les migrations.
//
//  2. SUIVI + TRANSACTION. Une table `schema_migrations` enregistre les
//     fichiers déjà appliqués, et chaque fichier s'exécute dans une
//     transaction : plus de migration à moitié appliquée laissant la base
//     dans un état incohérent. Un verrou consultatif évite deux
//     déploiements simultanés.
//
//  3. TLS. `rejectUnauthorized: false` acceptait n'importe quel
//     certificat. Fournissez SUPABASE_CA_CERT pour une vérification
//     réelle ; sinon l'exécution est refusée en production.
//
// Variables : DATABASE_URL (obligatoire), SUPABASE_CA_CERT (recommandé),
//             MIGRATE_FORCE=1 (forcer hors production).
// =====================================================================

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const LOCK_ID = 237237237;

function log(msg) { console.log(`[migrate] ${msg}`); }

function autorise() {
  if (process.env.MIGRATE_FORCE === '1') return { ok: true, why: 'MIGRATE_FORCE=1' };
  const env = process.env.VERCEL_ENV;           // 'production' | 'preview' | 'development'
  if (!env) return { ok: true, why: 'exécution locale' };
  if (env === 'production') return { ok: true, why: 'déploiement de production' };
  return { ok: false, why: `déploiement « ${env} » — les previews ne touchent pas à la base` };
}

function ssl() {
  const ca = process.env.SUPABASE_CA_CERT;
  if (ca) return { ca, rejectUnauthorized: true };
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error(
      "SUPABASE_CA_CERT absent : refus de migrer la production sans vérification du certificat. " +
      "Téléchargez le certificat depuis Supabase > Settings > Database et ajoutez-le aux variables d'environnement."
    );
  }
  log('SUPABASE_CA_CERT absent — vérification TLS désactivée (toléré hors production uniquement).');
  return { rejectUnauthorized: false };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    log('DATABASE_URL non défini — migrations ignorées pour ce build.');
    return;
  }

  const permission = autorise();
  if (!permission.ok) {
    log(`Migrations ignorées : ${permission.why}.`);
    return;
  }
  log(`Migrations autorisées (${permission.why}).`);

  const dir = path.join(process.cwd(), 'supabase', 'migrations');
  let fichiers = [];
  try {
    fichiers = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    log('Aucun dossier supabase/migrations trouvé, rien à faire.');
    return;
  }
  if (!fichiers.length) { log('Aucune migration à appliquer.'); return; }

  const client = new Client({ connectionString, ssl: ssl() });
  await client.connect();

  try {
    // Verrou consultatif : deux déploiements simultanés ne se marchent pas dessus.
    const { rows } = await client.query('select pg_try_advisory_lock($1) as ok', [LOCK_ID]);
    if (!rows[0].ok) {
      log('Une autre migration est en cours (verrou occupé). Abandon sans erreur.');
      return;
    }

    await client.query(`
      create table if not exists schema_migrations (
        filename    text primary key,
        checksum    text not null,
        applied_at  timestamptz not null default now()
      );
    `);

    const { rows: dejaFaites } = await client.query('select filename, checksum from schema_migrations');
    const appliquees = new Map(dejaFaites.map((r) => [r.filename, r.checksum]));

    let n = 0;
    for (const fichier of fichiers) {
      const sql = readFileSync(path.join(dir, fichier), 'utf8');
      const checksum = await empreinte(sql);

      if (appliquees.has(fichier)) {
        if (appliquees.get(fichier) !== checksum) {
          log(`ATTENTION : ${fichier} a été modifié après application. ` +
              `Créez une nouvelle migration plutôt que d'éditer une migration déjà passée.`);
        }
        continue;
      }

      log(`Application de ${fichier}…`);
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query(
          'insert into schema_migrations (filename, checksum) values ($1, $2)',
          [fichier, checksum]
        );
        await client.query('commit');
        n += 1;
      } catch (e) {
        await client.query('rollback');
        throw new Error(`${fichier} a échoué et a été annulé intégralement : ${e.message}`);
      }
    }

    log(n ? `${n} migration(s) appliquée(s).` : 'Base déjà à jour.');
  } finally {
    try { await client.query('select pg_advisory_unlock($1)', [LOCK_ID]); } catch {}
    await client.end();
  }
}

async function empreinte(texte) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(texte).digest('hex').slice(0, 32);
}

main().catch((e) => {
  console.error(`[migrate] ÉCHEC : ${e.message}`);
  process.exit(1);   // un build ne doit pas être publié si le schéma n'a pas suivi
});
