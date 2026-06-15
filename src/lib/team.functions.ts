// Pure client-side data layer. Previously these were TanStack Start server
// functions backed by the service-role key; in the SPA they are plain async
// functions that call the authenticated Supabase client directly. Security is
// now enforced entirely by Postgres RLS (and two SECURITY DEFINER RPCs for the
// team-creation bootstrap and invite acceptance, which RLS cannot express).
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Non autenticato");
  return data.user.id;
}

/* ============ Create team (onboarding) ============ */

export async function createTeam(input: { name: string }): Promise<{ teamId: string }> {
  const { name } = z.object({ name: z.string().trim().min(2).max(80) }).parse(input);
  const { data, error } = await supabase.rpc("create_team", { _name: name });
  if (error) throw new Error(error.message);
  return { teamId: data as string };
}

/* ============ Inviti ============ */

export async function createInvite(input: {
  teamId: string;
  email?: string;
  role: "admin" | "staff";
}) {
  const data = z
    .object({
      teamId: z.string().uuid(),
      email: z.string().email().max(255).optional().or(z.literal("")),
      role: z.enum(["admin", "staff"]),
    })
    .parse(input);
  const userId = await requireUserId();

  const { data: invite, error } = await supabase
    .from("team_invites")
    .insert({
      team_id: data.teamId,
      email: data.email && data.email.length > 0 ? data.email.toLowerCase() : null,
      role: data.role,
      created_by: userId,
    })
    .select("id, token, email, role, expires_at, created_at, used_at")
    .single();
  if (error || !invite) throw new Error(error?.message ?? "Errore");

  return invite;
}

export async function acceptInvite(input: { token: string }): Promise<{
  teamId: string;
  teamName: string | null;
  alreadyMember: boolean;
}> {
  const { token } = z.object({ token: z.string().min(10).max(200) }).parse(input);
  const { data, error } = await supabase.rpc("accept_invite", { _token: token });
  if (error) throw new Error(error.message);
  const result = data as { teamId: string; teamName: string | null; alreadyMember: boolean };
  return result;
}

export async function deleteInvite(input: { teamId: string; inviteId: string }) {
  const data = z
    .object({ teamId: z.string().uuid(), inviteId: z.string().uuid() })
    .parse(input);
  const { error } = await supabase
    .from("team_invites")
    .delete()
    .eq("id", data.inviteId)
    .eq("team_id", data.teamId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/* ============ Eventi ============ */

const eventFields = z.object({
  teamId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  date: z.string().date(),
  headliner: z.string().trim().max(120).nullable(),
  formatId: z.string().uuid().nullable(),
  venue: z.string().trim().max(160).nullable(),
  notes: z.string().trim().max(2000).nullable(),
});

export async function createEvent(input: z.input<typeof eventFields>): Promise<{ id: string }> {
  const data = eventFields.parse(input);
  const userId = await requireUserId();

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      team_id: data.teamId,
      created_by: userId,
      name: data.name,
      date: data.date,
      headliner: data.headliner,
      format_id: data.formatId,
      venue: data.venue,
      notes: data.notes,
      status: "upcoming",
    })
    .select("id")
    .single();
  if (error || !event) {
    throw new Error("Impossibile creare l’evento. Verifica il team attivo e riprova.");
  }

  const { data: members, error: membersError } = await supabase
    .from("team_members")
    .select("user_id")
    .eq("team_id", data.teamId)
    .eq("status", "active");
  if (membersError) {
    await supabase.from("events").delete().eq("id", event.id);
    throw new Error("Evento non creato: impossibile caricare lo staff del team.");
  }
  if (members && members.length > 0) {
    const { error: assignmentError } = await supabase.from("event_members").insert(
      members.map((member) => ({
        team_id: data.teamId,
        event_id: event.id,
        user_id: member.user_id,
      })),
    );
    if (assignmentError) {
      await supabase.from("events").delete().eq("id", event.id);
      throw new Error("Evento non creato: impossibile assegnare lo staff.");
    }
  }
  return { id: event.id };
}

