import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/public/webhook/whatsapp
 * Body JSON: { from: string, message: string }
 * Header: x-webhook-secret: <WHATSAPP_WEBHOOK_SECRET>
 *
 * Normalizza il numero (rimuove spazi/+/-) e cerca un tavolo con whatsapp matching.
 * Se trovato, crea un alert kind='whatsapp_msg'.
 */
export const Route = createFileRoute("/api/public/webhook/whatsapp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
          if (!secret) {
            return new Response("Webhook secret not configured", { status: 500 });
          }
          const provided = request.headers.get("x-webhook-secret");
          if (provided !== secret) {
            return new Response("Unauthorized", { status: 401 });
          }

          const body = await request.json().catch(() => null) as { from?: string; message?: string } | null;
          if (!body || typeof body.from !== "string" || typeof body.message !== "string") {
            return new Response("Invalid payload", { status: 400 });
          }
          if (body.message.length > 1000 || body.from.length > 32) {
            return new Response("Payload too large", { status: 400 });
          }

          const normalize = (s: string) => s.replace(/[^0-9]/g, "");
          const fromNorm = normalize(body.from);
          if (!fromNorm) return new Response("Bad number", { status: 400 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Match by suffix (gli ultimi 9 cifre, per ignorare prefisso internazionale)
          const suffix = fromNorm.slice(-9);
          const { data: tables, error: tErr } = await supabaseAdmin
            .from("club_tables")
            .select("id, whatsapp")
            .not("whatsapp", "is", null);
          if (tErr) {
            console.error("[whatsapp webhook]", tErr);
            return new Response("DB error", { status: 500 });
          }

          const match = (tables ?? []).find((t) => {
            const n = normalize(t.whatsapp ?? "");
            return n && n.endsWith(suffix);
          });

          if (!match) {
            // Nessun match: registra comunque alert "orfano" (table_id null)
            await supabaseAdmin.from("alerts").insert({
              kind: "whatsapp_msg",
              table_id: null,
              message: `Da ${body.from}: ${body.message}`,
            });
            return Response.json({ matched: false });
          }

          const { error: aErr } = await supabaseAdmin.from("alerts").insert({
            kind: "whatsapp_msg",
            table_id: match.id,
            message: body.message,
          });
          if (aErr) {
            console.error("[whatsapp webhook] insert alert", aErr);
            return new Response("DB error", { status: 500 });
          }

          return Response.json({ matched: true, table_id: match.id });
        } catch (e) {
          console.error("[whatsapp webhook] crash", e);
          return new Response("Server error", { status: 500 });
        }
      },
    },
  },
});
