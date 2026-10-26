import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { listOutlets } from "@/lib/catalog.functions";
import { getMyRole } from "@/lib/roles.functions";
import { acknowledgeRegistrationRewards } from "@/lib/transactions.functions";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { hasConfirmedEmail, validateSignInCredentials, validateSignInForm, validateSignUpForm, type FormErrors } from "@/lib/auth-rules";
import { ThemeToggle } from "@/components/theme-toggle";
import { LegalLinks } from "@/components/legal-page";
import { PasswordInput, PasswordStrengthMeter } from "@/components/password-field";
import logoImg from "@/assets/logo.jpg";
import heroImg from "@/assets/hero-meal.jpg";

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
  const welcomeReceipt = useServerFn(acknowledgeRegistrationRewards);

  const [mode, setMode] = useState<"signin" | "signup">(initialMode === "signup" ? "signup" : "signin");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [outletId, setOutletId] = useState("");
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [referralCode, setReferralCode] = useState(ref.toUpperCase());
  const [busy, setBusy] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const clearError = (field: keyof FormErrors) =>
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const roleHome = (role: string): "/admin" | "/outlet" | "/dashboard" =>
    role === "central_admin" ? "/admin" : role.startsWith("outlet") ? "/outlet" : "/dashboard";

  async function afterSignIn() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!hasConfirmedEmail(data.user)) {
      setAwaitingConfirm(true);
      return;
    }
    await welcomeReceipt().catch(() => {});
    const role = await getRole();
    await navigate({ to: roleHome(role) });
  }

  // Already signed in? Head straight to the right dashboard.
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active || !hasConfirmedEmail(data.user)) return;
      await welcomeReceipt().catch(() => {});
      const role = await getRole();
      if (active) await navigate({ to: roleHome(role) });
    })().catch(() => { /* Signed-out visitors stay on the sign-in form. */ });
    return () => { active = false; };
  }, [getRole, navigate, welcomeReceipt]);

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

    // Every field is required except the referral code, which stays optional.
    const fieldErrors =
      mode === "signup"
        ? validateSignUpForm({ fullName, email, phone, gender, dateOfBirth: dob, outletId, password, confirmPassword, referralCode, acceptedTerms })
        : validateSignInForm(email, password);
    const messages = Object.values(fieldErrors).filter(Boolean) as string[];
    if (messages.length > 0) {
      setErrors(fieldErrors);
      toast.error(messages[0]);
      return;
    }
    setErrors({});

    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: {
              full_name: fullName.trim(),
              phone: phone.trim(),
              gender,
              date_of_birth: dob,
              outlet_id: outletId,
              referral_code: referralCode.trim().toUpperCase() || undefined,
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
        <div className="fixed top-4 right-4 z-50"><ThemeToggle /></div>
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
          setConfirmPassword("");
          setAwaitingConfirm(false);
        }}>
          Back to sign in
        </Button>
      </CenterCard>
    );
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-6 sm:py-10">
      <div className="fixed top-4 right-4 z-50"><ThemeToggle /></div>
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[2rem] bg-card shadow-soft lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <aside className="relative hidden overflow-hidden bg-gradient-brand p-8 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
          <img src={heroImg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
          <div className="relative">
            <Link to="/" className="inline-flex items-center gap-3">
              <img src={logoImg} alt="Campus Delight logo" className="h-14 w-14 rounded-full ring-4 ring-primary-foreground/30" />
              <span className="font-display text-xl font-bold">Campus Delight</span>
            </Link>
          </div>
          <div className="relative">
            <span className="inline-block rounded-full bg-golden px-3 py-1 text-xs font-bold text-primary-foreground">Eat Now & Pay Later</span>
            <h2 className="mt-4 font-display text-4xl font-bold leading-tight">Good food.<br />Every day on campus.</h2>
            <p className="mt-3 max-w-sm text-sm opacity-90">Join today and get 1,000 welcome tokens, meal plans and a ₦2,100 starter Pay Later limit.</p>
            <div className="mt-6 grid grid-cols-3 gap-2 text-center">
              {[["1,000", "Free tokens"], ["11", "Outlets"], ["₦2,100", "Starter limit"]].map(([v, l]) => (
                <div key={l} className="rounded-2xl bg-primary-foreground/15 p-3 backdrop-blur">
                  <p className="font-display text-lg font-bold">{v}</p><p className="text-[11px] opacity-85">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
        <div className="p-6 sm:p-10">
          <Link to="/" className="mb-6 flex flex-col items-center gap-2 lg:hidden">
            <img src={logoImg} alt="Campus Delight logo" className="h-20 w-20 rounded-full shadow-glow" />
            <span className="font-display text-xl font-bold">Campus Delight</span>
          </Link>
          <h1 className="font-display text-2xl font-bold">{mode === "signin" ? "Welcome back 👋" : "Create your account 🍛"}</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">{mode === "signin" ? "Sign in to order, top up and track your meals." : "Fill in every field below — only the referral code is optional."}</p>
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            {(["signin", "signup"] as const).map((m) => (
              <Button
                key={m}
                type="button"
                variant={mode === m ? "default" : "ghost"}
                onClick={() => { setMode(m); setErrors({}); }}
                className={`rounded-lg py-2 text-sm font-semibold transition-colors ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </Button>
            ))}
          </div>

          <form onSubmit={submit} noValidate className="space-y-4">
            {mode === "signin" && (
              <div>
                <Label htmlFor="email">Email address <Required /></Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); clearError("email"); }} required aria-required="true" aria-invalid={Boolean(errors.email)} placeholder="you@example.com" />
                <FieldError message={errors.email} />
              </div>
            )}
            {mode === "signup" && (
              <>
                <div>
                  <Label htmlFor="fullName">Full name <Required /></Label>
                  <Input id="fullName" value={fullName} onChange={(e) => { setFullName(e.target.value); clearError("fullName"); }} required aria-required="true" aria-invalid={Boolean(errors.fullName)} placeholder="Ada Obi" />
                  <FieldError message={errors.fullName} />
                </div>
                <div>
                  <Label htmlFor="email">Email address <Required /></Label>
                  <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); clearError("email"); }} required aria-required="true" aria-invalid={Boolean(errors.email)} placeholder="you@example.com" />
                  <FieldError message={errors.email} />
                </div>
                <div>
                  <Label htmlFor="phone">Phone number <Required /></Label>
                  <Input id="phone" inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); clearError("phone"); }} required aria-required="true" aria-invalid={Boolean(errors.phone)} placeholder="0803 000 0000" />
                  <FieldError message={errors.phone} />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="gender">Gender <Required /></Label>
                    <Select value={gender} onValueChange={(v) => { setGender(v); clearError("gender"); }} required>
                      <SelectTrigger id="gender" className="w-full" aria-required="true" aria-invalid={Boolean(errors.gender)}>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldError message={errors.gender} />
                  </div>
                  <div>
                    <Label htmlFor="dob">Date of birth <Required /></Label>
                    <Input id="dob" type="date" value={dob} onChange={(e) => { setDob(e.target.value); clearError("dateOfBirth"); }} required aria-required="true" aria-invalid={Boolean(errors.dateOfBirth)} max={new Date().toISOString().slice(0, 10)} />
                    <FieldError message={errors.dateOfBirth} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="outlet">Your campus outlet <Required /></Label>
                  <Select value={outletId} onValueChange={(v) => { setOutletId(v); clearError("outletId"); }} required>
                    <SelectTrigger id="outlet" className="w-full" aria-required="true" aria-invalid={Boolean(errors.outletId)}>
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
                  <FieldError message={errors.outletId} />
                </div>
                <div>
                  <Label htmlFor="referral">Referral code <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="referral" value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())} placeholder="CD482901" />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="password">Password <Required /></Label>
              <PasswordInput id="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => { setPassword(e.target.value); clearError("password"); }} required aria-required="true" aria-invalid={Boolean(errors.password)} minLength={mode === "signup" ? 8 : undefined} placeholder="••••••••" />
              <FieldError message={errors.password} />
              {mode === "signup" && <PasswordStrengthMeter password={password} />}
            </div>
            {mode === "signup" && (
              <div>
                <Label htmlFor="confirmPassword">Confirm password <Required /></Label>
                <PasswordInput id="confirmPassword" autoComplete="new-password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); clearError("confirmPassword"); }} required aria-required="true" aria-invalid={Boolean(errors.confirmPassword)} placeholder="••••••••" />
                <FieldError message={errors.confirmPassword} />
                {confirmPassword && !errors.confirmPassword && (
                  <p className={`mt-1.5 text-xs font-semibold animate-in fade-in duration-300 ${confirmPassword === password ? "text-primary" : "text-destructive"}`}>
                    {confirmPassword === password ? "✓ Passwords match" : "Passwords don't match yet"}
                  </p>
                )}
              </div>
            )}
            {mode === "signup" && (
              <div>
                <label htmlFor="acceptTerms" className="flex items-start gap-3 rounded-2xl border border-border bg-secondary/40 p-3 text-sm">
                  <input id="acceptTerms" type="checkbox" required checked={acceptedTerms} onChange={(e) => { setAcceptedTerms(e.target.checked); clearError("acceptedTerms"); }} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
                  <span className="text-muted-foreground">
                    I agree to the <Link to="/terms" target="_blank" className="font-semibold text-primary underline-offset-2 hover:underline">Terms and Conditions</Link> and the <Link to="/privacy" target="_blank" className="font-semibold text-primary underline-offset-2 hover:underline">Privacy Policy</Link>. <Required />
                  </span>
                </label>
                <FieldError message={errors.acceptedTerms} />
              </div>
            )}
            <Button type="submit" className="h-11 w-full rounded-2xl text-base shadow-glow" disabled={busy || (mode === "signup" && !acceptedTerms)}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create my account"}
            </Button>
          </form>
          {mode === "signin" && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Forgot your password?{" "}
              <Link to="/reset-password" className="font-semibold text-primary">Reset it</Link>
            </p>
          )}
          <div className="mt-5"><LegalLinks /></div>
        </div>
      </div>
    </div>
  );
}

function Required() {
  return <span aria-hidden="true" className="text-destructive">*</span>;
}

function FieldError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-destructive">{message}</p>;
}

function CenterCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4">
      <div className="fixed top-4 right-4 z-50"><ThemeToggle /></div>
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm">{children}</div>
    </div>
  );
}
