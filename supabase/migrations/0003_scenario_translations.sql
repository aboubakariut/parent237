-- Migration 0003 — support multilingue du contenu pédagogique.
-- `translations` stocke les versions traduites par langue, ex :
--   { "en": { "theme": "...", "situation": "...", "narration": "...", "choices": [...] } }
-- La langue de base (français) reste dans les colonnes existantes (theme,
-- situation, narration, choices) — aucune donnée existante n'est perdue.
alter table scenarios add column if not exists translations jsonb not null default '{}'::jsonb;
