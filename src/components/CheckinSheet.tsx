import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Banknote, CreditCard, Check, Minus, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

export interface BottleListItem { id: string; name: string; price: number; }
export interface SelectedBottle { bottle_id: string; name: string; price_list: number; price_actual: number; }

interface Props {
  tableId: string;
  teamId: string;
  eventId: string;
  userId: string;
  refName: string;
  initialPeople: number;
  minPerPerson: number;
  zoneName: string;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Sheet di check-in: selezione MANUALE delle bottiglie, prezzi modificabili.
 * Mostra budget, totale, delta, e suggerimento sulla bottiglia più economica
 * non ancora selezionata.
 */
export function CheckinSheet({
  tableId, teamId, eventId, userId, refName, initialPeople, minPerPerson, zoneName, onClose, onDone,
}: Props) {
  const [people, setPeople] = useState(initialPeople);
  const [catalog, setCatalog] = useState<BottleListItem[]>([]);
  const [selected, setSelected] = useState<SelectedBottle[]>([]);
  const [payment, setPayment] = useState<"cash" | "pos" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("bottles").select("id,name,price").eq("event_id", eventId).order("price");
      setCatalog((data ?? []) as BottleListItem[]);
    })();
  }, [eventId]);

  const required = useMemo(() => +(people * minPerPerson).toFixed(2), [people, minPerPerson]);
  const totalSelected = useMemo(() => +selected.reduce((s, b) => s + b.price_actual, 0).toFixed(2), [selected]);
  const delta = +(required - totalSelected).toFixed(2);

  const cheapestNext = useMemo(() => {
    if (catalog.length === 0) return null;
    // bottiglia più economica del listino (anche se già selezionata, può ripetersi)
    return [...catalog].sort((a, b) => a.price - b.price)[0] ?? null;
  }, [catalog]);

  const addBottle = (b: BottleListItem) => {
    setSelected((prev) => [...prev, { bottle_id: b.id, name: b.name, price_list: b.price, price_actual: b.price }]);
  };
  const removeAt = (i: number) => setSelected((prev) => prev.filter((_, j) => j !== i));
  const updatePrice = (i: number, val: string) => {
    const v = parseFloat(val);
    if (isNaN(v) || v < 0) return;
    setSelected((prev) => prev.map((b, j) => (j === i ? { ...b, price_actual: v } : b)));
  };

  const confirm = async () => {
    if (!payment) return toast.error("Scegli il metodo di pagamento");
    if (selected.length === 0) return toast.error("Aggiungi almeno una bottiglia");
    setSubmitting(true);
    const total = totalSelected;
    const now = new Date().toISOString();

    const { data: order, error: orderErr } = await supabase.from("table_orders").insert({
      team_id: teamId,
      event_id: eventId,
      table_id: tableId,
      type: "checkin",
      bottles: selected as unknown as never,
      total,
      created_by: userId,
    }).select("id").single();
    if (orderErr) { setSubmitting(false); return toast.error(orderErr.message); }

    const { error: tErr } = await supabase.from("club_tables").update({
      people_count: people,
      status: "at_cashier",
      total_amount: total,
      payment_method: payment,
      check_in_at: now,
      assigned_to: userId,
    }).eq("id", tableId);

    setSubmitting(false);
    if (tErr) {
      if (order) await supabase.from("table_orders").delete().eq("id", order.id);
      return toast.error(`Check-in non salvato: ${tErr.message}`);
    }
    toast.success("Check-in confermato");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Scroll area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto p-4 space-y-4">
          <div className="flex items-center justify-between sticky top-0 -mx-4 px-4 py-3 bg-background border-b border-border z-10">
            <div className="min-w-0">
              <h2 className="text-xl font-black truncate">Check-in · {refName}</h2>
              <p className="text-xs text-muted-foreground">Zona {zoneName} · €{minPerPerson}/pax</p>
            </div>
            <button onClick={onClose} aria-label="Chiudi" className="h-11 w-11 grid place-items-center rounded-xl bg-secondary">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Persone */}
          <div className="rounded-2xl bg-card border border-border p-4">
            <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Persone arrivate</h3>
            <div className="mt-3 flex items-center justify-between gap-3">
              <button onClick={() => setPeople((p) => Math.max(1, p - 1))} className="h-14 w-14 rounded-2xl bg-secondary grid place-items-center">
                <Minus className="w-6 h-6" />
              </button>
              <span className="text-5xl font-black tabular-nums">{people}</span>
              <button onClick={() => setPeople((p) => p + 1)} className="h-14 w-14 rounded-2xl bg-secondary grid place-items-center">
                <Plus className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Budget */}
          <div className="rounded-2xl bg-card border border-border p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Budget minimo</span>
              <span className="font-bold tabular-nums">€{required}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Bottiglie selezionate</span>
              <span className="font-bold tabular-nums">€{totalSelected}</span>
            </div>
            <div className="flex justify-between text-base pt-2 border-t border-border">
              <span className="font-bold">{delta > 0 ? "Mancano" : delta < 0 ? "Extra" : "Coperto"}</span>
              <span className={`font-black tabular-nums ${delta > 0 ? "text-warning" : "text-success"}`}>
                €{Math.abs(delta).toFixed(2)}
              </span>
            </div>
            {delta > 0 && cheapestNext && (
              <p className="text-xs text-muted-foreground pt-2">
                💡 La prossima più economica è <span className="font-bold">{cheapestNext.name}</span> (€{cheapestNext.price}).
                {people > 0 && (
                  <> Servono <span className="font-bold">€{(Math.max(0, cheapestNext.price - delta) / people).toFixed(2)} a testa</span> in più per coprirla.</>
                )}
              </p>
            )}
          </div>

          {/* Selezionate */}
          {selected.length > 0 && (
            <div className="rounded-2xl bg-card border border-border p-4 space-y-2">
              <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Aggiunte</h3>
              {selected.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 text-sm truncate">{b.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">€</span>
                    <input
                      type="number" inputMode="decimal" step="1"
                      value={b.price_actual}
                      onChange={(e) => updatePrice(i, e.target.value)}
                      className="w-20 h-10 px-2 rounded-lg bg-input border border-border text-right tabular-nums"
                    />
                  </div>
                  {b.price_actual !== b.price_list && (
                    <span className="text-[10px] text-muted-foreground line-through tabular-nums">€{b.price_list}</span>
                  )}
                  <button onClick={() => removeAt(i)} className="h-10 w-10 grid place-items-center rounded-lg bg-secondary text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Listino */}
          <div className="rounded-2xl bg-card border border-border p-4">
            <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Listino evento</h3>
            {catalog.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna bottiglia. Aggiungile dalla configurazione.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {catalog.map((b) => (
                  <button key={b.id} type="button" onClick={() => addBottle(b)}
                    className="rounded-xl bg-secondary p-3 text-left active:scale-95 transition-transform">
                    <div className="text-sm font-bold truncate">{b.name}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">€{b.price}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pagamento */}
          <div className="rounded-2xl bg-card border border-border p-4">
            <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">Pagamento</h3>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setPayment("cash")}
                className={`h-20 rounded-2xl flex flex-col items-center justify-center gap-1 font-bold ${payment === "cash" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                <Banknote className="w-6 h-6" /> Contanti
              </button>
              <button type="button" onClick={() => setPayment("pos")}
                className={`h-20 rounded-2xl flex flex-col items-center justify-center gap-1 font-bold ${payment === "pos" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                <CreditCard className="w-6 h-6" /> POS
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom CTA fissa (non sovrapposta) */}
      <div className="border-t border-border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="max-w-md mx-auto">
          <button disabled={submitting || !payment || selected.length === 0} onClick={confirm}
            className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black disabled:opacity-50">
            {submitting ? "Conferma…" : `Conferma — €${totalSelected}`}
          </button>
        </div>
      </div>
    </div>
  );
}
