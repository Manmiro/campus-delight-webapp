import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertCircle, Loader2, LockKeyhole, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput, PasswordStrengthMeter } from "@/components/password-field";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { MIN_PASSWORD_LENGTH, normalizeEmailAddress, validateEmailAddress } from "@/lib/auth-rules";
import { ThemeToggle } from "@/components/theme-toggle";

type ResetStage = "checking" | "request" | "sent" | "ready" | "invalid";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — Campus Delight" },
      { name: "description", content: "Set a new password for your Campus Delight account." },
      { property: "og:title", content: "Reset your password — Campus Delight" },
      {
        property: "og:description",
        content: "Set a new password for your Campus Delight account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<ResetStage>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();

  useEffect(() => {
    let active = true;
    let recoverySessionFound = false;

    // Subscribe before exchanging the PKCE code so PASSWORD_RECOVERY cannot be missed.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || event !== "PASSWORD_RECOVERY") return;
      if (session) {
        recoverySessionFound = true;
        setStage("ready");
      } else {
        setStage("invalid");
      }
    });

    const resolveRecoveryLink = async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const hasLinkError = url.searchParams.has("error") || hash.has("error");
      const code = url.searchParams.get("code");

      if (hasLinkError) {
        if (active) setStage("invalid");
        return;
      }

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;
        setStage(error || !data.session ? "invalid" : "ready");
        return;
      }

      // Keep compatibility with older recovery emails that contain an implicit-flow hash.
      if (hash.get("type") === "recovery") {
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        if (!accessToken || !refreshToken) {
          if (active) setStage("invalid");
          return;
        }
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!active) return;
        setStage(error || !data.session ? "invalid" : "ready");
        return;
      }

      // A recovery event may arrive asynchronously from Supabase's URL/session handling.
      if (active && !recoverySessionFound) setStage("request");
    };

    void resolveRecoveryLink().catch(() => {
      if (!active) return;
      setStage(codeOrHashRecoveryLink() ? "invalid" : "request");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function requestResetLink(e: React.FormEvent) {
    e.preventDefault();
    const error = validateEmailAddress(email);
    if (error) {
      setRequestError(error);
      return;
    }

    setRequestError(undefined);
    setBusy(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        normalizeEmailAddress(email),
        {
          redirectTo: `${window.location.origin}/reset-password`,
        },
      );
      if (resetError) throw resetError;
      setStage("sent");
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Could not send the reset link");
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setPasswordError(undefined);
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // Remove the recovery session before returning to the normal sign-in flow.
      await supabase.auth.signOut();
      toast.success("Password updated. You can sign in with it now.");
      await navigate({ to: "/auth", search: {} });
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-secondary/30 px-4 py-6 sm:py-10">
      <div className="fixed right-4 top-4 z-50">
        <ThemeToggle />
      </div>
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md items-center justify-center">
        {stage === "checking" && <LoadingCard />}
        {stage === "request" && (
          <CenterCard icon={<LockKeyhole className="mx-auto h-10 w-10 text-primary" />}>
            <h1 className="mt-4 font-display text-2xl font-bold">Forgot your password?</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your registered email and we&apos;ll send you a secure reset link.
            </p>
            <form onSubmit={requestResetLink} noValidate className="mt-6 space-y-4 text-left">
              <div>
                <Label htmlFor="reset-email">Email address</Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setRequestError(undefined);
                  }}
                  aria-invalid={Boolean(requestError)}
                  required
                />
                {requestError && (
                  <p role="alert" className="mt-1 text-xs font-medium text-destructive">
                    {requestError}
                  </p>
                )}
              </div>
              <Button type="submit" className="h-11 w-full rounded-2xl" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
            </form>
            <BackToSignIn />
          </CenterCard>
        )}
        {stage === "sent" && (
          <CenterCard icon={<MailCheck className="mx-auto h-10 w-10 text-primary" />}>
            <h1 className="mt-4 font-display text-2xl font-bold">Check your inbox</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Check your inbox. We&apos;ve sent a password reset link to your email.
            </p>
            <Button variant="outline" className="mt-6 w-full" onClick={() => setStage("request")}>
              Request another link
            </Button>
            <BackToSignIn />
          </CenterCard>
        )}
        {stage === "ready" && (
          <CenterCard icon={<LockKeyhole className="mx-auto h-10 w-10 text-primary" />}>
            <h1 className="mt-4 font-display text-2xl font-bold">Set a new password</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose a new password for your Campus Delight account.
            </p>
            <form onSubmit={updatePassword} noValidate className="mt-6 space-y-4 text-left">
              <div>
                <Label htmlFor="new-password">New password</Label>
                <PasswordInput
                  id="new-password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(undefined);
                  }}
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                />
                <PasswordStrengthMeter password={password} />
              </div>
              <div>
                <Label htmlFor="confirm-new-password">Confirm new password</Label>
                <PasswordInput
                  id="confirm-new-password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setPasswordError(undefined);
                  }}
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                />
                {confirmPassword && (
                  <p
                    className={`mt-1.5 text-xs font-semibold ${confirmPassword === password ? "text-primary" : "text-destructive"}`}
                  >
                    {confirmPassword === password
                      ? "✓ Passwords match"
                      : "Passwords don't match yet"}
                  </p>
                )}
              </div>
              {passwordError && (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {passwordError}
                </p>
              )}
              <Button type="submit" className="h-11 w-full rounded-2xl" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Update password
              </Button>
            </form>
          </CenterCard>
        )}
        {stage === "invalid" && (
          <CenterCard icon={<AlertCircle className="mx-auto h-10 w-10 text-destructive" />}>
            <h1 className="mt-4 font-display text-2xl font-bold">This reset link has expired</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The link is invalid or has expired. Request a fresh link and we&apos;ll get you back
              into your account.
            </p>
            <Button className="mt-6 w-full" onClick={() => setStage("request")}>
              Request a fresh link
            </Button>
            <BackToSignIn />
          </CenterCard>
        )}
      </div>
    </div>
  );
}

function codeOrHashRecoveryLink() {
  const url = new URL(window.location.href);
  return Boolean(
    url.searchParams.get("code") ||
    url.searchParams.has("error") ||
    url.hash.includes("type=recovery") ||
    url.hash.includes("error"),
  );
}

function LoadingCard() {
  return (
    <CenterCard icon={<Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />}>
      <p className="mt-4 text-sm text-muted-foreground">Checking your reset link…</p>
    </CenterCard>
  );
}

function BackToSignIn() {
  return (
    <p className="mt-5 text-center text-sm text-muted-foreground">
      <Link to="/auth" search={{ mode: "signin", ref: "" }} className="font-semibold text-primary">
        Back to sign in
      </Link>
    </p>
  );
}

function CenterCard({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="w-full rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
      <div aria-hidden="true">{icon}</div>
      {children}
    </div>
  );
}
