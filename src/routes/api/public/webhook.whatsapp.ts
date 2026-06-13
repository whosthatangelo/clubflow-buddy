import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/public/webhook/whatsapp
 * Identifica il team dal numero Twilio destinatario, l'evento attivo,
 * e cerca il tavolo per numero mittente all'interno di quell'evento.
 */
export const Route = createFileRoute("/api/public/webhook/whatsapp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const contentType = request.headers.get("content-type") ?? "";
          let from = "", to = "", message = "";
          let formParams: URLSearchParams | null = null;
          if (contentType.includes("application/json")) {
            const body = (await request.json().catch(() => null)) as
              | { from?: string; to?: string; message?: string } | null;
            if (!body) return new Response("Invalid JSON", { status: 400 });
            from = body.from ?? ""; to = body.to ?? ""; message = body.message ?? "";
          } else {
            const text = await request.text();
            const p = new URLSearchParams(text);
            formParams = p;
            from = p.get("From") ?? p.get("from") ?? "";
            to = p.get("To") ?? p.get("to") ?? "";
            message = p.get("Body") ?? p.get("message") ?? "";
          }
          if (!from || !to || !message) return new Response("Missing From/To/Body", { status: 400 });
          if (message.length > 1000 || from.length > 64 || to.length > 64) return new Response("Payload too large", { status: 400 });

          const normalize = (s: string) => s.replace(/[^0-9]/g, "");
          const fromNorm = normalize(from);
          const toNorm = normalize(to);
          if (!fromNorm || !toNorm) return new Response("Bad number", { status: 400 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: settings } = await supabaseAdmin
            .from("team_settings")
            .select("team_id, twilio_whatsapp_number, webhook_secret");

          const teamSettings = (settings ?? []).find((s) => {
            const n = normalize(s.twilio_whatsapp_number ?? "");
            return n && n === toNorm;
          });
          if (!teamSettings) return new Response("No team configured for this number", { status: 404 });

          const provided = request.headers.get("x-webhook-secret");
          const twilioSignature = request.headers.get("x-twilio-signature");
          let authorized = false;
          if (twilioSignature && formParams && teamSettings.twilio_auth_token) {
            const sorted = Array.from(formParams.entries()).sort(([a], [b]) => a.localeCompare(b));
            const signedPayload = request.url + sorted.map(([key, value]) => `${key}${value}`).join("");
            const key = await crypto.subtle.importKey(
              "raw",
              new TextEncoder().encode(teamSettings.twilio_auth_token),
              { name: "HMAC", hash: "SHA-1" },
              false,
              ["sign"],
            );
            const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
            const expected = btoa(String.fromCharCode(...new Uint8Array(digest)));
            authorized = expected === twilioSignature;
          } else if (provided && teamSettings.webhook_secret) {
            authorized = provided === teamSettings.webhook_secret;
          }
          if (!authorized) return new Response("Unauthorized", { status: 401 });

          // Active event for this team
          const { data: activeEvents } = await supabaseAdmin
            .from("events")
            .select("id")
            .eq("team_id", teamSettings.team_id)
            .eq("status", "active")
            .limit(1);
          const eventId = activeEvents?.[0]?.id ?? null;

          let matchId: string | null = null;
          if (eventId) {
            const suffix = fromNorm.slice(-9);
            const { data: tables } = await supabaseAdmin
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

          const { error: aErr } = await supabaseAdmin.from("alerts").insert({
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
      },
    },
  },
});
