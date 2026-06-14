import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTeam } from "@/hooks/use-current-team";
import { STATUS_LABEL, STATUS_ORDER, nextStatus, requiresInput, type TableStatus } from "@/lib/status";
import { ArrowLeft, Check, HandMetal, MessageCircle, Plus, StickyNote, UserRound } from "lucide-react";
import { toast } from "sonner";
import { CheckinSheet, type SelectedBottle } from "@/components/CheckinSheet";
import { ReorderSheet } from "@/components/ReorderSheet";

export const Route = createFileRoute("/_authenticated/table/$id")({
  component: TableDetail,
});

interface Zone { id: string; name: string; min_per_person: number; }
interface ClubTable {
  id: string;
  team_id: string;
  event_id: string;
  ref_name: string;
  whatsapp: string | null;
  people_count: number;
  zone_id: string | null;
  status: TableStatus;
  assigned_to: string | null;
  total_amount: number | null;
  payment_method: "cash" | "pos" | null;
  notes: string | null;
}
interface OrderRow {
  id: string;
  type: "checkin" | "reorder";
  bottles: SelectedBottle[];
  total: number;
  notes: string | null;
  created_at: string;
}
interface ActivityRow {
  id: string;
  actor_id: string | null;
  from_status: TableStatus | null;
  to_status: TableStatus | null;
  created_at: string;
}

