# Parent+237

PWA offline-first pour le concours UNICEF Cameroon × MINPROFF « Parentalité Positive ».

## Les interfaces
| Route | Public | Description |
|---|---|---|
| `/` | Tout le monde | Page d'accueil (landing) : présentation, compteur public d'impact, CTA |
| `/app` | Parents (sans compte) | App parent : parcours, simulateur, badge à partager (pas de lien vers l'espace pro — accessible uniquement via `/`) |
| `/connexion` | Facilitateurs, Éditeurs, Admins | Connexion / inscription (email + mot de passe) |
| `/facilitateur` | Facilitateur connecté | Dashboard filtré sur SA zone uniquement (via RLS) |
| `/editeur` | Éditeur ou Admin connecté | **Publie et modifie les modules pédagogiques**, sans redéploiement |
| `/admin` | Admin connecté | Dashboard global : toutes zones, liste des facilitateurs |
| `/profil` | Tout compte pro connecté | Modifier son nom/zone, changer son mot de passe |

**Qui publie les formations ?** Le rôle **Éditeur** (`/editeur`). Le contenu vit dans la table
`scenarios` en base — pas dans le code — donc MINPROFF/UNICEF peuvent désigner une personne
responsable de la validation pédagogique qui publie et corrige les modules elle-même, sans
dépendre de l'équipe technique. `src/scenarios.js` ne sert plus que de contenu de départ (seed,
inséré une fois en base) et de filet de secours hors-ligne si l'app n'a jamais pu se synchroniser.

**Qui fait le suivi ?** Deux niveaux, déjà détaillés plus haut : le **Facilitateur** au niveau
terrain/zone, l'**Admin** au niveau programme national.

**Pourquoi les parents n'ont pas de compte** : friction zéro est un choix délibéré — un mot de
passe de plus est une barrière d'adoption dans le contexte visé. Seuls les rôles pro se connectent.

## Ce qui fait le prototype
- **Simulateur de situations** en Canvas 2D animé (aucune image externe → hors-ligne total, poids minimal).
- **Narration vocale gratuite** via l'API Web Speech du navigateur (pas de fichiers audio à héberger).
- **Certificat partageable** généré en Canvas + partage direct WhatsApp (`navigator.share`) — moteur de viralité.
- **App installable** (manifest + service worker via `vite-plugin-pwa`) : fonctionne après la 1ère visite même sans réseau.
- **Authentification par rôle** (Supabase Auth) : facilitateur vs admin.
- **Sécurité multi-tenant réelle** : chaque facilitateur ne voit que les données de sa zone —
  la règle est appliquée par PostgreSQL (RLS), pas par le code JS, donc impossible à contourner
  depuis le navigateur.
- **Compteur public sans fuite de données** : la page d'accueil affiche un total via une fonction
  SQL `security definer` qui ne renvoie jamais les lignes individuelles.
- **Icônes Font Awesome** (CDN, mises en cache par le service worker pour l'usage hors-ligne) —
  aucune icône brute (emoji/unicode) dans le HTML.
- **Workflow d'approbation** : tout compte facilitateur/éditeur passe par une validation admin
  avant de voir la moindre donnée (voir section Sécurité ci-dessous).

## 1. Installation locale
```bash
npm install
cp .env.example .env.local   # puis renseignez vos clés Supabase
npm run dev
```

## 2. Connecter la base automatiquement (migrations)
Fini le copier-coller manuel dans le SQL Editor à chaque changement. Le
dossier `supabase/migrations/` contient le schéma complet, et `scripts/migrate.mjs`
l'applique automatiquement **à chaque build** (donc à chaque déploiement Vercel,
donc à chaque `git push`).

1. Créez un compte sur supabase.com et un nouveau projet.
2. Récupérez la **connexion Postgres directe** : Project Settings → Database →
   Connection string → onglet "URI". Préférez la version **Transaction pooler**
   (port 6543) pour la compatibilité avec l'environnement serverless de Vercel.
3. Ajoutez cette URL comme `DATABASE_URL` dans `.env.local` (dev) et dans
   Vercel → Settings → Environment Variables (prod). **Jamais préfixée `VITE_`**
   — elle ne doit jamais atteindre le navigateur, seul le script Node de build
   l'utilise.
