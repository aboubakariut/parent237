-- À exécuter dans Supabase > SQL Editor (projet gratuit)

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

-- ---------- Table des profils (facilitateurs / éditeurs / admins, avec compte) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null check (role in ('facilitateur','editeur','admin')) default 'facilitateur',
  zone_code text,
  created_at timestamptz default now()
);

alter table completions enable row level security;
alter table profiles enable row level security;

-- ---------- Policies : completions ----------
-- Un parent (visiteur anonyme, sans compte) peut seulement AJOUTER sa progression.
create policy "anon can insert completion"
  on completions for insert
  to anon
  with check (true);

-- Lecture réservée aux comptes connectés (facilitateur/admin), filtrée par zone :
-- un facilitateur ne voit que SA zone, un admin voit tout. C'est Postgres qui
-- applique cette règle, pas le code JS — donc infalsifiable depuis le navigateur.
create policy "facilitators see own zone, admins see all"
  on completions for select
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.zone_code = completions.zone_code)
    )
  );

-- ---------- Policies : profiles ----------
-- Chacun peut créer son propre profil à l'inscription (jamais celui d'un autre).
create policy "users can insert own profile"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Les comptes connectés peuvent voir la liste des profils (utile pour le
-- dashboard admin qui liste les facilitateurs par zone). Aucune donnée sensible
-- n'y figure (pas de mot de passe, pas d'email affiché côté client).
create policy "authenticated can view profiles"
  on profiles for select
  to authenticated
  using (true);

create policy "users can update own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = id);

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
-- Un Éditeur ou un Admin peut publier/corriger un module sans redéploiement.
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

-- Seuls les comptes Éditeur ou Admin peuvent créer/modifier/supprimer du contenu,
-- et voir aussi les brouillons non publiés (nécessaire pour l'interface d'édition).
create policy "editors and admins manage scenarios"
  on scenarios for all
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('editeur','admin')
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('editeur','admin')
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

-- ---------- Pour créer votre premier compte admin ou éditeur ----------
-- 1. Inscrivez-vous normalement comme facilitateur depuis l'app.
-- 2. Dans Supabase > Table Editor > profiles, changez manuellement sa colonne
--    "role" de 'facilitateur' à 'admin' ou 'editeur'.
-- (Volontairement pas de self-service pour ces rôles, pour éviter qu'un visiteur
-- ne se donne lui-même un droit de publication ou d'administration.)
