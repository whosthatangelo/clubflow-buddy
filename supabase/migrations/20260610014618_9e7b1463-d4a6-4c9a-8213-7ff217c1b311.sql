
-- Wipe esistente (tabelle + enum)
DROP TABLE IF EXISTS public.alerts CASCADE;
DROP TABLE IF EXISTS public.club_tables CASCADE;
DROP TABLE IF EXISTS public.bottles CASCADE;
DROP TABLE IF EXISTS public.zones CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.payment_method CASCADE;
DROP TYPE IF EXISTS public.table_status CASCADE;
DROP TYPE IF EXISTS public.alert_kind CASCADE;
DROP TYPE IF EXISTS public.team_role CASCADE;
DROP TYPE IF EXISTS public.member_status CASCADE;

CREATE TYPE public.team_role AS ENUM ('admin', 'staff');
CREATE TYPE public.member_status AS ENUM ('active', 'pending');
CREATE TYPE public.payment_method AS ENUM ('cash','pos');
CREATE TYPE public.table_status AS ENUM ('arriving','checkin','at_cashier','wristbands','fish_delivered','bottle_waiting','bottle_arrived','reorder','closed');
CREATE TYPE public.alert_kind AS ENUM ('whatsapp_msg','bottle_late','help_needed');

-- TEAMS
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.team_role NOT NULL DEFAULT 'staff',
  status public.member_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
