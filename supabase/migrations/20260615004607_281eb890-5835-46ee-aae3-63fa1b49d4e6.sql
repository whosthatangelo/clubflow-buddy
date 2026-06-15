DROP TRIGGER IF EXISTS validate_club_tables_relations_before_write ON public.club_tables;
DROP TRIGGER IF EXISTS validate_bottles_relations_before_write ON public.bottles;
DROP TRIGGER IF EXISTS validate_alerts_relations_before_write ON public.alerts;
DROP TRIGGER IF EXISTS validate_table_orders_relations_before_write ON public.table_orders;
DROP TRIGGER IF EXISTS log_club_table_status_change_after_update ON public.club_tables;