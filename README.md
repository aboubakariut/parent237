# Parent+237

PWA offline-first pour le concours UNICEF Cameroon × MINPROFF « Parentalité Positive ».

## Les interfaces
| Route | Public | Description |
|---|---|---|
| `/` | Tout le monde | Page d'accueil (landing) : présentation, compteur public d'impact, CTA |
| `/app` | Parents (sans compte) | App parent : parcours, simulateur, badge à partager |
| `/connexion` | Facilitateurs, Éditeurs, Admins | Connexion / inscription (email + mot de passe) |
| `/facilitateur` | Facilitateur connecté | Dashboard filtré sur SA zone uniquement (via RLS) |
| `/editeur` | Éditeur ou Admin connecté | **Publie et modifie les modules pédagogiques**, sans redéploiement |
| `/admin` | Admin connecté | Dashboard global : toutes zones, liste des facilitateurs |

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

## 1. Installation locale
```bash
npm install
cp .env.example .env.local   # puis renseignez vos clés Supabase
npm run dev
```

## 2. Créer la base gratuite (Supabase)
1. Créez un compte sur supabase.com (tier gratuit, largement suffisant pour un pilote).
2. Nouveau projet → copiez `Project URL` et `anon public key` dans `.env.local`.
3. Dans **SQL Editor**, exécutez le contenu de `supabase.sql`.

## 3. Sécurité réelle (à comprendre avant de présenter au jury)
La clé Supabase "anon" est **conçue pour être visible côté client** — ce n'est pas une fuite.
La vraie protection vient des **policies RLS** définies dans `supabase.sql` : elles limitent
précisément ce qu'un visiteur anonyme peut faire (ici : ajouter une ligne, lire des agrégats).
L'obfuscation du build (étape 4) protège votre **code métier et votre logique**, pas les clés.

## 4. Build obfusqué (protection du code source)
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

## 5. Déployer sur Vercel
```bash
npm i -g vercel     # si pas déjà installé
vercel               # suit les invites, lie le repo
vercel --prod
```
Ou via l'interface Vercel : *Import Project* depuis GitHub, puis ajoutez dans
**Settings → Environment Variables** :
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Le fichier `vercel.json` est déjà configuré (build command, dossier `dist`, rewrites SPA).

## Créer votre premier compte admin ou éditeur
1. Depuis `/connexion`, inscrivez-vous normalement en tant que facilitateur.
2. Dans Supabase → **Table Editor → profiles**, changez manuellement la colonne `role`
   de cette ligne : `facilitateur` → `admin` ou `editeur`.
3. Reconnectez-vous : vous arrivez automatiquement sur `/admin` ou `/editeur`.

(Volontairement, personne ne peut se donner ces rôles depuis le formulaire public —
c'est une décision de sécurité et d'intégrité du contenu, pas un oubli.)

## Prochaines étapes suggérées avant le 25 août
- Enrichir `src/scenarios.js` avec les scénarios validés localement (idéalement avec un
  facilitateur MINPROFF pour la justesse culturelle) et les traductions fulfuldé/ewondo.
- Ajouter la confirmation email obligatoire dans Supabase Auth (activée par défaut) ou la
  désactiver pour la démo si vous voulez un accès facilitateur instantané.
- Préparer la démo : montrer le mode avion activé en live sur `/app` pour prouver le
  "offline-first", puis se connecter sur `/facilitateur` pour montrer le filtrage par zone.
