import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "./use-session";

export function useRole() {
  const { user, loading: sessionLoading } = useSession();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    let mounted = true;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (!mounted) return;
        setIsAdmin(!!data?.some((r) => r.role === "admin"));
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [user, sessionLoading]);

  return { isAdmin, loading: loading || sessionLoading, user };
}
