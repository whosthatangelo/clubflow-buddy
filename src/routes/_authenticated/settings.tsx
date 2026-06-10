import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const tab: "team" | "whatsapp" = path.includes("/whatsapp") ? "whatsapp" : "team";

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-20 backdrop-blur bg-background/85 border-b border-border px-4 py-3 flex items-center gap-3">
        <Link
          to="/board"
          aria-label="Indietro"
          className="h-11 w-11 grid place-items-center rounded-xl bg-secondary"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-black">Impostazioni</h1>
      </header>

      <div className="px-4 py-3 flex gap-2 overflow-x-auto">
        <Link
          to="/settings/team"
          className={`h-11 inline-flex items-center px-4 rounded-full text-sm font-semibold whitespace-nowrap ${tab === "team" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
        >
          Team
        </Link>
        <Link
          to="/settings/whatsapp"
          className={`h-11 inline-flex items-center px-4 rounded-full text-sm font-semibold whitespace-nowrap ${tab === "whatsapp" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
        >
          WhatsApp
        </Link>
      </div>

      <main className="px-4">
        <Outlet />
      </main>
    </div>
  );
}
