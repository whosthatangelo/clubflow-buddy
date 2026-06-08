
-- 1) Add bottle_waiting_at to track 15-min timer
ALTER TABLE public.club_tables ADD COLUMN IF NOT EXISTS bottle_waiting_at TIMESTAMPTZ;

-- 2) Alert kind enum
DO $$ BEGIN
  CREATE TYPE public.alert_kind AS ENUM ('whatsapp_msg', 'bottle_late', 'help_needed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Alerts table
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID REFERENCES public.club_tables(id) ON DELETE CASCADE,
  kind public.alert_kind NOT NULL,
  message TEXT,
  claimed_by UUID REFERENCES auth.users(id),
  claimed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alerts select authed" ON public.alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "alerts insert authed" ON public.alerts FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "alerts update authed" ON public.alerts FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "alerts delete admin" ON public.alerts FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4) Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;

-- 5) Index
CREATE INDEX IF NOT EXISTS alerts_unresolved_idx ON public.alerts (created_at DESC) WHERE resolved_at IS NULL;
