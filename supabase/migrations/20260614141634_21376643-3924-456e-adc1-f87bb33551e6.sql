ALTER FUNCTION public.is_team_admin(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.is_team_member(uuid, uuid) SET SCHEMA private;

CREATE FUNCTION public.is_team_admin(_team_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$ SELECT private.is_team_admin(_team_id, _user_id) $$;

CREATE FUNCTION public.is_team_member(_team_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$ SELECT private.is_team_member(_team_id, _user_id) $$;

REVOKE ALL ON FUNCTION private.is_team_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_team_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_team_admin(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_team_member(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_team_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_team_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_admin(uuid, uuid) TO authenticated, service_role; 
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated, service_role;