# Correctifs Parent+237 — mode d'emploi

Ce dossier reproduit l'arborescence du dépôt. Chaque fichier va à l'emplacement
indiqué par son chemin. Les étapes sont classées par ordre d'urgence : la 1 est
bloquante, la 2 vise l'argument central du dossier de candidature.

---

## 0. Avant tout — sortir `.env.local` du dépôt

```bash
git rm --cached .env.local
git commit -m "Retire .env.local du suivi Git"
```

Le fichier `.gitignore` fourni couvre `.env*`. La clé *publishable* est conçue
pour vivre dans le navigateur, donc ce n'est pas une fuite grave — mais le jour
où quelqu'un y colle une clé `service_role`, elle serait publiée automatiquement.
Par précaution, faites tourner la clé anon dans Supabase > Settings > API.

---

## 1. Bloquant — les variables d'environnement (2 minutes)

`src/supabase.js` lit `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, mais
`.env.local` déclarait `NEXT_PUBLIC_…`. Vite n'expose que le préfixe `VITE_` :
les deux constantes valaient `undefined`, `supabase` valait `null`, et **toutes**
les fonctions échouaient avec « Configuration Supabase manquante ».

Créez un `.env.local` à partir de `.env.local.example` fourni, avec vos valeurs :

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxx
```

**Et faites la même correction dans Vercel > Settings > Environment Variables.**
C'est l'erreur la plus coûteuse du dépôt : sans cela, rien ne fonctionne devant
le jury.

---

## 2. Base de données — appliquer la migration 0004

Copiez `supabase/migrations/0004_integrite_sessions_quota.sql` dans votre dossier
`supabase/migrations/`, puis :

```bash
DATABASE_URL="postgres://…" MIGRATE_FORCE=1 npm run db:migrate
```

Ce que la migration corrige :

- **La porte grande ouverte.** La policy `anon can insert completion` avec
  `with check (true)` permettait à quiconque d'injecter des complétions en masse
  dans la zone de son choix, la clé anon étant publique. Elle est supprimée et
  remplacée par la RPC `record_completion`, qui valide le scénario, valide la
  zone, applique un quota de 40 écritures par appareil et par heure, et ignore
  les rejeux grâce au `client_id` unique.
- **`completions.zone_code`** devient une vraie clé étrangère vers `zones` : on
  ne peut plus empoisonner la zone d'un facilitateur avec du texte libre.
- **La table `sessions`** — la fiche de pointage du guide MINPROFF : commune,
  localité, groupe, module, date, effectifs dont femmes, hommes et personnes en
  situation de handicap. C'est la seule donnée non falsifiable de votre tableau
  de bord, puisqu'elle est saisie par un compte authentifié et approuvé.
- **`handle_new_user`** ne casse plus l'inscription. Avant, un `zone_code`
  inconnu violait la clé étrangère, le trigger échouait, et la création du
  compte était annulée avec une erreur 500 opaque.
- **`public_stats()`** distingue les compteurs vérifiés (sessions) des compteurs
  déclaratifs (complétions anonymes).

### Nettoyage à faire dans la foulée

Supprimez `supabase.sql`, `supabase_patch_rls_fix.sql`, `supabase_diagnostic.sql`
et `prototype.html` de la racine. Deux sources de vérité pour le schéma
garantissent une divergence entre votre base et toute base recréée à neuf.
Vérifiez d'abord que `supabase/migrations/0001_init.sql` contient bien tout ce
que contenait `supabase.sql`.

---

## 3. Fichiers à déposer tels quels

| Fichier | Remplace | Effet |
|---|---|---|
| `src/offlineQueue.js` | *(nouveau)* | File hors ligne en IndexedDB |
| `src/completions.js` | *(nouveau)* | Écriture idempotente + synchronisation |
| `src/sessions.js` | *(nouveau)* | Fiches de pointage, saisie hors ligne comprise |
| `src/pages/sessionForm.js` | *(nouveau)* | Écran de saisie, accessible |
| `src/swRuntime.js` | *(nouveau)* | Cache d'exécution du contenu et de l'audio |
| `src/audio.js` | *(nouveau)* | MP3 d'abord, synthèse vocale en secours |
| `vite.config.js` | remplace | Obfuscation retirée |
| `scripts/migrate.mjs` | remplace | Garde-fou de branche, transactions, suivi |
| `.gitignore`, `.env.local.example` | ajoutent | Hygiène du dépôt |

