
-- =========================================
-- ENUMS
-- =========================================
CREATE TYPE public.app_role AS ENUM ('admin', 'staff');

CREATE TYPE public.table_status AS ENUM (
  'arriving',
  'checkin',
  'at_cashier',
  'wristbands',
  'fish_delivered',
  'bottle_waiting',
  'bottle_arrived',
  'reorder',
  'closed'
);

CREATE TYPE public.payment_method AS ENUM ('cash', 'pos');

-- =========================================
-- PROFILES
-- =========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles select all authed" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- =========================================
-- USER ROLES
-- =========================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles select all authed" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Admin can manage roles
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- PROFILE AUTO-CREATION + FIRST USER = ADMIN
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));

  SELECT count(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- ZONES
-- =========================================
CREATE TABLE public.zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  min_per_person NUMERIC(10,2) NOT NULL CHECK (min_per_person >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zones TO authenticated;
GRANT ALL ON public.zones TO service_role;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zones select authed" ON public.zones FOR SELECT TO authenticated USING (true);
CREATE POLICY "zones admin write" ON public.zones FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "zones admin update" ON public.zones FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "zones admin delete" ON public.zones FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- =========================================
-- BOTTLES
-- =========================================
CREATE TABLE public.bottles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bottles TO authenticated;
GRANT ALL ON public.bottles TO service_role;
ALTER TABLE public.bottles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bottles select authed" ON public.bottles FOR SELECT TO authenticated USING (true);
CREATE POLICY "bottles admin write" ON public.bottles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "bottles admin update" ON public.bottles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "bottles admin delete" ON public.bottles FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- =========================================
-- TABLES (serata)
-- =========================================
CREATE TABLE public.club_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_name TEXT NOT NULL,
  whatsapp TEXT,
  people_count INT NOT NULL DEFAULT 1 CHECK (people_count >= 1),
  zone_id UUID REFERENCES public.zones(id) ON DELETE SET NULL,
  status public.table_status NOT NULL DEFAULT 'arriving',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_method public.payment_method,
  total_amount NUMERIC(10,2),
  selected_bottle_ids UUID[] DEFAULT '{}'::uuid[],
  check_in_at TIMESTAMPTZ,
  fish_delivered_at TIMESTAMPTZ,
  bottle_arrived_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_tables TO authenticated;
GRANT ALL ON public.club_tables TO service_role;
ALTER TABLE public.club_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tables select authed" ON public.club_tables FOR SELECT TO authenticated USING (true);
-- Tutti gli autenticati possono aggiornare lo stato (staff in serata)
CREATE POLICY "tables update authed" ON public.club_tables FOR UPDATE TO authenticated USING (true);
-- Solo admin crea/elimina tavoli (config pre-serata)
CREATE POLICY "tables admin insert" ON public.club_tables FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "tables admin delete" ON public.club_tables FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER club_tables_touch_updated_at
BEFORE UPDATE ON public.club_tables
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================
-- REALTIME
-- =========================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.club_tables;
ALTER PUBLICATION supabase_realtime ADD TABLE public.zones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bottles;
