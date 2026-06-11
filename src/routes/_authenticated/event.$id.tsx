import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTeam } from "@/hooks/use-current-team";
import { ArrowLeft, Trash2, CheckCircle2, Archive } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/event/$id")({
  component: EventEditPage,
});

interface EventRow {
  id: string;
  name: string;
  date: string;
  headliner: string | null;
  format_id: string | null;
  venue: string | null;
  notes: string | null;
  status: "upcoming" | "active" | "archived";
  team_id: string;
}
interface Format { id: string; name: string; }

function EventEditPage() {
  const { id } = Route.useParams();
  const { isAdmin, teamId } = useCurrentTeam();
  const navigate = useNavigate();
  const [ev, setEv] = useState<EventRow | null>(null);
  const [formats, setFormats] = useState<Format[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
    if (data) setEv(data as EventRow);
    if (teamId) {
      const { data: f } = await supabase.from("formats").select("id,name").eq("team_id", teamId).order("name");
      setFormats((f ?? []) as Format[]);
    }
    setLoading(false);
  }, [id, teamId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!ev) return;
    setSaving(true);
    const { error } = await supabase.from("events").update({
      name: ev.name,
      date: ev.date,
      headliner: ev.headliner || null,
      format_id: ev.format_id || null,
      venue: ev.venue || null,
      notes: ev.notes || null,
    }).eq("id", ev.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Salvato");
  };

  const activate = async () => {
    if (!ev || !teamId) return;
    await supabase.from("events").update({ status: "archived" }).eq("team_id", teamId).eq("status", "active");
    const { error } = await supabase.from("events").update({ status: "active" }).eq("id", ev.id);
    if (error) return toast.error(error.message);
    navigate({ to: "/board" });
  };

  const archive = async () => {
    if (!ev) return;
    const { error } = await supabase.from("events").update({ status: "archived" }).eq("id", ev.id);
    if (error) return toast.error(error.message);
    toast.success("Archiviato");
    navigate({ to: "/events" });
  };

  const del = async () => {
    if (!ev) return;
    if (!confirm(`Eliminare l'evento "${ev.name}"? Verranno cancellati anche tavoli, bottiglie e ordini collegati.`)) return;
    const { error } = await supabase.from("events").delete().eq("id", ev.id);
    if (error) return toast.error(error.message);
    navigate({ to: "/events" });
  };

  if (loading) return <p className="p-6 text-muted-foreground">Caricamento…</p>;
  if (!ev) return <p className="p-6">Evento non trovato.</p>;

  return (
    <div className="min-h-screen pb-32">
      <header className="sticky top-0 z-20 backdrop-blur bg-background/85 border-b border-border px-4 py-3 flex items-center gap-3">
        <Link to="/events" className="h-11 w-11 grid place-items-center rounded-xl bg-secondary">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-black truncate">{ev.name}</h1>
          <p className="text-xs text-muted-foreground capitalize">{ev.status}</p>
        </div>
      </header>

      <main className="p-4 space-y-3">
        <Field label="Nome">
          <input value={ev.name} onChange={(e) => setEv({ ...ev, name: e.target.value })}
            className="w-full h-12 px-4 rounded-xl bg-input border border-border" />
        </Field>
        <Field label="Data">
          <input type="date" value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })}
            className="w-full h-12 px-4 rounded-xl bg-input border border-border" />
        </Field>
        <Field label="Headliner / Ospite">
          <input value={ev.headliner ?? ""} onChange={(e) => setEv({ ...ev, headliner: e.target.value })}
            className="w-full h-12 px-4 rounded-xl bg-input border border-border" />
        </Field>
        <Field label="Format">
          <select value={ev.format_id ?? ""} onChange={(e) => setEv({ ...ev, format_id: e.target.value || null })}
            className="w-full h-12 px-4 rounded-xl bg-input border border-border">
            <option value="">—</option>
            {formats.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="Venue">
          <input value={ev.venue ?? ""} onChange={(e) => setEv({ ...ev, venue: e.target.value })}
            className="w-full h-12 px-4 rounded-xl bg-input border border-border" />
        </Field>
        <Field label="Note">
          <textarea value={ev.notes ?? ""} onChange={(e) => setEv({ ...ev, notes: e.target.value })} rows={4}
            className="w-full p-4 rounded-xl bg-input border border-border resize-none" />
        </Field>

        {isAdmin && (
          <div className="pt-2 space-y-2">
            {ev.status !== "active" && (
              <button onClick={activate} className="w-full h-12 rounded-xl bg-success text-success-foreground font-bold inline-flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Attiva e vai alla board
              </button>
            )}
            {ev.status !== "archived" && (
              <button onClick={archive} className="w-full h-12 rounded-xl bg-secondary text-foreground font-bold inline-flex items-center justify-center gap-2">
                <Archive className="w-4 h-4" /> Archivia
              </button>
            )}
            <button onClick={del} className="w-full h-12 rounded-xl bg-destructive/15 text-destructive font-bold inline-flex items-center justify-center gap-2">
              <Trash2 className="w-4 h-4" /> Elimina evento
            </button>
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent border-t border-border">
        <div className="max-w-md mx-auto">
          <button disabled={saving} onClick={save}
            className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black disabled:opacity-50">
            {saving ? "Salvataggio…" : "Salva modifiche"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
