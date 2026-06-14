DROP POLICY IF EXISTS "members view own event assignments" ON public.event_members;
CREATE POLICY "team members view event assignments"
ON public.event_members
FOR SELECT
TO authenticated
USING (public.is_team_member(team_id, auth.uid()));