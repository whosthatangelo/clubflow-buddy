import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createTeam, createInvite } from "@/lib/team.functions";
import { toast } from "sonner";
import { ArrowRight, Check, Copy, LogOut, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingPage,
});

type Step = 1 | 2 | 3;

interface InviteRow {
  id: string;
  token: string;
  email: string | null;
  role: "admin" | "staff";
}

function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [teamName, setTeamName] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  const createTeamFn = useServerFn(createTeam);
  const createInviteFn = useServerFn(createInvite);

  const submitTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (teamName.trim().length < 2) return toast.error("Nome troppo corto");
    setSubmitting(true);
    try {
      const res = await createTeamFn({ data: { name: teamName.trim() } });
      setTeamId(res.teamId);
      setStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setSubmitting(false);
    }
  };

  const addInvite = async () => {
    if (!teamId) return;
    setSubmitting(true);
    try {
      const inv = await createInviteFn({
        data: { teamId, email: inviteEmail.trim() || undefined, role: "staff" },
      });
      setInvites((prev) => [...prev, inv as InviteRow]);
      setInviteEmail("");
      toast.success("Link invito creato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setSubmitting(false);
    }
  };

  const inviteUrl = (token: string) =>
    typeof window !== "undefined" ? `${window.location.origin}/invite/${token}` : "";

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiato");
    } catch {
      toast.error("Copia manuale");
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen flex flex-col px-5 py-8">
      <header className="flex items-center justify-between mb-6">
        <div className="text-2xl font-black tracking-tight">
          Table<span className="text-primary">Flow</span>
        </div>
        <button
          onClick={signOut}
          aria-label="Esci"
          className="h-11 w-11 grid place-items-center rounded-xl bg-secondary"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-primary" : "bg-secondary"}`}
          />
        ))}
      </div>

      <div className="flex-1">
        {step === 1 && (
          <form onSubmit={submitTeam} className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
                Step 1 di 3
              </p>
              <h1 className="text-3xl font-black mt-2">Crea il tuo team</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Il nome che identificherà il tuo gruppo nelle serate.
              </p>
            </div>
            <input
              autoFocus
              placeholder="es. Team Francesco — Amnesia"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="w-full h-14 px-4 rounded-xl bg-input border border-border text-base"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-14 rounded-xl bg-primary text-primary-foreground font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {submitting ? "Creazione…" : "Continua"} <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
                Step 2 di 3
              </p>
              <h1 className="text-3xl font-black mt-2">Sei l'Admin</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Il team <span className="text-primary font-semibold">{teamName}</span> è stato creato.
                Tu sei il PR e puoi configurare zone, bottiglie e tavoli.
              </p>
            </div>
            <div className="rounded-2xl bg-card border border-border p-5">
              <div className="h-14 w-14 rounded-2xl bg-success/15 text-success grid place-items-center mb-3">
                <Check className="w-7 h-7" />
              </div>
              <h3 className="font-bold">Team pronto</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Ora invita lo staff (massimo 4 persone) o salta e fallo dopo.
              </p>
            </div>
            <button
              onClick={() => setStep(3)}
              className="w-full h-14 rounded-xl bg-primary text-primary-foreground font-bold inline-flex items-center justify-center gap-2"
            >
              Invita lo staff <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate({ to: "/board" })}
              className="w-full h-12 rounded-xl bg-secondary text-foreground font-semibold"
            >
              Salta, vado alla board
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
                Step 3 di 3
              </p>
              <h1 className="text-3xl font-black mt-2">Invita lo staff</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Genera link di invito e mandali via WhatsApp. Lo staff li apre, si registra e
                viene aggiunto automaticamente al team.
              </p>
            </div>

            <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
              <input
                type="email"
                placeholder="Email (opzionale)"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-input border border-border"
              />
              <button
                onClick={addInvite}
                disabled={submitting}
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <UserPlus className="w-5 h-5" /> Crea link invito
              </button>
            </div>

            {invites.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
                  Link generati ({invites.length})
                </h3>
                {invites.map((inv) => (
                  <div
                    key={inv.id}
                    className="rounded-xl bg-card border border-border p-3 flex items-center gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-muted-foreground truncate">
                        {inv.email ?? "Senza email"}
                      </div>
                      <div className="text-xs font-mono truncate text-foreground/80">
                        {inviteUrl(inv.token)}
                      </div>
                    </div>
                    <button
                      onClick={() => copy(inviteUrl(inv.token))}
                      aria-label="Copia"
                      className="h-11 w-11 grid place-items-center rounded-xl bg-secondary"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => navigate({ to: "/board" })}
              className="w-full h-14 rounded-xl bg-primary text-primary-foreground font-bold mt-4"
            >
              Vai alla board
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
