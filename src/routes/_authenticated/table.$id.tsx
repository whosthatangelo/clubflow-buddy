import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/use-role";
import { STATUS_LABEL, STATUS_ORDER, nextStatus, type TableStatus } from "@/lib/status";
import { calculateCheckin, type Bottle as BottleT } from "@/lib/bottle-calc";
import { ArrowLeft, Minus, Plus, Check, Banknote, CreditCard, HandMetal } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/table/$id")({
  component: TableDetail,
});

interface Zone { id: string; name: string; min_per_person: number; }
interface ClubTable {
  id: string;
  ref_name: string;
  whatsapp: string | null;
  people_count: number;
  zone_id: string | null;
  status: TableStatus;
  assigned_to: string | null;
  total_amount: number | null;
  payment_method: "cash" | "pos" | null;
  selected_bottle_ids: string[] | null;
}

function TableDetail() {
  const { id } = Route.useParams();
  const { user } = useRole();
  const navigate = useNavigate();
  const [table, setTable] = useState<ClubTable | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [bottles, setBottles] = useState<BottleT[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkinOpen, setCheckinOpen] = useState(false);

  const load = async () => {
    const { data: t } = await supabase.from("club_tables").select("*").eq("id", id).maybeSingle();
    if (!t) { setLoading(false); return; }
    setTable(t as ClubTable);
    const [{ data: z }, { data: b }] = await Promise.all([
      t.zone_id ? supabase.from("zones").select("*").eq("id", t.zone_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("bottles").select("*").order("price"),
    ]);
    setZone((z as Zone) ?? null);
    setBottles((b ?? []) as BottleT[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`table-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "club_tables", filter: `id=eq.${id}` }, (payload) => {
        setTable(payload.new as ClubTable);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const advance = async () => {
    if (!table) return;
    if (table.status === "arriving") {
      setCheckinOpen(true);
      return;
    }
    const ns = nextStatus(table.status);
    if (!ns) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("club_tables")
      .update({
        status: ns,
        assigned_to: table.assigned_to ?? user?.id ?? null,
        ...(ns === "fish_delivered" ? { fish_delivered_at: now } : {}),
        ...(ns === "bottle_waiting" ? { bottle_waiting_at: now } : {}),
        ...(ns === "bottle_arrived" ? { bottle_arrived_at: now } : {}),
        ...(ns === "closed" ? { closed_at: now } : {}),
      })
      .eq("id", id);
    if (error) toast.error(error.message);

    // Risolvi gli alert aperti per questo tavolo quando avanza
    if (ns === "bottle_arrived" || ns === "closed") {
      await supabase
        .from("alerts" as never)
        .update({ resolved_at: now } as never)
        .eq("table_id", id)
        .is("resolved_at", null);
    }
  };

  const callHelp = async () => {
    const { error } = await supabase.from("alerts" as never).insert({
      kind: "help_needed",
      table_id: id,
      message: `Serve aiuto al tavolo ${table?.ref_name ?? ""}`.trim(),
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Alert inviato allo staff");
  };

  if (loading) return <p className="p-6 text-muted-foreground">Caricamento…</p>;
  if (!table) return (
    <div className="p-6 text-center">
      <p>Tavolo non trovato.</p>
      <Link to="/board" className="inline-flex items-center justify-center mt-4 px-5 rounded-xl bg-primary text-primary-foreground font-bold">
        Board
      </Link>
    </div>
  );

  const ns = nextStatus(table.status);
  const selectedBottles = bottles.filter((b) => table.selected_bottle_ids?.includes(b.id));

  return (
    <div className="min-h-screen pb-32">
      <header className="sticky top-0 z-20 backdrop-blur bg-background/85 border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate({ to: "/board" })} aria-label="Indietro" className="h-11 w-11 grid place-items-center rounded-xl bg-secondary">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-black truncate">{table.ref_name}</h1>
          <p className="text-xs text-muted-foreground">{table.people_count} pax · {zone?.name ?? "—"}</p>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* Stepper stati */}
        <div className="rounded-2xl bg-card border border-border p-4">
          <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">Stato</h3>
          <div className="space-y-1.5">
            {STATUS_ORDER.map((s, i) => {
              const currentIdx = STATUS_ORDER.indexOf(table.status);
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
        </div>

        {/* Riepilogo spesa */}
        {table.total_amount && (
          <div className="rounded-2xl bg-card border border-border p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="font-bold">Spesa</h3>
              <span className="text-2xl font-black tabular-nums">€{table.total_amount}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Pagamento: {table.payment_method === "cash" ? "Contanti" : table.payment_method === "pos" ? "POS" : "—"}
            </p>
            {selectedBottles.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border space-y-1">
                {selectedBottles.map((b, i) => (
                  <div key={`${b.id}-${i}`} className="flex justify-between text-sm">
                    <span>{b.name}</span>
                    <span className="tabular-nums text-muted-foreground">€{b.price}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Note WhatsApp */}
        {table.whatsapp && (
          <div className="rounded-2xl bg-card border border-border p-4">
            <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground">WhatsApp</h3>
            <p className="font-mono mt-1">{table.whatsapp}</p>
          </div>
        )}
      </main>

      {/* CTA Avanza stato */}
      {ns && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background to-transparent">
          <button
            onClick={advance}
            className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black text-base shadow-lg"
          >
            {table.status === "arriving" ? "Check-in →" : `Avanza: ${STATUS_LABEL[ns]} →`}
          </button>
        </div>
      )}

      {checkinOpen && zone && (
        <CheckinSheet
          table={table}
          zone={zone}
          bottles={bottles}
          onClose={() => setCheckinOpen(false)}
          onDone={() => { setCheckinOpen(false); }}
        />
      )}
      {checkinOpen && !zone && (() => {
        toast.error("Tavolo senza zona assegnata"); setCheckinOpen(false); return null;
      })()}
    </div>
  );
}

/* ============ CHECK-IN SHEET ============ */
function CheckinSheet({
  table, zone, bottles, onClose, onDone,
}: {
  table: ClubTable; zone: Zone; bottles: BottleT[]; onClose: () => void; onDone: () => void;
}) {
  const [people, setPeople] = useState(table.people_count);
  const [useUpsell, setUseUpsell] = useState(false);
  const [payment, setPayment] = useState<"cash" | "pos" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const calc = useMemo(
    () => calculateCheckin(people, zone.min_per_person, bottles),
    [people, zone.min_per_person, bottles],
  );

  const chosen = useUpsell && calc.upsell ? calc.upsell.combination : calc.best;
  const totalToPay = useUpsell && calc.upsell ? calc.upsell.combination.total : calc.required;

  const confirm = async () => {
    if (!payment) return toast.error("Scegli il metodo di pagamento");
    setSubmitting(true);
    const { error } = await supabase.from("club_tables").update({
      people_count: people,
      status: "at_cashier",
      total_amount: totalToPay,
      payment_method: payment,
      selected_bottle_ids: chosen.bottles.map((b) => b.id),
      check_in_at: new Date().toISOString(),
    }).eq("id", table.id);
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Check-in confermato");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-40 bg-background/95 backdrop-blur overflow-y-auto">
      <div className="max-w-md mx-auto p-4 pb-32">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-black">Check-in</h2>
          <button onClick={onClose} className="h-11 px-4 rounded-xl bg-secondary font-semibold">Annulla</button>
        </div>

        {/* Persone */}
        <div className="rounded-2xl bg-card border border-border p-4">
          <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Persone arrivate</h3>
          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              onClick={() => setPeople((p) => Math.max(1, p - 1))}
              className="h-14 w-14 rounded-2xl bg-secondary grid place-items-center"
            >
              <Minus className="w-6 h-6" />
            </button>
            <span className="text-5xl font-black tabular-nums">{people}</span>
            <button
              onClick={() => setPeople((p) => p + 1)}
              className="h-14 w-14 rounded-2xl bg-secondary grid place-items-center"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Calcolo */}
        <div className="rounded-2xl bg-card border border-border p-4 mt-3">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Minimo dovuto ({zone.name})</div>
              <div className="text-2xl font-black tabular-nums">€{calc.required}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">{people} × €{zone.min_per_person}</div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <h4 className="font-bold text-sm mb-2">Combinazione ottimale ({calc.best.bottles.length} bottiglie)</h4>
            {calc.best.bottles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna bottiglia rientra nel budget.</p>
            ) : (
              <ul className="space-y-1">
                {calc.best.bottles.map((b, i) => (
                  <li key={`${b.id}-${i}`} className="flex justify-between text-sm">
                    <span>{b.name}</span>
                    <span className="tabular-nums text-muted-foreground">€{b.price}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-muted-foreground">Coperto</span>
              <span className="tabular-nums font-semibold">€{calc.best.total}</span>
            </div>
          </div>
        </div>

        {/* Upsell */}
        {calc.upsell && (
          <button
            type="button"
            onClick={() => setUseUpsell((v) => !v)}
            className={`mt-3 w-full text-left rounded-2xl border-2 p-4 transition-colors ${useUpsell ? "border-primary bg-primary/10" : "border-warning bg-warning/10"}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-warning">💡 Sblocca 1 bottiglia in più</div>
                <div className="text-xs mt-1 text-muted-foreground">
                  Con +€{calc.upsell.extraTotal} totali (€{calc.upsell.extraPerPerson} a testa) →{" "}
                  {calc.upsell.combination.bottles.length} bottiglie
                </div>
              </div>
              <div className={`h-6 w-6 rounded-full border-2 ${useUpsell ? "bg-primary border-primary" : "border-warning"}`}>
                {useUpsell && <Check className="w-full h-full text-primary-foreground" />}
              </div>
            </div>
          </button>
        )}

        {/* Pagamento */}
        <div className="mt-3 rounded-2xl bg-card border border-border p-4">
          <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">Pagamento</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPayment("cash")}
              className={`h-20 rounded-2xl flex flex-col items-center justify-center gap-1 font-bold ${payment === "cash" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}
            >
              <Banknote className="w-6 h-6" />
              Contanti
            </button>
            <button
              type="button"
              onClick={() => setPayment("pos")}
              className={`h-20 rounded-2xl flex flex-col items-center justify-center gap-1 font-bold ${payment === "pos" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}
            >
              <CreditCard className="w-6 h-6" />
              POS
            </button>
          </div>
        </div>

        {/* Totale */}
        <div className="mt-4 rounded-2xl bg-primary/10 border border-primary p-4 flex items-baseline justify-between">
          <span className="font-bold">Da incassare</span>
          <span className="text-3xl font-black tabular-nums text-primary">€{totalToPay}</span>
        </div>

        {/* Conferma */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background to-transparent">
          <div className="max-w-md mx-auto">
            <button
              onClick={confirm}
              disabled={submitting || !payment}
              className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black text-base disabled:opacity-50"
            >
              {submitting ? "Conferma…" : "Conferma check-in →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
