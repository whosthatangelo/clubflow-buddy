import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "./use-session";

export type TeamStatus = "loading" | "no_team" | "ready";

export interface CurrentTeam {
  status: TeamStatus;
  teamId: string | null;
  teamName: string | null;
  isAdmin: boolean;
  user: ReturnType<typeof useSession>["user"];
  refresh: () => Promise<void>;
}

export function useCurrentTeam(): CurrentTeam {
  const { user, loading: sessionLoading } = useSession();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState<TeamStatus>("loading");

  const fetchTeam = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("team_members")
      .select("team_id, role, teams(name)")
      .eq("user_id", uid)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) {
      console.error("[useCurrentTeam]", error);
      setStatus("no_team");
      return;
    }
    const row = (data ?? [])[0] as { team_id: string; role: string; teams: { name: string } | null } | undefined;
    if (!row) {
      setTeamId(null);
      setTeamName(null);
      setIsAdmin(false);
      setStatus("no_team");
      return;
    }
    setTeamId(row.team_id);
    setTeamName(row.teams?.name ?? null);
    setIsAdmin(row.role === "admin");
    setStatus("ready");
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setStatus("loading");
      return;
    }
    fetchTeam(user.id);
  }, [user, sessionLoading, fetchTeam]);

  const refresh = useCallback(async () => {
    if (user) await fetchTeam(user.id);
  }, [user, fetchTeam]);

  return {
    status: sessionLoading || (!user && status === "loading") ? "loading" : status,
    teamId,
    teamName,
    isAdmin,
    user,
    refresh,
  };
}