CREATE INDEX idx_team_members_user ON public.team_members(user_id);
CREATE INDEX idx_team_members_team ON public.team_members(team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_team_member(_team_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.team_members WHERE team_id = _team_id AND user_id = _user_id AND status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.is_team_admin(_team_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.team_members WHERE team_id = _team_id AND user_id = _user_id AND role = 'admin' AND status = 'active');
$$;

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "members view their teams" ON public.teams FOR SELECT TO authenticated USING (public.is_team_member(id, auth.uid()));
CREATE POLICY "any auth user creates a team" ON public.teams FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "admins update their team" ON public.teams FOR UPDATE TO authenticated USING (public.is_team_admin(id, auth.uid()));
CREATE POLICY "admins delete their team" ON public.teams FOR DELETE TO authenticated USING (public.is_team_admin(id, auth.uid()));

CREATE POLICY "members view their team members" ON public.team_members FOR SELECT TO authenticated USING (public.is_team_member(team_id, auth.uid()));
CREATE POLICY "admins or self add team members" ON public.team_members FOR INSERT TO authenticated WITH CHECK (
  public.is_team_admin(team_id, auth.uid())
  OR (user_id = auth.uid() AND NOT EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = team_members.team_id))
);
CREATE POLICY "admins update team members" ON public.team_members FOR UPDATE TO authenticated USING (public.is_team_admin(team_id, auth.uid()));
CREATE POLICY "admins or self remove" ON public.team_members FOR DELETE TO authenticated USING (public.is_team_admin(team_id, auth.uid()) OR user_id = auth.uid());

-- TEAM_INVITES
CREATE TABLE public.team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  email TEXT,
  role public.team_role NOT NULL DEFAULT 'staff',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_team_invites_token ON public.team_invites(token);
CREATE INDEX idx_team_invites_team ON public.team_invites(team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_invites TO authenticated;
GRANT ALL ON public.team_invites TO service_role;
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins view team invites" ON public.team_invites FOR SELECT TO authenticated USING (public.is_team_admin(team_id, auth.uid()));
CREATE POLICY "admins create invites" ON public.team_invites FOR INSERT TO authenticated WITH CHECK (public.is_team_admin(team_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "admins update invites" ON public.team_invites FOR UPDATE TO authenticated USING (public.is_team_admin(team_id, auth.uid()));
CREATE POLICY "admins delete invites" ON public.team_invites FOR DELETE TO authenticated USING (public.is_team_admin(team_id, auth.uid()));

-- TEAM_SETTINGS
CREATE TABLE public.team_settings (
  team_id UUID PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  twilio_account_sid TEXT,
  twilio_auth_token TEXT,
  twilio_whatsapp_number TEXT,
  webhook_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_settings TO authenticated;
GRANT ALL ON public.team_settings TO service_role;
ALTER TABLE public.team_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins view team settings" ON public.team_settings FOR SELECT TO authenticated USING (public.is_team_admin(team_id, auth.uid()));
CREATE POLICY "admins insert team settings" ON public.team_settings FOR INSERT TO authenticated WITH CHECK (public.is_team_admin(team_id, auth.uid()));
CREATE POLICY "admins update team settings" ON public.team_settings FOR UPDATE TO authenticated USING (public.is_team_admin(team_id, auth.uid()));

-- ZONES
CREATE TABLE public.zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  min_per_person INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_zones_team ON public.zones(team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zones TO authenticated;
GRANT ALL ON public.zones TO service_role;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team members view zones" ON public.zones FOR SELECT TO authenticated USING (public.is_team_member(team_id, auth.uid()));
CREATE POLICY "team admins manage zones" ON public.zones FOR ALL TO authenticated USING (public.is_team_admin(team_id, auth.uid())) WITH CHECK (public.is_team_admin(team_id, auth.uid()));

-- BOTTLES
CREATE TABLE public.bottles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bottles_team ON public.bottles(team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bottles TO authenticated;
GRANT ALL ON public.bottles TO service_role;
ALTER TABLE public.bottles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team members view bottles" ON public.bottles FOR SELECT TO authenticated USING (public.is_team_member(team_id, auth.uid()));
CREATE POLICY "team admins manage bottles" ON public.bottles FOR ALL TO authenticated USING (public.is_team_admin(team_id, auth.uid())) WITH CHECK (public.is_team_admin(team_id, auth.uid()));

-- CLUB_TABLES
CREATE TABLE public.club_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  zone_id UUID REFERENCES public.zones(id) ON DELETE SET NULL,
  ref_name TEXT NOT NULL,
  whatsapp TEXT,
  people_count INTEGER NOT NULL DEFAULT 0,
  selected_bottle_ids UUID[],
  total_amount NUMERIC,
  payment_method public.payment_method,
  status public.table_status NOT NULL DEFAULT 'arriving',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  check_in_at TIMESTAMPTZ,
  fish_delivered_at TIMESTAMPTZ,
  bottle_waiting_at TIMESTAMPTZ,
  bottle_arrived_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_club_tables_team ON public.club_tables(team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_tables TO authenticated;
GRANT ALL ON public.club_tables TO service_role;
ALTER TABLE public.club_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team members view tables" ON public.club_tables FOR SELECT TO authenticated USING (public.is_team_member(team_id, auth.uid()));
CREATE POLICY "team members insert tables" ON public.club_tables FOR INSERT TO authenticated WITH CHECK (public.is_team_member(team_id, auth.uid()));
CREATE POLICY "team members update tables" ON public.club_tables FOR UPDATE TO authenticated USING (public.is_team_member(team_id, auth.uid()));
CREATE POLICY "team admins delete tables" ON public.club_tables FOR DELETE TO authenticated USING (public.is_team_admin(team_id, auth.uid()));
CREATE TRIGGER trg_club_tables_updated BEFORE UPDATE ON public.club_tables FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ALERTS
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  table_id UUID REFERENCES public.club_tables(id) ON DELETE CASCADE,
  kind public.alert_kind NOT NULL,
  message TEXT,
  claimed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_team ON public.alerts(team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team members view alerts" ON public.alerts FOR SELECT TO authenticated USING (public.is_team_member(team_id, auth.uid()));
CREATE POLICY "team members insert alerts" ON public.alerts FOR INSERT TO authenticated WITH CHECK (public.is_team_member(team_id, auth.uid()));
CREATE POLICY "team members update alerts" ON public.alerts FOR UPDATE TO authenticated USING (public.is_team_member(team_id, auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.club_tables;
ALTER TABLE public.alerts REPLICA IDENTITY FULL;
ALTER TABLE public.club_tables REPLICA IDENTITY FULL;
