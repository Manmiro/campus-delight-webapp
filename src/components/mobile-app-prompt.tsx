import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Smartphone, Utensils, X, Zap } from "lucide-react";

import {
  isInstalledAppEnvironment,
  MOBILE_APP_DISMISSAL_KEY,
  wasMobileAppPromptDismissed,
} from "@/lib/app-environment";
import { Button } from "@/components/ui/button";

const PROMPT_DELAY_MS = 5_000;

export function MobileAppPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isInstalledAppEnvironment() || wasMobileAppPromptDismissed()) return;

    const timer = window.setTimeout(() => setVisible(true), PROMPT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(MOBILE_APP_DISMISSAL_KEY, String(Date.now()));
    } catch {
      // A blocked browser storage area should not prevent the prompt from closing.
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside
      aria-label="Campus Delight mobile app"
      className="cd-mobile-app-prompt animate-pop-in fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-3xl border border-golden/60 bg-card p-5 shadow-[0_18px_55px_-18px_color-mix(in_oklab,#B8860B_55%,transparent)] sm:inset-x-auto sm:right-6 sm:bottom-6"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close mobile app prompt"
        className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-4 pr-5">
        <div className="animate-float grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-golden text-golden-foreground shadow-glow">
          <span className="relative">
            <Smartphone className="h-7 w-7" />
            <Utensils className="absolute -bottom-1 -right-2 h-4 w-4 rounded-full bg-card p-0.5 text-golden" />
          </span>
        </div>
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-accent-foreground">
            <Zap className="h-3 w-3" /> Hotter &amp; Faster Experience
          </p>
          <h2 className="mt-3 font-display text-xl font-extrabold leading-tight text-foreground">
            Put Campus Delight in Your Pocket!
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Get instant food alerts, faster checkouts, and 1-tap ordering right from your home screen.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button asChild className="w-full rounded-full sm:flex-1">
          <Link to="/download">
            Download Mobile App <span aria-hidden="true" className="ml-1">📱</span>
          </Link>
        </Button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Maybe later
        </button>
      </div>
    </aside>
  );
}
