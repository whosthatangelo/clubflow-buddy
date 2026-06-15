import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { acceptInvite } from "@/lib/team.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"checking" | "needs-auth" | "joining" | "done" | "error">(
    "checking",
  );
  const [errMsg, setErrMsg] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [confirmationSent, setConfirmationSent] = useState(false);

  const tryAccept = async () => {
    setPhase("joining");
    try {
      await acceptInvite({ token });
      setPhase("done");
      toast.success("Sei nel team!");
      setTimeout(() => navigate({ to: "/board" }), 600);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Errore");
      setPhase("error");
    }
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) tryAccept();
      else setPhase("needs-auth");
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/invite/${token}`,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setConfirmationSent(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      await tryAccept();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    }
  };

  if (phase === "checking" || phase === "joining") {
    return <p className="min-h-screen grid place-items-center text-muted-foreground">Attendere…</p>;
  }

  if (phase === "done") {
    return (
      <p className="min-h-screen grid place-items-center text-primary font-bold">
        Benvenuto nel team!
      </p>
    );
  }

  if (phase === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <h2 className="text-xl font-bold">Invito non valido</h2>
        <p className="text-sm text-muted-foreground mt-2">{errMsg}</p>
        <button
          onClick={() => navigate({ to: "/auth" })}
          className="mt-6 px-5 h-12 rounded-xl bg-primary text-primary-foreground font-bold"
        >
          Vai al login
        </button>
      </div>
    );
  }

  // needs-auth
  if (confirmationSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <h2 className="text-xl font-bold">Controlla la tua email</h2>
        <p className="mt-2 text-sm text-muted-foreground">Conferma l'indirizzo email: tornerai qui e l'invito verrà accettato automaticamente.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-black">Sei stato invitato</div>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "signup"
              ? "Crea l'account per unirti al team"
              : "Accedi per unirti al team"}
          </p>
        </div>

        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="flex gap-2 mb-5 p-1 bg-secondary rounded-xl">
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 h-10 rounded-lg text-sm font-semibold ${mode === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              Registrati
            </button>
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 h-10 rounded-lg text-sm font-semibold ${mode === "signin" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              Accedi
            </button>
          </div>
          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <input
                type="text"
                placeholder="Nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-input border border-border"
              />
            )}
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-4 rounded-xl bg-input border border-border"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 rounded-xl bg-input border border-border"
            />
            <button className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold">
              {mode === "signup" ? "Crea account e unisciti" : "Accedi e unisciti"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
