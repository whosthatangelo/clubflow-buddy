import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTeam } from "@/hooks/use-current-team";
import { BottomNav } from "@/components/BottomNav";
import { TeamSwitcher } from "@/components/TeamSwitcher";
import type { SelectedBottle } from "@/components/CheckinSheet";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
});

type Tab = "overview" | "events" | "formats" | "headliners";

interface EventRow {
  id: string; name: string; date: string; headliner: string | null;
  format_id: string | null; status: string;
}
interface FormatRow { id: string; name: string; }
interface OrderRow { event_id: string; table_id: string; bottles: SelectedBottle[]; total: number; created_at: string; }
interface TableRow { id: string; event_id: string; people_count: number; zone_id: string | null; }
interface ZoneRow { id: string; name: string; }

const CHART_COLORS = ["oklch(0.78 0.18 65)", "oklch(0.70 0.18 145)", "oklch(0.80 0.18 80)", "oklch(0.65 0.25 25)", "oklch(0.70 0.15 240)", "oklch(0.70 0.20 320)"];

function AnalyticsPage() {
  const { teamId, isAdmin, status } = useCurrentTeam();
  const [tab, setTab] = useState<Tab>("overview");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [formats, setFormats] = useState<FormatRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    (async () => {
      const results = await Promise.all([
        supabase.from("events").select("id,name,date,headliner,format_id,status").eq("team_id", teamId).order("date", { ascending: true }),
        supabase.from("formats").select("id,name").eq("team_id", teamId),
        supabase.from("table_orders").select("event_id,table_id,bottles,total,created_at").eq("team_id", teamId),
        supabase.from("club_tables").select("id,event_id,people_count,zone_id").eq("team_id", teamId),
        supabase.from("zones").select("id,name").eq("team_id", teamId),
      ]);
      // If any dataset failed, don't render charts computed from partial data.
      if (results.some((r) => r.error)) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      const [{ data: e }, { data: f }, { data: o }, { data: t }, { data: z }] = results;
      setEvents((e ?? []) as EventRow[]);
      setFormats((f ?? []) as FormatRow[]);
      setOrders((o ?? []) as unknown as OrderRow[]);
      setTables((t ?? []) as TableRow[]);
      setZones((z ?? []) as ZoneRow[]);
      setLoadError(false);
      setLoading(false);
    })();
  }, [teamId]);

  if (status === "loading") return <p className="p-6 text-muted-foreground">Caricamento…</p>;
  if (status === "error") return <p className="p-6 text-destructive">Errore nel caricamento del team. Ricarica la pagina.</p>;
  if (!isAdmin) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <h2 className="text-xl font-bold">Solo admin</h2>
      <Link to="/board" className="mt-4 inline-flex h-11 px-4 items-center rounded-xl bg-primary text-primary-foreground font-bold">Board</Link>
    </div>
  );
  if (loadError) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <h2 className="text-xl font-bold">Errore nel caricamento dei dati</h2>
      <p className="mt-2 text-sm text-muted-foreground">Alcune statistiche non sono disponibili. Ricarica la pagina.</p>
    </div>
  );

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-20 backdrop-blur bg-background/85 border-b border-border px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-xl font-black">Analytics</h1>
          <div className="min-w-0 max-w-48 text-sm font-bold"><TeamSwitcher /></div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {(["overview", "events", "formats", "headliners"] as Tab[]).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`h-auto-tap !min-h-0 py-2 px-4 rounded-full text-sm font-semibold whitespace-nowrap ${tab === t ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
              {t === "overview" ? "Panoramica" : t === "events" ? "Eventi" : t === "formats" ? "Format" : "Headliner"}
            </button>
          ))}
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Caricamento…</p>
        ) : (
          <>
            {tab === "overview" && <Overview events={events} orders={orders} tables={tables} zones={zones} />}
            {tab === "events" && <PerEvent events={events} orders={orders} tables={tables} zones={zones} formats={formats} />}
            {tab === "formats" && <PerFormat events={events} formats={formats} orders={orders} tables={tables} />}
            {tab === "headliners" && <PerHeadliner events={events} orders={orders} />}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

/* ============ Helpers ============ */
function aggregate(orders: OrderRow[]) {
  let revenue = 0;
  const bottleCount = new Map<string, number>();
  const bottleRevenue = new Map<string, number>();
  const tableSet = new Set<string>();
  orders.forEach((o) => {
    revenue += Number(o.total);
    tableSet.add(o.table_id);
    o.bottles.forEach((b) => {
      bottleCount.set(b.name, (bottleCount.get(b.name) ?? 0) + 1);
      bottleRevenue.set(b.name, (bottleRevenue.get(b.name) ?? 0) + Number(b.price_actual));
    });
  });
  return { revenue, tables: tableSet.size, bottleCount, bottleRevenue };
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 space-y-2">
      <div>
        <h3 className="font-bold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
function Empty() { return <p className="text-center text-muted-foreground py-12">Nessun dato.</p>; }

const tooltipStyle = {
  backgroundColor: "oklch(0.14 0 0)",
  border: "1px solid oklch(0.22 0 0)",
  borderRadius: "0.75rem",
  fontSize: "12px",
  color: "oklch(0.985 0 0)",
};

/* ============ OVERVIEW ============ */
function Overview({ events, orders, tables, zones }: {
  events: EventRow[]; orders: OrderRow[]; tables: TableRow[]; zones: ZoneRow[];
}) {
  const agg = aggregate(orders);
  const totalPeople = tables.reduce((s, t) => s + t.people_count, 0);
  const avgPerEvent = events.length > 0 ? agg.revenue / events.length : 0;

  // Revenue per event (line chart, chronological)
  const trend = events.map((e) => {
    const evOrders = orders.filter((o) => o.event_id === e.id);
    const evAgg = aggregate(evOrders);
    return {
      date: new Date(e.date).toLocaleDateString("it-IT", { day: "2-digit", month: "short" }),
      Fatturato: Math.round(evAgg.revenue),
      Tavoli: evAgg.tables,
    };
  });

  // Top bottles
  const topBottles = Array.from(agg.bottleRevenue.entries())
    .map(([name, rev]) => ({ name, rev: Math.round(rev), qty: agg.bottleCount.get(name) ?? 0 }))
    .sort((a, b) => b.rev - a.rev).slice(0, 8);

  // Revenue per zone
  const zoneRev = new Map<string, number>();
  const tableToZone = new Map(tables.map((t) => [t.id, t.zone_id]));
  orders.forEach((o) => {
    const zid = tableToZone.get(o.table_id) ?? null;
    const key = zones.find((z) => z.id === zid)?.name ?? "—";
    zoneRev.set(key, (zoneRev.get(key) ?? 0) + Number(o.total));
  });
  const zoneData = Array.from(zoneRev.entries()).map(([name, value]) => ({ name, value: Math.round(value) }));

  if (events.length === 0) return <Empty />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Fatturato totale" value={`€${agg.revenue.toFixed(0)}`} hint={`${events.length} eventi`} />
        <Kpi label="Media/evento" value={`€${avgPerEvent.toFixed(0)}`} />
        <Kpi label="Tavoli serviti" value={String(agg.tables)} />
        <Kpi label="Persone totali" value={String(totalPeople)} />
      </div>

      {trend.length > 1 && (
        <Card title="Andamento fatturato" subtitle="Per evento, ordine cronologico">
          <div className="h-56 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="oklch(0.22 0 0)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "oklch(0.70 0 0)", fontSize: 11 }} />
                <YAxis tick={{ fill: "oklch(0.70 0 0)", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="Fatturato" stroke={CHART_COLORS[0]} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {topBottles.length > 0 && (
        <Card title="Top bottiglie" subtitle="Per fatturato totale">
          <div className="h-64 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topBottles} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="oklch(0.22 0 0)" strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fill: "oklch(0.70 0 0)", fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fill: "oklch(0.70 0 0)", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, _n, p) => [`€${v} (${p.payload.qty}×)`, "Fatturato"]} />
                <Bar dataKey="rev" fill={CHART_COLORS[0]} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {zoneData.length > 0 && (
        <Card title="Fatturato per zona">
          <div className="h-56 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={zoneData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(d) => `${d.name}`}>
                  {zoneData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `€${v}`} />
                <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.70 0 0)" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ============ PER EVENT ============ */
function PerEvent({ events, orders, tables, zones, formats }: {
  events: EventRow[]; orders: OrderRow[]; tables: TableRow[]; zones: ZoneRow[]; formats: FormatRow[];
}) {
  if (events.length === 0) return <Empty />;
  const fmt = (id: string | null) => formats.find((f) => f.id === id)?.name ?? "—";
  // Sort desc for the list view
  const sorted = [...events].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      {sorted.map((e) => {
        const evOrders = orders.filter((o) => o.event_id === e.id);
        const evTables = tables.filter((t) => t.event_id === e.id);
        const agg = aggregate(evOrders);
        const avgPerTable = agg.tables > 0 ? agg.revenue / agg.tables : 0;
        const totalPeople = evTables.reduce((s, t) => s + t.people_count, 0);

        const tableToZone = new Map(evTables.map((t) => [t.id, t.zone_id]));
        const zoneRev = new Map<string, number>();
        evOrders.forEach((o) => {
          const name = zones.find((z) => z.id === tableToZone.get(o.table_id))?.name ?? "—";
          zoneRev.set(name, (zoneRev.get(name) ?? 0) + Number(o.total));
        });
        const zoneData = Array.from(zoneRev.entries()).map(([name, value]) => ({ name, value: Math.round(value) }));

        return (
          <Card key={e.id} title={e.name} subtitle={`${new Date(e.date).toLocaleDateString("it-IT")} · ${fmt(e.format_id)}${e.headliner ? " · " + e.headliner : ""}`}>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Mini label="Fatturato" value={`€${agg.revenue.toFixed(0)}`} />
              <Mini label="Tavoli" value={String(agg.tables)} />
              <Mini label="Media/tavolo" value={`€${avgPerTable.toFixed(0)}`} />
              <Mini label="Persone" value={String(totalPeople)} />
            </div>
            {zoneData.length > 0 && (
              <div className="h-44 -mx-2 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={zoneData}>
                    <CartesianGrid stroke="oklch(0.22 0 0)" strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fill: "oklch(0.70 0 0)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "oklch(0.70 0 0)", fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `€${v}`} />
                    <Bar dataKey="value" fill={CHART_COLORS[1]} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        );
      })}
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/40 p-2">
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}

/* ============ PER FORMAT ============ */
function PerFormat({ events, formats, orders, tables }: {
  events: EventRow[]; formats: FormatRow[]; orders: OrderRow[]; tables: TableRow[];
}) {
  const data = useMemo(() => formats.map((f) => {
    const fEvents = events.filter((e) => e.format_id === f.id);
    const eventIds = new Set(fEvents.map((e) => e.id));
    const fOrders = orders.filter((o) => eventIds.has(o.event_id));
    const fTables = tables.filter((t) => eventIds.has(t.event_id));
    const agg = aggregate(fOrders);
    return {
      name: f.name,
      Fatturato: Math.round(agg.revenue),
      Eventi: fEvents.length,
      avgPerTable: agg.tables > 0 ? agg.revenue / agg.tables : 0,
      avgTablesPerEvent: fEvents.length > 0 ? agg.tables / fEvents.length : 0,
      totalTables: fTables.length,
      tables: agg.tables,
    };
  }).filter((d) => d.Eventi > 0).sort((a, b) => b.Fatturato - a.Fatturato), [formats, events, orders, tables]);

  if (data.length === 0) return <Empty />;
  return (
    <>
      <Card title="Confronto fatturato per format">
        <div className="h-64 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid stroke="oklch(0.22 0 0)" strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fill: "oklch(0.70 0 0)", fontSize: 11 }} />
              <YAxis tick={{ fill: "oklch(0.70 0 0)", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `€${v}`} />
              <Bar dataKey="Fatturato" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      {data.map((d) => (
        <Card key={d.name} title={d.name} subtitle={`${d.Eventi} eventi · ${d.tables} tavoli`}>
          <div className="grid grid-cols-2 gap-2">
            <Mini label="Fatturato" value={`€${d.Fatturato}`} />
            <Mini label="Media/tavolo" value={`€${d.avgPerTable.toFixed(0)}`} />
            <Mini label="Tavoli medi/evento" value={d.avgTablesPerEvent.toFixed(1)} />
            <Mini label="Tavoli totali" value={String(d.totalTables)} />
          </div>
        </Card>
      ))}
    </>
  );
}

/* ============ PER HEADLINER ============ */
function PerHeadliner({ events, orders }: { events: EventRow[]; orders: OrderRow[]; }) {
  const data = useMemo(() => {
    const map = new Map<string, { events: number; revenue: number; tables: Set<string> }>();
    events.forEach((e) => {
      const key = e.headliner?.trim() || "—";
      if (!map.has(key)) map.set(key, { events: 0, revenue: 0, tables: new Set() });
      const group = map.get(key);
      if (group) group.events++;
    });
    orders.forEach((o) => {
      const ev = events.find((e) => e.id === o.event_id);
      const key = ev?.headliner?.trim() || "—";
      const g = map.get(key);
      if (g) { g.revenue += Number(o.total); g.tables.add(o.table_id); }
    });
    return Array.from(map.entries()).map(([name, g]) => ({
      name, Fatturato: Math.round(g.revenue), Eventi: g.events, Tavoli: g.tables.size,
      avg: g.tables.size > 0 ? g.revenue / g.tables.size : 0,
    })).filter((r) => r.name !== "—" || r.Eventi > 0).sort((a, b) => b.Fatturato - a.Fatturato);
  }, [events, orders]);

  if (data.length === 0) return <Empty />;
  return (
    <>
      <Card title="Fatturato per headliner">
        <div className="h-72 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid stroke="oklch(0.22 0 0)" strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fill: "oklch(0.70 0 0)", fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fill: "oklch(0.70 0 0)", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `€${v}`} />
              <Bar dataKey="Fatturato" fill={CHART_COLORS[2]} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      {data.map((d) => (
        <Card key={d.name} title={d.name} subtitle={`${d.Eventi} eventi`}>
          <div className="grid grid-cols-3 gap-2">
            <Mini label="Fatturato" value={`€${d.Fatturato}`} />
            <Mini label="Tavoli" value={String(d.Tavoli)} />
            <Mini label="Media/tavolo" value={`€${d.avg.toFixed(0)}`} />
          </div>
        </Card>
      ))}
    </>
  );
}
