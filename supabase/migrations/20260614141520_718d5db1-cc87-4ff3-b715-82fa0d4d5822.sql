REVOKE EXECUTE ON FUNCTION public.is_team_admin(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION private.can_access_event(uuid, uuid) FROM authenticated;