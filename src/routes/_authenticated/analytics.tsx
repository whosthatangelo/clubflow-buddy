import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTeam } from "@/hooks/use-current-team";
import { ArrowLeft } from "lucide-react";
import type { SelectedBottle } from "@/components/CheckinSheet";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
});

type Tab = "event" | "month" | "format" | "headliner";

interface EventRow {
  id: string;
  name: string;
  date: string;
  headliner: string | null;
  format_id: string | null;
  status: string;
}
interface FormatRow { id: string; name: string; }
interface OrderRow { event_id: string; table_id: string; bottles: SelectedBottle[]; total: number; }
interface TableRow { id: string; event_id: string; people_count: number; zone_id: string | null; }
interface ZoneRow { id: string; name: string; }

function AnalyticsPage() {
  const { teamId, isAdmin, status } = useCurrentTeam();
  const [tab, setTab] = useState<Tab>("event");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [formats, setFormats] = useState<FormatRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    (async () => {
      const [{ data: e }, { data: f }, { data: o }, { data: t }, { data: z }] = await Promise.all([
        supabase.from("events").select("id,name,date,headliner,format_id,status").eq("team_id", teamId).order("date", { ascending: false }),
        supabase.from("formats").select("id,name").eq("team_id", teamId),
        supabase.from("table_orders").select("event_id,table_id,bottles,total").eq("team_id", teamId),
        supabase.from("club_tables").select("id,event_id,people_count,zone_id").eq("team_id", teamId),
        supabase.from("zones").select("id,name").eq("team_id", teamId),
      ]);
      setEvents((e ?? []) as EventRow[]);
      setFormats((f ?? []) as FormatRow[]);
      setOrders((o ?? []) as unknown as OrderRow[]);
      setTables((t ?? []) as TableRow[]);
      setZones((z ?? []) as ZoneRow[]);
      setLoading(false);
    })();
  }, [teamId]);

  if (status === "loading") return <p className="p-6 text-muted-foreground">Caricamento…</p>;
  if (!isAdmin) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <h2 className="text-xl font-bold">Solo admin</h2>
      <Link to="/board" className="mt-4 inline-flex h-11 px-4 items-center rounded-xl bg-primary text-primary-foreground font-bold">Board</Link>
    </div>
  );

  return (
    <div className="min-h-screen pb-12">
      <header className="sticky top-0 z-20 backdrop-blur bg-background/85 border-b border-border px-4 py-3 flex items-center gap-3">
        <Link to="/events" className="h-11 w-11 grid place-items-center rounded-xl bg-secondary">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-black">Analytics</h1>
      </header>

      <div className="px-4 py-3 flex gap-2 overflow-x-auto">
        {(["event", "month", "format", "headliner"] as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`h-auto-tap !min-h-0 py-2 px-4 rounded-full text-sm font-semibold whitespace-nowrap ${tab === t ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
            {t === "event" ? "Per evento" : t === "month" ? "Per mese" : t === "format" ? "Per format" : "Per headliner"}
          </button>
        ))}
      </div>

      <main className="px-4 space-y-3">
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Caricamento…</p>
        ) : (
          <>
            {tab === "event" && <PerEvent events={events} orders={orders} tables={tables} zones={zones} formats={formats} />}
            {tab === "month" && <PerMonth events={events} orders={orders} tables={tables} />}
            {tab === "format" && <PerFormat events={events} formats={formats} orders={orders} tables={tables} />}
            {tab === "headliner" && <PerHeadliner events={events} orders={orders} tables={tables} />}
          </>
        )}
      </main>
    </div>
  );
}

/* ============ HELPERS ============ */
function aggregate(orders: OrderRow[]) {
  let revenue = 0;
  const bottleCount = new Map<string, number>();
  const tableSet = new Set<string>();
  orders.forEach((o) => {
    revenue += Number(o.total);
    tableSet.add(o.table_id);
    o.bottles.forEach((b) => {
      bottleCount.set(b.name, (bottleCount.get(b.name) ?? 0) + 1);
    });
  });
  let topBottle: string | null = null; let topCount = 0;
  bottleCount.forEach((c, name) => { if (c > topCount) { topCount = c; topBottle = name; } });
  return { revenue, tables: tableSet.size, topBottle, topCount };
}

function KpiRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 space-y-2">
      <div>
        <h3 className="font-bold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function EmptyAnalytics() {
  return <p className="text-center text-muted-foreground py-12">Nessun dato.</p>;
}

/* ============ PER EVENTO ============ */
function PerEvent({ events, orders, tables, zones, formats }: {
  events: EventRow[]; orders: OrderRow[]; tables: TableRow[]; zones: ZoneRow[]; formats: FormatRow[];
}) {
  if (events.length === 0) return <EmptyAnalytics />;
  const formatName = (id: string | null) => formats.find((f) => f.id === id)?.name ?? "—";
  return (
    <>
      {events.map((e) => {
        const evOrders = orders.filter((o) => o.event_id === e.id);
        const evTables = tables.filter((t) => t.event_id === e.id);
        const agg = aggregate(evOrders);
        const avgPerTable = agg.tables > 0 ? agg.revenue / agg.tables : 0;
        const totalPeople = evTables.reduce((s, t) => s + t.people_count, 0);
        // revenue per zona
        const tableToZone = new Map(evTables.map((t) => [t.id, t.zone_id]));
        const zoneRev = new Map<string, number>();
        evOrders.forEach((o) => {
          const zid = tableToZone.get(o.table_id) ?? null;
          const key = zid ?? "—";
          zoneRev.set(key, (zoneRev.get(key) ?? 0) + Number(o.total));
        });
        return (
          <Card key={e.id} title={e.name} subtitle={`${new Date(e.date).toLocaleDateString("it-IT")} · ${formatName(e.format_id)}${e.headliner ? " · " + e.headliner : ""}`}>
            <KpiRow label="Fatturato" value={`€${agg.revenue.toFixed(0)}`} />
            <KpiRow label="Tavoli serviti" value={String(agg.tables)} />
            <KpiRow label="Media per tavolo" value={`€${avgPerTable.toFixed(0)}`} />
            <KpiRow label="Persone" value={String(totalPeople)} />
            <KpiRow label="Bottiglia top" value={agg.topBottle ? `${agg.topBottle} (×${agg.topCount})` : "—"} />
            {zoneRev.size > 0 && (
              <div className="pt-2 mt-2 border-t border-border space-y-1">
                <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Per zona</span>
                {Array.from(zoneRev.entries()).map(([zid, rev]) => (
                  <KpiRow key={zid} label={zones.find((z) => z.id === zid)?.name ?? "—"} value={`€${rev.toFixed(0)}`} />
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </>
  );
}

/* ============ PER MESE ============ */
function PerMonth({ events, orders, tables }: { events: EventRow[]; orders: OrderRow[]; tables: TableRow[]; }) {
  const groups = useMemo(() => {
    const map = new Map<string, { events: EventRow[]; orders: OrderRow[]; tables: TableRow[] }>();
    events.forEach((e) => {
      const key = e.date.slice(0, 7); // YYYY-MM
      if (!map.has(key)) map.set(key, { events: [], orders: [], tables: [] });
      map.get(key)!.events.push(e);
    });
    orders.forEach((o) => {
      const ev = events.find((e) => e.id === o.event_id);
      if (!ev) return;
      const key = ev.date.slice(0, 7);
      if (map.has(key)) map.get(key)!.orders.push(o);
    });
    tables.forEach((t) => {
      const ev = events.find((e) => e.id === t.event_id);
      if (!ev) return;
      const key = ev.date.slice(0, 7);
      if (map.has(key)) map.get(key)!.tables.push(t);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [events, orders, tables]);

  if (groups.length === 0) return <EmptyAnalytics />;
  return (
    <>
      {groups.map(([key, g]) => {
        const agg = aggregate(g.orders);
        const avg = agg.tables > 0 ? agg.revenue / agg.tables : 0;
        const ppl = g.tables.reduce((s, t) => s + t.people_count, 0);
        const label = new Date(key + "-01").toLocaleDateString("it-IT", { month: "long", year: "numeric" });
        return (
          <Card key={key} title={label} subtitle={`${g.events.length} eventi`}>
            <KpiRow label="Fatturato" value={`€${agg.revenue.toFixed(0)}`} />
            <KpiRow label="Tavoli totali" value={String(agg.tables)} />
            <KpiRow label="Media per tavolo" value={`€${avg.toFixed(0)}`} />
            <KpiRow label="Persone" value={String(ppl)} />
            <KpiRow label="Bottiglia top" value={agg.topBottle ? `${agg.topBottle} (×${agg.topCount})` : "—"} />
          </Card>
        );
      })}
    </>
  );
}

/* ============ PER FORMAT ============ */
function PerFormat({ events, formats, orders, tables }: {
  events: EventRow[]; formats: FormatRow[]; orders: OrderRow[]; tables: TableRow[];
}) {
  const data = formats.map((f) => {
    const fEvents = events.filter((e) => e.format_id === f.id);
    const eventIds = new Set(fEvents.map((e) => e.id));
    const fOrders = orders.filter((o) => eventIds.has(o.event_id));
    const fTables = tables.filter((t) => eventIds.has(t.event_id));
    const agg = aggregate(fOrders);
    const avgPerTable = agg.tables > 0 ? agg.revenue / agg.tables : 0;
    const avgTablesPerEvent = fEvents.length > 0 ? agg.tables / fEvents.length : 0;
    return { format: f, events: fEvents.length, agg, avgPerTable, avgTablesPerEvent, totalTables: fTables.length };
  }).filter((d) => d.events > 0).sort((a, b) => b.agg.revenue - a.agg.revenue);

  if (data.length === 0) return <EmptyAnalytics />;
  return (
    <>
      {data.map((d) => (
        <Card key={d.format.id} title={d.format.name} subtitle={`${d.events} eventi`}>
          <KpiRow label="Fatturato totale" value={`€${d.agg.revenue.toFixed(0)}`} />
          <KpiRow label="Tavoli serviti" value={String(d.agg.tables)} />
          <KpiRow label="Media per tavolo" value={`€${d.avgPerTable.toFixed(0)}`} />
          <KpiRow label="Tavoli medi/evento" value={d.avgTablesPerEvent.toFixed(1)} />
          <KpiRow label="Bottiglia top" value={d.agg.topBottle ? `${d.agg.topBottle} (×${d.agg.topCount})` : "—"} />
        </Card>
      ))}
    </>
  );
}

/* ============ PER HEADLINER ============ */
function PerHeadliner({ events, orders, tables }: { events: EventRow[]; orders: OrderRow[]; tables: TableRow[]; }) {
  const map = new Map<string, { events: EventRow[]; orders: OrderRow[]; tables: TableRow[] }>();
  events.forEach((e) => {
    const key = e.headliner?.trim() || "—";
    if (!map.has(key)) map.set(key, { events: [], orders: [], tables: [] });
    map.get(key)!.events.push(e);
  });
  orders.forEach((o) => {
    const ev = events.find((e) => e.id === o.event_id);
    const key = ev?.headliner?.trim() || "—";
    if (map.has(key)) map.get(key)!.orders.push(o);
  });
  tables.forEach((t) => {
    const ev = events.find((e) => e.id === t.event_id);
    const key = ev?.headliner?.trim() || "—";
    if (map.has(key)) map.get(key)!.tables.push(t);
  });

  const rows = Array.from(map.entries()).map(([name, g]) => {
    const agg = aggregate(g.orders);
    const avg = agg.tables > 0 ? agg.revenue / agg.tables : 0;
    return { name, events: g.events.length, agg, avg };
  }).filter((r) => r.name !== "—" || r.events > 0).sort((a, b) => b.agg.revenue - a.agg.revenue);

  if (rows.length === 0) return <EmptyAnalytics />;
  return (
    <>
      {rows.map((r) => (
        <Card key={r.name} title={r.name} subtitle={`${r.events} eventi`}>
          <KpiRow label="Fatturato" value={`€${r.agg.revenue.toFixed(0)}`} />
          <KpiRow label="Tavoli serviti" value={String(r.agg.tables)} />
          <KpiRow label="Media per tavolo" value={`€${r.avg.toFixed(0)}`} />
          <KpiRow label="Bottiglia top" value={r.agg.topBottle ? `${r.agg.topBottle} (×${r.agg.topCount})` : "—"} />
        </Card>
      ))}
    </>
  );
}
