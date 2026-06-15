import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import {
  listTeamData,
  createInvite,
  deleteInvite,
  removeMember,
  changeMemberRole,
  createTeam,
} from "@/lib/team.functions";
import { useCurrentTeam } from "@/hooks/use-current-team";
import { toast } from "sonner";
import { Building2, Copy, Plus, Trash2, UserPlus, ShieldCheck, Shield } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/team")({
  component: TeamSettings,
});

interface Member {
  id: string;
  userId: string;
  role: "admin" | "staff";
  status: "active" | "pending";
  email: string | null;
  name: string | null;
}
interface Invite {
  id: string;
  token: string;
  email: string | null;
  role: "admin" | "staff";
  expires_at: string;
}

function TeamSettings() {
  const { teamId, teamName, teams, selectTeam, isAdmin, user, status } = useCurrentTeam();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"staff" | "admin">("staff");
  const [submitting, setSubmitting] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const res = await listTeamData({ teamId });
      setMembers(res.members as Member[]);
      setInvites(res.invites as Invite[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (status === "ready" && isAdmin) load();
  }, [status, isAdmin, load]);

  if (status === "loading") return <p className="p-6 text-muted-foreground">Caricamento…</p>;
  if (status === "error") return <p className="p-6 text-destructive">Errore nel caricamento del team. Ricarica la pagina.</p>;
  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="font-semibold">Solo gli admin possono gestire il team.</p>
      </div>
    );
  }

  const addInvite = async () => {
    if (!teamId) return;
    setSubmitting(true);
    try {
      await createInvite({ teamId, email: inviteEmail.trim() || undefined, role: inviteRole });
      setInviteEmail("");
      toast.success("Invito creato");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setSubmitting(false);
    }
  };

  const inviteUrl = (token: string) =>
    typeof window !== "undefined" ? `${window.location.origin}/invite/${token}` : "";

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiato");
    } catch {
      toast.error("Copia manuale");
    }
  };

  const onRemove = async (m: Member) => {
    if (!teamId) return;
    if (!confirm(`Rimuovere ${m.name ?? m.email ?? "membro"}?`)) return;
    try {
      await removeMember({ teamId, memberId: m.id });
      toast.success("Rimosso");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    }
  };

  const onToggleRole = async (m: Member) => {
    if (!teamId) return;
    const newRole = m.role === "admin" ? "staff" : "admin";
    try {
      await changeMemberRole({ teamId, memberId: m.id, role: newRole });
      toast.success(`Ora ${m.name ?? "membro"} è ${newRole === "admin" ? "Admin" : "Staff"}`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    }
  };

  const removeInv = async (id: string) => {
    if (!teamId) return;
    try {
      await deleteInvite({ teamId, inviteId: id });
      toast.success("Invito eliminato");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    }
  };

  const addTeam = async () => {
    if (newTeamName.trim().length < 2) return toast.error("Inserisci un nome valido");
    setCreatingTeam(true);
    try {
      const result = await createTeam({ name: newTeamName.trim() });
      setNewTeamName("");
      selectTeam(result.teamId);
      toast.success("Nuovo team creato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setCreatingTeam(false);
    }
  };

  return (
    <div className="space-y-5 pt-2">
      <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <h3 className="font-bold flex items-center gap-2"><Building2 className="w-4 h-4" /> I tuoi team</h3>
        <div className="space-y-2">
          {teams.map((team) => (
            <button key={team.id} type="button" onClick={() => selectTeam(team.id)}
              className={`w-full min-h-12 rounded-xl border px-3 text-left flex items-center justify-between gap-3 ${team.id === teamId ? "border-primary bg-primary/10" : "border-border bg-secondary"}`}>
              <span className="min-w-0">
                <span className="block truncate font-bold">{team.name}</span>
                <span className="block text-xs text-muted-foreground">{team.role === "admin" ? "Admin" : "Staff"}</span>
              </span>
              {team.id === teamId && <span className="text-xs font-bold text-primary">Attivo</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <input value={newTeamName} onChange={(event) => setNewTeamName(event.target.value)} placeholder="Nuovo team o città"
            className="min-w-0 flex-1 h-12 px-4 rounded-xl bg-input border border-border" />
          <button type="button" onClick={addTeam} disabled={creatingTeam}
            aria-label="Crea team" className="h-12 w-12 shrink-0 grid place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-60">
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Stai gestendo {teamName}. Il ruolo e le impostazioni sono separati per ogni team.</p>
      </section>

      {/* Nuovo invito */}
      <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <h3 className="font-bold flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> Nuovo invito
        </h3>
        <input
          type="email"
          placeholder="Email (opzionale)"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-input border border-border"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setInviteRole("staff")}
            className={`flex-1 h-12 rounded-xl font-semibold ${inviteRole === "staff" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
          >
            Staff
          </button>
          <button
            type="button"
            onClick={() => setInviteRole("admin")}
            className={`flex-1 h-12 rounded-xl font-semibold ${inviteRole === "admin" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
          >
            Admin
          </button>
        </div>
        <button
          onClick={addInvite}
          disabled={submitting}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-60"
        >
          Crea link invito
        </button>
      </section>

      {/* Membri */}
      <section className="space-y-2">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-bold px-1">
          Membri ({members.length})
        </h3>
        {loading ? (
          <p className="text-muted-foreground text-sm px-1">Caricamento…</p>
        ) : (
          members.map((m) => {
            const isMe = m.userId === user?.id;
            return (
              <div
                key={m.id}
                className="rounded-xl bg-card border border-border p-3 flex items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-bold truncate">
                    {m.name ?? m.email ?? "—"} {isMe && <span className="text-xs text-muted-foreground">(tu)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full ${m.role === "admin" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}
                    >
                      {m.role}
                    </span>
                    <span
                      className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full ${m.status === "active" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}
                    >
                      {m.status === "active" ? "Attivo" : "In attesa"}
                    </span>
                  </div>
                </div>
                {!isMe && (
                  <>
                    <button
                      onClick={() => onToggleRole(m)}
                      aria-label="Cambia ruolo"
                      className="h-11 w-11 grid place-items-center rounded-xl bg-secondary"
                    >
                      {m.role === "admin" ? <Shield className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => onRemove(m)}
                      aria-label="Rimuovi"
                      className="h-11 w-11 grid place-items-center rounded-xl bg-secondary text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* Inviti pendenti */}
      {invites.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-bold px-1">
            Inviti pendenti ({invites.length})
          </h3>
          {invites.map((inv) => (
            <div
              key={inv.id}
              className="rounded-xl bg-card border border-border p-3 flex items-center gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">
                  {inv.email ?? "Senza email"}{" "}
                  <span className="text-xs text-muted-foreground">· {inv.role}</span>
                </div>
                <div className="text-xs font-mono text-foreground/70 truncate">
                  {inviteUrl(inv.token)}
                </div>
              </div>
              <button
                onClick={() => copy(inviteUrl(inv.token))}
                aria-label="Copia"
                className="h-11 w-11 grid place-items-center rounded-xl bg-secondary"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={() => removeInv(inv.id)}
                aria-label="Elimina"
                className="h-11 w-11 grid place-items-center rounded-xl bg-secondary text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
