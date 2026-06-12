import { Link, useRouterState } from "@tanstack/react-router";
import { Calendar, BarChart3 } from "lucide-react";

const items = [
  { to: "/events", label: "Eventi", icon: Calendar, match: ["/events", "/board", "/event", "/table"] },
  { to: "/analytics", label: "Analytics", icon: BarChart3, match: ["/analytics"] },
] as const;

export function BottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur pb-[max(0px,env(safe-area-inset-bottom))]">
      <ul className="max-w-md mx-auto grid grid-cols-2">
        {items.map((it) => {
          const active = it.match.some((m) => path === m || path.startsWith(m + "/"));
          return (
            <li key={it.to}>
              <Link
                to={it.to}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                <it.icon className="w-5 h-5" />
                <span className="text-[11px] font-bold tracking-wide uppercase">{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
