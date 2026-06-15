-- M2: make the Twilio auth token write-only from the client's perspective.
-- Previously the SPA selected `twilio_auth_token` directly, so the live Twilio
-- credential travelled to the browser and sat in the DOM/memory. This RPC runs
-- as the owner, re-checks admin access, and returns everything the settings UI
-- needs EXCEPT the token — only a boolean saying whether one is configured.
-- The token still lives in Postgres and is read server-side by the
-- `twilio-test` edge function; it never needs to reach the browser.
CREATE OR REPLACE FUNCTION public.get_team_settings_safe(_team_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.team_settings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non autenticato';
  END IF;
  IF NOT public.is_team_admin(_team_id, auth.uid()) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  SELECT * INTO _row FROM public.team_settings WHERE team_id = _team_id;

  RETURN jsonb_build_object(
    'twilio_account_sid', _row.twilio_account_sid,
    'twilio_whatsapp_number', _row.twilio_whatsapp_number,
    'webhook_secret', _row.webhook_secret,
    'has_auth_token', (_row.twilio_auth_token IS NOT NULL AND _row.twilio_auth_token <> '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_team_settings_safe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_settings_safe(uuid) TO authenticated;
