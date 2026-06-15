// Twilio inbound WhatsApp webhook. Previously a TanStack server route; moved to
// a Supabase Edge Function because the SPA build has no server runtime.
// Uses the service-role key (bypasses RLS) — only safe because it runs on the
// edge, never in the browser. Configure with verify_jwt = false (Twilio does not
// send a Supabase JWT); requests are authenticated via the Twilio signature or
// the per-team webhook secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const normalize = (s: string) => s.replace(/[^0-9]/g, "");

function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let result = 0;
  for (let i = 0; i < ab.length; i++) result |= ab[i] ^ bb[i];
  return result === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const contentType = req.headers.get("content-type") ?? "";
    let from = "", to = "", message = "";
    let formParams: URLSearchParams | null = null;
    if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => null)) as
        | { from?: string; to?: string; message?: string }
        | null;
      if (!body) return new Response("Invalid JSON", { status: 400 });
      from = body.from ?? ""; to = body.to ?? ""; message = body.message ?? "";
    } else {
      const text = await req.text();
      const p = new URLSearchParams(text);
      formParams = p;
      from = p.get("From") ?? p.get("from") ?? "";
      to = p.get("To") ?? p.get("to") ?? "";
      message = p.get("Body") ?? p.get("message") ?? "";
    }
    if (!from || !to || !message) return new Response("Missing From/To/Body", { status: 400 });
    if (message.length > 1000 || from.length > 64 || to.length > 64) {
      return new Response("Payload too large", { status: 400 });
    }

    const fromNorm = normalize(from);
    const toNorm = normalize(to);
    if (!fromNorm || !toNorm) return new Response("Bad number", { status: 400 });

    const { data: settings } = await admin
      .from("team_settings")
      .select("team_id, twilio_whatsapp_number, twilio_auth_token, webhook_secret");

    const teamSettings = (settings ?? []).find((s) => {
      const n = normalize(s.twilio_whatsapp_number ?? "");
      return n && n === toNorm;
    });
    if (!teamSettings) return new Response("No team configured for this number", { status: 404 });

    const provided = req.headers.get("x-webhook-secret");
    const twilioSignature = req.headers.get("x-twilio-signature");
    let authorized = false;
    if (twilioSignature && formParams && teamSettings.twilio_auth_token) {
      const sorted = Array.from(formParams.entries()).sort(([a], [b]) => a.localeCompare(b));
      const paramPart = sorted.map(([key, value]) => `${key}${value}`).join("");
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(teamSettings.twilio_auth_token),
        { name: "HMAC", hash: "SHA-1" },
        false,
        ["sign"],
      );
      const signFor = async (url: string) => {
        const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(url + paramPart));
        return btoa(String.fromCharCode(...new Uint8Array(digest)));
      };
      // Twilio signs the *public* URL configured in its console. Behind the
      // Supabase edge proxy `req.url` is often the internal/rewritten URL, so a
      // single comparison against it silently fails. Validate against every
      // plausible reconstruction of the public URL (canonical function URL,
      // forwarded headers, and the raw request URL as a last resort).
      const reqUrl = new URL(req.url);
      const fwdProto = req.headers.get("x-forwarded-proto") ?? reqUrl.protocol.replace(":", "");
      const fwdHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? reqUrl.host;
      const candidates = new Set<string>([
        `${supabaseUrl}/functions/v1/whatsapp-webhook${reqUrl.search}`,
        `${fwdProto}://${fwdHost}${reqUrl.pathname}${reqUrl.search}`,
        req.url,
      ]);
      for (const candidate of candidates) {
        if (timingSafeEqual(await signFor(candidate), twilioSignature)) {
          authorized = true;
          break;
        }
      }
    } else if (provided && teamSettings.webhook_secret) {
      authorized = timingSafeEqual(provided, teamSettings.webhook_secret);
    }
    if (!authorized) return new Response("Unauthorized", { status: 401 });

    const { data: activeEvents } = await admin
      .from("events")
      .select("id")
      .eq("team_id", teamSettings.team_id)
      .eq("status", "active")
      .limit(1);
    const eventId = activeEvents?.[0]?.id ?? null;

    let matchId: string | null = null;
    if (eventId) {
      const suffix = fromNorm.slice(-9);
      const { data: tables } = await admin
        .from("club_tables")
        .select("id, whatsapp")
        .eq("event_id", eventId)
        .not("whatsapp", "is", null);
      const match = (tables ?? []).find((t) => {
        const n = normalize(t.whatsapp ?? "");
        return n && n.endsWith(suffix);
      });
      matchId = match?.id ?? null;
    }

    const { error: aErr } = await admin.from("alerts").insert({
      team_id: teamSettings.team_id,
      event_id: eventId,
      table_id: matchId,
      kind: "whatsapp_msg",
      message: matchId ? message : `Da ${from}: ${message}`,
    });
    if (aErr) {
      console.error("[whatsapp webhook] insert alert", aErr);
      return new Response("DB error", { status: 500 });
    }

    return Response.json({ matched: !!matchId });
  } catch (e) {
    console.error("[whatsapp webhook] crash", e);
    return new Response("Server error", { status: 500 });
  }
});
