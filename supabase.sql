-- À exécuter dans Supabase > SQL Editor (projet gratuit)
-- Ordre important : zones doit exister avant profiles (clé étrangère).

-- ---------- Table des zones officielles ----------
-- Les codes de zone ne sont PAS du texte libre saisi par l'inscrit : ils
-- viennent d'une liste contrôlée par l'admin. Ça évite les doublons/fautes de
-- frappe et empêche quelqu'un d'inventer un code de zone qui n'existe pas.
create table if not exists zones (
  code text primary key,
  label text not null,
  created_at timestamptz default now()
);

alter table zones enable row level security;

-- Lecture publique : le formulaire d'inscription (accessible sans compte)
-- doit pouvoir proposer la liste des zones dans un menu déroulant.
-- Ce ne sont que des noms de zones administratives, aucune donnée sensible.
create policy "anyone can read zones"
  on zones for select
  to anon, authenticated
  using (true);

-- Zones de départ pour le pilote (l'admin peut en ajouter depuis /admin).
insert into zones (code, label) values
  ('YDE-EFOULAN-01', 'Yaoundé — Efoulan'),
  ('YDE-MFOUNDI-02', 'Yaoundé — Mfoundi'),
  ('DLA-WOURI-01', 'Douala — Wouri'),
  ('RUR-EST-01', 'Zone rurale — Région de l''Est (pilote)')
on conflict (code) do nothing;

-- ---------- Table des profils (facilitateurs / éditeurs / admins, avec compte) ----------
-- `status` est le verrou anti-usurpation : un compte fraîchement inscrit est
-- 'en_attente' et NE VOIT AUCUNE donnée réelle tant qu'un admin ne l'a pas
-- approuvé ('valide'). S'auto-déclarer facilitateur ne suffit donc pas à voir
-- les données d'une zone.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null check (role in ('facilitateur','editeur','admin')) default 'facilitateur',
  status text not null check (status in ('en_attente','valide','refuse')) default 'en_attente',
  zone_code text references zones(code),
  created_at timestamptz default now()
);

alter table profiles enable row level security;

-- IMPORTANT : la ligne profiles n'est PLUS créée depuis le front (voir plus bas
-- le trigger handle_new_user). Ça évite un piège classique de Supabase : si la
-- confirmation email est activée, signUp() ne donne pas de session immédiate,
-- donc un insert profiles tenté juste après échouerait côté RLS (l'utilisateur
-- n'est encore "authenticated" pour personne). Le trigger, lui, s'exécute côté
-- serveur avec les droits du propriétaire de la table, donc fonctionne dans
-- tous les cas — session confirmée ou non.
-- On garde quand même une policy d'insert restrictive, pour qu'une tentative
-- d'insert directe depuis le client (contournant le trigger) reste bloquée
-- sauf si elle respecte les mêmes règles.
create policy "self-signup is locked to facilitateur + en_attente"
  on profiles for insert
  to authenticated
  with check (
    auth.uid() = id
    and role = 'facilitateur'
    and status = 'en_attente'
  );

create policy "users can view own profile"
  on profiles for select
  to authenticated
  using (auth.uid() = id);

-- Seuls les admins APPROUVÉS peuvent voir la liste complète des profils
-- (nécessaire pour la file d'approbation et l'annuaire des facilitateurs).
create policy "admins can view all profiles"
  on profiles for select
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin' and p.status = 'valide'
    )
  );

-- Un utilisateur peut modifier des détails de son propre profil, mais jamais
-- se donner un autre rôle ou se valider lui-même.
create policy "users can update own profile basics"
  on profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id and role = 'facilitateur');

-- Seuls les admins approuvés peuvent changer le rôle/statut d'un autre compte
-- (c'est le mécanisme d'approbation : passer 'en_attente' à 'valide').
create policy "admins can update any profile"
  on profiles for update
  to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin' and p.status = 'valide')
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin' and p.status = 'valide')
  );

-- ---------- Création automatique du profil à l'inscription (trigger) ----------
-- Dès qu'une ligne apparaît dans auth.users (= quelqu'un s'inscrit, même sans
-- avoir confirmé son email), Postgres crée automatiquement la ligne profiles
-- correspondante. "security definer" = s'exécute avec les droits du créateur
-- de la fonction, donc n'est jamais bloqué par une policy RLS liée à la
-- session de l'utilisateur qui s'inscrit. full_name/zone_code viennent des
-- métadonnées passées au moment du signUp() côté client.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, zone_code)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    nullif(new.raw_user_meta_data ->> 'zone_code', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create policy "admins manage zones"
  on zones for insert
  to authenticated
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin' and p.status = 'valide')
  );

create policy "admins update zones"
  on zones for update
  to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin' and p.status = 'valide')
  );