4. Testez en local : `npm run db:migrate` — vous devriez voir chaque fichier de
   `supabase/migrations/` s'appliquer avec un message de succès.
5. En production, c'est automatique : `npm run build` (que Vercel appelle à
   chaque déploiement) exécute `scripts/migrate.mjs` avant de compiler l'app.

**Pour ajouter un changement de schéma plus tard** : créez un nouveau fichier
`supabase/migrations/0002_votre_nom.sql`, écrivez-le de façon idempotente
(`create table if not exists`, `drop policy if exists` + `create policy`,
`create or replace function`), committez et poussez — il s'appliquera tout seul
au prochain déploiement.

*(Filet de sécurité : si `DATABASE_URL` n'est pas configuré, le build continue
normalement sans bloquer — utile en local si vous préférez encore coller le SQL
à la main dans le dashboard Supabase pour une première prise en main.)*

## 3. Le bug 500 récurrent sur `/profiles` — explication complète
Deux causes différentes ont été corrigées, l'une après l'autre :
1. **Récursion RLS** : une policy qui interroge `profiles` depuis l'intérieur
   d'une policy sur `profiles` fait planter Postgres ("infinite recursion
   detected"). Corrigé avec des fonctions `security definer`
   (`is_valid_admin()`, etc.) — voir `supabase/migrations/0001_init.sql`.
2. **Policy trop stricte sur la mise à jour du profil** : la version précédente
   forçait `role = 'facilitateur'` dans le `with check`, ce qui empêchait même
   un admin de modifier son propre nom. Remplacé par un **trigger** qui compare
   l'ancienne et la nouvelle valeur de `role`/`status`, et bloque uniquement une
   tentative d'auto-élévation — la policy elle-même autorise maintenant toute
   modification de ses propres informations.

Avec le système de migrations automatiques (section 2), ces deux correctifs
s'appliquent tout seuls au prochain déploiement — plus besoin de diagnostiquer
ça à la main.

## 4. Sécurité réelle (à comprendre avant de présenter au jury)
La clé Supabase "anon" est **conçue pour être visible côté client** — ce n'est pas une fuite.
La vraie protection vient des **policies RLS** définies dans `supabase/migrations/0001_init.sql` :
elles limitent précisément ce qu'un visiteur anonyme peut faire (ici : ajouter une ligne, lire des
agrégats). L'obfuscation du build (étape 5) protège votre **code métier et votre logique**, pas les clés.

## 5. Build obfusqué (protection du code source)
```bash
npm run build
```
En production, `vite.config.js` applique automatiquement :
- **Terser** (minification + suppression des commentaires/console.log/sourcemaps)
- **vite-plugin-javascript-obfuscator** (noms de variables hexadécimaux, chaînes encodées en base64,
  aplatissement du flux de contrôle, code mort injecté, auto-défense anti-debug)

Résultat : quelqu'un qui fait "Voir le code source" verra un bundle illisible, pas votre logique
métier originale. **Honnêteté technique** : aucune obfuscation JS n'est incassable face à un attaquant
déterminé (le navigateur doit pouvoir exécuter le code, donc le lire) — mais ce niveau décourage
largement la copie occasionnelle par un concurrent, ce qui est l'objectif réaliste ici. Pour toute
logique vraiment sensible (règles métier propriétaires, calculs de score, etc.), la bonne pratique
reste de la déplacer côté serveur (fonctions Vercel ou Supabase Edge Functions) plutôt que de
compter sur l'obfuscation front.

## 6. Déployer sur Vercel
```bash
npm i -g vercel     # si pas déjà installé
vercel               # suit les invites, lie le repo
vercel --prod
```
Ou via l'interface Vercel : *Import Project* depuis GitHub, puis ajoutez dans
**Settings → Environment Variables** :
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `DATABASE_URL` (voir section 2 — déclenche les migrations automatiques à chaque déploiement)
- `VITE_VAPID_PUBLIC_KEY` (optionnel, voir section 8 — notifications push)

Le fichier `vercel.json` est déjà configuré (build command, dossier `dist`, rewrites SPA).

