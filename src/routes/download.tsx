import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Download as DownloadIcon,
  Globe,
  Plus,
  Share2,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/app-shell";
import { isInstalledAppEnvironment } from "@/lib/app-environment";
import { APK_DOWNLOAD_PATH, downloadPercent, foodieDownloadStatus } from "@/lib/mobile-download";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type DownloadState = "idle" | "downloading" | "complete" | "error";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download Campus Delight" },
      {
        name: "description",
        content: "Install Campus Delight on your phone for faster checkouts and 1-tap campus meal ordering.",
      },
    ],
  }),
  component: DownloadPage,
});

function DownloadPage() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    setInstalled(isInstalledAppEnvironment());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const installPwa = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const downloadAndroidApp = async () => {
    setDownloadState("downloading");
    setDownloadProgress(0);
    setDownloadError(null);

    try {
      const response = await fetch(APK_DOWNLOAD_PATH, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`Download failed with status ${response.status}.`);

      const totalBytes = Number(response.headers.get("content-length"));
      const chunks: Uint8Array[] = [];
      let loadedBytes = 0;

      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          chunks.push(value);
          loadedBytes += value.byteLength;
          if (totalBytes > 0) setDownloadProgress(downloadPercent(loadedBytes, totalBytes));
        }
      } else {
        const fallback = new Uint8Array(await response.arrayBuffer());
        chunks.push(fallback);
        loadedBytes = fallback.byteLength;
      }

      const blob = new Blob(chunks as BlobPart[], { type: "application/vnd.android.package-archive" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "campus-delight.apk";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);

      setDownloadProgress(100);
      setDownloadState("complete");
      playCelebratoryPing();
    } catch (error) {
      setDownloadState("error");
      setDownloadError(error instanceof Error ? error.message : "We could not fetch the APK. Please try again.");
    }
  };

  const downloadComplete = downloadState === "complete";
  const downloading = downloadState === "downloading";

  return (
    <div className="min-h-screen bg-canvas">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link to="/" aria-label="Back to Campus Delight home" className="rounded-full p-1 transition-colors hover:bg-card">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Logo />
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/auth" search={{}}>Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 pb-12 pt-6 sm:px-6 sm:pt-10">
        <section className="relative overflow-hidden rounded-[2rem] bg-gradient-brand p-6 text-primary-foreground shadow-glow sm:p-10">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-golden/30 blur-3xl" />
          <div className="relative max-w-2xl">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em]">
              <Sparkles className="h-3.5 w-3.5 text-golden" /> Hotter &amp; faster on mobile
            </p>
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-tight sm:text-6xl">
              Campus Delight, wherever hunger finds you.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 opacity-90 sm:text-lg">
              Get instant food alerts, faster checkouts, and 1-tap ordering right from your home screen.
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3" aria-label="Download options">
          <DownloadOption
            eyebrow="Android"
            title="Google Play"
            description="The official Android app is coming soon."
            icon={<span className="text-2xl" aria-hidden="true">▶</span>}
            disabled
          />
          <DownloadOption
            eyebrow="iPhone"
            title="Apple App Store"
            description="The iOS app is coming soon."
            icon={<span className="text-2xl" aria-hidden="true"></span>}
            disabled
          />
          <Card className="border-golden/50 bg-card shadow-soft">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-golden text-golden-foreground">
                  <DownloadIcon className="h-5 w-5" />
                </span>
                <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground">Android APK</span>
              </div>
              <CardTitle className="pt-2 font-display text-xl">Install directly</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">Install immediately without waiting for store review. The steaming Jollof will track every byte as it arrives.</p>
              <Button onClick={() => void downloadAndroidApp()} disabled={downloading} className="mt-5 w-full rounded-full">
                <DownloadIcon className="mr-2 h-4 w-4" />
                {downloading ? `Downloading ${downloadProgress}%` : downloadComplete ? "Download complete" : downloadState === "error" ? "Try again" : "Download Android App"}
              </Button>
              {downloadError && <p role="alert" className="mt-3 text-sm text-destructive">{downloadError}</p>}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="download-runway-title">
          <div className="cd-download-frosted-card rounded-[2rem] border border-primary/35 bg-primary/10 p-5 shadow-soft backdrop-blur sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-golden">Campus Delight delivery tracker</p>
                <h2 id="download-runway-title" className="mt-1 font-display text-2xl font-extrabold text-foreground sm:text-3xl">Steaming your Jollof to your phone</h2>
              </div>
              <span className="rounded-full bg-card px-3 py-1.5 text-sm font-bold text-primary shadow-soft">{downloadProgress}% ready</span>
            </div>

            <DownloadRunway progress={downloadProgress} complete={downloadComplete} active={downloading} />

            <p aria-live="polite" className="mt-4 text-center font-display text-sm font-bold text-foreground sm:text-base">
              {foodieDownloadStatus(downloadProgress, downloadComplete)}
            </p>

            {downloadComplete && (
              <div className="mt-5 rounded-2xl border border-golden/40 bg-card/85 p-4 text-sm text-foreground shadow-soft">
                <p className="font-display font-bold">🔔 Ping! Your file is saved.</p>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
                  <li>Open your phone&apos;s Downloads folder.</li>
                  <li>Tap <strong className="text-foreground">campus-delight.apk</strong>.</li>
                  <li>Allow installs from this browser if Android asks, then tap Install.</li>
                </ol>
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <Card className="overflow-hidden border-primary/25 bg-card shadow-soft">
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><Globe className="h-5 w-5" /></span>
                <div>
                  <CardTitle className="font-display text-xl">1-tap install from your browser</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Use Campus Delight like an app, with no store account needed.</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {installed ? (
                <div className="flex items-center gap-3 rounded-2xl bg-secondary p-4 text-sm font-semibold text-secondary-foreground">
                  <Check className="h-5 w-5 shrink-0" /> Campus Delight is already installed on this device.
                </div>
              ) : installPrompt ? (
                <Button onClick={() => void installPwa()} className="w-full rounded-full sm:w-auto">
                  <Smartphone className="mr-2 h-4 w-4" /> Install Campus Delight
                </Button>
              ) : (
                <p className="rounded-2xl bg-muted p-4 text-sm leading-6 text-muted-foreground">
                  On Android Chrome, use the browser menu and choose <strong className="text-foreground">Install app</strong> or <strong className="text-foreground">Add to Home screen</strong>. If the install button appears above, it will trigger the native banner directly.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card shadow-soft">
            <CardHeader>
              <CardTitle className="font-display text-xl">iPhone / iPad Safari</CardTitle>
              <p className="text-sm text-muted-foreground">Two quick taps to keep meals one touch away.</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
                <InstallStep icon={<Share2 className="h-5 w-5" />} label="Tap Share" />
                <ArrowLeft className="h-4 w-4 rotate-180 text-golden" />
                <InstallStep icon={<Plus className="h-5 w-5" />} label="Add to Home Screen" />
              </div>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">Open this page in Safari, tap the Share icon, then choose Add to Home Screen.</p>
            </CardContent>
          </Card>
        </section>

        <div className="flex flex-wrap items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <Zap className="h-4 w-4 text-golden" />
          <span>One account. Faster meals on every device.</span>
          <Link to="/" className="font-semibold text-primary hover:underline">Back to campusdelight.net</Link>
        </div>
      </main>
    </div>
  );
}

function DownloadRunway({ progress, complete, active }: { progress: number; complete: boolean; active: boolean }) {
  const percent = Math.max(0, Math.min(100, progress));
  const milestones = [
    { at: 25, emoji: "🥟", label: "Crispy Meat Pie" },
    { at: 50, emoji: "🍗", label: "Peppered Chicken" },
    { at: 75, emoji: "🥤", label: "Chilled Drink" },
  ];

  return (
    <div className="cd-download-runway relative mt-7 h-36 sm:h-40">
      <div className="absolute left-0 right-0 top-9 h-5 rounded-full bg-golden/20 ring-1 ring-golden/30">
        <div className="h-full rounded-full bg-gradient-golden transition-[width] duration-200 ease-out" style={{ width: `${percent}%` }} />
        <div
          className={`cd-jollof-runner absolute top-1/2 ${active ? "cd-jollof-runner-active" : ""} ${complete ? "cd-jollof-runner-complete" : ""}`}
          style={{ left: `${percent}%` }}
          role="img"
          aria-label={`Steaming jollof download progress: ${percent}%`}
        >
          <span className="cd-jollof-steam cd-jollof-steam-one">〰</span>
          <span className="cd-jollof-steam cd-jollof-steam-two">〰</span>
          <span className="cd-jollof-steam cd-jollof-steam-three">〰</span>
          <span className="cd-jollof-bowl">🍛</span>
        </div>
      </div>

      {milestones.map((milestone) => (
        <div key={milestone.at} className="absolute top-16 -translate-x-1/2 text-center" style={{ left: `${milestone.at}%` }}>
          <span className="cd-download-snack grid h-9 w-9 place-items-center rounded-full border border-golden/40 bg-card text-lg shadow-soft" aria-hidden="true">{milestone.emoji}</span>
          <span className="mt-1 block max-w-20 text-[0.65rem] font-semibold leading-3 text-muted-foreground">{milestone.label}</span>
        </div>
      ))}

      <div className={`absolute right-0 top-0 flex translate-x-1/2 flex-col items-center ${complete ? "cd-download-finish-complete" : ""}`}>
        <span className="text-2xl" aria-hidden="true">🏁</span>
        <span className="cd-download-finish-pack text-2xl" role="img" aria-label="Campus Delight delivery pack">📦</span>
        {complete && <span className="cd-download-confetti" aria-hidden="true">✦　✧　✦　✧</span>}
      </div>
    </div>
  );
}

function playCelebratoryPing() {
  try {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    const context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1_110, context.currentTime + 0.16);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.3);
    window.setTimeout(() => void context.close(), 450);
  } catch {
    // A browser may block Web Audio; the visual celebration and live copy remain available.
  }
}

function DownloadOption({
  eyebrow,
  title,
  description,
  icon,
  disabled,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Card className="bg-card shadow-soft">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-muted text-foreground">{icon}</span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">{disabled ? "Coming soon" : "Available"}</span>
        </div>
        <p className="pt-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{eyebrow}</p>
        <CardTitle className="font-display text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        <Button disabled={disabled} variant="outline" className="mt-5 w-full rounded-full">
          {disabled ? "Coming soon" : "Get the app"}
        </Button>
      </CardContent>
    </Card>
  );
}

function InstallStep({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-accent-foreground">{icon}</span>
      <span className="text-xs font-semibold leading-4">{label}</span>
    </div>
  );
}