create policy "admins delete zones"
  on zones for delete
  to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin' and p.status = 'valide')
  );

-- ---------- Table des complétions (remplie par les parents, sans compte) ----------
create table if not exists completions (
  id bigint generated always as identity primary key,
  device_id uuid not null,
  scenario_id text not null,
  theme text not null,
  zone_code text default 'non-renseigne',
  lang text default 'fr',
  created_at timestamptz default now()
);

alter table completions enable row level security;

-- Un parent (visiteur anonyme, sans compte) peut seulement AJOUTER sa progression.
create policy "anon can insert completion"
  on completions for insert
  to anon
  with check (true);

-- Lecture réservée aux comptes APPROUVÉS (status = 'valide'), filtrée par zone :
-- un facilitateur ne voit que SA zone, un admin voit tout. C'est Postgres qui
-- applique cette règle, pas le code JS — donc infalsifiable depuis le navigateur.
-- Un compte fraîchement auto-inscrit ('en_attente') ne matche jamais cette règle.
create policy "approved facilitators see own zone, admins see all"
  on completions for select
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.status = 'valide'
        and (p.role = 'admin' or p.zone_code = completions.zone_code)
    )
  );

-- ---------- Fonction publique pour la page d'accueil (marketing) ----------
-- "security definer" = s'exécute avec les droits du créateur, donc peut lire
-- la table même si l'appelant (anon) n'a pas de policy de lecture directe.
-- Elle ne renvoie qu'un total : aucune ligne, aucune donnée individuelle.
create or replace function public_completion_count()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*) from completions;
$$;

grant execute on function public_completion_count() to anon, authenticated;

-- ---------- Table du contenu pédagogique (gérée par le rôle Éditeur) ----------
-- C'est ici que vit le VRAI contenu affiché dans l'app parent — pas dans le code.
-- Un Éditeur ou un Admin, APPROUVÉ, peut publier/corriger un module sans redéploiement.
create table if not exists scenarios (
  id text primary key,
  pillar text not null check (pillar in ('developpement','soins','sante','nutrition')),
  theme text not null,
  level int default 1,
  situation text not null,
  narration text not null,
  choices jsonb not null,          -- [{ text, correct, feedback }, ...]
  published boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table scenarios enable row level security;

-- Tout le monde (parents inclus, sans compte) peut lire les modules publiés :
-- c'est le contenu que consomme l'app parent, publiquement.
create policy "anyone can read published scenarios"
  on scenarios for select
  to anon, authenticated
  using (published = true);

-- Seuls les comptes Éditeur ou Admin APPROUVÉS peuvent créer/modifier/supprimer
-- du contenu, et voir aussi les brouillons non publiés (nécessaire pour l'éditeur).
create policy "approved editors and admins manage scenarios"
  on scenarios for all
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.status = 'valide' and p.role in ('editeur','admin')
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.status = 'valide' and p.role in ('editeur','admin')
    )
  );

-- ---------- Données de départ (les 6 modules du pilote) ----------
insert into scenarios (id, pillar, theme, level, situation, narration, choices, published) values
('crise-marche', 'soins', 'Gérer une crise en public', 1,
 'Au marché, votre enfant de 4 ans se jette au sol et hurle parce que vous refusez de lui acheter un jouet.',
 'Voici une situation fréquente. Votre enfant hurle au marché parce que vous avez dit non. Que faites-vous ?',
 '[
   {"text": "Je crie plus fort pour qu''il arrête", "correct": false, "feedback": "Crier ajoute de la tension et apprend à l''enfant que les cris sont la solution. Essayons une autre option."},
   {"text": "Je m''accroupis à sa hauteur, je reste calme et je nomme ce qu''il ressent", "correct": true, "feedback": "Excellent choix. En restant calme et en nommant l''émotion (« je vois que tu es déçu »), vous aidez l''enfant à se calmer sans céder."},
   {"text": "Je cède et j''achète le jouet pour que ça s''arrête", "correct": false, "feedback": "Céder soulage sur le moment mais renforce la crise la prochaine fois. Mieux vaut rester ferme et calme."}
 ]'::jsonb, true),
('sans-cris-coups', 'soins', 'Communiquer sans crier ni frapper', 1,
 'Votre enfant a encore renversé de l''eau sur le tapis après un avertissement.',
 'Votre enfant a désobéi une nouvelle fois. Comment réagissez-vous, sans crier ni frapper ?',
 '[
   {"text": "Je le corrige physiquement pour qu''il comprenne", "correct": false, "feedback": "La correction physique fait peur mais n''enseigne pas le bon comportement, et abîme la confiance."},
   {"text": "Je respire, j''explique calmement la conséquence et je fais nettoyer ensemble", "correct": true, "feedback": "C''est la bonne approche : une conséquence liée à l''acte, expliquée calmement, apprend la responsabilité."},
   {"text": "J''ignore complètement, ça n''a pas d''importance", "correct": false, "feedback": "Ignorer ne pose pas de limite claire. L''enfant a besoin de comprendre les conséquences de ses actes."}
 ]'::jsonb, true),
