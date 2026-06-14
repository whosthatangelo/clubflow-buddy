CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.can_access_event(_event_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
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

REVOKE ALL ON FUNCTION private.can_access_event(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_event(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "events_select_assigned" ON public.events;
CREATE POLICY "events_select_assigned" ON public.events FOR SELECT TO authenticated
USING (private.can_access_event(id, auth.uid()));

DROP POLICY IF EXISTS "assigned members view bottles" ON public.bottles;
CREATE POLICY "assigned members view bottles" ON public.bottles FOR SELECT TO authenticated
USING (private.can_access_event(event_id, auth.uid()));

DROP POLICY IF EXISTS "assigned members view tables" ON public.club_tables;
DROP POLICY IF EXISTS "assigned members insert tables" ON public.club_tables;
DROP POLICY IF EXISTS "assigned members update tables" ON public.club_tables;
CREATE POLICY "assigned members view tables" ON public.club_tables FOR SELECT TO authenticated
USING (private.can_access_event(event_id, auth.uid()));
CREATE POLICY "assigned members insert tables" ON public.club_tables FOR INSERT TO authenticated
WITH CHECK (private.can_access_event(event_id, auth.uid()));
CREATE POLICY "assigned members update tables" ON public.club_tables FOR UPDATE TO authenticated
USING (private.can_access_event(event_id, auth.uid()))
WITH CHECK (private.can_access_event(event_id, auth.uid()));

DROP POLICY IF EXISTS "assigned members view alerts" ON public.alerts;
DROP POLICY IF EXISTS "assigned members insert alerts" ON public.alerts;
DROP POLICY IF EXISTS "assigned members update alerts" ON public.alerts;
CREATE POLICY "assigned members view alerts" ON public.alerts FOR SELECT TO authenticated
USING ((event_id IS NOT NULL AND private.can_access_event(event_id, auth.uid())) OR (event_id IS NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "assigned members insert alerts" ON public.alerts FOR INSERT TO authenticated
WITH CHECK ((event_id IS NOT NULL AND private.can_access_event(event_id, auth.uid())) OR (event_id IS NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "assigned members update alerts" ON public.alerts FOR UPDATE TO authenticated
USING ((event_id IS NOT NULL AND private.can_access_event(event_id, auth.uid())) OR (event_id IS NULL AND public.is_team_member(team_id, auth.uid())))
WITH CHECK ((event_id IS NOT NULL AND private.can_access_event(event_id, auth.uid())) OR (event_id IS NULL AND public.is_team_member(team_id, auth.uid())));

DROP POLICY IF EXISTS "assigned members view orders" ON public.table_orders;
DROP POLICY IF EXISTS "assigned members insert orders" ON public.table_orders;
DROP POLICY IF EXISTS "assigned members update orders" ON public.table_orders;
CREATE POLICY "assigned members view orders" ON public.table_orders FOR SELECT TO authenticated
USING (private.can_access_event(event_id, auth.uid()));
CREATE POLICY "assigned members insert orders" ON public.table_orders FOR INSERT TO authenticated
WITH CHECK (private.can_access_event(event_id, auth.uid()));
CREATE POLICY "assigned members update orders" ON public.table_orders FOR UPDATE TO authenticated
USING (private.can_access_event(event_id, auth.uid()))
WITH CHECK (private.can_access_event(event_id, auth.uid()));

DROP POLICY IF EXISTS "assigned members view table activity" ON public.table_activity;
DROP POLICY IF EXISTS "assigned members add own table activity" ON public.table_activity;
CREATE POLICY "assigned members view table activity" ON public.table_activity FOR SELECT TO authenticated
USING (private.can_access_event(event_id, auth.uid()));
CREATE POLICY "assigned members add own table activity" ON public.table_activity FOR INSERT TO authenticated
WITH CHECK (private.can_access_event(event_id, auth.uid()) AND actor_id = auth.uid());

DROP FUNCTION public.can_access_event(uuid, uuid);