-- Migration 0001 — schéma complet de Parent+237.
-- IDEMPOTENTE : peut être exécutée plusieurs fois sans erreur (create table if
-- not exists, drop policy if exists + create, create or replace function).
-- Ordre important : zones avant profiles (clé étrangère).

-- ---------- Table des zones officielles ----------
create table if not exists zones (
  code text primary key,
  label text not null,
  created_at timestamptz default now()
);

alter table zones enable row level security;

drop policy if exists "anyone can read zones" on zones;
create policy "anyone can read zones"
  on zones for select
  to anon, authenticated
  using (true);

insert into zones (code, label) values
  ('YDE-EFOULAN-01', 'Yaoundé — Efoulan'),
  ('YDE-MFOUNDI-02', 'Yaoundé — Mfoundi'),
  ('DLA-WOURI-01', 'Douala — Wouri'),
  ('RUR-EST-01', 'Zone rurale — Région de l''Est (pilote)')
on conflict (code) do nothing;

-- ---------- Table des profils ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null check (role in ('facilitateur','editeur','admin')) default 'facilitateur',
  status text not null check (status in ('en_attente','valide','refuse')) default 'en_attente',
  zone_code text references zones(code),
  created_at timestamptz default now()
);

alter table profiles enable row level security;

drop policy if exists "self-signup is locked to facilitateur + en_attente" on profiles;
create policy "self-signup is locked to facilitateur + en_attente"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id and role = 'facilitateur' and status = 'en_attente');

drop policy if exists "users can view own profile" on profiles;
create policy "users can view own profile"
  on profiles for select
  to authenticated
  using (auth.uid() = id);

-- ---------- Fonctions anti-récursion (security definer) ----------
create or replace function public.is_valid_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and status = 'valide');
$$;

create or replace function public.is_valid_editor_or_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('editeur','admin') and status = 'valide');
$$;

create or replace function public.my_valid_zone()
returns text language sql security definer set search_path = public as $$
  select zone_code from profiles where id = auth.uid() and status = 'valide';
$$;

drop policy if exists "admins can view all profiles" on profiles;
create policy "admins can view all profiles"
  on profiles for select
  to authenticated
  using (is_valid_admin());

-- CORRIGÉ : la version précédente forçait "role = 'facilitateur'" dans le
-- with check, ce qui empêchait un éditeur ou un admin de modifier son PROPRE
-- profil (ex : changer son nom depuis /profil). Le contrôle "personne ne peut
-- s'auto-élever" est maintenant fait par le trigger ci-dessous, qui compare
-- l'ancienne et la nouvelle valeur — la policy, elle, autorise simplement le
-- propriétaire de la ligne à la modifier.
drop policy if exists "users can update own profile basics" on profiles;
create policy "users can update own profile basics"
  on profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "admins can update any profile" on profiles;
create policy "admins can update any profile"
  on profiles for update
  to authenticated
  using (is_valid_admin())
  with check (is_valid_admin());

-- Empêche quiconque n'est pas déjà admin de changer son PROPRE rôle/statut,
-- même via la policy ci-dessus qui autorise la modification du reste du
-- profil (nom, zone). C'est un trigger, pas une policy, car comparer
-- "ancienne valeur vs nouvelle valeur" n'est pas exprimable proprement dans
-- un simple `with check`.
create or replace function public.prevent_self_role_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_valid_admin() then
    if new.role is distinct from old.role or new.status is distinct from old.status then
      raise exception 'Modification du rôle ou du statut réservée aux administrateurs.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_self_role_escalation on profiles;
create trigger trg_prevent_self_role_escalation
  before update on profiles
  for each row execute procedure public.prevent_self_role_escalation();

-- ---------- Création automatique du profil à l'inscription ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
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

-- ---------- Policies zones (gestion admin) ----------
drop policy if exists "admins manage zones" on zones;
create policy "admins manage zones"
  on zones for insert to authenticated with check (is_valid_admin());

drop policy if exists "admins update zones" on zones;
create policy "admins update zones"
  on zones for update to authenticated using (is_valid_admin());

drop policy if exists "admins delete zones" on zones;
create policy "admins delete zones"
  on zones for delete to authenticated using (is_valid_admin());

-- ---------- Table des complétions ----------
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

drop policy if exists "anon can insert completion" on completions;
create policy "anon can insert completion"
  on completions for insert to anon with check (true);

drop policy if exists "approved facilitators see own zone, admins see all" on completions;
create policy "approved facilitators see own zone, admins see all"
  on completions for select to authenticated
  using (is_valid_admin() or zone_code = my_valid_zone());

-- ---------- Fonction publique (compteur landing page) ----------
create or replace function public_completion_count()
returns bigint language sql security definer set search_path = public as $$
  select count(*) from completions;
$$;

grant execute on function public_completion_count() to anon, authenticated;

-- ---------- Table du contenu pédagogique ----------
create table if not exists scenarios (
  id text primary key,
  pillar text not null check (pillar in ('developpement','soins','sante','nutrition')),
  theme text not null,
  level int default 1,
  situation text not null,
  narration text not null,
  choices jsonb not null,
  published boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table scenarios enable row level security;

drop policy if exists "anyone can read published scenarios" on scenarios;
create policy "anyone can read published scenarios"
  on scenarios for select to anon, authenticated using (published = true);

drop policy if exists "approved editors and admins manage scenarios" on scenarios;
create policy "approved editors and admins manage scenarios"
  on scenarios for all to authenticated
  using (is_valid_editor_or_admin())
  with check (is_valid_editor_or_admin());

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

-- ---------- Table des abonnements push (notifications) ----------
-- Un appareil (parent, facilitateur, éditeur ou admin) qui a accepté les
-- notifications enregistre ici son "abonnement" push du navigateur. Le champ
-- profile_id est NULL pour les parents (pas de compte) — dans ce cas c'est le
-- device_id local qui sert de clé de correspondance côté app.
create table if not exists push_subscriptions (
  id bigint generated always as identity primary key,
  profile_id uuid references profiles(id) on delete cascade,
  device_id uuid,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz default now()
);

alter table push_subscriptions enable row level security;

-- N'importe qui (même anonyme) peut enregistrer un abonnement pour lui-même.
drop policy if exists "anyone can insert own push subscription" on push_subscriptions;
create policy "anyone can insert own push subscription"
  on push_subscriptions for insert
  to anon, authenticated
  with check (true);

-- Un utilisateur connecté peut supprimer ses propres abonnements (désinscription).
drop policy if exists "users can delete own push subscription" on push_subscriptions;
create policy "users can delete own push subscription"
  on push_subscriptions for delete
  to authenticated
  using (profile_id = auth.uid());

-- Seule la fonction serveur (service_role, qui contourne RLS) lit cette table
-- pour envoyer les notifications — aucune policy SELECT pour anon/authenticated,
-- c'est volontaire : ces endpoints/clés ne doivent jamais être lisibles côté client.

-- ---------- Pour créer votre premier compte admin ----------
-- 1. Inscrivez-vous normalement comme facilitateur depuis /connexion.
-- 2. Dans Supabase > Table Editor > profiles, changez pour cette ligne :
--    "role" -> 'admin' ET "status" -> 'valide'.
-- 3. Reconnectez-vous : vous arrivez sur /admin.