## Sécurité : empêcher les faux comptes facilitateur de voir des données
Trois verrous indépendants, tous appliqués côté base (PostgreSQL/RLS), donc
infalsifiables depuis le navigateur même par quelqu'un qui lit ce code :

1. **Approbation obligatoire.** Un compte fraîchement inscrit a `status = 'en_attente'`.
   Toutes les policies de lecture de données réelles (`completions`, gestion de
   `scenarios`) exigent `status = 'valide'`. Tant qu'un admin n'a pas approuvé le
   compte depuis `/admin`, il ne voit strictement rien — même en visitant l'URL
   du dashboard directement.
2. **Zones contrôlées, pas de texte libre.** Les codes de zone viennent d'une table
   `zones` gérée uniquement par l'admin (`/admin`). Le formulaire d'inscription
   propose un menu déroulant, pas un champ texte : impossible d'inventer un code
   qui n'existe pas ou d'usurper une zone par une simple faute de frappe.
3. **Auto-élévation impossible.** La policy d'insertion sur `profiles` verrouille
   `role = 'facilitateur'` et `status = 'en_attente'` au niveau SQL (`with check`).
   Même quelqu'un qui contournerait le formulaire pour appeler l'API Supabase
   directement ne peut pas s'auto-déclarer admin ou "validé" — la base rejette
   la requête.

**Ce que voit concrètement un admin sur `/admin`** : la file des demandes en
attente (nom + zone demandée, avec boutons Approuver/Refuser), la liste des
facilitateurs déjà approuvés, la liste des zones officielles avec un formulaire
pour en ajouter, et les statistiques agrégées globales.

## Qui est l'admin, concrètement ?
Techniquement, n'importe qui promu manuellement (voir ci-dessous) — mais la
gouvernance prévue est :
- **Phase pilote (maintenant → lancement)** : vous et votre associé, en tant
  qu'équipe technique, portez le premier compte admin pour configurer les
  zones et approuver les premiers facilitateurs de test.
- **Phase programme** : un point focal désigné par MINPROFF/UNICEF (ou un
  membre de l'équipe M&E) reprend ce rôle, puisque l'approbation des
  facilitateurs est une décision de terrain/institutionnelle, pas technique.
Cette distinction est utile à mentionner explicitement dans le dossier — le
jury demande souvent "qui a la main sur l'outil après le concours ?".

## Créer votre premier compte admin
1. Depuis `/connexion`, inscrivez-vous normalement en tant que facilitateur.
2. Dans Supabase → **Table Editor → profiles**, changez manuellement pour cette
   ligne : `role` → `admin` **et** `status` → `valide` (les deux colonnes,
   sinon les policies continuent de vous traiter comme non approuvé).
3. Reconnectez-vous : vous arrivez automatiquement sur `/admin`.

C'est le **seul** moment où vous touchez la base à la main. Après ça, tout
passe par l'interface `/admin` : approbation des facilitateurs suivants,
création de zones, élévation d'un compte "éditeur" (même mécanisme, à
appliquer une seule fois pour le premier éditeur).

## 7. Page Profil (tous les comptes pro)
Accessible sur `/profil` depuis chaque dashboard ("Mon profil"). Permet de :
- Modifier son nom et sa zone (facilitateurs uniquement pour la zone).
- Changer son mot de passe.
Impossible de s'y donner un autre rôle ou de s'auto-valider — verrouillé par le
trigger `prevent_self_role_escalation` (voir section 3).

## 8. Notifications push
Deux niveaux, avec des besoins de configuration différents :

**Notifications locales (déjà actives, zéro configuration)** — déclenchées par
l'app elle-même pendant qu'elle est ouverte ou récemment fermée : "module
terminé", "certificat prêt à partager". Fonctionnent dès que le navigateur
autorise les notifications.

**Notifications push réelles (app fermée, nécessite un déploiement)** — pour
"votre compte a été approuvé" (facilitateur) ou "nouvelle demande en attente"
(admin). Trois étapes, à faire une fois :

1. **Générer une paire de clés VAPID** (gratuit) :
   ```bash
   npx web-push generate-vapid-keys
   ```
   Copiez la clé publique dans `VITE_VAPID_PUBLIC_KEY` (`.env.local` + Vercel).

