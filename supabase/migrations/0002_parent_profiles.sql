-- Migration 0002 — profil parent (nom, téléphone, région), sans compte.
-- Objectif : savoir "à qui" appartient un certificat, et rattacher enfin les
-- complétions à une vraie zone (jusqu'ici zone_code n'était jamais renseigné
-- côté parent, donc les dashboards facilitateur ne recevaient jamais rien).

create table if not exists parent_profiles (
  device_id uuid primary key,
  full_name text not null,
  phone text,
  zone_code text references zones(code),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table parent_profiles enable row level security;

-- Un parent (sans compte) peut créer ou mettre à jour SA fiche, identifiée
-- par son device_id local. Limite assumée, documentée dans README : sans
-- authentification parent, rien n'empêche techniquement de cibler un autre
-- device_id via l'API directement (peu probable en pratique, device_id est
-- un UUID aléatoire non deviné) — acceptable pour un pilote à faible
-- sensibilité (pas de données de santé), à muscler avant un passage à l'échelle.
drop policy if exists "anon can insert own parent profile" on parent_profiles;
create policy "anon can insert own parent profile"
  on parent_profiles for insert to anon with check (true);

drop policy if exists "anon can update own parent profile" on parent_profiles;
create policy "anon can update own parent profile"
  on parent_profiles for update to anon using (true) with check (true);

-- Lecture réservée aux comptes approuvés, filtrée par zone (même logique que
-- `completions`) : un facilitateur voit les parents de SA zone, un admin voit tout.
drop policy if exists "approved facilitators see zone parents, admins see all" on parent_profiles;
create policy "approved facilitators see zone parents, admins see all"
  on parent_profiles for select to authenticated
  using (is_valid_admin() or zone_code = my_valid_zone());
