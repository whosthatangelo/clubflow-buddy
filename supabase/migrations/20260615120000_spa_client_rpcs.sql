-- SPA conversion: the client no longer has a service-role key, so the two
-- operations that previously bypassed RLS in server functions are exposed as
-- SECURITY DEFINER RPCs. Both run as the function owner (bypassing RLS) but
-- gate every action on auth.uid(), so an authenticated user can only ever
-- bootstrap their own team or accept an invite addressed to a valid token.

-- ============ create_team (onboarding bootstrap) ============
-- A brand-new team has no members yet, so the "admins add team members" RLS
-- policy can never let the creator insert their own first membership row.
-- This RPC creates the team, the creator's admin membership, and the default
-- team_settings row atomically.
CREATE OR REPLACE FUNCTION public.create_team(_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _team_id uuid;
  _clean text := btrim(_name);
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Non autenticato';
  END IF;
  IF char_length(_clean) < 2 OR char_length(_clean) > 80 THEN
    RAISE EXCEPTION 'Nome team non valido';
  END IF;

  INSERT INTO public.teams (name, created_by)
  VALUES (_clean, _uid)
  RETURNING id INTO _team_id;

  INSERT INTO public.team_members (team_id, user_id, role, status)
  VALUES (_team_id, _uid, 'admin', 'active');

  INSERT INTO public.team_settings (team_id)
  VALUES (_team_id);

  RETURN _team_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_team(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team(text) TO authenticated;

-- ============ accept_invite ============
-- The invitee is not yet a member, so they cannot SELECT the invite (admin-only),
-- INSERT their membership, or UPDATE the invite under RLS. This RPC performs the
-- whole join flow, validating the token, expiry and prior use.
CREATE OR REPLACE FUNCTION public.accept_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _invite public.team_invites%ROWTYPE;
  _team_name text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Non autenticato';
  END IF;

  SELECT * INTO _invite
  FROM public.team_invites
  WHERE token = _token;

  IF _invite.id IS NULL THEN
    RAISE EXCEPTION 'Invito non valido';
  END IF;
  IF _invite.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invito già usato';
  END IF;
  IF _invite.expires_at < now() THEN
    RAISE EXCEPTION 'Invito scaduto';
  END IF;

  SELECT name INTO _team_name FROM public.teams WHERE id = _invite.team_id;

  -- Already an active member: just consume the invite.
  IF EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _invite.team_id AND user_id = _uid AND status = 'active'
  ) THEN
    UPDATE public.team_invites
    SET used_at = now(), used_by = _uid
    WHERE id = _invite.id;
    RETURN jsonb_build_object('teamId', _invite.team_id, 'teamName', _team_name, 'alreadyMember', true);
  END IF;

  INSERT INTO public.team_members (team_id, user_id, role, status)
  VALUES (_invite.team_id, _uid, _invite.role, 'active');

  UPDATE public.team_invites
  SET used_at = now(), used_by = _uid
  WHERE id = _invite.id;

  RETURN jsonb_build_object('teamId', _invite.team_id, 'teamName', _team_name, 'alreadyMember', false);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO authenticated;
