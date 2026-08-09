-- =====================================================================
-- Migration 0004 — Intégrité des données, sessions de formation,
--                  garde-fous d'écriture, inscription robuste.
--
-- NE PAS mettre de begin/commit ici : scripts/migrate.mjs enveloppe
-- automatiquement chaque fichier dans une transaction.
-- Idempotente : peut être rejouée sans dommage.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Zone "non renseignée" réelle
-- ---------------------------------------------------------------------
-- `completions.zone_code` valait 'non-renseigne' par défaut alors que ce
-- code n'existait pas dans `zones`. On le crée pour pouvoir poser une
-- vraie clé étrangère sans perdre les lignes déjà enregistrées.
insert into zones (code, label)
values ('non-renseigne', 'Zone non renseignée (déclaratif parent)')
on conflict (code) do nothing;


-- ---------------------------------------------------------------------
-- 2. Intégrité de la table `completions`
-- ---------------------------------------------------------------------
-- 2.1 Colonnes de traçabilité.
alter table completions add column if not exists client_id   uuid;
alter table completions add column if not exists recorded_at timestamptz not null default now();
alter table completions add column if not exists source      text not null default 'anonyme';

-- `created_at` est déclaré par le client (utile pour une saisie hors ligne
-- datée), `recorded_at` est l'heure serveur : c'est elle qui fait foi pour
-- les quotas, sinon un client peut antidater pour contourner la limite.

do $$ begin
  alter table completions
    add constraint completions_source_chk check (source in ('anonyme', 'verifie'));
exception when duplicate_object then null; end $$;

-- 2.2 Idempotence : une même complétion renvoyée deux fois par la file
--     hors ligne ne doit compter qu'une fois.
create unique index if not exists completions_client_id_uniq
  on completions (client_id);

-- 2.3 Zone contrôlée : on remappe l'existant avant de poser la contrainte.
update completions
   set zone_code = 'non-renseigne'
 where zone_code is null
    or not exists (select 1 from zones z where z.code = completions.zone_code);

alter table completions alter column zone_code set default 'non-renseigne';
alter table completions alter column zone_code set not null;

do $$ begin
  alter table completions
    add constraint completions_zone_fk foreign key (zone_code) references zones(code);
exception when duplicate_object then null; end $$;

-- 2.4 Index de lecture pour les tableaux de bord.
create index if not exists completions_zone_recorded_idx on completions (zone_code, recorded_at desc);
create index if not exists completions_device_recorded_idx on completions (device_id, recorded_at desc);


-- ---------------------------------------------------------------------
-- 3. Écriture anonyme : fermer la porte grande ouverte
-- ---------------------------------------------------------------------
-- L'ancienne policy `with check (true)` autorisait n'importe qui, muni de
-- la clé anon (publique par nature), à injecter des complétions en masse
-- dans la zone de son choix. Une donnée de suivi falsifiable n'est pas
-- une donnée de suivi. On la remplace par une RPC contrôlée.
drop policy if exists "anon can insert completion" on completions;

