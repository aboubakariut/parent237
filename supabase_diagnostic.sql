-- Colle ceci dans SQL Editor et regarde les résultats de chaque bloc.

-- 1) Les 3 fonctions anti-récursion existent-elles ?
select proname from pg_proc where proname in ('is_valid_admin', 'is_valid_editor_or_admin', 'my_valid_zone');
-- Attendu : 3 lignes. Si vide → le patch n'a jamais été exécuté avec succès.

-- 2) Quelles policies sont actuellement actives sur profiles ?
select policyname, cmd, qual from pg_policies where tablename = 'profiles';
-- Vérifie qu'aucune ne contient "select 1 from profiles" en clair dans "qual"
-- (ça voudrait dire une ancienne version de la policy est toujours active).

-- 3) Le trigger de création auto du profil existe-t-il ?
select tgname from pg_trigger where tgname = 'on_auth_user_created';
-- Attendu : 1 ligne.

-- 4) Le profil de l'utilisateur concerné existe-t-il vraiment ?
select id, role, status, zone_code from profiles
where id = '31675c46-0634-445f-b4c6-ad4c7bae5444';
-- S'il n'y a AUCUNE ligne, le problème n'est pas la policy mais l'absence du
-- profil lui-même (le trigger ne s'est peut-être pas déclenché pour ce compte
-- précis, créé avant que le trigger n'existe).
