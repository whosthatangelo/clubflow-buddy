DROP POLICY IF EXISTS "events_insert_team" ON public.events;
DROP POLICY IF EXISTS "events_update_team" ON public.events;
CREATE POLICY "events_insert_admin" ON public.events FOR INSERT TO authenticated WITH CHECK (public.is_team_admin(team_id, auth.uid()));
CREATE POLICY "events_update_admin" ON public.events FOR UPDATE TO authenticated USING (public.is_team_admin(team_id, auth.uid())) WITH CHECK (public.is_team_admin(team_id, auth.uid()));

DROP POLICY IF EXISTS "profiles select all authed" ON public.profiles;
CREATE POLICY "profiles_select_same_team_or_self" ON public.profiles FOR SELECT TO authenticated USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.team_members mine
    JOIN public.team_members theirs ON theirs.team_id = mine.team_id
    WHERE mine.user_id = auth.uid()
      AND mine.status = 'active'
      AND theirs.user_id = profiles.id
      AND theirs.status = 'active'
  )
);

REVOKE ALL ON FUNCTION public.is_team_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_team_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_club_table_status_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_team_admin(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_club_table_status_change() TO authenticated, service_role;