create or replace function public.record_completion(
  p_client_id   uuid,
  p_device_id   uuid,
  p_scenario_id text,
  p_theme       text,
  p_zone_code   text default 'non-renseigne',
  p_lang        text default 'fr',
  p_created_at  timestamptz default now()
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone  text;
  v_count int;
begin
  if p_client_id is null or p_device_id is null then
    raise exception 'client_id et device_id sont obligatoires' using errcode = '22023';
  end if;

  -- Le scénario doit exister : interdit d'inventer un module.
  if not exists (select 1 from scenarios where id = p_scenario_id) then
    raise exception 'scenario_id inconnu' using errcode = '22023';
  end if;

  -- Zone inconnue -> repli neutre, jamais l'empoisonnement d'une zone réelle.
  select code into v_zone from zones where code = p_zone_code;
  if v_zone is null then v_zone := 'non-renseigne'; end if;

  -- Limitation de débit : RLS ne sait pas compter, une fonction si.
  select count(*) into v_count
    from completions
   where device_id = p_device_id
     and recorded_at > now() - interval '1 hour';
  if v_count >= 40 then
    raise exception 'quota horaire atteint pour cet appareil' using errcode = '54000';
  end if;

  insert into completions
    (client_id, device_id, scenario_id, theme, zone_code, lang, created_at, source)
  values
    (p_client_id, p_device_id, p_scenario_id, p_theme, v_zone, coalesce(p_lang, 'fr'),
     coalesce(p_created_at, now()), 'anonyme')
  on conflict (client_id) do nothing;   -- rejeu de la file hors ligne : sans effet

  return 'ok';
end;
$$;

revoke all on function public.record_completion(uuid, uuid, text, text, text, text, timestamptz) from public;
grant execute on function public.record_completion(uuid, uuid, text, text, text, text, timestamptz) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. Sessions de formation — la fiche de pointage du guide MINPROFF
-- ---------------------------------------------------------------------
-- C'est la donnée non falsifiable du tableau de bord : elle est saisie par
-- un compte authentifié ET approuvé, dans sa propre zone.
create table if not exists sessions (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid unique,                      -- idempotence hors ligne
  facilitator_id       uuid not null references profiles(id) default auth.uid(),
  zone_code            text not null references zones(code),
  commune              text not null,
  localite             text not null,
  groupe               text not null,
  module_id            text references scenarios(id),
  module_libelle       text not null,
  tenue_le             date not null,
  participants_total   int  not null check (participants_total >= 0 and participants_total <= 500),
  participants_femmes  int  not null default 0 check (participants_femmes >= 0),
  participants_hommes  int  not null default 0 check (participants_hommes >= 0),
  participants_handicap int not null default 0 check (participants_handicap >= 0),
  observations         text,
  created_at           timestamptz not null default now(),
  constraint sessions_repartition_chk
    check (participants_femmes + participants_hommes <= participants_total),
  constraint sessions_handicap_chk
    check (participants_handicap <= participants_total),
  constraint sessions_date_chk
    check (tenue_le <= (now() at time zone 'utc')::date + 1)
);

create index if not exists sessions_zone_date_idx on sessions (zone_code, tenue_le desc);
create index if not exists sessions_facilitator_idx on sessions (facilitator_id, tenue_le desc);

alter table sessions enable row level security;

-- Saisie : facilitateur approuvé, dans SA zone, en son propre nom.
drop policy if exists "approved facilitators insert own zone sessions" on sessions;
create policy "approved facilitators insert own zone sessions"
on sessions for insert to authenticated
with check (
  facilitator_id = auth.uid()
  and (is_valid_admin() or zone_code = my_valid_zone())
);

-- Lecture : sa zone pour le facilitateur, tout pour l'admin.
drop policy if exists "approved facilitators read own zone sessions" on sessions;
create policy "approved facilitators read own zone sessions"
on sessions for select to authenticated
using (is_valid_admin() or zone_code = my_valid_zone());

-- Correction : sa propre saisie, pendant 7 jours. L'admin sans limite.
drop policy if exists "facilitators fix own recent sessions" on sessions;
create policy "facilitators fix own recent sessions"
on sessions for update to authenticated
using (
  is_valid_admin()
  or (facilitator_id = auth.uid() and created_at > now() - interval '7 days')
)
with check (
  is_valid_admin()
  or (facilitator_id = auth.uid() and zone_code = my_valid_zone())
);

-- Suppression réservée à l'admin : une fiche de pointage ne s'efface pas.
drop policy if exists "admins delete sessions" on sessions;
create policy "admins delete sessions"
on sessions for delete to authenticated
using (is_valid_admin());


-- ---------------------------------------------------------------------
-- 5. Compteurs publics — distinguer vérifié et déclaratif
-- ---------------------------------------------------------------------
create or replace function public.public_stats()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'completions_total',   (select count(*) from completions),
    'sessions_total',      (select count(*) from sessions),
    'parents_en_session',  (select coalesce(sum(participants_total), 0) from sessions),
    'zones_couvertes',     (select count(distinct zone_code) from sessions),
    'facilitateurs_actifs',(select count(distinct facilitator_id) from sessions
                             where tenue_le > (now() at time zone 'utc')::date - 30)
  );
$$;

revoke all on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. Inscription : ne plus casser la création de compte
-- ---------------------------------------------------------------------
-- Avant : un zone_code absent de `zones` violait la clé étrangère, le
-- trigger échouait, et l'insertion dans auth.users était annulée — donc
-- une erreur 500 opaque à l'inscription. Désormais la zone invalide est
-- neutralisée et toute erreur inattendue laisse le compte se créer.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone text;
begin
  select code into v_zone
    from zones
   where code = nullif(new.raw_user_meta_data ->> 'zone_code', '');

  insert into public.profiles (id, full_name, zone_code)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'Sans nom'),
    v_zone
  )
  on conflict (id) do nothing;

  return new;
exception when others then
  raise warning 'handle_new_user: profil non créé pour % (%)', new.id, sqlerrm;
  return new;   -- la création du compte ne doit jamais échouer à cause du profil
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
