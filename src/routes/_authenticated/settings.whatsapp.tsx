import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getTwilioSettings,
  saveTwilioSettings,
  testTwilioConnection,
  regenerateWebhookSecret,
} from "@/lib/team.functions";
import { useCurrentTeam } from "@/hooks/use-current-team";
import { toast } from "sonner";
import { Copy, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/whatsapp")({
  component: WhatsAppSettings,
});

function WhatsAppSettings() {
  const { teamId, isAdmin, status } = useCurrentTeam();
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const getFn = useServerFn(getTwilioSettings);
  const saveFn = useServerFn(saveTwilioSettings);
  const testFn = useServerFn(testTwilioConnection);
  const regenFn = useServerFn(regenerateWebhookSecret);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const s = await getFn({ data: { teamId } });
      setAccountSid(s.twilio_account_sid ?? "");
      setAuthToken(s.twilio_auth_token ?? "");
      setWhatsappNumber(s.twilio_whatsapp_number ?? "");
      setWebhookSecret(s.webhook_secret ?? "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setLoading(false);
    }
  }, [teamId, getFn]);

  useEffect(() => {
    if (status === "ready" && isAdmin) load();
  }, [status, isAdmin, load]);

  if (status === "loading") return <p className="p-6 text-muted-foreground">Caricamento…</p>;
  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="font-semibold">Solo gli admin possono configurare WhatsApp.</p>
      </div>
    );
  }

  const save = async () => {
    if (!teamId) return;
    if (!accountSid.trim() || !authToken.trim() || !whatsappNumber.trim()) {
      return toast.error("Compila tutti i campi");
    }
    setSaving(true);
    try {
      await saveFn({
        data: {
          teamId,
          accountSid: accountSid.trim(),
          authToken: authToken.trim(),
          whatsappNumber: whatsappNumber.trim(),
        },
      });
      toast.success("Salvato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!teamId) return;
    setTesting(true);
    try {
      const res = await testFn({ data: { teamId } });
      if (res.ok) {
        toast.success(`Connesso ${res.friendlyName ? `· ${res.friendlyName}` : ""} (${res.status ?? "ok"})`);
      } else {
        toast.error(res.error ?? "Test fallito");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setTesting(false);
    }
  };

  const regen = async () => {
    if (!teamId) return;
    if (!confirm("Rigenerare il secret invaliderà il webhook attuale. Continuare?")) return;
    try {
      const res = await regenFn({ data: { teamId } });
      setWebhookSecret(res.webhook_secret);
      toast.success("Nuovo secret generato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiato");
    } catch {
      toast.error("Copia manuale");
    }
  };

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/webhook/whatsapp`
      : "";

  if (loading) return <p className="p-6 text-muted-foreground">Caricamento…</p>;

  return (
    <div className="space-y-5 pt-2">
      <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <h3 className="font-bold">Credenziali Twilio</h3>
        <p className="text-xs text-muted-foreground">
          Trovi questi valori nella Console Twilio in alto a destra.
        </p>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
            Account SID
          </span>
          <input
            placeholder="AC…"
            value={accountSid}
            onChange={(e) => setAccountSid(e.target.value)}
            className="mt-1 w-full h-12 px-4 rounded-xl bg-input border border-border font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
            Auth Token
          </span>
          <input
            type="password"
            placeholder="•••••"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            className="mt-1 w-full h-12 px-4 rounded-xl bg-input border border-border font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
            Numero WhatsApp Twilio
          </span>
          <input
            type="tel"
            placeholder="+39…"
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
            className="mt-1 w-full h-12 px-4 rounded-xl bg-input border border-border font-mono text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            onClick={save}
            disabled={saving}
            className="h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-60"
          >
            {saving ? "Salvataggio…" : "Salva"}
          </button>
          <button
            onClick={test}
            disabled={testing}
            className="h-12 rounded-xl bg-secondary text-foreground font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {testing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Testa
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <h3 className="font-bold">Webhook</h3>
        <p className="text-xs text-muted-foreground">
          Configura questi valori in Twilio Console → Phone Numbers → WhatsApp settings →
          Incoming message webhook (POST).
        </p>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
            URL webhook
          </span>
          <div className="mt-1 flex gap-2">
            <input
              readOnly
              value={webhookUrl}
              className="flex-1 h-12 px-4 rounded-xl bg-input border border-border font-mono text-xs"
            />
            <button
              onClick={() => copy(webhookUrl)}
              aria-label="Copia URL"
              className="h-12 w-12 grid place-items-center rounded-xl bg-secondary"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
            Header secret (X-Webhook-Secret)
          </span>
          <div className="mt-1 flex gap-2">
            <input
              readOnly
              value={webhookSecret}
              className="flex-1 h-12 px-4 rounded-xl bg-input border border-border font-mono text-xs"
            />
            <button
              onClick={() => copy(webhookSecret)}
              aria-label="Copia secret"
              className="h-12 w-12 grid place-items-center rounded-xl bg-secondary"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={regen}
              aria-label="Rigenera"
              className="h-12 w-12 grid place-items-center rounded-xl bg-secondary text-warning"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </label>

        <div className="flex items-start gap-2 text-xs text-warning bg-warning/10 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Il messaggio in arrivo viene smistato al team in base al numero Twilio configurato
            (campo <code className="font-mono">To</code>).
          </span>
        </div>
      </section>
    </div>
  );
}
