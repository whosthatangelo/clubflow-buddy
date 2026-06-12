import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTeam } from "@/hooks/use-current-team";
import { FormatSelect } from "@/components/FormatSelect";
import { BottomNav } from "@/components/BottomNav";
import { Plus, Calendar, Star, MapPin, CheckCircle2, Copy, Settings, LogOut, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/events")({
  component: EventsPage,
});

interface EventRow {
  id: string; name: string; date: string; headliner: string | null;
  format_id: string | null; venue: string | null;
  status: "upcoming" | "active" | "archived";
}
interface Format { id: string; name: string; }

function EventsPage() {
  const { isAdmin, teamId, teamName, status, user } = useCurrentTeam();
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [formats, setFormats] = useState<Format[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    if (!teamId) return;
    const [{ data: e }, { data: f }] = await Promise.all([
      supabase.from("events").select("id,name,date,headliner,format_id,venue,status").eq("team_id", teamId).order("date", { ascending: false }),
      supabase.from("formats").select("id,name").eq("team_id", teamId).order("name"),
    ]);
    setEvents((e ?? []) as EventRow[]);
    setFormats((f ?? []) as Format[]);
    setLoading(false);
  }, [teamId]);
  useEffect(() => { if (teamId) load(); }, [teamId, load]);

  const setActive = async (id: string) => {
    if (!teamId) return;
    await supabase.from("events").update({ status: "archived" }).eq("team_id", teamId).eq("status", "active");
    const { error } = await supabase.from("events").update({ status: "active" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Evento attivato"); load();
  };

  const cloneEvent = async (ev: EventRow) => {
    if (!teamId || !user) return;
    if (!confirm(`Clonare "${ev.name}"?`)) return;
    const d = new Date(ev.date); d.setDate(d.getDate() + 7);
    const { data: newEv, error } = await supabase.from("events").insert({
      team_id: teamId, created_by: user.id, status: "upcoming",
      name: `${ev.name} (copia)`, date: d.toISOString().slice(0, 10),
      headliner: ev.headliner, format_id: ev.format_id, venue: ev.venue,
    }).select("id").maybeSingle();
    if (error || !newEv) return toast.error(error?.message ?? "Errore");
    const [{ data: bts }, { data: tbs }] = await Promise.all([
      supabase.from("bottles").select("name,price").eq("event_id", ev.id),
      supabase.from("club_tables").select("ref_name,whatsapp,people_count,zone_id").eq("event_id", ev.id),
    ]);
    if (bts && bts.length > 0) {
      await supabase.from("bottles").insert(bts.map((b) => ({ team_id: teamId, event_id: newEv.id, name: b.name, price: b.price })));
    }
    if (tbs && tbs.length > 0) {
      await supabase.from("club_tables").insert(tbs.map((t) => ({
        team_id: teamId, event_id: newEv.id, ref_name: t.ref_name, whatsapp: t.whatsapp,
        people_count: t.people_count, zone_id: t.zone_id, status: "arriving",
      })));
    }
    toast.success("Clonato"); navigate({ to: "/event/$id", params: { id: newEv.id } });
  };

  const signOut = async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); };

  if (status === "loading") return <p className="p-6 text-muted-foreground">Caricamento…</p>;

  const formatById = (id: string | null) => formats.find((f) => f.id === id)?.name;
  const active = events.find((e) => e.status === "active");
  const upcoming = events.filter((e) => e.status === "upcoming");
  const archived = events.filter((e) => e.status === "archived");

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-20 backdrop-blur bg-background/85 border-b border-border px-4 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-black truncate">{teamName ?? "TableFlow"}</h1>
          <p className="text-xs text-muted-foreground -mt-0.5">{isAdmin ? "Admin" : "Staff"}</p>
        </div>
        <div className="relative shrink-0">
          <button onClick={() => setMenuOpen((v) => !v)} aria-label="Menu impostazioni"
            className="h-11 w-11 grid place-items-center rounded-xl bg-secondary">
            <Settings className="w-5 h-5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-12 z-40 w-56 rounded-xl bg-popover border border-border shadow-2xl overflow-hidden">
                <Link to="/settings/team" onClick={() => setMenuOpen(false)}
                  className="block px-4 py-3 hover:bg-secondary text-sm font-semibold">Team & inviti</Link>
                <Link to="/settings/whatsapp" onClick={() => setMenuOpen(false)}
                  className="block px-4 py-3 hover:bg-secondary text-sm font-semibold">WhatsApp / Twilio</Link>
                <button onClick={signOut}
                  className="w-full text-left px-4 py-3 hover:bg-secondary text-sm font-semibold text-destructive inline-flex items-center gap-2">
                  <LogOut className="w-4 h-4" /> Esci
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="p-4 space-y-6">
        {isAdmin && (
          <button type="button" onClick={() => setCreating(true)}
            className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black inline-flex items-center justify-center gap-2">
            <Plus className="w-5 h-5" /> Nuovo evento
          </button>
        )}

        {loading ? (
          <p className="text-center text-muted-foreground">Caricamento…</p>
        ) : (
          <>
            {active && (
              <section>
                <h2 className="text-xs uppercase tracking-wider font-bold text-success mb-2">In corso</h2>
                <EventCard ev={active} format={formatById(active.format_id)}
                  onOpen={() => navigate({ to: "/board" })}
                  onEdit={() => navigate({ to: "/event/$id", params: { id: active.id } })}
                  onClone={isAdmin ? () => cloneEvent(active) : undefined}
                  primary primaryCta="Apri board" />
              </section>
            )}

            {upcoming.length > 0 && (
              <section>
                <h2 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">In programma</h2>
                <div className="space-y-2">
                  {upcoming.map((e) => (
                    <EventCard key={e.id} ev={e} format={formatById(e.format_id)}
                      onOpen={() => navigate({ to: "/event/$id", params: { id: e.id } })}
                      onClone={isAdmin ? () => cloneEvent(e) : undefined}
                      action={isAdmin ? { label: "Attiva", icon: CheckCircle2, onClick: () => setActive(e.id) } : undefined} />
                  ))}
                </div>
              </section>
            )}

            {archived.length > 0 && (
              <section>
                <h2 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Archivio</h2>
                <div className="space-y-2">
                  {archived.map((e) => (
                    <EventCard key={e.id} ev={e} format={formatById(e.format_id)}
                      onOpen={() => navigate({ to: "/event/$id", params: { id: e.id } })}
                      onClone={isAdmin ? () => cloneEvent(e) : undefined} muted />
                  ))}
                </div>
              </section>
            )}

            {events.length === 0 && (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">🎉</div>
                <h2 className="text-lg font-bold">Nessun evento</h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
                  {isAdmin ? "Crea il primo evento per iniziare." : "L'admin non ha ancora creato eventi."}
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {creating && teamId && user && (
        <NewEventSheet teamId={teamId} userId={user.id}
          onClose={() => setCreating(false)}
          onCreated={async (id, activate) => {
            setCreating(false);
            if (activate) { await setActive(id); navigate({ to: "/board" }); }
            else { load(); navigate({ to: "/event/$id", params: { id } }); }
          }} />
      )}

      <BottomNav />
    </div>
  );
}

function EventCard({
  ev, format, onOpen, onEdit, onClone, action, primary, muted, primaryCta,
}: {
  ev: EventRow; format?: string;
  onOpen: () => void;
  onEdit?: () => void;
  onClone?: () => void;
  action?: { label: string; icon: typeof Star; onClick: () => void };
  primary?: boolean; muted?: boolean; primaryCta?: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${primary ? "bg-success/10 border-success" : muted ? "bg-card border-border opacity-70" : "bg-card border-border"}`}>
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold leading-tight truncate">{ev.name}</h3>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{new Date(ev.date).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}</span>
              {format && <span>· {format}</span>}
              {ev.venue && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{ev.venue}</span>}
            </p>
            {ev.headliner && (
              <p className="text-sm mt-1 inline-flex items-center gap-1 font-semibold">
                <Star className="w-3.5 h-3.5 text-primary" /> {ev.headliner}
              </p>
            )}
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
        </div>
      </button>
      <div className="mt-3 flex gap-2">
        {primary && (
          <button type="button" onClick={onOpen}
            className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-bold text-sm">
            {primaryCta ?? "Apri"}
          </button>
        )}
        {action && (
          <button type="button" onClick={action.onClick}
            className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-bold text-sm inline-flex items-center justify-center gap-2">
            <action.icon className="w-4 h-4" /> {action.label}
          </button>
        )}
        {onEdit && (
          <button type="button" onClick={onEdit} className="h-11 px-3 rounded-xl bg-secondary text-sm font-bold">
            Impostazioni
          </button>
        )}
        {onClone && (
          <button type="button" onClick={onClone} aria-label="Clona"
            className="h-11 w-11 grid place-items-center rounded-xl bg-secondary">
            <Copy className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function NewEventSheet({
  teamId, userId, onClose, onCreated,
}: { teamId: string; userId: string; onClose: () => void; onCreated: (id: string, activate: boolean) => void }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [headliner, setHeadliner] = useState("");
  const [formatId, setFormatId] = useState<string | null>(null);
  const [venue, setVenue] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (activate: boolean) => {
    if (!name.trim()) return toast.error("Nome obbligatorio");
    setSubmitting(true);
    const { data, error } = await supabase.from("events").insert({
      team_id: teamId, name: name.trim(), date,
      headliner: headliner.trim() || null, format_id: formatId,
      venue: venue.trim() || null, notes: notes.trim() || null,
      status: "upcoming", created_by: userId,
    }).select("id").maybeSingle();
    setSubmitting(false);
    if (error || !data) return toast.error(error?.message ?? "Errore");
    toast.success("Evento creato"); onCreated(data.id, activate);
  };

  return (
    <div className="fixed inset-0 z-40 bg-background/95 backdrop-blur overflow-y-auto">
      <div className="max-w-md mx-auto p-4 pb-40">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-black">Nuovo evento</h2>
          <button onClick={onClose} className="h-11 px-4 rounded-xl bg-secondary font-semibold">Annulla</button>
        </div>
        <div className="space-y-3">
          <Field label="Nome *">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Sabato 14 giugno"
              className="w-full h-12 px-4 rounded-xl bg-input border border-border" />
          </Field>
          <Field label="Data *">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full h-12 px-4 rounded-xl bg-input border border-border" />
          </Field>
          <Field label="Headliner / Ospite">
            <input value={headliner} onChange={(e) => setHeadliner(e.target.value)} placeholder="es. Peggy Gou"
              className="w-full h-12 px-4 rounded-xl bg-input border border-border" />
          </Field>
          <Field label="Format">
            <FormatSelect teamId={teamId} value={formatId} onChange={setFormatId} />
          </Field>
          <Field label="Venue">
            <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="es. Amnesia Milano"
              className="w-full h-12 px-4 rounded-xl bg-input border border-border" />
          </Field>
          <Field label="Note">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              className="w-full p-4 rounded-xl bg-input border border-border resize-none" />
          </Field>
        </div>
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent border-t border-border">
          <div className="max-w-md mx-auto space-y-2">
            <button disabled={submitting} onClick={() => submit(true)}
              className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black disabled:opacity-50">
              Crea e attiva subito
            </button>
            <button disabled={submitting} onClick={() => submit(false)}
              className="w-full h-12 rounded-2xl bg-secondary font-bold disabled:opacity-50">
              Crea senza attivare
            </button>
          </div>
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
