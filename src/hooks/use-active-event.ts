import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTeam } from "./use-current-team";

export interface ActiveEvent {
  id: string;
  name: string;
  date: string;
  headliner: string | null;
  format_id: string | null;
  venue: string | null;
  notes: string | null;
  status: "upcoming" | "active" | "archived";
}

export function useActiveEvent() {
  const team = useCurrentTeam();
  const [event, setEvent] = useState<ActiveEvent | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEvent = useCallback(async (teamId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("events")
      .select("id,name,date,headliner,format_id,venue,notes,status")
      .eq("team_id", teamId)
      .eq("status", "active")
      .order("date", { ascending: false })
      .limit(1);
    setEvent(((data ?? [])[0] as ActiveEvent | undefined) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (team.status !== "ready" || !team.teamId) return;
    fetchEvent(team.teamId);
  }, [team.status, team.teamId, fetchEvent]);

  const refresh = useCallback(async () => {
    if (team.teamId) await fetchEvent(team.teamId);
  }, [team.teamId, fetchEvent]);

  return { event, loading: loading || team.status === "loading", team, refresh };
}