function TableDetail() {
  const { id } = Route.useParams();
  const { user, teamId } = useCurrentTeam();
  const navigate = useNavigate();
  const [table, setTable] = useState<ClubTable | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  const load = useCallback(async () => {
    const { data: t } = await supabase.from("club_tables").select("*").eq("id", id).maybeSingle();
    if (!t) { setLoading(false); return; }
    setTable(t as ClubTable);
    setNotesDraft((t as ClubTable).notes ?? "");
    const [{ data: z }, { data: o }, { data: a }] = await Promise.all([
      t.zone_id ? supabase.from("zones").select("*").eq("id", t.zone_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("table_orders").select("*").eq("table_id", id).order("created_at"),
      supabase.from("table_activity").select("id,actor_id,from_status,to_status,created_at").eq("table_id", id).order("created_at", { ascending: false }),
    ]);
    setZone((z as Zone) ?? null);
    setOrders((o ?? []) as unknown as OrderRow[]);
    const rows = (a ?? []) as ActivityRow[];
    setActivity(rows);
    const actorIds = [...new Set(rows.flatMap((row) => row.actor_id ? [row.actor_id] : []))];
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id,display_name,email").in("id", actorIds);
      setPeople(Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name ?? p.email ?? "Operatore"])));
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`table-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "club_tables", filter: `id=eq.${id}` },
        () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "table_orders", filter: `table_id=eq.${id}` },
        () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "table_activity", filter: `table_id=eq.${id}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load]);

  const advance = async () => {
    if (!table) return;
    if (requiresInput(table.status)) { setCheckinOpen(true); return; }
    const ns = nextStatus(table.status);
    if (!ns) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from("club_tables").update({
      status: ns,
      assigned_to: user?.id ?? null,
      ...(ns === "fish_delivered" ? { fish_delivered_at: now } : {}),
      ...(ns === "bottle_waiting" ? { bottle_waiting_at: now } : {}),
      ...(ns === "bottle_arrived" ? { bottle_arrived_at: now } : {}),
      ...(ns === "closed" ? { closed_at: now } : {}),
    }).eq("id", id);
    if (error) toast.error(error.message);
    if (ns === "bottle_arrived" || ns === "closed") {
      await supabase.from("alerts").update({ resolved_at: now }).eq("table_id", id).is("resolved_at", null);
    }
  };

  const callHelp = async () => {
    if (!teamId || !table) return;
    const { error } = await supabase.from("alerts").insert({
      team_id: teamId,
      event_id: table.event_id,
      kind: "help_needed",
      table_id: id,
      message: `Supporto richiesto al tavolo ${table.ref_name}`,
    });
    if (error) return toast.error(error.message);
    toast.success("Richiesta inviata al team");
  };

  const sendRequest = async (request: string) => {
    if (!teamId || !table) return;
    const { error } = await supabase.from("alerts").insert({
      team_id: teamId, event_id: table.event_id, kind: "help_needed", table_id: id,
      message: `${request} · ${table.ref_name}`,
    });
    if (error) return toast.error(error.message);
    toast.success(`${request}: richiesta inviata`);
  };

  const saveNotes = async () => {
    if (!table) return;
    const { error } = await supabase.from("club_tables").update({ notes: notesDraft.trim() || null }).eq("id", id);
    if (error) return toast.error(error.message);
    setTable((current) => current ? { ...current, notes: notesDraft.trim() || null } : current);
    toast.success("Note salvate");
  };

  if (loading) return <p className="p-6 text-muted-foreground">Caricamento…</p>;
  if (!table) return (
    <div className="p-6 text-center">
      <p>Tavolo non trovato.</p>
      <Link to="/board" className="inline-flex items-center justify-center mt-4 px-5 h-11 rounded-xl bg-primary text-primary-foreground font-bold">Board</Link>
    </div>
  );

  const ns = nextStatus(table.status);
  const ordersTotal = orders.reduce((s, o) => s + Number(o.total), 0);
  const canReorder = table.status !== "arriving" && table.status !== "closed";
  const whatsappHref = table.whatsapp
    ? `https://wa.me/${table.whatsapp.replace(/\D/g, "")}`
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 backdrop-blur bg-background/85 border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate({ to: "/board" })} aria-label="Indietro" className="h-11 w-11 grid place-items-center rounded-xl bg-secondary">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-black truncate">{table.ref_name}</h1>
          <p className="text-xs text-muted-foreground">{table.people_count} pax · {zone?.name ?? "—"}</p>
        </div>
      </header>

      {/* Scrollable content */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Stepper */}
        <div className="rounded-2xl bg-card border border-border p-4">
          <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">Stato</h3>
          <div className="space-y-1.5">
            {STATUS_ORDER.map((s, i) => {
              const currentIdx = STATUS_ORDER.indexOf(table.status === "reorder" ? "bottle_arrived" : table.status);
              const done = i < currentIdx;
              const active = i === currentIdx;
              return (
                <div key={s} className={`flex items-center gap-3 py-1.5 ${done ? "opacity-50" : ""}`}>
                  <div className={`h-6 w-6 rounded-full grid place-items-center ${active ? "bg-primary text-primary-foreground" : done ? "bg-success text-success-foreground" : "bg-secondary text-muted-foreground"}`}>
                    {done ? <Check className="w-3.5 h-3.5" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
                  </div>
                  <span className={`text-sm ${active ? "font-bold text-foreground" : ""}`}>{STATUS_LABEL[s]}</span>
                </div>
              );
            })}
          </div>
          {table.status === "reorder" && (
            <p className="mt-3 text-xs text-warning font-bold">⚡ Riordine in corso</p>
          )}
        </div>

        {/* Totale + ordini */}
        {orders.length > 0 && (
          <div className="rounded-2xl bg-card border border-border p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="font-bold">Totale tavolo</h3>
              <span className="text-2xl font-black tabular-nums">€{ordersTotal.toFixed(2)}</span>
            </div>
            {table.payment_method && (
              <p className="text-xs text-muted-foreground mt-1">
                Pagamento check-in: {table.payment_method === "cash" ? "Contanti" : "POS"}
              </p>
            )}
            <div className="mt-3 pt-3 border-t border-border space-y-3">
              {orders.map((o) => (
                <div key={o.id}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                      {o.type === "checkin" ? "Check-in" : "Riordine"}
                    </span>
                    <span className="text-sm font-bold tabular-nums">€{Number(o.total).toFixed(2)}</span>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {o.bottles.map((b, i) => (
                      <li key={i} className="flex justify-between text-sm">
                        <span className="truncate">{b.name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          €{b.price_actual}
                          {b.price_actual !== b.price_list && <span className="ml-1 text-[10px] line-through">€{b.price_list}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {o.notes && <p className="mt-1 text-xs text-muted-foreground italic">"{o.notes}"</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {canReorder && (
          <button onClick={() => setReorderOpen(true)}
            className="w-full h-12 rounded-2xl bg-secondary text-foreground font-bold inline-flex items-center justify-center gap-2">
            <Plus className="w-5 h-5" /> Nuovo riordine
          </button>
        )}

        {/* Note */}
        <div className="rounded-2xl bg-card border border-border p-4">
          <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground flex items-center gap-1.5">
            <StickyNote className="w-3.5 h-3.5" /> Note tavolo
          </h3>
          <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={3}
            placeholder="Allergie, richieste, preferenze…"
            className="mt-2 w-full p-3 rounded-xl bg-input border border-border resize-none text-sm" />
          {(notesDraft ?? "") !== (table.notes ?? "") && (
            <button onClick={saveNotes} className="mt-2 w-full h-10 rounded-lg bg-primary text-primary-foreground font-bold text-sm">
              Salva note
            </button>
          )}
        </div>

        {activity.length > 0 && (
          <div className="rounded-2xl bg-card border border-border p-4">
            <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">Registro attività</h3>
            <div className="space-y-3">
              {activity.map((item) => (
                <div key={item.id} className="flex gap-3 text-sm">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-secondary grid place-items-center"><UserRound className="w-4 h-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p><span className="font-bold">{people[item.actor_id ?? ""] ?? "Sistema"}</span> ha avanzato a <span className="font-semibold">{item.to_status ? STATUS_LABEL[item.to_status] : "—"}</span></p>
                    <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {whatsappHref && (
          <a href={whatsappHref} target="_blank" rel="noreferrer"
            className="w-full h-12 rounded-2xl bg-success text-success-foreground font-black inline-flex items-center justify-center gap-2">
            <MessageCircle className="w-5 h-5" /> WhatsApp
          </a>
        )}

        <div className="rounded-2xl bg-card border border-border p-4">
          <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">Richieste rapide</h3>
          <div className="grid grid-cols-2 gap-2">
            {["Manca ghiaccio", "Manca tonica", "Serve cameriere", "Altra assistenza"].map((request) => (
              <button key={request} type="button" onClick={() => sendRequest(request)} className="min-h-11 rounded-xl bg-secondary px-3 text-sm font-bold">
                {request}
              </button>
            ))}
          </div>
        </div>

        <button type="button" onClick={callHelp}
          className="w-full h-12 rounded-2xl bg-warning/15 border-2 border-warning text-warning font-bold inline-flex items-center justify-center gap-2">
          <HandMetal className="w-5 h-5" /> Segnala problema al team
        </button>
      </main>

      {/* CTA Avanza — sticky bottom, mai sovrapposta */}
      {ns && (
        <div className="border-t border-border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button onClick={advance}
            className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black">
            {requiresInput(table.status) ? "Check-in →" : `Avanza: ${STATUS_LABEL[ns]} →`}
          </button>
        </div>
      )}

      {checkinOpen && zone && user && teamId && (
        <CheckinSheet
          tableId={table.id}
          teamId={teamId}
          eventId={table.event_id}
          userId={user.id}
          refName={table.ref_name}
          initialPeople={table.people_count}
          minPerPerson={zone.min_per_person}
          zoneName={zone.name}
          onClose={() => setCheckinOpen(false)}
          onDone={() => { setCheckinOpen(false); load(); }}
        />
      )}
      {reorderOpen && user && teamId && (
        <ReorderSheet
          tableId={table.id}
          teamId={teamId}
          eventId={table.event_id}
          userId={user.id}
          refName={table.ref_name}
          currentTotal={ordersTotal}
          onClose={() => setReorderOpen(false)}
          onDone={() => { setReorderOpen(false); load(); }}
        />
      )}
    </div>
  );
}
