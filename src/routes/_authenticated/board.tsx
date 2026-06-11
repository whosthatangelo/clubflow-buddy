import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTeam } from "@/hooks/use-current-team";
import { useActiveEvent } from "@/hooks/use-active-event";
import { STATUS_LABEL_SHORT, nextStatus, requiresInput, type TableStatus } from "@/lib/status";
import { LogOut, Settings, Users, Clock, ChevronRight, StickyNote, ArrowLeftRight, BarChart3 } from "lucide-react";
import { AlertsBanner } from "@/components/AlertsBanner";
import { CheckinSheet } from "@/components/CheckinSheet";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/board")({
  component: BoardPage,
});

interface Zone { id: string; name: string; min_per_person: number; }
interface ClubTable {
  id: string;
  ref_name: string;
  people_count: number;
  zone_id: string | null;
  status: TableStatus;
  assigned_to: string | null;
  total_amount: number | null;
  payment_method: "cash" | "pos" | null;
  bottle_waiting_at: string | null;
  team_id: string;
  event_id: string;
  notes: string | null;
}

const STATUS_COLOR: Record<TableStatus, string> = {
  arriving: "bg-muted text-muted-foreground",
  checkin: "bg-warning text-warning-foreground",
  at_cashier: "bg-warning text-warning-foreground",
  wristbands: "bg-primary text-primary-foreground",
  fish_delivered: "bg-primary text-primary-foreground",
  bottle_waiting: "bg-warning text-warning-foreground",
  bottle_arrived: "bg-success text-success-foreground",
  reorder: "bg-warning text-warning-foreground",
  closed: "bg-secondary text-muted-foreground",
};

const BOTTLE_TIMEOUT_MS = 15 * 60 * 1000;

