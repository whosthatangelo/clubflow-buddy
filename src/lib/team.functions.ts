import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* ============ Helpers ============ */

async function getAdminContext(supabase: any, userId: string, teamId: string) {
  const { data, error } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data || data.role !== "admin") {
    throw new Error("Non sei admin di questo team");
  }
}

/* ============ Create team (onboarding) ============ */

export const createTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string }) =>
    z.object({ name: z.string().trim().min(2).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verifica che l'utente non abbia già un team (limite v1: 1 team per utente)
    const { data: existing } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", userId)
      .limit(1);
    if (existing && existing.length > 0) {
      throw new Error("Hai già un team");
    }

    // Crea team
    const { data: team, error: tErr } = await supabaseAdmin
      .from("teams")
      .insert({ name: data.name, created_by: userId })
      .select("id")
      .single();
    if (tErr || !team) throw new Error(tErr?.message ?? "Errore creazione team");

    // Aggiungi creatore come admin attivo
    const { error: mErr } = await supabaseAdmin.from("team_members").insert({
      team_id: team.id,
      user_id: userId,
      role: "admin",
      status: "active",
    });
    if (mErr) throw new Error(mErr.message);

    // Crea team_settings con webhook_secret di default
    await supabaseAdmin.from("team_settings").insert({ team_id: team.id });

    return { teamId: team.id };
  });

