import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyRole } from "@/lib/roles.functions";
import { hasConfirmedEmail } from "@/lib/auth-rules";

export type SessionHome = "/admin" | "/outlet" | "/dashboard";

export const roleHome = (role: string): SessionHome =>
  role === "central_admin" ? "/admin" : role.startsWith("outlet") ? "/outlet" : "/dashboard";

/** Reads the saved session on this device (refreshing it if expired) and resolves the user's home. */
export function useSessionHome() {
  const getRole = useServerFn(getMyRole);
  const [state, setState] = useState<{ status: "checking" | "signedOut" | "signedIn"; home: SessionHome | null }>({ status: "checking", home: null });

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user || !hasConfirmedEmail(user)) {
        if (active) setState({ status: "signedOut", home: null });
        return;
      }
      let home: SessionHome = "/dashboard";
      try { home = roleHome(await getRole()); } catch { /* fall back to the customer dashboard */ }
      if (active) setState({ status: "signedIn", home });
    })().catch(() => { if (active) setState({ status: "signedOut", home: null }); });
    return () => { active = false; };
  }, [getRole]);

  return state;
}
