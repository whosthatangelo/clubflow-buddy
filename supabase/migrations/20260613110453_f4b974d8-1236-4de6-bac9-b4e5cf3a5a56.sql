CREATE TABLE public.table_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES public.club_tables(id) ON DELETE CASCADE,
  actor_id UUID,
  action TEXT NOT NULL,
  from_status public.table_status,
  to_status public.table_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.table_activity TO authenticated;
GRANT ALL ON public.table_activity TO service_role;

ALTER TABLE public.table_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view table activity"
ON public.table_activity FOR SELECT TO authenticated
USING (public.is_team_member(team_id, auth.uid()));

CREATE POLICY "Team members can add their own table activity"
ON public.table_activity FOR INSERT TO authenticated
WITH CHECK (public.is_team_member(team_id, auth.uid()) AND actor_id = auth.uid());

CREATE INDEX table_activity_event_created_idx ON public.table_activity(event_id, created_at DESC);
CREATE INDEX table_activity_table_created_idx ON public.table_activity(table_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_club_table_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.table_activity (
      team_id, event_id, table_id, actor_id, action, from_status, to_status
    ) VALUES (
      NEW.team_id, NEW.event_id, NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER log_club_table_status_change
AFTER UPDATE OF status ON public.club_tables
FOR EACH ROW
EXECUTE FUNCTION public.log_club_table_status_change();