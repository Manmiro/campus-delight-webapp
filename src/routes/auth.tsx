import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { listOutlets } from "@/lib/catalog.functions";
import { getMyRole } from "@/lib/roles.functions";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

const outletsQuery = queryOptions({
  queryKey: ["public-outlets"],
  queryFn: () => listOutlets(),
});

const searchSchema = {
  validateSearch: (search: Record<string, unknown>): { mode?: string; ref?: string } => {
    const out: { mode?: string; ref?: string } = {};
    if (typeof search["mode"] === "string") out["mode"] = search["mode"];
    if (typeof search["ref"] === "string") out["ref"] = search["ref"];
    return out;
  },
};

export const Route = createFileRoute("/auth")({
  ...searchSchema,
  loader: ({ context }) => context.queryClient.ensureQueryData(outletsQuery),
  head: () => ({
    meta: [
      { title: "Sign in or create your account — Campus Delight" },
      { name: "description", content: "Sign in to Campus Delight or create your customer account and pick your campus outlet." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { data: outlets } = useSuspenseQuery(outletsQuery);
  const search = Route.useSearch();
  const initialMode = search["mode"];
  const ref = search["ref"] ?? "";
  const getRole = useServerFn(getMyRole);

  const [mode, setMode] = useState<"signin" | "signup">(initialMode === "signup" ? "signup" : "signin");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [outletId, setOutletId] = useState("");
  const [referralCode, setReferralCode] = useState(ref.toUpperCase());
  const [busy, setBusy] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  const roleHome = (role: string): "/admin" | "/outlet" | "/dashboard" =>
    role === "central_admin" ? "/admin" : role.startsWith("outlet") ? "/outlet" : "/dashboard";

  async function afterSignIn() {
    const role = await getRole();
    await navigate({ to: roleHome(role) });
  }

  // Already signed in? Head straight to the right dashboard.
  void (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) await afterSignIn();
  })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!outletId) throw new Error("Choose your Campus Delight outlet");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: fullName,
              phone,
              outlet_id: outletId,
              referral_code: referralCode || undefined,
            },
          },
        });
        if (error) throw error;
        if (data.session) {
          await afterSignIn();
        } else {
          setAwaitingConfirm(true); // email confirmation is on: the link creates the session
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await afterSignIn();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (awaitingConfirm) {
    return (
      <CenterCard>
        <MailCheck className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-4 font-display text-2xl font-bold">Check your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a confirmation link to <span className="font-semibold text-foreground">{email}</span>.
          Open it to activate your Campus Delight account — your wallet and 1,000 welcome tokens are waiting.
        </p>
        <Button variant="outline" className="mt-6" onClick={() => setAwaitingConfirm(false)}>
          Back
        </Button>
      </CenterCard>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary font-display font-bold text-primary-foreground">CD</span>
          <span className="font-display text-xl font-bold">Campus Delight</span>
        </Link>
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-lg py-2 text-sm font-semibold transition-colors ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Ada Obi" />
                </div>
                <div>
                  <Label htmlFor="phone">Phone number</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="0803 000 0000" />
                </div>
                <div>
                  <Label htmlFor="outlet">Your campus outlet</Label>
                  <Select value={outletId} onValueChange={setOutletId} required>
                    <SelectTrigger id="outlet" className="w-full">
                      <SelectValue placeholder="Select your outlet" />
                    </SelectTrigger>
                    <SelectContent>
                      {outlets.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="referral">Referral code (optional)</Label>
                  <Input id="referral" value={referralCode} onChange={(e) => setReferralCode(e.target.value)} placeholder="CDRXXXXXX" />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create my account"}
            </Button>
          </form>
          {mode === "signin" && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Forgot your password?{" "}
              <Link to="/reset-password" className="font-semibold text-primary">
                Reset it
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function CenterCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm">{children}</div>
    </div>
  );
}
