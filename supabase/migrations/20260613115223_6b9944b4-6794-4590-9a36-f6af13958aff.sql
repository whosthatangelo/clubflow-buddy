DROP POLICY IF EXISTS "orders_delete_team" ON public.table_orders;
CREATE POLICY "orders_delete_admin" ON public.table_orders FOR DELETE TO authenticated USING (public.is_team_admin(team_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.validate_team_event_relations()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'club_tables' THEN
    IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = NEW.event_id AND e.team_id = NEW.team_id) THEN
      RAISE EXCEPTION 'Evento non appartenente al team';
    END IF;
    IF NEW.zone_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.zones z WHERE z.id = NEW.zone_id AND z.team_id = NEW.team_id) THEN
      RAISE EXCEPTION 'Zona non appartenente al team';
    END IF;
  ELSIF TG_TABLE_NAME = 'bottles' THEN
    IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = NEW.event_id AND e.team_id = NEW.team_id) THEN
      RAISE EXCEPTION 'Evento non appartenente al team';
    END IF;
  ELSIF TG_TABLE_NAME = 'alerts' THEN
    IF NEW.event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = NEW.event_id AND e.team_id = NEW.team_id) THEN
      RAISE EXCEPTION 'Evento non appartenente al team';
    END IF;
    IF NEW.table_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.club_tables t WHERE t.id = NEW.table_id AND t.team_id = NEW.team_id AND (NEW.event_id IS NULL OR t.event_id = NEW.event_id)) THEN
      RAISE EXCEPTION 'Tavolo non appartenente al team o evento';
    END IF;
  ELSIF TG_TABLE_NAME = 'table_orders' THEN
    IF NOT EXISTS (SELECT 1 FROM public.club_tables t WHERE t.id = NEW.table_id AND t.team_id = NEW.team_id AND t.event_id = NEW.event_id) THEN
      RAISE EXCEPTION 'Tavolo non appartenente al team o evento';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_team_event_relations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_team_event_relations() TO service_role;

CREATE TRIGGER validate_club_tables_team_event BEFORE INSERT OR UPDATE ON public.club_tables FOR EACH ROW EXECUTE FUNCTION public.validate_team_event_relations();
CREATE TRIGGER validate_bottles_team_event BEFORE INSERT OR UPDATE ON public.bottles FOR EACH ROW EXECUTE FUNCTION public.validate_team_event_relations();
CREATE TRIGGER validate_alerts_team_event BEFORE INSERT OR UPDATE ON public.alerts FOR EACH ROW EXECUTE FUNCTION public.validate_team_event_relations();
CREATE TRIGGER validate_table_orders_team_event BEFORE INSERT OR UPDATE ON public.table_orders FOR EACH ROW EXECUTE FUNCTION public.validate_team_event_relations();