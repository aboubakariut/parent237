-- PATCH : corrige la récursion RLS (erreur 500) sans avoir besoin de
-- relancer tout supabase.sql. Idempotent : peut être exécuté plusieurs fois.

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
create policy "admins can view all profiles" on profiles for select to authenticated
  using (is_valid_admin());

drop policy if exists "admins can update any profile" on profiles;
create policy "admins can update any profile" on profiles for update to authenticated
  using (is_valid_admin()) with check (is_valid_admin());

drop policy if exists "admins manage zones" on zones;
create policy "admins manage zones" on zones for insert to authenticated
  with check (is_valid_admin());

drop policy if exists "admins update zones" on zones;
create policy "admins update zones" on zones for update to authenticated
  using (is_valid_admin());

drop policy if exists "admins delete zones" on zones;
create policy "admins delete zones" on zones for delete to authenticated
  using (is_valid_admin());

drop policy if exists "approved facilitators see own zone, admins see all" on completions;
create policy "approved facilitators see own zone, admins see all" on completions for select to authenticated
  using (is_valid_admin() or zone_code = my_valid_zone());

drop policy if exists "approved editors and admins manage scenarios" on scenarios;
create policy "approved editors and admins manage scenarios" on scenarios for all to authenticated
  using (is_valid_editor_or_admin()) with check (is_valid_editor_or_admin());

-- Le trigger de création automatique du profil (probablement déjà absent
-- chez toi puisque c'est ce qui causait l'erreur RLS précédente) :
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, zone_code)
  values (new.id, new.raw_user_meta_data ->> 'full_name', nullif(new.raw_user_meta_data ->> 'zone_code', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
