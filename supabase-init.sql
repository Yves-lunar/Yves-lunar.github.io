-- Run once in the Supabase project's SQL Editor as administrator.
-- This grants all visitors shared CRUD access ONLY to little_days_items.
-- It does not delete data or change other tables' policies.
BEGIN;

CREATE TABLE IF NOT EXISTS public.little_days_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('todo', 'note', 'diary')),
  title varchar(300) NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 50000),
  day date,
  done boolean NOT NULL DEFAULT false,
  created timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT little_days_title_required CHECK (kind = 'diary' OR length(btrim(title)) > 0),
  CONSTRAINT little_days_diary_required CHECK (kind <> 'diary' OR (day IS NOT NULL AND length(btrim(body)) > 0))
);

ALTER TABLE public.little_days_items ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.little_days_items TO anon, authenticated;

-- Re-running only replaces this app's own policy, without removing records.
DROP POLICY IF EXISTS little_days_shared_access ON public.little_days_items;
CREATE POLICY little_days_shared_access ON public.little_days_items
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Tell PostgREST to reload its table metadata after creating the table.
NOTIFY pgrst, 'reload schema';
COMMIT;
