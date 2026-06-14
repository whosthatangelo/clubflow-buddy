import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { useCurrentTeam } from "@/hooks/use-current-team";

export function TeamSwitcher() {
  const { teamId, teamName, teams, selectTeam } = useCurrentTeam();
  const [open, setOpen] = useState(false);

  if (teams.length < 2) return <span className="truncate">{teamName ?? "TableFlow"}</span>;

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="max-w-full inline-flex items-center gap-1.5 rounded-lg -ml-2 px-2 py-1 hover:bg-secondary"
        aria-expanded={open}
        aria-label="Cambia team"
      >
        <span className="truncate">{teamName ?? "Team"}</span>
        <ChevronsUpDown className="w-4 h-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Chiudi selettore team" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-10 z-40 w-64 rounded-2xl border border-border bg-popover p-1.5 shadow-2xl">
            <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Team attivo</p>
            {teams.map((team) => (
              <button
                key={team.id}
                type="button"
                onClick={() => { selectTeam(team.id); setOpen(false); }}
                className="w-full min-h-12 rounded-xl px-3 text-left hover:bg-secondary flex items-center gap-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{team.name}</span>
                  <span className="block text-xs text-muted-foreground">{team.role === "admin" ? "Admin" : "Staff"}</span>
                </span>
                {team.id === teamId && <Check className="w-4 h-4 text-primary" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}