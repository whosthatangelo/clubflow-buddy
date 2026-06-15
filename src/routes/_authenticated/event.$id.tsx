import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { activateEvent } from "@/lib/team.functions";
import { useCurrentTeam } from "@/hooks/use-current-team";
import { FormatSelect } from "@/components/FormatSelect";
import { ArrowLeft, Trash2, CheckCircle2, Archive, Copy, Plus, Play, Settings as SettingsIcon, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/event/$id")({
  component: EventDetailPage,
});

type Tab = "details" | "staff" | "zones" | "bottles" | "tables";

interface EventRow {
  id: string; name: string; date: string; headliner: string | null;
  format_id: string | null; venue: string | null; notes: string | null;
  status: "upcoming" | "active" | "archived"; team_id: string;
}
interface Zone { id: string; name: string; min_per_person: number; }
interface Bottle { id: string; name: string; price: number; }
interface ClubTable {
  id: string; ref_name: string; whatsapp: string | null;
  people_count: number; zone_id: string | null;
}

function EventDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { isAdmin, teamId, user, status: teamStatus } = useCurrentTeam();
  const [ev, setEv] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("details");
  const activateEventFn = useServerFn(activateEvent);

  const load = useCallback(async () => {
    const { data } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
    setEv((data as EventRow) ?? null);
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!ev) return;
    const { error } = await supabase.from("events").update({
      name: ev.name, date: ev.date,
      headliner: ev.headliner || null, format_id: ev.format_id || null,
      venue: ev.venue || null, notes: ev.notes || null,
    }).eq("id", ev.id);
    if (error) return toast.error(error.message);
    toast.success("Salvato");
  };

  const activate = async () => {
    if (!ev || !teamId) return;
    try {
      await activateEventFn({ data: { teamId, eventId: ev.id } });
      navigate({ to: "/board" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossibile attivare l’evento");
    }
  };

  const archive = async () => {
    if (!ev) return;
    const { error } = await supabase.from("events").update({ status: "archived" }).eq("id", ev.id);
    if (error) return toast.error(error.message);
    toast.success("Archiviato"); navigate({ to: "/events" });
  };

  const del = async () => {
    if (!ev) return;
    if (!confirm(`Eliminare "${ev.name}"? Verranno cancellati anche tavoli, bottiglie e ordini.`)) return;
    const { error } = await supabase.from("events").delete().eq("id", ev.id);
    if (error) return toast.error(error.message);
    navigate({ to: "/events" });
  };

  const clone = async () => {
    if (!ev || !teamId || !user) return;
    if (!confirm(`Clonare "${ev.name}"? Verranno copiati bottiglie e tavoli (non gli ordini).`)) return;
    const newDate = new Date(ev.date); newDate.setDate(newDate.getDate() + 7);
    const { data: newEv, error } = await supabase.from("events").insert({
      team_id: teamId, created_by: user.id, status: "upcoming",
      name: `${ev.name} (copia)`, date: newDate.toISOString().slice(0, 10),
      headliner: ev.headliner, format_id: ev.format_id, venue: ev.venue, notes: ev.notes,
    }).select("id").maybeSingle();
    if (error || !newEv) return toast.error(error?.message ?? "Errore");

    // Copy bottles
    const { data: bts } = await supabase.from("bottles").select("name,price").eq("event_id", ev.id);
    if (bts && bts.length > 0) {
      await supabase.from("bottles").insert(bts.map((b) => ({ team_id: teamId, event_id: newEv.id, name: b.name, price: b.price })));
    }
    // Copy tables
    const { data: tbs } = await supabase.from("club_tables").select("ref_name,whatsapp,people_count,zone_id").eq("event_id", ev.id);
    if (tbs && tbs.length > 0) {
      await supabase.from("club_tables").insert(tbs.map((t) => ({
        team_id: teamId, event_id: newEv.id, ref_name: t.ref_name, whatsapp: t.whatsapp,
        people_count: t.people_count, zone_id: t.zone_id, status: "arriving",
      })));
    }
    const { data: assigned } = await supabase.from("event_members").select("user_id").eq("event_id", ev.id);
    if (assigned && assigned.length > 0) {
      const { error: staffError } = await supabase.from("event_members").insert(
        assigned.map((member) => ({ team_id: teamId, event_id: newEv.id, user_id: member.user_id })),
      );
      if (staffError) return toast.error(`Evento creato, ma staff non copiato: ${staffError.message}`);
    }
    toast.success("Evento clonato");
    navigate({ to: "/event/$id", params: { id: newEv.id } });
  };

  if (loading || teamStatus === "loading") return <p className="p-6 text-muted-foreground">Caricamento…</p>;
  if (!ev || !teamId) return <p className="p-6">Evento non trovato.</p>;
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <h2 className="text-xl font-bold">Solo admin</h2>
        <p className="mt-2 text-sm text-muted-foreground">Le impostazioni dell'evento sono riservate agli amministratori.</p>
        <Link to="/board" className="mt-5 inline-flex h-11 px-4 items-center rounded-xl bg-primary text-primary-foreground font-bold">Torna alla board</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32">
      <header className="sticky top-0 z-20 backdrop-blur bg-background/85 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/events" className="h-11 w-11 grid place-items-center rounded-xl bg-secondary">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black truncate">{ev.name}</h1>
            <p className="text-xs text-muted-foreground capitalize">{ev.status}{ev.status === "active" ? " · in corso" : ""}</p>
          </div>
          {ev.status === "active" && (
            <Link to="/board" aria-label="Vai alla board" className="h-11 px-3 rounded-xl bg-success text-success-foreground font-bold text-sm inline-flex items-center gap-1.5">
              <Play className="w-4 h-4" /> Board
            </Link>
          )}
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto -mx-1 px-1">
          {([
            ["details", "Dettagli", SettingsIcon],
            ["staff", "Staff", Users],
            ["zones", "Zone", null],
            ["bottles", "Bottiglie", null],
            ["tables", "Tavoli", null],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key as Tab)}
              className={`h-auto-tap !min-h-0 py-2 px-4 rounded-full text-sm font-semibold whitespace-nowrap ${tab === key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="p-4 space-y-3">
        {tab === "details" && (
          <DetailsTab ev={ev} setEv={setEv} teamId={teamId} isAdmin={isAdmin}
            onSave={save} onActivate={activate} onArchive={archive} onDelete={del} onClone={clone} />
        )}
        {tab === "staff" && <EventStaffTab teamId={teamId} eventId={ev.id} />}
        {tab === "zones" && <ZonesTab teamId={teamId} />}
        {tab === "bottles" && <BottlesTab teamId={teamId} eventId={ev.id} />}
        {tab === "tables" && <TablesTab teamId={teamId} eventId={ev.id} />}
      </main>
    </div>
  );
}

/* ============ EVENT STAFF ============ */
interface StaffMember {
  userId: string;
  name: string;
  email: string | null;
  role: "admin" | "staff";
}

function EventStaffTab({ teamId, eventId }: { teamId: string; eventId: string }) {
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: memberships }, { data: assignments }] = await Promise.all([
      supabase.from("team_members").select("user_id,role").eq("team_id", teamId).eq("status", "active"),
      supabase.from("event_members").select("user_id").eq("event_id", eventId),
    ]);
    const userIds = (memberships ?? []).map((membership) => membership.user_id);
    const { data: profiles } = userIds.length > 0
      ? await supabase.from("profiles").select("id,display_name,email").in("id", userIds)
      : { data: [] };
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    setMembers((memberships ?? []).map((membership) => {
      const profile = profileById.get(membership.user_id);
      return {
        userId: membership.user_id,
        name: profile?.display_name ?? profile?.email ?? "Operatore",
        email: profile?.email ?? null,
        role: membership.role,
      };
    }));
    setSelected(new Set((assignments ?? []).map((assignment) => assignment.user_id)));
    setLoading(false);
  }, [teamId, eventId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (member: StaffMember) => {
    const isAssigned = selected.has(member.userId);
    if (isAssigned && member.role === "admin") return;
    const { error } = isAssigned
      ? await supabase.from("event_members").delete().eq("event_id", eventId).eq("user_id", member.userId)
      : await supabase.from("event_members").insert({ event_id: eventId, team_id: teamId, user_id: member.userId });
    if (error) return toast.error(error.message);
    setSelected((current) => {
      const next = new Set(current);
      if (isAssigned) next.delete(member.userId); else next.add(member.userId);
      return next;
    });
  };

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Caricamento staff…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-black">Staff della serata</h2>
        <p className="mt-1 text-sm text-muted-foreground">Seleziona chi partecipa. Gli admin mantengono sempre accesso all’evento.</p>
      </div>
      <div className="space-y-2">
        {members.map((member) => {
          const assigned = selected.has(member.userId);
          return (
            <button key={member.userId} type="button" onClick={() => toggle(member)}
              className={`w-full rounded-xl border p-3 flex items-center gap-3 text-left ${assigned ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
              <span className={`h-6 w-6 rounded-lg border grid place-items-center ${assigned ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                {assigned && <CheckCircle2 className="w-4 h-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{member.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{member.email ?? "Nessuna email"} · {member.role === "admin" ? "Admin" : "Staff"}</span>
              </span>
              {member.role === "admin" && <span className="text-[10px] font-bold uppercase text-primary">Sempre</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============ DETAILS ============ */
function DetailsTab({
  ev, setEv, teamId, isAdmin, onSave, onActivate, onArchive, onDelete, onClone,
}: {
  ev: EventRow; setEv: (e: EventRow) => void; teamId: string; isAdmin: boolean;
  onSave: () => void; onActivate: () => void; onArchive: () => void; onDelete: () => void; onClone: () => void;
}) {
  return (
    <div className="space-y-3">
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
        <FormatSelect teamId={teamId} value={ev.format_id} onChange={(id) => setEv({ ...ev, format_id: id })} />
      </Field>
      <Field label="Venue">
        <input value={ev.venue ?? ""} onChange={(e) => setEv({ ...ev, venue: e.target.value })}
          className="w-full h-12 px-4 rounded-xl bg-input border border-border" />
      </Field>
      <Field label="Note">
        <textarea value={ev.notes ?? ""} onChange={(e) => setEv({ ...ev, notes: e.target.value })} rows={4}
          className="w-full p-4 rounded-xl bg-input border border-border resize-none" />
      </Field>

      <div className="pt-2 grid grid-cols-2 gap-2">
        <button onClick={onSave} className="h-12 rounded-xl bg-primary text-primary-foreground font-bold">Salva</button>
        <button onClick={onClone} className="h-12 rounded-xl bg-secondary font-bold inline-flex items-center justify-center gap-1.5">
          <Copy className="w-4 h-4" /> Clona
        </button>
      </div>

      {isAdmin && (
        <div className="pt-2 space-y-2">
          {ev.status !== "active" && (
            <button onClick={onActivate} className="w-full h-12 rounded-xl bg-success text-success-foreground font-bold inline-flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Attiva e vai alla board
            </button>
          )}
          {ev.status !== "archived" && (
            <button onClick={onArchive} className="w-full h-12 rounded-xl bg-secondary font-bold inline-flex items-center justify-center gap-2">
              <Archive className="w-4 h-4" /> Archivia
            </button>
          )}
          <button onClick={onDelete} className="w-full h-12 rounded-xl bg-destructive/15 text-destructive font-bold inline-flex items-center justify-center gap-2">
            <Trash2 className="w-4 h-4" /> Elimina evento
          </button>
        </div>
      )}
    </div>
  );
}

/* ============ ZONES (team-global) ============ */
function ZonesTab({ teamId }: { teamId: string }) {
  const [items, setItems] = useState<Zone[]>([]);
  const [name, setName] = useState(""); const [minPp, setMinPp] = useState("");
  const load = useCallback(async () => {
    const { data } = await supabase.from("zones").select("*").eq("team_id", teamId).order("name");
    setItems((data ?? []) as Zone[]);
  }, [teamId]);
  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = parseFloat(minPp);
    if (!name.trim() || isNaN(v) || v < 0) return toast.error("Dati non validi");
    const { error } = await supabase.from("zones").insert({ team_id: teamId, name: name.trim(), min_per_person: v });
    if (error) return toast.error(error.message);
    setName(""); setMinPp(""); load();
  };
  const del = async (id: string) => {
    if (!confirm("Eliminare la zona?")) return;
    const { error } = await supabase.from("zones").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Le zone sono condivise tra tutti gli eventi del team.</p>
      <form onSubmit={add} className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <h3 className="font-bold">Nuova zona</h3>
        <input placeholder="Nome (es. Console)" value={name} onChange={(e) => setName(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-input border border-border" />
        <input type="number" inputMode="decimal" step="1" placeholder="Quota minima a persona (€)" value={minPp}
          onChange={(e) => setMinPp(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-input border border-border" />
        <button className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold inline-flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Aggiungi zona
        </button>
      </form>
      <div className="space-y-2">
        {items.map((z) => (
          <div key={z.id} className="rounded-xl bg-card border border-border p-4 flex items-center justify-between">
            <div>
              <div className="font-bold">{z.name}</div>
              <div className="text-xs text-muted-foreground">€{z.min_per_person} a persona</div>
            </div>
            <button onClick={() => del(z.id)} className="h-11 w-11 grid place-items-center rounded-xl bg-secondary text-destructive">
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ BOTTLES ============ */
function BottlesTab({ teamId, eventId }: { teamId: string; eventId: string }) {
  const [items, setItems] = useState<Bottle[]>([]);
  const [name, setName] = useState(""); const [price, setPrice] = useState("");
  const load = useCallback(async () => {
    const { data } = await supabase.from("bottles").select("*").eq("event_id", eventId).order("price");
    setItems((data ?? []) as Bottle[]);
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = parseFloat(price);
    if (!name.trim() || isNaN(v) || v <= 0) return toast.error("Dati non validi");
    const { error } = await supabase.from("bottles").insert({ team_id: teamId, event_id: eventId, name: name.trim(), price: v });
    if (error) return toast.error(error.message);
    setName(""); setPrice(""); load();
  };
  const del = async (id: string) => {
    if (!confirm("Eliminare la bottiglia?")) return;
    const { error } = await supabase.from("bottles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };
  return (
    <div className="space-y-4">
      <form onSubmit={add} className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <h3 className="font-bold">Nuova bottiglia</h3>
        <input placeholder="Nome (es. Belvedere)" value={name} onChange={(e) => setName(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-input border border-border" />
        <input type="number" inputMode="decimal" step="1" placeholder="Prezzo listino (€)" value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-input border border-border" />
        <button className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold inline-flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Aggiungi
        </button>
      </form>
      <div className="space-y-2">
        {items.map((b) => (
          <div key={b.id} className="rounded-xl bg-card border border-border p-4 flex items-center justify-between">
            <div>
              <div className="font-bold">{b.name}</div>
              <div className="text-xs text-muted-foreground">€{b.price}</div>
            </div>
            <button onClick={() => del(b.id)} className="h-11 w-11 grid place-items-center rounded-xl bg-secondary text-destructive">
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ TABLES ============ */
function TablesTab({ teamId, eventId }: { teamId: string; eventId: string }) {
  const [items, setItems] = useState<ClubTable[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [refName, setRefName] = useState(""); const [whatsapp, setWhatsapp] = useState("");
  const [people, setPeople] = useState("4"); const [zoneId, setZoneId] = useState<string>("");

  const load = useCallback(async () => {
    const [{ data: t }, { data: z }] = await Promise.all([
      supabase.from("club_tables").select("id,ref_name,whatsapp,people_count,zone_id").eq("event_id", eventId).order("created_at"),
      supabase.from("zones").select("*").eq("team_id", teamId).order("name"),
    ]);
    setItems((t ?? []) as ClubTable[]);
    setZones((z ?? []) as Zone[]);
    if (z && z.length > 0) setZoneId((c) => c || z[0].id);
  }, [teamId, eventId]);
  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(people, 10);
    if (!refName.trim() || isNaN(p) || p < 1) return toast.error("Dati non validi");
    if (!zoneId) return toast.error("Crea prima una zona");
    const { error } = await supabase.from("club_tables").insert({
      team_id: teamId, event_id: eventId, ref_name: refName.trim(),
      whatsapp: whatsapp.trim() || null, people_count: p, zone_id: zoneId,
    });
    if (error) return toast.error(error.message);
    setRefName(""); setWhatsapp(""); setPeople("4"); load();
  };
  const del = async (id: string) => {
    if (!confirm("Eliminare il tavolo?")) return;
    const { error } = await supabase.from("club_tables").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };
  return (
    <div className="space-y-4">
      <form onSubmit={add} className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <h3 className="font-bold">Nuovo tavolo</h3>
        <input placeholder="Nome referente" value={refName} onChange={(e) => setRefName(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-input border border-border" />
        <input type="tel" placeholder="WhatsApp (es. +39…)" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-input border border-border" />
        <input type="number" inputMode="numeric" min={1} placeholder="Persone" value={people}
          onChange={(e) => setPeople(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-input border border-border" />
        <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-input border border-border">
          {zones.length === 0 && <option value="">Nessuna zona — creane una prima</option>}
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name} · €{z.min_per_person}/pax</option>)}
        </select>
        <button className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold inline-flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Aggiungi
        </button>
      </form>
      <div className="space-y-2">
        {items.map((t) => {
          const z = zones.find((x) => x.id === t.zone_id);
          return (
            <div key={t.id} className="rounded-xl bg-card border border-border p-4 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-bold truncate">{t.ref_name}</div>
                <div className="text-xs text-muted-foreground">
                  {t.people_count} pax · {z?.name ?? "—"} {t.whatsapp ? `· ${t.whatsapp}` : ""}
                </div>
              </div>
              <button onClick={() => del(t.id)} className="h-11 w-11 grid place-items-center rounded-xl bg-secondary text-destructive">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          );
        })}
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
