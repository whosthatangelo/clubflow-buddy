import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
  // Monotonic request token so a stale fetch can't apply an old event.
  const reqIdRef = useRef(0);

  const fetchEvent = useCallback(async (teamId: string) => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    const { data, error } = await supabase
      .from("events")
      .select("id,name,date,headliner,format_id,venue,notes,status")
      .eq("team_id", teamId)
      .eq("status", "active")
      .order("date", { ascending: false })
      .limit(1);
    if (reqId !== reqIdRef.current) return; // superseded by a newer fetch
    if (error) {
      // Don't silently render "no active event" on a real failure.
      console.error("[useActiveEvent]", error);
      toast.error("Impossibile caricare l’evento attivo.");
      setLoading(false);
      return;
    }
    setEvent(((data ?? [])[0] as ActiveEvent | undefined) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (team.status !== "ready" || !team.teamId) {
      // Team not ready (loading, switched away, logged out): drop any stale
      // event so we don't keep showing the previous team's active event.
      reqIdRef.current++;
      setEvent(null);
      // Resolve our own loading flag for terminal non-ready states (no_team /
      // error); the returned `loading` still ORs team.status === "loading", so
      // the genuine loading case is unaffected.
      setLoading(false);
      return;
    }
    fetchEvent(team.teamId);
  }, [team.status, team.teamId, fetchEvent]);

  const refresh = useCallback(async () => {
    if (team.teamId) await fetchEvent(team.teamId);
  }, [team.teamId, fetchEvent]);

  return { event, loading: loading || team.status === "loading", team, refresh };
}