/* ============ Inviti ============ */

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { teamId: string; email?: string; role: "admin" | "staff" }) =>
    z
      .object({
        teamId: z.string().uuid(),
        email: z.string().email().max(255).optional().or(z.literal("")),
        role: z.enum(["admin", "staff"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await getAdminContext(supabase, userId, data.teamId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite, error } = await supabaseAdmin
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
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) =>
    z.object({ token: z.string().min(10).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite } = await supabaseAdmin
      .from("team_invites")
      .select("id, team_id, role, expires_at, used_at, teams(name)")
      .eq("token", data.token)
      .maybeSingle();
    if (!invite) throw new Error("Invito non valido");
    if (invite.used_at) throw new Error("Invito già usato");
    if (new Date(invite.expires_at) < new Date()) throw new Error("Invito scaduto");

    // Verifica che l'utente non sia già in questo team
    const { data: already } = await supabaseAdmin
      .from("team_members")
      .select("id")
      .eq("team_id", invite.team_id)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (already) {
      // segna come used comunque
      await supabaseAdmin.from("team_invites").update({ used_at: new Date().toISOString(), used_by: userId }).eq("id", invite.id);
      return { teamId: invite.team_id, teamName: (invite.teams as any)?.name ?? null, alreadyMember: true };
    }

    // Inserisci (o upsert se c'era una riga pending senza user_id valido)
    const { error: insErr } = await supabaseAdmin
      .from("team_members")
      .insert({ team_id: invite.team_id, user_id: userId, role: invite.role, status: "active" });
    if (insErr) throw new Error(insErr.message);

    await supabaseAdmin
      .from("team_invites")
      .update({ used_at: new Date().toISOString(), used_by: userId })
      .eq("id", invite.id);

    return { teamId: invite.team_id, teamName: (invite.teams as any)?.name ?? null, alreadyMember: false };
  });

export const deleteInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { inviteId: string }) =>
    z.object({ inviteId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("team_invites").delete().eq("id", data.inviteId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ Membri ============ */

export const listTeamData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { teamId: string }) =>
    z.object({ teamId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await getAdminContext(supabase, userId, data.teamId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: members }, { data: invites }] = await Promise.all([
      supabaseAdmin
        .from("team_members")
        .select("id, role, status, user_id, created_at, profiles:profiles!team_members_user_id_fkey(email, display_name)")
        .eq("team_id", data.teamId)
        .order("created_at"),
      supabaseAdmin
        .from("team_invites")
        .select("id, email, role, token, expires_at, used_at, created_at")
        .eq("team_id", data.teamId)
        .is("used_at", null)
        .order("created_at", { ascending: false }),
    ]);

    return {
      members: (members ?? []).map((m: any) => ({
        id: m.id,
        userId: m.user_id,
        role: m.role,
        status: m.status,
        email: m.profiles?.email ?? null,
        name: m.profiles?.display_name ?? null,
      })),
      invites: invites ?? [],
    };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { teamId: string; memberId: string }) =>
    z.object({ teamId: z.string().uuid(), memberId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await getAdminContext(supabase, userId, data.teamId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target } = await supabaseAdmin
      .from("team_members")
      .select("user_id, role")
      .eq("id", data.memberId)
      .eq("team_id", data.teamId)
      .maybeSingle();
    if (!target) throw new Error("Membro non trovato");

    // Non rimuovere l'ultimo admin
    if (target.role === "admin") {
      const { count } = await supabaseAdmin
        .from("team_members")
        .select("*", { count: "exact", head: true })
        .eq("team_id", data.teamId)
        .eq("role", "admin")
        .eq("status", "active");
      if ((count ?? 0) <= 1) throw new Error("Non puoi rimuovere l'unico admin");
    }

    const { error } = await supabaseAdmin.from("team_members").delete().eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const changeMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { teamId: string; memberId: string; role: "admin" | "staff" }) =>
    z
      .object({
        teamId: z.string().uuid(),
        memberId: z.string().uuid(),
        role: z.enum(["admin", "staff"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await getAdminContext(supabase, userId, data.teamId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Se sto degradando un admin, verifica che non sia l'ultimo
    if (data.role === "staff") {
      const { data: target } = await supabaseAdmin
        .from("team_members")
        .select("role")
        .eq("id", data.memberId)
      .eq("team_id", data.teamId)
        .maybeSingle();
      if (target?.role === "admin") {
        const { count } = await supabaseAdmin
          .from("team_members")
          .select("*", { count: "exact", head: true })
          .eq("team_id", data.teamId)
          .eq("role", "admin")
          .eq("status", "active");
        if ((count ?? 0) <= 1) throw new Error("Non puoi degradare l'unico admin");
      }
    }

    const { error } = await supabaseAdmin
      .from("team_members")
      .update({ role: data.role })
      .eq("id", data.memberId)
      .eq("team_id", data.teamId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ Twilio settings ============ */

export const getTwilioSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { teamId: string }) =>
    z.object({ teamId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await getAdminContext(supabase, userId, data.teamId);
    const { data: settings } = await supabase
      .from("team_settings")
      .select("twilio_account_sid, twilio_auth_token, twilio_whatsapp_number, webhook_secret")
      .eq("team_id", data.teamId)
      .maybeSingle();
    return settings ?? {
      twilio_account_sid: null,
      twilio_auth_token: null,
      twilio_whatsapp_number: null,
      webhook_secret: null,
    };
  });

export const saveTwilioSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    teamId: string;
    accountSid: string;
    authToken: string;
    whatsappNumber: string;
  }) =>
    z
      .object({
        teamId: z.string().uuid(),
        accountSid: z.string().trim().min(1).max(64),
        authToken: z.string().trim().min(1).max(128),
        whatsappNumber: z.string().trim().min(1).max(32),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await getAdminContext(supabase, userId, data.teamId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("team_settings")
      .upsert(
        {
          team_id: data.teamId,
          twilio_account_sid: data.accountSid,
          twilio_auth_token: data.authToken,
          twilio_whatsapp_number: data.whatsappNumber,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "team_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const regenerateWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { teamId: string }) =>
    z.object({ teamId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await getAdminContext(supabase, userId, data.teamId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const newSecret = (await import("crypto")).randomBytes(32).toString("hex");
    const { error } = await supabaseAdmin
      .from("team_settings")
      .upsert(
        { team_id: data.teamId, webhook_secret: newSecret, updated_at: new Date().toISOString() },
        { onConflict: "team_id" },
      );
    if (error) throw new Error(error.message);
    return { webhook_secret: newSecret };
  });

export const testTwilioConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { teamId: string }) =>
    z.object({ teamId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await getAdminContext(supabase, userId, data.teamId);

    const { data: s } = await supabase
      .from("team_settings")
      .select("twilio_account_sid, twilio_auth_token")
      .eq("team_id", data.teamId)
      .maybeSingle();
    if (!s?.twilio_account_sid || !s?.twilio_auth_token) {
      return { ok: false, error: "Credenziali non configurate" };
    }
    const auth = Buffer.from(`${s.twilio_account_sid}:${s.twilio_auth_token}`).toString("base64");
    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${s.twilio_account_sid}.json`,
        { headers: { Authorization: `Basic ${auth}` } },
      );
      if (!res.ok) {
        const body = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
      }
      const json: any = await res.json();
      return { ok: true, friendlyName: json.friendly_name ?? null, status: json.status ?? null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Errore rete" };
    }
  });
