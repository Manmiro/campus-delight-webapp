import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
import { hasConfirmedEmail, validateSignInCredentials } from "@/lib/auth-rules";

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
      { property: "og:title", content: "Sign in or create your account — Campus Delight" },
      {
        property: "og:description",
        content: "Sign in to Campus Delight or create your customer account and pick your campus outlet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [referralCode, setReferralCode] = useState(ref.toUpperCase());
  const [busy, setBusy] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  const roleHome = (role: string): "/admin" | "/outlet" | "/dashboard" =>
    role === "central_admin" ? "/admin" : role.startsWith("outlet") ? "/outlet" : "/dashboard";

  async function afterSignIn() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!hasConfirmedEmail(data.user)) {
      setAwaitingConfirm(true);
      return;
    }
    const role = await getRole();
    await navigate({ to: roleHome(role) });
  }

  // Already signed in? Head straight to the right dashboard.
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active || !hasConfirmedEmail(data.user)) return;
      const role = await getRole();
      if (active) await navigate({ to: roleHome(role) });
    })().catch(() => { /* Signed-out visitors stay on the sign-in form. */ });
    return () => { active = false; };
  }, [getRole, navigate]);

  async function resendConfirmation() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth` },
      });
      if (error) throw error;
      toast.success("Confirmation email sent. Please check your inbox and spam folder.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the confirmation email");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!fullName.trim()) throw new Error("Enter your full name");
        if (!phone.trim()) throw new Error("Enter your phone number");
        if (!outletId) throw new Error("Choose your Campus Delight outlet");
        if (!gender) throw new Error("Select your gender");
        if (!dob) throw new Error("Enter your date of birth");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: {
              full_name: fullName,
              phone,
              gender,
              date_of_birth: dob,
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
        const credentials = validateSignInCredentials(email, password);
        const { error } = await supabase.auth.signInWithPassword(credentials);
        if (error?.code === "email_not_confirmed") {
          setAwaitingConfirm(true);
          return;
        }
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
          Confirm your email address before signing in to Campus Delight. Check your spam folder if the email is missing.
        </p>
        <Button className="mt-6 w-full" disabled={busy} onClick={resendConfirmation}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Resend confirmation email
        </Button>
        <Button variant="outline" className="mt-3 w-full" disabled={busy} onClick={() => {
          setMode("signin");
          setPassword("");
          setAwaitingConfirm(false);
        }}>
          Back to sign in
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
              <Button
                key={m}
                type="button"
                variant={mode === m ? "default" : "ghost"}
                onClick={() => setMode(m)}
                className={`rounded-lg py-2 text-sm font-semibold transition-colors ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </Button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signin" && (
              <div>
                <Label htmlFor="email">Email address</Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
            )}
            {mode === "signup" && (
              <>
                <div>
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Ada Obi" />
                </div>
                <div>
                  <Label htmlFor="email">Email address</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
                </div>
                <div>
                  <Label htmlFor="phone">Phone number</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="0803 000 0000" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="gender">Gender</Label>
                    <Select value={gender} onValueChange={setGender} required>
                      <SelectTrigger id="gender" className="w-full">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="dob">Date of birth</Label>
                    <Input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} required max={new Date().toISOString().slice(0, 10)} />
                  </div>
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
                  <Label htmlFor="referral">Referral code <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="referral" value={referralCode} onChange={(e) => setReferralCode(e.target.value)} placeholder="CDRXXXXXX" />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
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
