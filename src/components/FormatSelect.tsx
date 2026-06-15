import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";

interface Format { id: string; name: string; }

export function FormatSelect({
  teamId,
  value,
  onChange,
}: {
  teamId: string;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [items, setItems] = useState<Format[]>([]);
  const [managing, setManaging] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("formats").select("id,name").eq("team_id", teamId).order("name");
    if (error) {
      toast.error("Impossibile caricare i format.");
      return;
    }
    setItems((data ?? []) as Format[]);
  }, [teamId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const { data, error } = await supabase.from("formats").insert({ team_id: teamId, name }).select("id,name").maybeSingle();
    if (error || !data) return toast.error(error?.message ?? "Errore");
    setNewName("");
    await load();
    onChange(data.id);
  };
  const rename = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    const { error } = await supabase.from("formats").update({ name }).eq("id", id);
    if (error) return toast.error(error.message);
    setEditingId(null); setEditName(""); load();
  };
  const del = async (id: string) => {
    if (!confirm("Eliminare il format?")) return;
    const { error } = await supabase.from("formats").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (value === id) onChange(null);
    load();
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="flex-1 h-12 px-4 rounded-xl bg-input border border-border"
        >
          <option value="">— Nessun format —</option>
          {items.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setManaging((v) => !v)}
          className="h-12 px-3 rounded-xl bg-secondary text-sm font-bold"
        >
          {managing ? "Chiudi" : "Gestisci"}
        </button>
      </div>

      {managing && (
        <div className="rounded-xl bg-card border border-border p-3 space-y-2">
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nuovo format (es. Circoloco)"
              className="flex-1 h-11 px-3 rounded-lg bg-input border border-border text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            />
            <button type="button" onClick={add} className="h-11 w-11 grid place-items-center rounded-lg bg-primary text-primary-foreground">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <ul className="space-y-1">
            {items.map((f) => (
              <li key={f.id} className="flex items-center gap-2">
                {editingId === f.id ? (
                  <>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 h-10 px-3 rounded-lg bg-input border border-border text-sm"
                      autoFocus
                    />
                    <button type="button" onClick={() => rename(f.id)} className="h-10 w-10 grid place-items-center rounded-lg bg-success text-success-foreground">
                      <Check className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => { setEditingId(null); setEditName(""); }} className="h-10 w-10 grid place-items-center rounded-lg bg-secondary">
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm truncate">{f.name}</span>
                    <button type="button" onClick={() => { setEditingId(f.id); setEditName(f.name); }} className="h-10 w-10 grid place-items-center rounded-lg bg-secondary">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => del(f.id)} className="h-10 w-10 grid place-items-center rounded-lg bg-secondary text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </li>
            ))}
            {items.length === 0 && <li className="text-xs text-muted-foreground">Nessun format ancora.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
