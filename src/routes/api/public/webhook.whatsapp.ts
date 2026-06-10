import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/public/webhook/whatsapp
 * Identifica il team dal numero Twilio destinatario, poi cerca il tavolo
 * per numero del mittente all'interno di quel team.
 *
 * Accetta payload Twilio (form-urlencoded con From/To/Body) o JSON {from, to, message}.
 * Header opzionale: x-webhook-secret (deve combaciare con team_settings.webhook_secret).
 */
export const Route = createFileRoute("/api/public/webhook/whatsapp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Parse body (Twilio invia form-urlencoded, ma supportiamo anche JSON)
          const contentType = request.headers.get("content-type") ?? "";
          let from = "";
          let to = "";
          let message = "";
          if (contentType.includes("application/json")) {
            const body = (await request.json().catch(() => null)) as
              | { from?: string; to?: string; message?: string }
              | null;
            if (!body) return new Response("Invalid JSON", { status: 400 });
            from = body.from ?? "";
            to = body.to ?? "";
            message = body.message ?? "";
          } else {
            const text = await request.text();
            const params = new URLSearchParams(text);
            from = params.get("From") ?? params.get("from") ?? "";
            to = params.get("To") ?? params.get("to") ?? "";
            message = params.get("Body") ?? params.get("message") ?? "";
          }

          if (!from || !to || !message) {
            return new Response("Missing From/To/Body", { status: 400 });
          }
          if (message.length > 1000 || from.length > 64 || to.length > 64) {
            return new Response("Payload too large", { status: 400 });
          }

          const normalize = (s: string) => s.replace(/[^0-9]/g, "");
          const fromNorm = normalize(from);
          const toNorm = normalize(to);
          if (!fromNorm || !toNorm) return new Response("Bad number", { status: 400 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1) Trova il team via numero Twilio destinatario
          const { data: settings } = await supabaseAdmin
            .from("team_settings")
            .select("team_id, twilio_whatsapp_number, webhook_secret");

          const teamSettings = (settings ?? []).find((s) => {
            const n = normalize(s.twilio_whatsapp_number ?? "");
            return n && n === toNorm;
          });
          if (!teamSettings) {
            return new Response("No team configured for this number", { status: 404 });
          }

          // 2) Verifica secret se presente nell'header
          const provided = request.headers.get("x-webhook-secret");
          if (provided && provided !== teamSettings.webhook_secret) {
            return new Response("Unauthorized", { status: 401 });
          }

          // 3) Cerca il tavolo per suffisso del numero mittente nello stesso team
          const suffix = fromNorm.slice(-9);
          const { data: tables } = await supabaseAdmin
            .from("club_tables")
            .select("id, whatsapp")
            .eq("team_id", teamSettings.team_id)
            .not("whatsapp", "is", null);

          const match = (tables ?? []).find((t) => {
            const n = normalize(t.whatsapp ?? "");
            return n && n.endsWith(suffix);
          });

          const { error: aErr } = await supabaseAdmin.from("alerts").insert({
            team_id: teamSettings.team_id,
            table_id: match?.id ?? null,
            kind: "whatsapp_msg",
            message: match ? message : `Da ${from}: ${message}`,
          });
          if (aErr) {
            console.error("[whatsapp webhook] insert alert", aErr);
            return new Response("DB error", { status: 500 });
          }

          return Response.json({
            matched: !!match,
            team_id: teamSettings.team_id,
            table_id: match?.id ?? null,
          });
        } catch (e) {
          console.error("[whatsapp webhook] crash", e);
          return new Response("Server error", { status: 500 });
        }
      },
    },
  },
});
