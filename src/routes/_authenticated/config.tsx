import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTeam } from "@/hooks/use-current-team";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/config")({
  component: ConfigPage,
});

type Tab = "zones" | "bottles" | "tables";

interface Zone { id: string; name: string; min_per_person: number; }
interface Bottle { id: string; name: string; price: number; }
interface ClubTable {
  id: string; ref_name: string; whatsapp: string | null;
  people_count: number; zone_id: string | null;
}

function ConfigPage() {
  const { isAdmin, status, teamId } = useCurrentTeam();
  const [tab, setTab] = useState<Tab>("zones");

  if (status === "loading") return <p className="p-6 text-muted-foreground">Caricamento…</p>;
  if (!isAdmin || !teamId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <h2 className="text-xl font-bold">Solo admin</h2>
        <p className="text-sm text-muted-foreground mt-2">Non hai i permessi per la configurazione.</p>
        <Link to="/board" className="mt-6 inline-flex items-center justify-center h-12 px-5 rounded-xl bg-primary text-primary-foreground font-bold">
          Vai alla board
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-20 backdrop-blur bg-background/85 border-b border-border px-4 py-3 flex items-center gap-3">
        <Link to="/board" aria-label="Indietro" className="h-11 w-11 grid place-items-center rounded-xl bg-secondary">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-black">Configurazione</h1>
      </header>

      <div className="px-4 py-3 flex gap-2 overflow-x-auto">
        {(["zones", "bottles", "tables"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`h-auto-tap !min-h-0 py-2 px-4 rounded-full text-sm font-semibold whitespace-nowrap ${tab === t ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
          >
            {t === "zones" ? "Zone" : t === "bottles" ? "Bottiglie" : "Tavoli"}
          </button>
        ))}
      </div>

      <main className="px-4">
        {tab === "zones" && <ZonesTab teamId={teamId} />}
        {tab === "bottles" && <BottlesTab teamId={teamId} />}
        {tab === "tables" && <TablesTab teamId={teamId} />}
      </main>
    </div>
  );
}

/* ============ ZONES ============ */
function ZonesTab({ teamId }: { teamId: string }) {
  const [items, setItems] = useState<Zone[]>([]);
  const [name, setName] = useState("");
  const [minPp, setMinPp] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("zones").select("*").eq("team_id", teamId).order("name");
    setItems((data ?? []) as Zone[]);
  }, [teamId]);
  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(minPp);
    if (!name.trim() || isNaN(value) || value < 0) return toast.error("Dati non validi");
    const { error } = await supabase.from("zones").insert({ team_id: teamId, name: name.trim(), min_per_person: value });
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
    <div className="space-y-4 pt-2">
      <form onSubmit={add} className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <h3 className="font-bold">Nuova zona</h3>
        <input
          placeholder="Nome (es. Console)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-input border border-border"
        />
        <input
          type="number"
          inputMode="decimal"
          step="1"
          placeholder="Quota minima a persona (€)"
          value={minPp}
          onChange={(e) => setMinPp(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-input border border-border"
        />
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
function BottlesTab({ teamId }: { teamId: string }) {
  const [items, setItems] = useState<Bottle[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("bottles").select("*").eq("team_id", teamId).order("price");
    setItems((data ?? []) as Bottle[]);
  }, [teamId]);
  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(price);
    if (!name.trim() || isNaN(value) || value <= 0) return toast.error("Dati non validi");
    const { error } = await supabase.from("bottles").insert({ team_id: teamId, name: name.trim(), price: value });
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
    <div className="space-y-4 pt-2">
      <form onSubmit={add} className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <h3 className="font-bold">Nuova bottiglia</h3>
        <input
          placeholder="Nome (es. Belvedere)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-input border border-border"
        />
        <input
          type="number"
          inputMode="decimal"
          step="1"
          placeholder="Prezzo (€)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-input border border-border"
        />
        <button className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold inline-flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Aggiungi bottiglia
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
function TablesTab({ teamId }: { teamId: string }) {
  const [items, setItems] = useState<ClubTable[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [refName, setRefName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [people, setPeople] = useState("4");
  const [zoneId, setZoneId] = useState<string>("");

  const load = useCallback(async () => {
    const [{ data: t }, { data: z }] = await Promise.all([
      supabase.from("club_tables").select("id,ref_name,whatsapp,people_count,zone_id").eq("team_id", teamId).order("created_at"),
      supabase.from("zones").select("*").eq("team_id", teamId).order("name"),
    ]);
    setItems((t ?? []) as ClubTable[]);
    setZones((z ?? []) as Zone[]);
    if (z && z.length > 0) setZoneId((curr) => curr || z[0].id);
  }, [teamId]);
  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(people, 10);
    if (!refName.trim() || isNaN(p) || p < 1) return toast.error("Dati non validi");
    if (!zoneId) return toast.error("Crea prima una zona");
    const { error } = await supabase.from("club_tables").insert({
      team_id: teamId,
      ref_name: refName.trim(),
      whatsapp: whatsapp.trim() || null,
      people_count: p,
      zone_id: zoneId,
    });
    if (error) return toast.error(error.message);
    setRefName(""); setWhatsapp(""); setPeople("4");
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Eliminare il tavolo?")) return;
    const { error } = await supabase.from("club_tables").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="space-y-4 pt-2">
      <form onSubmit={add} className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <h3 className="font-bold">Nuovo tavolo</h3>
        <input
          placeholder="Nome referente"
          value={refName}
          onChange={(e) => setRefName(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-input border border-border"
        />
        <input
          type="tel"
          placeholder="WhatsApp (es. +39…)"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-input border border-border"
        />
        <input
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="Persone"
          value={people}
          onChange={(e) => setPeople(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-input border border-border"
        />
        <select
          value={zoneId}
          onChange={(e) => setZoneId(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-input border border-border"
        >
          {zones.length === 0 && <option value="">Nessuna zona — creane una prima</option>}
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name} · €{z.min_per_person}/pax</option>
          ))}
        </select>
        <button className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold inline-flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Aggiungi tavolo
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
