
-- Wipe existing operational data (start fresh)
DELETE FROM public.alerts;
DELETE FROM public.club_tables;
DELETE FROM public.bottles;

-- ============ FORMATS ============
CREATE TABLE public.formats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formats TO authenticated;
GRANT ALL ON public.formats TO service_role;
ALTER TABLE public.formats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "formats_select_team" ON public.formats FOR SELECT TO authenticated USING (public.is_team_member(team_id, auth.uid()));
CREATE POLICY "formats_admin_write" ON public.formats FOR ALL TO authenticated USING (public.is_team_admin(team_id, auth.uid())) WITH CHECK (public.is_team_admin(team_id, auth.uid()));

-- ============ EVENT STATUS ENUM ============
CREATE TYPE public.event_status AS ENUM ('upcoming', 'active', 'archived');

-- ============ EVENTS ============
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  date date NOT NULL,
  headliner text,
  format_id uuid REFERENCES public.formats(id) ON DELETE SET NULL,
  venue text,
  notes text,
  status public.event_status NOT NULL DEFAULT 'upcoming',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_select_team" ON public.events FOR SELECT TO authenticated USING (public.is_team_member(team_id, auth.uid()));
CREATE POLICY "events_insert_team" ON public.events FOR INSERT TO authenticated WITH CHECK (public.is_team_member(team_id, auth.uid()));
CREATE POLICY "events_update_team" ON public.events FOR UPDATE TO authenticated USING (public.is_team_member(team_id, auth.uid())) WITH CHECK (public.is_team_member(team_id, auth.uid()));
CREATE POLICY "events_delete_admin" ON public.events FOR DELETE TO authenticated USING (public.is_team_admin(team_id, auth.uid()));
CREATE TRIGGER events_touch BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_events_team_date ON public.events(team_id, date DESC);

-- ============ Add event_id to bottles ============
ALTER TABLE public.bottles ADD COLUMN event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE;
CREATE INDEX idx_bottles_event ON public.bottles(event_id);

-- ============ Add event_id + notes to club_tables ============
ALTER TABLE public.club_tables ADD COLUMN event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE public.club_tables ADD COLUMN notes text;
CREATE INDEX idx_club_tables_event ON public.club_tables(event_id);

-- ============ Add event_id to alerts ============
ALTER TABLE public.alerts ADD COLUMN event_id uuid REFERENCES public.events(id) ON DELETE CASCADE;
CREATE INDEX idx_alerts_event ON public.alerts(event_id);

-- ============ TABLE ORDERS ============
CREATE TYPE public.order_type AS ENUM ('checkin', 'reorder');

CREATE TABLE public.table_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.club_tables(id) ON DELETE CASCADE,
  type public.order_type NOT NULL,
  bottles jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{bottle_id, name, price_actual, price_list}]
  total numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_orders TO authenticated;
GRANT ALL ON public.table_orders TO service_role;
ALTER TABLE public.table_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_select_team" ON public.table_orders FOR SELECT TO authenticated USING (public.is_team_member(team_id, auth.uid()));
CREATE POLICY "orders_insert_team" ON public.table_orders FOR INSERT TO authenticated WITH CHECK (public.is_team_member(team_id, auth.uid()));
CREATE POLICY "orders_update_team" ON public.table_orders FOR UPDATE TO authenticated USING (public.is_team_member(team_id, auth.uid())) WITH CHECK (public.is_team_member(team_id, auth.uid()));
CREATE POLICY "orders_delete_team" ON public.table_orders FOR DELETE TO authenticated USING (public.is_team_member(team_id, auth.uid()));
CREATE INDEX idx_orders_table ON public.table_orders(table_id, created_at);
CREATE INDEX idx_orders_event ON public.table_orders(event_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.table_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.formats;
