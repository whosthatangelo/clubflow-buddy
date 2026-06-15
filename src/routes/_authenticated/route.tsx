import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Verifica appartenenza a un team. Se nessuno, manda a onboarding
    // (ma non ridirigere se siamo già sull'onboarding o sull'invite).
    const path = location.pathname;
    if (path.startsWith("/onboarding")) return { user: data.user };

    const { data: membership, error: membershipError } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", data.user.id)
      .eq("status", "active")
      .limit(1);
    // A transient/RLS failure must NOT be treated as "no team" — that would
    // wrongly funnel an existing member into onboarding. Surface it instead so
    // the router error boundary offers a retry.
    if (membershipError) {
      throw new Error("Impossibile verificare il team. Riprova.");
    }
    if (!membership || membership.length === 0) {
      throw redirect({ to: "/onboarding" });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