export async function updateEvent(
  input: { teamId: string; eventId: string } & z.input<typeof eventFields>,
): Promise<{ ok: true }> {
  const { teamId, eventId, ...rest } = input;
  const ids = z.object({ teamId: z.string().uuid(), eventId: z.string().uuid() }).parse({ teamId, eventId });
  // Reuse the same validation as createEvent (min/max lengths, date format).
  const data = eventFields.parse({ teamId, ...rest });

  const { error } = await supabase
    .from("events")
    .update({
      name: data.name,
      date: data.date,
      headliner: data.headliner,
      format_id: data.formatId,
      venue: data.venue,
      notes: data.notes,
    })
    .eq("id", ids.eventId)
    .eq("team_id", ids.teamId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function activateEvent(input: { teamId: string; eventId: string }) {
  const data = z
    .object({ teamId: z.string().uuid(), eventId: z.string().uuid() })
    .parse(input);

  const { data: target } = await supabase
    .from("events")
    .select("id")
    .eq("id", data.eventId)
    .eq("team_id", data.teamId)
    .maybeSingle();
  if (!target) throw new Error("Evento non trovato nel team attivo.");

  const { data: previous } = await supabase
    .from("events")
    .select("id")
    .eq("team_id", data.teamId)
    .eq("status", "active")
    .neq("id", data.eventId)
    .maybeSingle();
  if (previous) {
    const { error } = await supabase.from("events").update({ status: "archived" }).eq("id", previous.id);
    if (error) throw new Error("Impossibile chiudere l’evento attivo.");
  }
  const { error } = await supabase.from("events").update({ status: "active" }).eq("id", data.eventId);
  if (error) {
    if (previous) await supabase.from("events").update({ status: "active" }).eq("id", previous.id);
    throw new Error("Impossibile attivare l’evento. Riprova.");
  }
  return { ok: true };
}

export async function cloneEvent(input: { teamId: string; eventId: string }): Promise<{ id: string }> {
  const data = z
    .object({ teamId: z.string().uuid(), eventId: z.string().uuid() })
    .parse(input);
  const userId = await requireUserId();

  const { data: source } = await supabase
    .from("events")
    .select("name,date,headliner,format_id,venue,notes")
    .eq("id", data.eventId)
    .eq("team_id", data.teamId)
    .maybeSingle();
  if (!source) throw new Error("Evento da clonare non trovato.");

  const nextDate = new Date(source.date);
  nextDate.setDate(nextDate.getDate() + 7);
  const { data: cloned, error } = await supabase
    .from("events")
    .insert({
      team_id: data.teamId,
      created_by: userId,
      status: "upcoming",
      name: `${source.name} (copia)`,
      date: nextDate.toISOString().slice(0, 10),
      headliner: source.headliner,
      format_id: source.format_id,
      venue: source.venue,
      notes: source.notes,
    })
    .select("id")
    .single();
  if (error || !cloned) throw new Error("Impossibile clonare l’evento.");

  const [{ data: bottles }, { data: tables }, { data: members }] = await Promise.all([
    supabase.from("bottles").select("name,price").eq("event_id", data.eventId),
    supabase.from("club_tables").select("ref_name,whatsapp,people_count,zone_id").eq("event_id", data.eventId),
    supabase.from("event_members").select("user_id").eq("event_id", data.eventId),
  ]);
  const writes = [];
  if (bottles && bottles.length > 0)
    writes.push(supabase.from("bottles").insert(bottles.map((bottle) => ({ ...bottle, team_id: data.teamId, event_id: cloned.id }))));
  if (tables && tables.length > 0)
    writes.push(supabase.from("club_tables").insert(tables.map((table) => ({ ...table, team_id: data.teamId, event_id: cloned.id, status: "arriving" as const }))));
  if (members && members.length > 0)
    writes.push(supabase.from("event_members").insert(members.map((member) => ({ ...member, team_id: data.teamId, event_id: cloned.id }))));
  const results = await Promise.all(writes);
  if (results.some((result) => result.error)) {
    await supabase.from("events").delete().eq("id", cloned.id);
    throw new Error("Clone annullato: alcuni dati collegati non erano copiabili.");
  }
  return { id: cloned.id };
}

/* ============ Membri ============ */

export async function listTeamData(input: { teamId: string }) {
  const data = z.object({ teamId: z.string().uuid() }).parse(input);

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from("team_members")
      .select("id, role, status, user_id, created_at, profiles:profiles!team_members_user_id_fkey(email, display_name)")
      .eq("team_id", data.teamId)
      .order("created_at"),
    supabase
      .from("team_invites")
      .select("id, email, role, token, expires_at, used_at, created_at")
      .eq("team_id", data.teamId)
      .is("used_at", null)
      .order("created_at", { ascending: false }),
  ]);

  type MemberRow = {
    id: string;
    role: string;
    status: string;
    user_id: string;
    created_at: string;
    profiles: { email: string | null; display_name: string | null } | null;
  };

  return {
    members: ((members ?? []) as unknown as MemberRow[]).map((m) => ({
      id: m.id,
      userId: m.user_id,
      role: m.role,
      status: m.status,
      email: m.profiles?.email ?? null,
      name: m.profiles?.display_name ?? null,
    })),
    invites: invites ?? [],
  };
}

