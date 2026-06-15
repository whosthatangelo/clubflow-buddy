// Tests a team's Twilio credentials. Previously a server function; moved to a
// Supabase Edge Function because Twilio's REST API sends no CORS headers, so a
// browser fetch is blocked. The caller's JWT is forwarded so RLS enforces that
// only team admins can read the credentials (team_settings is admin-only).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Non autenticato" }, 401);

    const { teamId } = (await req.json().catch(() => ({}))) as { teamId?: string };
    if (!teamId) return json({ ok: false, error: "teamId mancante" }, 400);

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    // RLS: only team admins can SELECT team_settings.
    const { data: s, error } = await supabase
      .from("team_settings")
      .select("twilio_account_sid, twilio_auth_token")
      .eq("team_id", teamId)
      .maybeSingle();
    if (error) return json({ ok: false, error: "Accesso negato" }, 403);
    if (!s?.twilio_account_sid || !s?.twilio_auth_token) {
      return json({ ok: false, error: "Credenziali non configurate" });
    }

    const auth = btoa(`${s.twilio_account_sid}:${s.twilio_auth_token}`);
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${s.twilio_account_sid}.json`,
      { headers: { Authorization: `Basic ${auth}` } },
    );
    if (!res.ok) {
      const body = await res.text();
      return json({ ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` });
    }
    const data = await res.json();
    return json({ ok: true, friendlyName: data.friendly_name ?? null, status: data.status ?? null });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "Errore rete" });
  }
});
