GRANT EXECUTE ON FUNCTION public.is_team_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_event(uuid, uuid) TO authenticated;