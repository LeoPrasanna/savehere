-- Enable Row Level Security on every application table.
--
-- WHY THIS IS NOT OPTIONAL
-- ------------------------
-- Once these tables live in Supabase Postgres, Supabase automatically exposes
-- them over PostgREST at  https://<project>.supabase.co/rest/v1/<table>  , and
-- the ONLY thing standing between the public internet and those rows is RLS.
-- The publishable/anon key (EXPO_PUBLIC_SUPABASE_ANON_KEY) ships inside the
-- mobile bundle and is trivially extractable from any installed app. With RLS
-- off, anyone holding that key can read and write EVERY user's rows directly —
-- bypassing the FastAPI ownership checks entirely. Concretely they could:
--   * read every user's saved links and notes            (privacy breach)
--   * UPDATE ai_usage SET count = 0                      (defeats the AI quota,
--                                                          i.e. the cost ceiling)
--   * forge trial_grants                                 (unlimited free trials)
--
-- THE MODEL HERE: DENY-ALL TO CLIENTS
-- -----------------------------------
-- The mobile app never queries these tables — it uses Supabase for AUTH ONLY
-- (supabase.auth.*), and all data flows through the FastAPI backend. The backend
-- connects with the service-role key, which BYPASSES RLS by design. So we enable
-- RLS and deliberately create NO policies: anon/authenticated get nothing, the
-- backend keeps working unchanged. Least privilege, zero app changes.
--
-- If you later let the client read a table directly, add a scoped policy then —
-- and only then. Template at the bottom of this file.
--
-- FORCE matters: without it the table OWNER role still bypasses RLS. Depending
-- on which role your pooled connection uses, that alone can be the hole.
--
-- Safe to re-run (idempotent).

ALTER TABLE reels                ENABLE ROW LEVEL SECURITY;
ALTER TABLE reels                FORCE  ROW LEVEL SECURITY;

ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles             FORCE  ROW LEVEL SECURITY;

ALTER TABLE ai_usage             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage             FORCE  ROW LEVEL SECURITY;

ALTER TABLE trial_grants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_grants         FORCE  ROW LEVEL SECURITY;

ALTER TABLE tasks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                FORCE  ROW LEVEL SECURITY;

ALTER TABLE workout_exercises    ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_exercises    FORCE  ROW LEVEL SECURITY;

ALTER TABLE extraction_cache     ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_cache     FORCE  ROW LEVEL SECURITY;

-- ai_action_log holds the descriptive AI-usage log (reel titles + question text).
-- Added after the tables above — must be locked down the same way.
ALTER TABLE ai_action_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_action_log         FORCE  ROW LEVEL SECURITY;


-- ── Verify ───────────────────────────────────────────────────────────────────
-- Every row must show rowsecurity = true AND relforcerowsecurity = true.
--
--   SELECT c.relname            AS table,
--          c.relrowsecurity     AS rls_enabled,
--          c.relforcerowsecurity AS rls_forced
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r'
--   ORDER BY 1;
--
-- Then prove it from the outside — this MUST return [] (not rows):
--
--   curl "https://<project>.supabase.co/rest/v1/reels?select=*" \
--        -H "apikey: <your EXPO_PUBLIC_SUPABASE_ANON_KEY>"
--
-- If that returns data, RLS is not doing its job. Do not ship.


-- ── Template: ONLY if you later expose a table to the client directly ────────
-- Do not add these pre-emptively. Deny-all is the safer default for this app.
--
--   CREATE POLICY "own rows" ON reels
--     FOR ALL
--     TO authenticated
--     USING      (auth.uid()::text = user_id)   -- rows they may read
--     WITH CHECK (auth.uid()::text = user_id);  -- rows they may write
--
-- Note: ai_usage, trial_grants and profiles must NEVER get a client write
-- policy — they are the quota/trial ledgers. A user who can write them can
-- grant themselves unlimited AI spend.