---

## 4. Quatre branchements à faire à la main

### 4.1 `src/supabase.js` — retirer l'ancienne logique de complétion

Supprimez de ce fichier `logCompletion`, `queueOffline` et `flushOfflineQueue`
(elles vivent désormais dans `src/completions.js`, corrigées). Si d'autres
fichiers les importaient depuis `./supabase.js`, changez la source :

```js
import { logCompletion, flushOfflineQueue, getDeviceId } from './completions.js';
```

Gardez `getDeviceId` dans un seul endroit : `completions.js` utilise la clé
`p237_device_id`. Si votre version existante utilisait une autre clé, alignez-la,
sinon les appareils déjà installés changeront d'identifiant.

### 4.2 `src/main.js` — démarrer la synchronisation

L'ancienne file ne se vidait peut-être jamais : aucun `flushOfflineQueue` n'était
rappelé sur l'événement `online`.

```js
import { startAutoSync } from './completions.js';
import { flushSessionQueue } from './sessions.js';

startAutoSync();                                  // au démarrage, au retour du réseau, toutes les 5 min
window.addEventListener('online', () => flushSessionQueue());
flushSessionQueue();
```

### 4.3 `src/sw.js` — activer le cache d'exécution

Ajoutez en haut du fichier, avant la partie push :

```js
import { registerRuntimeCaching } from './swRuntime.js';
registerRuntimeCaching();
```

Sans cela, un parent hors ligne n'a que les six scénarios compilés dans le
bundle, et aucune traduction de la migration 0003. C'est la première chose qu'un
évaluateur testera, en mode avion.

Installez la dépendance manquante :

```bash
npm i -D workbox-cacheable-response
npm remove vite-plugin-javascript-obfuscator
```

### 4.4 Router — déclarer l'écran de saisie

Dans le fichier qui enregistre vos routes :

```js
import { renderSessionForm } from './pages/sessionForm.js';

registerRoute('/sessions', () =>
  renderSessionForm(document.querySelector('#app'), { profile, modules })
);
```

`profile` est le profil approuvé de l'utilisateur connecté (il lui faut au moins
`id` et `zone_code`), `modules` la liste des scénarios pour le menu déroulant.
Ajoutez le lien « Enregistrer une session » en tête du tableau de bord
facilitateur : c'est l'action principale de ce rôle.

---

## 5. Vérification avant le gel du prototype

1. Mode avion : ouvrir un module, terminer une leçon, saisir une fiche de
   session, remettre le réseau — les deux doivent apparaître dans le tableau de
   bord en moins d'une minute, sans doublon.
2. Répéter deux fois le même parcours hors ligne : le compteur ne doit avancer
   que du nombre réel de leçons terminées.
3. Créer un compte avec un `zone_code` bidon dans les métadonnées : le compte
   doit se créer, avec une zone vide, et non planter en 500.
4. Tenter une écriture directe dans `completions` avec la clé anon depuis un
   terminal : elle doit être refusée.
5. Naviguer tout le formulaire de session au clavier seul, puis vérifier que
   chaque message d'erreur est bien annoncé.

---

## 6. Deux points qui restent à traiter, hors code

- **Les enregistrements audio.** `src/audio.js` attend des fichiers dans
  `public/audio/<lang>/<scenarioId>.mp3`. Tant qu'ils n'existent pas, la
  synthèse vocale prend le relais en français seulement — aucun Android n'a de
  voix fulfuldé ou ewondo. Produire ne serait-ce qu'un module enregistré en
  langue locale vaut plus, devant le jury, que six modules muets.
- **Le protocole d'alerte.** Le dossier promet une orientation en cas de
  détection de détresse ; rien dans le code ne l'implémente. Au minimum, un
  écran statique avec le numéro officiel d'assistance, atteignable en un geste
  depuis l'app parent, et jamais de conseil automatique.