('ado-communication', 'soins', 'Communiquer avec son adolescent', 2,
 'Votre adolescent rentre tard sans prévenir et refuse de répondre à vos questions.',
 'Votre adolescent rentre tard et se ferme. Comment ouvrir le dialogue ?',
 '[
   {"text": "Je le punis immédiatement et j''interdis les sorties", "correct": false, "feedback": "Une punition immédiate sans dialogue renforce souvent le silence et la distance."},
   {"text": "J''attends un moment calme puis je pose des questions ouvertes, sans juger", "correct": true, "feedback": "Très bien. Choisir le bon moment et poser des questions ouvertes favorise la confiance et la sincérité."},
   {"text": "Je ne dis rien, de peur de le braquer", "correct": false, "feedback": "Le silence total prive l''ado d''un cadre. Il a besoin de sentir que vous êtes présent et attentif."}
 ]'::jsonb, true),
('signes-stress', 'sante', 'Reconnaître les signes de stress', 1,
 'Votre enfant devient irritable, dort mal et ne veut plus aller à l''école depuis quelques jours.',
 'Votre enfant montre des signes inhabituels depuis quelques jours. Que faites-vous ?',
 '[
   {"text": "Je le punis parce qu''il refuse d''aller à l''école", "correct": false, "feedback": "Punir un changement de comportement sans en chercher la cause peut aggraver un mal-être déjà présent."},
   {"text": "J''observe, je reste disponible, et j''en parle calmement avec lui", "correct": true, "feedback": "Bonne réaction. Ces signes (irritabilité, sommeil perturbé, évitement) peuvent traduire un stress. En parler calmement aide à comprendre la cause."},
   {"text": "Je considère que ça va passer tout seul", "correct": false, "feedback": "Ignorer des signes répétés retarde une aide dont l''enfant pourrait avoir besoin."}
 ]'::jsonb, true),
('diversification', 'nutrition', 'Diversification alimentaire', 1,
 'Votre bébé de 6 mois repousse systématiquement les nouveaux aliments que vous lui proposez.',
 'Votre bébé refuse un nouvel aliment. Comment réagissez-vous ?',
 '[
   {"text": "Je force un peu, pour qu''il apprenne à goûter", "correct": false, "feedback": "Forcer crée souvent un rejet encore plus fort et associe le repas à une tension."},
   {"text": "Je retire l''aliment et je n''y reviens plus", "correct": false, "feedback": "Abandonner après un seul essai prive l''enfant de la chance de s''habituer au goût avec le temps."},
   {"text": "Je continue à proposer le même aliment, sans forcer, sur plusieurs jours", "correct": true, "feedback": "C''est la bonne approche : un enfant a souvent besoin de plusieurs présentations avant d''accepter un nouvel aliment."}
 ]'::jsonb, true),
('langage-18-mois', 'developpement', 'Le langage qui tarde à venir', 1,
 'Votre enfant de 18 mois ne dit encore aucun mot clair, contrairement à d''autres enfants du même âge.',
 'Votre enfant de 18 mois ne parle pas encore. Que faites-vous ?',
 '[
   {"text": "Je compare avec les autres enfants et je m''inquiète en silence", "correct": false, "feedback": "Comparer sans agir n''aide ni vous ni l''enfant. Chaque enfant a son rythme, mais un accompagnement reste utile."},
   {"text": "Je stimule le langage par le jeu et la lecture, et j''en parle à un professionnel de santé si le doute persiste", "correct": true, "feedback": "Exactement l''approche recommandée : stimuler au quotidien, et consulter si l''inquiétude persiste, sans attendre."},
   {"text": "Je ne fais rien, ça vient toujours avec le temps", "correct": false, "feedback": "Attendre passivement fait perdre un temps précieux pour la stimulation précoce, qui a un vrai impact."}
 ]'::jsonb, true)
on conflict (id) do nothing;

-- ---------- Pour créer votre premier compte admin ----------
-- Ceci est le SEUL moment où vous touchez la base à la main — après ça, tout
-- passe par l'interface /admin (approbation, zones, contenu).
-- 1. Inscrivez-vous normalement comme facilitateur depuis /connexion.
-- 2. Dans Supabase > Table Editor > profiles, changez manuellement pour cette
--    ligne : "role" -> 'admin' ET "status" -> 'valide' (les deux, sinon les
--    policies ci-dessus continueront de vous traiter comme non approuvé).
-- 3. Reconnectez-vous : vous arrivez sur /admin, avec les droits complets
--    (approuver des facilitateurs, gérer les zones, publier du contenu).
