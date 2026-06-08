import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/use-role";
import { STATUS_LABEL, type TableStatus } from "@/lib/status";
import { LogOut, Settings, Users, Clock } from "lucide-react";
import { toast } from "sonner";
import { AlertsBanner } from "@/components/AlertsBanner";

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
  const { isAdmin, user } = useRole();
  const navigate = useNavigate();
  const [tables, setTables] = useState<ClubTable[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open">("all");
  const [now, setNow] = useState(() => Date.now());
  const lateAlertsCreated = useRef<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [{ data: t }, { data: z }] = await Promise.all([
        supabase.from("club_tables").select("*").order("created_at"),
        supabase.from("zones").select("*").order("name"),
      ]);
      if (!mounted) return;
      setTables((t ?? []) as ClubTable[]);
      setZones((z ?? []) as Zone[]);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel("board")
      .on("postgres_changes", { event: "*", schema: "public", table: "club_tables" }, (payload) => {
        setTables((prev) => {
          if (payload.eventType === "INSERT") return [...prev, payload.new as ClubTable];
          if (payload.eventType === "DELETE") return prev.filter((r) => r.id !== (payload.old as ClubTable).id);
          if (payload.eventType === "UPDATE") {
            return prev.map((r) => (r.id === (payload.new as ClubTable).id ? (payload.new as ClubTable) : r));
          }
          return prev;
        });
      })
      .subscribe();

    const tick = setInterval(() => setNow(Date.now()), 15000);

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      clearInterval(tick);
    };
  }, []);

  // Auto-crea alert bottle_late quando timer >= 15 min
  useEffect(() => {
    if (!user) return;
    const late = tables.filter(
      (t) =>
        t.status === "bottle_waiting" &&
        t.bottle_waiting_at &&
        now - new Date(t.bottle_waiting_at).getTime() >= BOTTLE_TIMEOUT_MS &&
        !lateAlertsCreated.current.has(t.id),
    );
    if (late.length === 0) return;
    late.forEach(async (t) => {
      lateAlertsCreated.current.add(t.id);
      // Verifica se esiste già un alert aperto
      const { data: existing } = await supabase
        .from("alerts" as never)
        .select("id")
        .eq("table_id", t.id)
        .eq("kind", "bottle_late")
        .is("resolved_at", null)
        .limit(1);
      if (existing && existing.length > 0) return;
      await supabase.from("alerts" as never).insert({
        table_id: t.id,
        kind: "bottle_late",
        message: `Bottiglia in attesa da oltre 15 min`,
      } as never);
    });
  }, [tables, now, user]);

  const zoneById = (id: string | null) => zones.find((z) => z.id === id);
  const visible = filter === "open" ? tables.filter((t) => t.status !== "closed") : tables;
  const tablesIndex = useMemo(
    () => Object.fromEntries(tables.map((t) => [t.id, t.ref_name])),
    [tables],
  );

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-20 backdrop-blur bg-background/85 border-b border-border">
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-black tracking-tight">
              Table<span className="text-primary">Flow</span>
            </h1>
            <p className="text-xs text-muted-foreground -mt-0.5">
              {isAdmin ? "Admin" : "Staff"} · {tables.filter((t) => t.status !== "closed").length} aperti
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link
                to="/config"
                aria-label="Configurazione"
                className="h-11 w-11 grid place-items-center rounded-xl bg-secondary text-foreground"
              >
                <Settings className="w-5 h-5" />
              </Link>
            )}
            <button
              type="button"
              onClick={signOut}
              aria-label="Esci"
              className="h-11 w-11 grid place-items-center rounded-xl bg-secondary text-foreground"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`h-auto-tap !min-h-0 py-1.5 px-3 rounded-full text-xs font-semibold ${filter === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
          >
            Tutti
          </button>
          <button
            type="button"
            onClick={() => setFilter("open")}
            className={`h-auto-tap !min-h-0 py-1.5 px-3 rounded-full text-xs font-semibold ${filter === "open" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
          >
            Solo aperti
          </button>
        </div>
      </header>

      <AlertsBanner userId={user?.id} tablesIndex={tablesIndex} />

      <main className="p-4">
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Caricamento…</p>
        ) : visible.length === 0 ? (
          <EmptyState isAdmin={isAdmin} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visible.map((t) => {
              const z = zoneById(t.zone_id);
              const isMine = t.assigned_to === user?.id;
              const waiting = t.status === "bottle_waiting" && t.bottle_waiting_at;
              const waitedMs = waiting ? now - new Date(t.bottle_waiting_at!).getTime() : 0;
              const waitedMin = Math.floor(waitedMs / 60000);
              const late = waitedMs >= BOTTLE_TIMEOUT_MS;
              return (
                <Link
                  key={t.id}
                  to="/table/$id"
                  params={{ id: t.id }}
                  className={`block rounded-2xl bg-card border p-4 active:scale-[0.98] transition-transform ${late ? "border-destructive" : "border-border"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-bold leading-tight truncate">{t.ref_name}</h3>
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
                      {STATUS_LABEL[t.status]}
                    </span>
                    <div className="flex items-center gap-2">
                      {waiting && (
                        <span className={`inline-flex items-center gap-1 text-xs font-bold tabular-nums ${late ? "text-destructive" : "text-warning"}`}>
                          <Clock className="w-3.5 h-3.5" /> {waitedMin}′
                        </span>
                      )}
                      {isMine && (
                        <span className="text-[10px] uppercase tracking-wide font-bold text-primary">Tuo</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="text-5xl mb-3">🪑</div>
      <h2 className="text-lg font-bold">Nessun tavolo</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
        {isAdmin
          ? "Crea zone, listino bottiglie e tavoli dalla configurazione."
          : "L'admin non ha ancora creato i tavoli della serata."}
      </p>
      {isAdmin && (
        <Link
          to="/config"
          className="inline-flex items-center justify-center mt-6 px-5 rounded-xl bg-primary text-primary-foreground font-bold"
        >
          Vai alla configurazione
        </Link>
      )}
    </div>
  );
}