export async function removeMember(input: { teamId: string; memberId: string }) {
  const data = z
    .object({ teamId: z.string().uuid(), memberId: z.string().uuid() })
    .parse(input);

  const { data: target } = await supabase
    .from("team_members")
    .select("user_id, role")
    .eq("id", data.memberId)
    .eq("team_id", data.teamId)
    .maybeSingle();
  if (!target) throw new Error("Membro non trovato");

  // Non rimuovere l'ultimo admin
  if (target.role === "admin") {
    const { count } = await supabase
      .from("team_members")
      .select("*", { count: "exact", head: true })
      .eq("team_id", data.teamId)
      .eq("role", "admin")
      .eq("status", "active");
    if ((count ?? 0) <= 1) throw new Error("Non puoi rimuovere l'unico admin");
  }

  const { error } = await supabase.from("team_members").delete().eq("id", data.memberId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function changeMemberRole(input: {
  teamId: string;
  memberId: string;
  role: "admin" | "staff";
}) {
  const data = z
    .object({
      teamId: z.string().uuid(),
      memberId: z.string().uuid(),
      role: z.enum(["admin", "staff"]),
    })
    .parse(input);

  // Se sto degradando un admin, verifica che non sia l'ultimo
  if (data.role === "staff") {
    const { data: target } = await supabase
      .from("team_members")
      .select("role")
      .eq("id", data.memberId)
      .eq("team_id", data.teamId)
      .maybeSingle();
    if (target?.role === "admin") {
      const { count } = await supabase
        .from("team_members")
        .select("*", { count: "exact", head: true })
        .eq("team_id", data.teamId)
        .eq("role", "admin")
        .eq("status", "active");
      if ((count ?? 0) <= 1) throw new Error("Non puoi degradare l'unico admin");
    }
  }

  const { error } = await supabase
    .from("team_members")
    .update({ role: data.role })
    .eq("id", data.memberId)
    .eq("team_id", data.teamId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/* ============ Twilio settings ============ */

export interface TwilioSettings {
  twilio_account_sid: string | null;
  twilio_whatsapp_number: string | null;
  webhook_secret: string | null;
  // The auth token is never returned to the browser — only whether one exists.
  has_auth_token: boolean;
}

export async function getTwilioSettings(input: { teamId: string }): Promise<TwilioSettings> {
  const data = z.object({ teamId: z.string().uuid() }).parse(input);
  const { data: settings, error } = await supabase.rpc("get_team_settings_safe", {
    _team_id: data.teamId,
  });
  if (error) throw new Error(error.message);
  const s = (settings ?? {}) as Partial<TwilioSettings>;
  return {
    twilio_account_sid: s.twilio_account_sid ?? null,
    twilio_whatsapp_number: s.twilio_whatsapp_number ?? null,
    webhook_secret: s.webhook_secret ?? null,
    has_auth_token: !!s.has_auth_token,
  };
}

export async function saveTwilioSettings(input: {
  teamId: string;
  accountSid: string;
  authToken?: string;
  whatsappNumber: string;
}) {
  const data = z
    .object({
      teamId: z.string().uuid(),
      accountSid: z.string().trim().min(1).max(64),
      // Optional: leave blank to keep the existing token unchanged.
      authToken: z.string().trim().max(128).optional(),
      whatsappNumber: z.string().trim().min(1).max(32),
    })
    .parse(input);

  // Only overwrite the token when a non-empty value is supplied; omitting it
  // from the upsert preserves the stored token on the conflict (update) path.
  const payload: {
    team_id: string;
    twilio_account_sid: string;
    twilio_whatsapp_number: string;
    updated_at: string;
    twilio_auth_token?: string;
  } = {
    team_id: data.teamId,
    twilio_account_sid: data.accountSid,
    twilio_whatsapp_number: data.whatsappNumber,
    updated_at: new Date().toISOString(),
  };
  if (data.authToken && data.authToken.length > 0) {
    payload.twilio_auth_token = data.authToken;
  }

  const { error } = await supabase
    .from("team_settings")
    .upsert(payload, { onConflict: "team_id" });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function regenerateWebhookSecret(input: { teamId: string }) {
  const data = z.object({ teamId: z.string().uuid() }).parse(input);
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const newSecret = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const { error } = await supabase.from("team_settings").upsert(
    { team_id: data.teamId, webhook_secret: newSecret, updated_at: new Date().toISOString() },
    { onConflict: "team_id" },
  );
  if (error) throw new Error(error.message);
  return { webhook_secret: newSecret };
}

export async function testTwilioConnection(input: { teamId: string }): Promise<{
  ok: boolean;
  friendlyName?: string | null;
  status?: string | null;
  error?: string;
}> {
  const data = z.object({ teamId: z.string().uuid() }).parse(input);
  // CORS blocks calling Twilio from the browser, so this runs in the
  // `twilio-test` Edge Function (which also re-checks admin access via RLS).
  const { data: result, error } = await supabase.functions.invoke("twilio-test", {
    body: { teamId: data.teamId },
  });
  if (error) return { ok: false, error: error.message };
  return result as { ok: boolean; friendlyName?: string | null; status?: string | null; error?: string };
}
