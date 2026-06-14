CREATE TABLE public.event_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_members TO authenticated;
GRANT ALL ON public.event_members TO service_role;

ALTER TABLE public.event_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_event(_event_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = _event_id
      AND (
        public.is_team_admin(e.team_id, _user_id)
        OR EXISTS (
          SELECT 1
          FROM public.event_members em
          WHERE em.event_id = e.id
            AND em.team_id = e.team_id
            AND em.user_id = _user_id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_event(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_event(uuid, uuid) TO authenticated, service_role;

CREATE POLICY "event admins manage assignments"
ON public.event_members
FOR ALL
TO authenticated
USING (public.is_team_admin(team_id, auth.uid()))
WITH CHECK (public.is_team_admin(team_id, auth.uid()));

CREATE POLICY "members view own event assignments"
ON public.event_members
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.validate_event_member_relation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = NEW.event_id AND e.team_id = NEW.team_id
  ) THEN
    RAISE EXCEPTION 'Evento non appartenente al team';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = NEW.team_id
      AND tm.user_id = NEW.user_id
      AND tm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'La persona non è un membro attivo del team';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_event_member_relation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_event_member_relation() TO service_role;

CREATE TRIGGER validate_event_member_relation_before_write
BEFORE INSERT OR UPDATE ON public.event_members
FOR EACH ROW EXECUTE FUNCTION public.validate_event_member_relation();

INSERT INTO public.event_members (event_id, team_id, user_id)
SELECT e.id, e.team_id, tm.user_id
FROM public.events e
JOIN public.team_members tm
  ON tm.team_id = e.team_id
 AND tm.status = 'active'
ON CONFLICT (event_id, user_id) DO NOTHING;

DROP POLICY IF EXISTS "events_select_team" ON public.events;
CREATE POLICY "events_select_assigned"
ON public.events
FOR SELECT
TO authenticated
USING (public.can_access_event(id, auth.uid()));

DROP POLICY IF EXISTS "team members view bottles" ON public.bottles;
CREATE POLICY "assigned members view bottles"
ON public.bottles
FOR SELECT
TO authenticated
USING (public.can_access_event(event_id, auth.uid()));

DROP POLICY IF EXISTS "team members view tables" ON public.club_tables;
DROP POLICY IF EXISTS "team members insert tables" ON public.club_tables;
DROP POLICY IF EXISTS "team members update tables" ON public.club_tables;
CREATE POLICY "assigned members view tables"
ON public.club_tables
FOR SELECT
TO authenticated
USING (public.can_access_event(event_id, auth.uid()));
CREATE POLICY "assigned members insert tables"
ON public.club_tables
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_event(event_id, auth.uid()));
CREATE POLICY "assigned members update tables"
ON public.club_tables
FOR UPDATE
TO authenticated
USING (public.can_access_event(event_id, auth.uid()))
WITH CHECK (public.can_access_event(event_id, auth.uid()));

DROP POLICY IF EXISTS "team members view alerts" ON public.alerts;
DROP POLICY IF EXISTS "team members insert alerts" ON public.alerts;
DROP POLICY IF EXISTS "team members update alerts" ON public.alerts;
CREATE POLICY "assigned members view alerts"
ON public.alerts
FOR SELECT
TO authenticated
USING ((event_id IS NOT NULL AND public.can_access_event(event_id, auth.uid())) OR (event_id IS NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "assigned members insert alerts"
ON public.alerts
FOR INSERT
TO authenticated
WITH CHECK ((event_id IS NOT NULL AND public.can_access_event(event_id, auth.uid())) OR (event_id IS NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "assigned members update alerts"
ON public.alerts
FOR UPDATE
TO authenticated
USING ((event_id IS NOT NULL AND public.can_access_event(event_id, auth.uid())) OR (event_id IS NULL AND public.is_team_member(team_id, auth.uid())))
WITH CHECK ((event_id IS NOT NULL AND public.can_access_event(event_id, auth.uid())) OR (event_id IS NULL AND public.is_team_member(team_id, auth.uid())));

DROP POLICY IF EXISTS "orders_select_team" ON public.table_orders;
DROP POLICY IF EXISTS "orders_insert_team" ON public.table_orders;
DROP POLICY IF EXISTS "orders_update_team" ON public.table_orders;
CREATE POLICY "assigned members view orders"
ON public.table_orders
FOR SELECT
TO authenticated
USING (public.can_access_event(event_id, auth.uid()));
CREATE POLICY "assigned members insert orders"
ON public.table_orders
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_event(event_id, auth.uid()));
CREATE POLICY "assigned members update orders"
ON public.table_orders
FOR UPDATE
TO authenticated
USING (public.can_access_event(event_id, auth.uid()))
WITH CHECK (public.can_access_event(event_id, auth.uid()));

DROP POLICY IF EXISTS "Team members can view table activity" ON public.table_activity;
DROP POLICY IF EXISTS "Team members can add their own table activity" ON public.table_activity;
CREATE POLICY "assigned members view table activity"
ON public.table_activity
FOR SELECT
TO authenticated
USING (public.can_access_event(event_id, auth.uid()));
CREATE POLICY "assigned members add own table activity"
ON public.table_activity
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_event(event_id, auth.uid()) AND actor_id = auth.uid());