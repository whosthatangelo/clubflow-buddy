import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { BottleListItem, SelectedBottle } from "./CheckinSheet";

interface Props {
  tableId: string;
  teamId: string;
  eventId: string;
  userId: string;
  refName: string;
  currentTotal: number;
  onClose: () => void;
  onDone: () => void;
}

/** Sheet per aggiungere un riordine ripetibile al tavolo. */
export function ReorderSheet({
  tableId, teamId, eventId, userId, refName, currentTotal, onClose, onDone,
}: Props) {
  const [catalog, setCatalog] = useState<BottleListItem[]>([]);
  const [selected, setSelected] = useState<SelectedBottle[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("bottles").select("id,name,price").eq("event_id", eventId).order("price");
      setCatalog((data ?? []) as BottleListItem[]);
    })();
  }, [eventId]);

  const total = useMemo(() => +selected.reduce((s, b) => s + b.price_actual, 0).toFixed(2), [selected]);

  const add = (b: BottleListItem) => setSelected((p) => [...p, { bottle_id: b.id, name: b.name, price_list: b.price, price_actual: b.price }]);
  const removeAt = (i: number) => setSelected((p) => p.filter((_, j) => j !== i));
  const setPrice = (i: number, v: string) => {
    const n = parseFloat(v);
    if (isNaN(n) || n < 0) return;
    setSelected((p) => p.map((b, j) => (j === i ? { ...b, price_actual: n } : b)));
  };

  const confirm = async () => {
    if (selected.length === 0) return toast.error("Aggiungi almeno una bottiglia");
    setSubmitting(true);
    const { error } = await supabase.from("table_orders").insert({
      team_id: teamId,
      event_id: eventId,
      table_id: tableId,
      type: "reorder",
      bottles: selected,
      total,
      notes: notes.trim() || null,
      created_by: userId,
    });
    if (error) { setSubmitting(false); return toast.error(error.message); }

    await supabase.from("club_tables").update({
      total_amount: +(currentTotal + total).toFixed(2),
      status: "reorder",
    }).eq("id", tableId);

    setSubmitting(false);
    toast.success("Riordine registrato");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto p-4 space-y-4">
          <div className="flex items-center justify-between sticky top-0 -mx-4 px-4 py-3 bg-background border-b border-border z-10">
            <h2 className="text-xl font-black truncate">Riordine · {refName}</h2>
            <button onClick={onClose} className="h-11 w-11 grid place-items-center rounded-xl bg-secondary">
              <X className="w-5 h-5" />
            </button>
          </div>

          {selected.length > 0 && (
            <div className="rounded-2xl bg-card border border-border p-4 space-y-2">
              {selected.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 text-sm truncate">{b.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">€</span>
                    <input type="number" inputMode="decimal" step="1" value={b.price_actual}
                      onChange={(e) => setPrice(i, e.target.value)}
                      className="w-20 h-10 px-2 rounded-lg bg-input border border-border text-right tabular-nums" />
                  </div>
                  {b.price_actual !== b.price_list && (
                    <span className="text-[10px] text-muted-foreground line-through tabular-nums">€{b.price_list}</span>
                  )}
                  <button onClick={() => removeAt(i)} className="h-10 w-10 grid place-items-center rounded-lg bg-secondary text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="pt-2 border-t border-border flex justify-between font-bold">
                <span>Totale riordine</span>
                <span className="tabular-nums">€{total}</span>
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-card border border-border p-4">
            <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Aggiungi al riordine</h3>
            {catalog.length === 0 ? (
              <p className="text-sm text-muted-foreground">Listino vuoto.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {catalog.map((b) => (
                  <button key={b.id} type="button" onClick={() => add(b)}
                    className="rounded-xl bg-secondary p-3 text-left active:scale-95 transition-transform">
                    <div className="text-sm font-bold truncate">{b.name}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">€{b.price}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Note (opzionale)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="mt-1 w-full p-3 rounded-xl bg-input border border-border resize-none" />
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="max-w-md mx-auto">
          <button disabled={submitting || selected.length === 0} onClick={confirm}
            className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black disabled:opacity-50 inline-flex items-center justify-center gap-2">
            <Plus className="w-5 h-5" /> {submitting ? "Salvo…" : `Aggiungi riordine — €${total}`}
          </button>
        </div>
      </div>
    </div>
  );
}
