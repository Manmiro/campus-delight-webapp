import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getSession reads the saved session and refreshes an expired token, so a slow
    // network on app launch does not sign the student out.
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      await new Promise((r) => setTimeout(r, 800));
      ({ data: { session } } = await supabase.auth.getSession());
    }
    const data = { user: session?.user ?? null };
    if (!data.user) {
      throw redirect({ to: "/auth", search: { mode: "signin", ref: "" } });
    }
    const { data: profile } = await supabase.from("profiles").select("is_active").eq("id", data.user.id).maybeSingle();
    if (profile?.is_active === false) {
      await supabase.auth.signOut();
      throw redirect({ to: "/" });
    }
  },
  component: () => <Outlet />,
});