2. **Déployer la fonction serveur** (nécessite la CLI Supabase, `npm i -g supabase`) :
   ```bash
   supabase functions deploy send-push
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:vous@exemple.cm
   supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
   ```
   (`SUPABASE_SERVICE_ROLE_KEY` se trouve dans Project Settings → API Keys —
   c'est la clé **secrète**, jamais celle utilisée côté client.)

3. **Créer le webhook** : Supabase → Database → Webhooks → New Webhook, table
   `profiles`, événements `INSERT` et `UPDATE`, URL = celle de la fonction
   déployée à l'étape 2 (affichée après le déploiement).

Sans ces 3 étapes, l'app fonctionne normalement — seuls les boutons "Activer
les notifications" afficheront "indisponible", sans rien casser.

## 9. Inscription parent (nom, téléphone, région)
Toujours sans mot de passe (friction zéro conservée), mais dès la première
ouverture, l'app demande **nom, téléphone, région**. Objectif :
- Le certificat porte enfin le vrai nom du parent — avant, "à qui appartient
  ce certificat" n'avait pas de réponse fiable.
- Les complétions sont maintenant rattachées à une **vraie zone** — avant, la
  colonne `zone_code` de `completions` restait toujours à `'non-renseigne'`,
  donc **aucun facilitateur ne voyait jamais rien** sur son dashboard, même
  avec des parents actifs. C'est corrigé.

Stocké dans `parent_profiles` (voir migration 0002), identifié par le
`device_id` local — pas par un compte. Modifiable à tout moment depuis
"Modifier mes informations" sur l'accueil.

## 10. Visibilité des erreurs (toasts)
Chaque action qui peut échouer (connexion, sauvegarde de profil, publication
de contenu, approbation d'un facilitateur...) affiche maintenant un bandeau
visible en haut de l'écran (`src/toast.js`), succès ou erreur — plus jamais
d'échec silencieux.

**Le bug "je n'arrive pas à me connecter" expliqué** : `getCurrentProfile()`
avalait silencieusement toute erreur de lecture du profil et renvoyait `null`,
ce qui renvoyait l'utilisateur vers `/connexion` **sans aucun message** — alors
que la connexion, elle, avait réussi. Ça ressemblait exactement à "je ne peux
pas me connecter". Corrigé : la fonction distingue maintenant "pas connecté"
de "connecté mais erreur de lecture", et affiche l'erreur réelle dans les deux
cas (voir `src/pages/profileLoadError.js`).

## 1. Traduction réelle de l'interface (i18n)
Français et anglais sont **réellement traduits** (`src/i18n.js`) — chrome de
l'app (boutons, titres, navigation) et contenu des modules (via la colonne
`translations` de `scenarios`, migration 0003).

Pour fulfulde et ewondo : **honnêteté assumée**. Je ne fabrique pas de
traduction non vérifiée pour des langues que je ne maîtrise pas — l'app
affiche un bandeau clair "traduction en préparation" et retombe sur le
français plutôt que de risquer un contenu culturellement maladroit ou faux.
Dès qu'un locuteur natif (MINPROFF, facilitateur local) valide un texte,
l'Éditeur peut l'ajouter via `/editeur` → section "Traduction" (actuellement
english uniquement dans le formulaire ; le modèle de données supporte déjà
n'importe quelle langue, il suffira d'ajouter les mêmes champs pour ff/ew une
fois le contenu validé).

La synthèse vocale suit aussi la langue choisie (`voiceLangTag`).

## Prochaines étapes suggérées avant le 25 août
- Enrichir `src/scenarios.js` avec les scénarios validés localement (idéalement avec un
  facilitateur MINPROFF pour la justesse culturelle) et les traductions fulfuldé/ewondo.
- Ajouter la confirmation email obligatoire dans Supabase Auth (activée par défaut) ou la
  désactiver pour la démo si vous voulez un accès facilitateur instantané.
- Préparer la démo : montrer le mode avion activé en live sur `/app` pour prouver le
  "offline-first", puis se connecter sur `/facilitateur` pour montrer le filtrage par zone.
