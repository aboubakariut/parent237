// S'exécute automatiquement avant chaque build (voir package.json > "build").
// Ça veut dire : à chaque déploiement Vercel (donc à chaque push git), les
// migrations SQL non encore appliquées sont exécutées automatiquement contre
// la base — plus besoin de copier-coller manuellement dans le SQL Editor.
//
// Nécessite la variable d'environnement DATABASE_URL (connexion Postgres
// directe, PAS la clé anon). Voir README > "Connecter la base automatiquement".
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.log('[migrate] DATABASE_URL non défini — migrations ignorées pour ce build.');
    console.log('[migrate] (normal en local si vous n\'avez pas encore configuré .env.local)');
    return;
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
  } catch (err) {
    console.error('[migrate] Impossible de se connecter à la base :', err.message);
    console.error('[migrate] Le build continue quand même (les migrations pourront être rejouées au prochain déploiement).');
    return; // on ne bloque pas le build sur un souci réseau ponctuel
  }

  await client.query(`
    create table if not exists _schema_migrations (
      id text primary key,
      applied_at timestamptz default now()
    );
  `);

  const dir = path.join(process.cwd(), 'supabase', 'migrations');
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    console.log('[migrate] Aucun dossier supabase/migrations trouvé, rien à faire.');
    await client.end();
    return;
  }

  for (const file of files) {
    const { rows } = await client.query('select 1 from _schema_migrations where id = $1', [file]);
    if (rows.length) {
      console.log(`[migrate] ${file} déjà appliqué, ignoré.`);
      continue;
    }

    console.log(`[migrate] Application de ${file}...`);
    const sql = readFileSync(path.join(dir, file), 'utf8');
    try {
      await client.query(sql);
      await client.query('insert into _schema_migrations (id) values ($1)', [file]);
      console.log(`[migrate] ${file} appliqué avec succès.`);
    } catch (err) {
      // Les migrations sont écrites pour être idempotentes (drop if exists,
      // create if not exists) : si ça échoue quand même, on log l'erreur en
      // détail mais on NE bloque PAS le build, pour ne pas casser un déploiement
      // pour un souci SQL réparable ensuite à la main.
      console.error(`[migrate] ERREUR dans ${file} :`, err.message);
      console.error('[migrate] Le build continue ; corrigez et redéployez, ou appliquez ce fichier manuellement dans le SQL Editor.');
    }
  }

  await client.end();
  console.log('[migrate] Terminé.');
}

main().catch((err) => {
  console.error('[migrate] Erreur inattendue :', err);
  // On ne fait jamais échouer le build entier pour un souci de migration.
});
