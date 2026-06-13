import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, AlarmClock, HandMetal, Check } from "lucide-react";
import { toast } from "sonner";

export type AlertKind = "whatsapp_msg" | "bottle_late" | "help_needed";

export interface AlertRow {
  id: string;
  team_id: string;
  event_id: string | null;
  table_id: string | null;
  kind: AlertKind;
  message: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface Props {
  userId: string | undefined;
  teamId: string | null;
  eventId?: string | null;
  tablesIndex: Record<string, string>;
  peopleIndex?: Record<string, string>;
}

const KIND_META: Record<AlertKind, { label: string; Icon: typeof MessageCircle; tone: string }> = {
  whatsapp_msg: { label: "WhatsApp", Icon: MessageCircle, tone: "bg-primary text-primary-foreground" },
  bottle_late: { label: "Bottiglia in ritardo", Icon: AlarmClock, tone: "bg-destructive text-destructive-foreground" },
  help_needed: { label: "Serve aiuto", Icon: HandMetal, tone: "bg-warning text-warning-foreground" },
};

export function AlertsBanner({ userId, teamId, eventId, tablesIndex, peopleIndex = {} }: Props) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const tablesIndexRef = useRef(tablesIndex);

  useEffect(() => {
    tablesIndexRef.current = tablesIndex;
  }, [tablesIndex]);

  useEffect(() => {
    if (!teamId) return;
    let mounted = true;
    const load = async () => {
      let query = supabase
        .from("alerts")
        .select("*")
        .eq("team_id", teamId)
        .is("resolved_at", null)
        .order("created_at", { ascending: false });
      if (eventId) query = query.eq("event_id", eventId);
      const { data } = await query;
      if (!mounted) return;
      setAlerts((data ?? []) as AlertRow[]);
    };
    load();

    const channel = supabase
      .channel(`alerts-${teamId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts", filter: `team_id=eq.${teamId}` },
        (payload) => {
          setAlerts((prev) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as AlertRow;
              if (row.resolved_at || (eventId && row.event_id !== eventId)) return prev;
              const exists = prev.some((a) => a.id === row.id);
              if (!exists) {
                const tableName = row.table_id ? tablesIndexRef.current[row.table_id] : null;
                toast(`${KIND_META[row.kind].label}${tableName ? ` · ${tableName}` : ""}`, {
                  description: row.message ?? undefined,
                });
              }
              return exists ? prev : [row, ...prev];
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new as AlertRow;
              if (row.resolved_at) return prev.filter((a) => a.id !== row.id);
              return prev.map((a) => (a.id === row.id ? row : a));
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((a) => a.id !== (payload.old as { id: string }).id);
            }
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, eventId]);

  const claim = async (a: AlertRow) => {
    if (!userId) return;
    const { error } = await supabase
      .from("alerts")
      .update({ claimed_by: userId, claimed_at: new Date().toISOString() })
      .eq("id", a.id);
    if (error) return toast.error(error.message);
    if (a.table_id) {
      await supabase.from("club_tables").update({ assigned_to: userId }).eq("id", a.table_id);
    }
    toast.success("Preso in carico");
  };

  const resolve = async (a: AlertRow) => {
    const { error } = await supabase
      .from("alerts")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", a.id);
    if (error) return toast.error(error.message);
  };

  if (alerts.length === 0) return null;

  return (
    <div className="sticky top-[112px] z-10 px-4 pt-2 pb-1 space-y-2">
      {alerts.map((a) => {
        const meta = KIND_META[a.kind];
        const tableName = a.table_id ? tablesIndex[a.table_id] : null;
        const claimed = !!a.claimed_by;
        const mine = a.claimed_by === userId;
        return (
          <div
            key={a.id}
            className={`rounded-2xl border-2 p-3 ${claimed ? "border-success/60 bg-success/10" : "border-destructive bg-destructive/15 animate-pulse"}`}
          >
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl grid place-items-center ${meta.tone}`}>
                <meta.Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-black">
                  {meta.label}
                  {tableName && <span className="text-foreground"> · {tableName}</span>}
                </div>
                {a.message && (
                  <div className="text-xs text-muted-foreground truncate">{a.message}</div>
                )}
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              {!claimed ? (
                <button
                  onClick={() => claim(a)}
                  className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-black text-sm"
                >
                  PRENDO IO
                </button>
              ) : (
                <span className={`flex-1 h-11 grid place-items-center rounded-xl text-xs font-bold ${mine ? "bg-success text-success-foreground" : "bg-secondary text-muted-foreground"}`}>
                  {mine ? "Tuo" : `Preso da ${peopleIndex[a.claimed_by ?? ""] ?? "altro operatore"}`}
                </span>
              )}
              <button
                onClick={() => resolve(a)}
                aria-label="Risolvi"
                className="h-11 w-11 grid place-items-center rounded-xl bg-secondary"
              >
                <Check className="w-5 h-5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
