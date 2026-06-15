import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
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
  const [hasToken, setHasToken] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const s = await getTwilioSettings({ teamId });
      setAccountSid(s.twilio_account_sid ?? "");
      // The auth token is write-only: never loaded back into the form. We only
      // know whether one is configured.
      setAuthToken("");
      setHasToken(s.has_auth_token);
      setWhatsappNumber(s.twilio_whatsapp_number ?? "");
      setWebhookSecret(s.webhook_secret ?? "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (status === "ready" && isAdmin) load();
  }, [status, isAdmin, load]);

  if (status === "loading") return <p className="p-6 text-muted-foreground">Caricamento…</p>;
  if (status === "error") return <p className="p-6 text-destructive">Errore nel caricamento del team. Ricarica la pagina.</p>;
  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="font-semibold">Solo gli admin possono configurare WhatsApp.</p>
      </div>
    );
  }

  const save = async () => {
    if (!teamId) return;
    if (!accountSid.trim() || !whatsappNumber.trim()) {
      return toast.error("Compila tutti i campi");
    }
    // The token is only required the first time (when none is stored yet).
    if (!hasToken && !authToken.trim()) {
      return toast.error("Inserisci l’Auth Token");
    }
    setSaving(true);
    try {
      await saveTwilioSettings({
        teamId,
        accountSid: accountSid.trim(),
        authToken: authToken.trim() || undefined,
        whatsappNumber: whatsappNumber.trim(),
      });
      if (authToken.trim()) {
        setHasToken(true);
        setAuthToken("");
      }
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
      const res = await testTwilioConnection({ teamId });
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
      const res = await regenerateWebhookSecret({ teamId });
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

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  if (loading) return <p className="p-6 text-muted-foreground">Caricamento…</p>;

  return (
    <div className="space-y-5 pt-2">
      <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <h3 className="font-bold">Credenziali Twilio</h3>
        <p className="text-xs text-muted-foreground">
          Usa un numero WhatsApp Business abilitato in Twilio. Le credenziali restano accessibili solo agli admin del team.
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
            Auth Token {hasToken && <span className="text-success normal-case">· salvato</span>}
          </span>
          <input
            type="password"
            autoComplete="off"
            placeholder={hasToken ? "•••••• (lascia vuoto per non cambiare)" : "Auth Token Twilio"}
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
          In Twilio configura “When a message comes in” con questo URL, metodo POST. Twilio firmerà automaticamente ogni richiesta: non aggiungere header manuali.
        </p>

        <label className="block sr-only">
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
            Salva prima le credenziali, premi “Testa”, poi invia un messaggio reale al numero WhatsApp. Il messaggio apparirà negli avvisi dell’evento attivo e verrà associato al tavolo tramite il numero del cliente.
          </span>
        </div>
      </section>
    </div>
  );
}