function BoardPage() {
  const { isAdmin, user, teamName, status: teamStatus } = useCurrentTeam();
  const { event, loading: evLoading, team } = useActiveEvent();
  const navigate = useNavigate();
  const [tables, setTables] = useState<ClubTable[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open">("open");
  const [now, setNow] = useState(() => Date.now());
  const [checkinFor, setCheckinFor] = useState<ClubTable | null>(null);
  const lateAlertsCreated = useRef<Set<string>>(new Set());

  const teamId = team.teamId;
  const eventId = event?.id ?? null;

  useEffect(() => {
    if (!teamId || !eventId) { setLoading(false); return; }
    let mounted = true;
    const load = async () => {
      const [{ data: t }, { data: z }] = await Promise.all([
        supabase.from("club_tables").select("*").eq("event_id", eventId).order("created_at"),
        supabase.from("zones").select("*").eq("team_id", teamId).order("name"),
      ]);
      if (!mounted) return;
      setTables((t ?? []) as ClubTable[]);
      setZones((z ?? []) as Zone[]);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`board-${eventId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "club_tables", filter: `event_id=eq.${eventId}` },
        (payload) => {
          setTables((prev) => {
            if (payload.eventType === "INSERT") return [...prev, payload.new as ClubTable];
            if (payload.eventType === "DELETE") return prev.filter((r) => r.id !== (payload.old as ClubTable).id);
            if (payload.eventType === "UPDATE") return prev.map((r) => (r.id === (payload.new as ClubTable).id ? (payload.new as ClubTable) : r));
            return prev;
          });
        })
      .subscribe();

    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => { mounted = false; supabase.removeChannel(channel); clearInterval(tick); };
  }, [teamId, eventId]);

  useEffect(() => {
    if (!user || !teamId || !eventId) return;
    const late = tables.filter(
      (t) => t.status === "bottle_waiting" && t.bottle_waiting_at &&
        now - new Date(t.bottle_waiting_at).getTime() >= BOTTLE_TIMEOUT_MS &&
        !lateAlertsCreated.current.has(t.id),
    );
    if (late.length === 0) return;
    late.forEach(async (t) => {
      lateAlertsCreated.current.add(t.id);
      const { data: existing } = await supabase.from("alerts").select("id").eq("table_id", t.id).eq("kind", "bottle_late").is("resolved_at", null).limit(1);
      if (existing && existing.length > 0) return;
      await supabase.from("alerts").insert({
        team_id: teamId, event_id: eventId, table_id: t.id, kind: "bottle_late",
        message: "Bottiglia in attesa da oltre 15 min",
      });
    });
  }, [tables, now, user, teamId, eventId]);

  const zoneById = (id: string | null) => zones.find((z) => z.id === id);
  const visible = filter === "open" ? tables.filter((t) => t.status !== "closed") : tables;
  const tablesIndex = useMemo(() => Object.fromEntries(tables.map((t) => [t.id, t.ref_name])), [tables]);

  const advance = async (t: ClubTable) => {
    if (requiresInput(t.status)) { setCheckinFor(t); return; }
    const ns = nextStatus(t.status);
    if (!ns) return;
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("club_tables").update({
      status: ns,
      assigned_to: t.assigned_to ?? user?.id ?? null,
      ...(ns === "fish_delivered" ? { fish_delivered_at: nowIso } : {}),
      ...(ns === "bottle_waiting" ? { bottle_waiting_at: nowIso } : {}),
      ...(ns === "bottle_arrived" ? { bottle_arrived_at: nowIso } : {}),
      ...(ns === "closed" ? { closed_at: nowIso } : {}),
    }).eq("id", t.id);
    if (error) return toast.error(error.message);
    if (ns === "bottle_arrived" || ns === "closed") {
      await supabase.from("alerts").update({ resolved_at: nowIso }).eq("table_id", t.id).is("resolved_at", null);
    }
  };

  const signOut = async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); };

  if (teamStatus === "loading" || evLoading) {
    return <p className="p-6 text-muted-foreground">Caricamento…</p>;
  }

  if (!event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-3">🎉</div>
        <h2 className="text-xl font-bold">Nessun evento attivo</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs">
          Attiva un evento per vedere la board della serata.
        </p>
        <Link to="/events" className="mt-6 inline-flex items-center justify-center h-12 px-5 rounded-xl bg-primary text-primary-foreground font-bold">
          Vai agli eventi
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-20 backdrop-blur bg-background/85 border-b border-border">
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl font-black tracking-tight truncate">{event.name}</h1>
            <p className="text-xs text-muted-foreground -mt-0.5 truncate">
              {teamName} · {tables.filter((t) => t.status !== "closed").length} aperti{event.headliner ? ` · ${event.headliner}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/events" aria-label="Cambia evento" className="h-11 w-11 grid place-items-center rounded-xl bg-secondary">
              <ArrowLeftRight className="w-5 h-5" />
            </Link>
            {isAdmin && (
              <Link to="/analytics" aria-label="Analytics" className="h-11 w-11 grid place-items-center rounded-xl bg-secondary">
                <BarChart3 className="w-5 h-5" />
              </Link>
            )}
            {isAdmin && (
              <Link to="/config" aria-label="Configurazione" className="h-11 w-11 grid place-items-center rounded-xl bg-secondary">
                <Settings className="w-5 h-5" />
              </Link>
            )}
            <Link to="/settings/team" aria-label="Impostazioni" className="h-11 w-11 grid place-items-center rounded-xl bg-secondary">
              <Users className="w-5 h-5" />
            </Link>
            <button type="button" onClick={signOut} aria-label="Esci" className="h-11 w-11 grid place-items-center rounded-xl bg-secondary">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-3 flex gap-2">
          {(["all", "open"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={`h-auto-tap !min-h-0 py-1.5 px-3 rounded-full text-xs font-semibold ${filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
              {f === "all" ? "Tutti" : "Solo aperti"}
            </button>
          ))}
        </div>
      </header>

      <AlertsBanner userId={user?.id} teamId={teamId} tablesIndex={tablesIndex} />

      <main className="p-4">
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Caricamento…</p>
        ) : visible.length === 0 ? (
          <EmptyState isAdmin={isAdmin} hasTables={tables.length > 0} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visible.map((t) => {
              const z = zoneById(t.zone_id);
              const isMine = t.assigned_to === user?.id;
              const waiting = t.status === "bottle_waiting" && t.bottle_waiting_at;
              const waitedMs = waiting ? now - new Date(t.bottle_waiting_at!).getTime() : 0;
              const waitedMin = Math.floor(waitedMs / 60000);
              const late = waitedMs >= BOTTLE_TIMEOUT_MS;
              const ns = nextStatus(t.status);
              return (
                <div key={t.id} className={`rounded-2xl bg-card border p-4 ${late ? "border-destructive" : "border-border"}`}>
                  <Link to="/table/$id" params={{ id: t.id }} className="block">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-bold leading-tight truncate flex items-center gap-1.5">
                          {t.ref_name}
                          {t.notes && <StickyNote className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                          <Users className="w-3.5 h-3.5" /> {t.people_count} pax
                          {z && <span>· {z.name}</span>}
                        </p>
                      </div>
                      {t.total_amount ? (
                        <span className="text-sm font-bold tabular-nums">€{Math.round(t.total_amount)}</span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLOR[t.status]}`}>
                        {STATUS_LABEL_SHORT[t.status]}
                      </span>
                      <div className="flex items-center gap-2">
                        {waiting && (
                          <span className={`inline-flex items-center gap-1 text-xs font-bold tabular-nums ${late ? "text-destructive" : "text-warning"}`}>
                            <Clock className="w-3.5 h-3.5" /> {waitedMin}′
                          </span>
                        )}
                        {isMine && <span className="text-[10px] uppercase tracking-wide font-bold text-primary">Tuo</span>}
                      </div>
                    </div>
                  </Link>
                  {ns && (
                    <button
                      type="button"
                      onClick={() => advance(t)}
                      className="mt-3 w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold text-sm inline-flex items-center justify-center gap-1"
                    >
                      {requiresInput(t.status) ? "Check-in" : STATUS_LABEL_SHORT[ns]} <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {checkinFor && (() => {
        const z = zoneById(checkinFor.zone_id);
        if (!z) { toast.error("Tavolo senza zona"); setCheckinFor(null); return null; }
        if (!user || !teamId || !eventId) return null;
        return (
          <CheckinSheet
            tableId={checkinFor.id}
            teamId={teamId}
            eventId={eventId}
            userId={user.id}
            refName={checkinFor.ref_name}
            initialPeople={checkinFor.people_count}
            minPerPerson={z.min_per_person}
            zoneName={z.name}
            onClose={() => setCheckinFor(null)}
            onDone={() => setCheckinFor(null)}
          />
        );
      })()}
    </div>
  );
}

function EmptyState({ isAdmin, hasTables }: { isAdmin: boolean; hasTables: boolean }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="text-5xl mb-3">🪑</div>
      <h2 className="text-lg font-bold">{hasTables ? "Tutti chiusi" : "Nessun tavolo"}</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
        {hasTables ? "Cambia filtro per vedere i tavoli chiusi." :
          isAdmin ? "Aggiungi tavoli e bottiglie dalla configurazione." :
          "L'admin non ha ancora creato i tavoli."}
      </p>
      {isAdmin && !hasTables && (
        <Link to="/config" className="inline-flex items-center justify-center mt-6 h-12 px-5 rounded-xl bg-primary text-primary-foreground font-bold">
          Configurazione
        </Link>
      )}
    </div>
  );
}
