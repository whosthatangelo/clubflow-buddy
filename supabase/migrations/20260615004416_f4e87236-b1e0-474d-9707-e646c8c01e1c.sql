DROP POLICY IF EXISTS "admins or self add team members" ON public.team_members;
CREATE POLICY "admins add team members"
ON public.team_members
FOR INSERT
TO authenticated
WITH CHECK (private.is_team_admin(team_id, auth.uid()));

DROP POLICY IF EXISTS "events_insert_admin" ON public.events;
CREATE POLICY "events_insert_admin"
ON public.events
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND private.is_team_admin(team_id, auth.uid())
);

DROP POLICY IF EXISTS "events_update_admin" ON public.events;
CREATE POLICY "events_update_admin"
ON public.events
FOR UPDATE
TO authenticated
USING (private.is_team_admin(team_id, auth.uid()))
WITH CHECK (private.is_team_admin(team_id, auth.uid()));

DROP POLICY IF EXISTS "events_delete_admin" ON public.events;
CREATE POLICY "events_delete_admin"
ON public.events
FOR DELETE
TO authenticated
USING (private.is_team_admin(team_id, auth.uid()));

CREATE UNIQUE INDEX IF NOT EXISTS events_one_active_per_team_idx
ON public.events (team_id)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS event_members_team_user_idx
ON public.event_members (team_id, user_id);

CREATE INDEX IF NOT EXISTS alerts_event_open_created_idx
ON public.alerts (event_id, created_at DESC)
WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS team_members_user_status_idx
ON public.team_members (user_id, status, created_at);

DROP TRIGGER IF EXISTS validate_event_member_relation_before_write ON public.event_members;
CREATE TRIGGER validate_event_member_relation_before_write
BEFORE INSERT OR UPDATE ON public.event_members
FOR EACH ROW EXECUTE FUNCTION public.validate_event_member_relation();

DROP TRIGGER IF EXISTS validate_club_tables_relations_before_write ON public.club_tables;
CREATE TRIGGER validate_club_tables_relations_before_write
BEFORE INSERT OR UPDATE ON public.club_tables
FOR EACH ROW EXECUTE FUNCTION public.validate_team_event_relations();

DROP TRIGGER IF EXISTS validate_bottles_relations_before_write ON public.bottles;
CREATE TRIGGER validate_bottles_relations_before_write
BEFORE INSERT OR UPDATE ON public.bottles
FOR EACH ROW EXECUTE FUNCTION public.validate_team_event_relations();

DROP TRIGGER IF EXISTS validate_alerts_relations_before_write ON public.alerts;
CREATE TRIGGER validate_alerts_relations_before_write
BEFORE INSERT OR UPDATE ON public.alerts
FOR EACH ROW EXECUTE FUNCTION public.validate_team_event_relations();

DROP TRIGGER IF EXISTS validate_table_orders_relations_before_write ON public.table_orders;
CREATE TRIGGER validate_table_orders_relations_before_write
BEFORE INSERT OR UPDATE ON public.table_orders
FOR EACH ROW EXECUTE FUNCTION public.validate_team_event_relations();

DROP TRIGGER IF EXISTS log_club_table_status_change_after_update ON public.club_tables;
CREATE TRIGGER log_club_table_status_change_after_update
AFTER UPDATE OF status ON public.club_tables
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.log_club_table_status_change();