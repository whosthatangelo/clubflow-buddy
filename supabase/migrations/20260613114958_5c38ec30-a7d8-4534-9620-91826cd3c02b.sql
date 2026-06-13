REVOKE ALL ON FUNCTION public.log_club_table_status_change() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.log_club_table_status_change() TO service_role;