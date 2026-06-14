import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "./use-session";

export type TeamStatus = "loading" | "no_team" | "ready";

export interface CurrentTeam {
  status: TeamStatus;
  teamId: string | null;
  teamName: string | null;
  isAdmin: boolean;
  teams: TeamOption[];
  user: ReturnType<typeof useSession>["user"];
  selectTeam: (teamId: string) => void;
  refresh: () => Promise<void>;
}

export interface TeamOption {
  id: string;
  name: string;
  role: "admin" | "staff";
}

const ACTIVE_TEAM_KEY = "tableflow.active-team";
const TEAM_CHANGED_EVENT = "tableflow:team-changed";

export function useCurrentTeam(): CurrentTeam {
  const { user, loading: sessionLoading } = useSession();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [status, setStatus] = useState<TeamStatus>("loading");

  const fetchTeam = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("team_members")
      .select("team_id, role, teams(name)")
      .eq("user_id", uid)
      .eq("status", "active")
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[useCurrentTeam]", error);
      setStatus("no_team");
      return;
    }
    const options = (data ?? []).map((row) => ({
      id: row.team_id,
      name: row.teams?.name ?? "Team",
      role: row.role as "admin" | "staff",
    }));
    setTeams(options);
    const storedId = window.localStorage.getItem(ACTIVE_TEAM_KEY);
    const row = options.find((option) => option.id === storedId) ?? options[0];
    if (!row) {
      setTeamId(null);
      setTeamName(null);
      setIsAdmin(false);
      setStatus("no_team");
      return;
    }
    window.localStorage.setItem(ACTIVE_TEAM_KEY, row.id);
    setTeamId(row.id);
    setTeamName(row.name);
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

  useEffect(() => {
    const onTeamChanged = () => {
      if (user) fetchTeam(user.id);
    };
    window.addEventListener(TEAM_CHANGED_EVENT, onTeamChanged);
    return () => window.removeEventListener(TEAM_CHANGED_EVENT, onTeamChanged);
  }, [user, fetchTeam]);

  const selectTeam = useCallback((nextTeamId: string) => {
    if (!teams.some((team) => team.id === nextTeamId)) return;
    window.localStorage.setItem(ACTIVE_TEAM_KEY, nextTeamId);
    window.dispatchEvent(new Event(TEAM_CHANGED_EVENT));
  }, [teams]);

  const refresh = useCallback(async () => {
    if (user) await fetchTeam(user.id);
  }, [user, fetchTeam]);

  return {
    status: sessionLoading || (!user && status === "loading") ? "loading" : status,
    teamId,
    teamName,
    isAdmin,
    teams,
    user,
    selectTeam,
    refresh,
  };
}
