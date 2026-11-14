import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardCopy,
  Coins,
  Copy,
  Gift,
  LockKeyhole,
  MessageCircle,
  QrCode,
  ScanLine,
  Send,
  Sparkles,
  Trophy,
  Users,
  Utensils,
} from "lucide-react";
import { toast } from "sonner";
import logoImg from "@/assets/logo.webp.asset.json";
import { profileQuery, referralsQuery } from "@/lib/queries";
import { tokens as fmtTokens, formatDateTime } from "@/lib/format";
import { referralLinkFor, referralQrImageUrl } from "@/lib/referrals";
import { playDelightFeedback, prepareDelightFeedback } from "@/lib/delight-feedback";
import { Button } from "@/components/ui/button";
import { showFoodieError } from "@/lib/foodie-errors";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/_customer/refer")({
  component: ReferPage,
  head: () => ({
    meta: [
      { title: "Refer & Earn — Campus Delight" },
      {
        name: "description",
        content:
          "Share your Campus Delight referral link and track earned and locked token rewards.",
      },
      { property: "og:title", content: "Refer & Earn — Campus Delight" },
      {
        property: "og:description",
        content:
          "Share your Campus Delight referral link and track earned and locked token rewards.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type CopyKind = "link" | "code";

const rankSteps = [
  { label: "Foodie Scout", range: "0–2 friends", threshold: 0, icon: Utensils },
  { label: "Campus Connector", range: "3–9 friends", threshold: 3, icon: Users },
  { label: "Master Foodie Ambassador", range: "10+ friends", threshold: 10, icon: Trophy },
];

function ReferralQrCode({
  value,
  expanded,
  onToggle,
}: {
  value: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const qrImageUrl = referralQrImageUrl(value);
  return (
    <button
      type="button"
      className={`group relative mx-auto block w-fit rounded-[1.5rem] p-3 text-center transition-transform duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-golden md:cursor-default ${expanded ? "scale-110" : "hover:scale-[1.03]"}`}
      onClick={onToggle}
      aria-label="Referral QR code. Tap to enlarge."
      aria-expanded={expanded}
    >
      <span className="absolute inset-0 rounded-[1.5rem] border-2 border-golden/70 bg-[#fffdf2] shadow-[0_12px_30px_-18px_rgba(184,134,11,.9)] dark:bg-[#221f13]" />
      <span className="relative block rounded-xl bg-white p-2 dark:bg-white">
        <img
          src={qrImageUrl}
          decoding="async"
          alt="QR code for the Campus Delight referral link"
          className="block size-40 bg-white sm:size-44"
        />
        <span className="pointer-events-none absolute left-1/2 top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-lg border-2 border-white bg-white p-1 shadow-md sm:size-8">
          <img
            src={logoImg.url}
            decoding="async"
            alt="Campus Delight"
            className="size-full rounded-lg object-cover"
          />
        </span>
      </span>
      <span className="relative mt-2 flex items-center justify-center gap-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#6b520a] dark:text-golden">
        <ScanLine className="size-3.5" /> {expanded ? "Tap to shrink" : "Tap to enlarge"}
      </span>
    </button>
  );
}

function ReferPage() {
  const celebrationSequence = useRef(0);
  const [copied, setCopied] = useState<{ kind: CopyKind; id: number } | null>(null);
  const [qrExpanded, setQrExpanded] = useState(false);
  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: referrals } = useSuspenseQuery(referralsQuery);

  const referralCode = profile.referral_code;
  const referralLink = referralLinkFor(referralCode);
  const whatsappMessage = `Hey! Join Campus Delight with my code to get 2,000 welcome tokens for food at campus delight kitchen: ${referralLink}`;
  const totalFriends = referrals.length;
  const unlocked = referrals.filter((referral) => referral.status === "rewarded");
  const pending = referrals.filter((referral) => referral.status !== "rewarded");
  const currentRank =
    totalFriends >= 10
      ? "Master Foodie Ambassador"
      : totalFriends >= 3
        ? "Campus Connector"
        : "Foodie Scout";

  const copyReferralValue = (value: string, kind: CopyKind, label: string) => {
    prepareDelightFeedback();
    void navigator.clipboard
      .writeText(value)
      .then(() => {
        const celebrationId = celebrationSequence.current + 1;
        celebrationSequence.current = celebrationId;
        setCopied({ kind, id: celebrationId });
        playDelightFeedback("tokens");
        toast.success(`${label} copied`);
        window.setTimeout(
          () => setCopied((current) => (current?.id === celebrationId ? null : current)),
          1900,
        );
      })
      .catch((error) => showFoodieError(error, `Could not copy the ${label.toLowerCase()}`));
  };

  return (
    <div className="space-y-8 pb-10">
      <header className="px-1 pt-1 sm:pt-3">
        <p className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.2em] text-golden">
          <Sparkles className="size-4" /> Ambassador HQ
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Refer &amp; earn good vibes
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Bring your favourite people to the table. Their welcome tokens start the magic, and your
          rewards unlock after their first campus meal.
        </p>
      </header>

      <section
        className="referral-ticket relative overflow-hidden rounded-[2rem] border border-golden/55 p-1.5 shadow-[0_24px_70px_-30px_rgba(120,166,27,.65)]"
        aria-labelledby="ambassador-pass-title"
      >
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-golden/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 size-72 rounded-full bg-primary/20 blur-3xl" />
        {copied && (
          <div
            key={copied.id}
            className="pointer-events-none absolute inset-x-0 -top-4 z-20 flex justify-center"
            role="status"
            aria-live="polite"
          >
            <div className="animate-copy-success relative flex items-center gap-2 rounded-full bg-gradient-brand px-3 py-2 text-primary-foreground shadow-glow">
              <span
                className="absolute -inset-2 rounded-full border border-golden/70 animate-copy-ring"
                aria-hidden="true"
              />
              <span
                className="absolute -left-5 -top-3 animate-copy-token text-xs font-black text-golden"
                aria-hidden="true"
              >
                +100
              </span>
              <span
                className="absolute -right-5 bottom-0 animate-copy-token text-xs font-black text-golden [animation-delay:160ms]"
                aria-hidden="true"
              >
                ✦
              </span>
              <span className="grid size-7 place-items-center overflow-hidden rounded-full bg-primary-foreground shadow-sm">
                <img
                  src={logoImg.url}
                  decoding="async"
                  alt=""
                  className="size-full animate-copy-logo object-cover"
                />
              </span>
              <span className="text-xs font-extrabold tracking-wide">Ready to share!</span>
              <span className="hidden text-xs opacity-80 sm:inline">
                {copied.kind === "link" ? "Link copied" : "Code copied"}
              </span>
              <Sparkles className="size-4 text-golden" aria-hidden="true" />
            </div>
          </div>
        )}

        <div className="relative grid gap-0 rounded-[1.65rem] bg-gradient-to-br from-[#fff9dd] via-card to-[#eef7dc] px-5 py-6 text-foreground dark:from-[#3c351c] dark:via-card dark:to-[#243718] sm:px-8 sm:py-8 md:grid-cols-[minmax(0,1.25fr)_minmax(240px,.75fr)] md:gap-7">
          <div className="min-w-0 pb-7 md:pb-0 md:pr-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-golden/40 bg-golden/15 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-[#6b520a] dark:text-golden">
                <Gift className="size-4" /> VIP invite ticket
              </span>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                CD · AMBASSADOR
              </span>
            </div>
            <h2
              id="ambassador-pass-title"
              className="mt-6 max-w-lg font-display text-2xl font-bold tracking-tight sm:text-3xl"
            >
              Your golden pass to a bigger food crew.
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Share your personal code anywhere your campus crew hangs out. One tap makes it ready
              to send.
            </p>

            <button
              type="button"
              onClick={() => copyReferralValue(referralCode, "code", "Referral code")}
              className={`ambassador-code group mt-6 flex w-full max-w-md items-center justify-between gap-4 rounded-2xl border border-golden/55 bg-[#fffdf2] px-4 py-4 text-left shadow-[inset_0_2px_0_rgba(255,255,255,.9),0_12px_20px_-16px_rgba(69,61,17,.9)] transition-transform hover:-rotate-1 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:bg-[#1f2815] ${copied?.kind === "code" ? "animate-copy-button" : ""}`}
              aria-label="Copy referral code"
            >
              <span>
                <span className="block text-[10px] font-extrabold uppercase tracking-[0.22em] text-golden">
                  Your 8-character code
                </span>
                <span className="mt-1 block font-mono text-3xl font-black tracking-[0.16em] text-[#26370e] dark:text-[#f7f0c5] sm:text-4xl">
                  {referralCode}
                </span>
              </span>
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-golden/15 text-golden transition-colors group-hover:bg-golden group-hover:text-golden-foreground">
                {copied?.kind === "code" ? <Check className="animate-pop-in" /> : <Copy />}
              </span>
            </button>
            <p className="mt-2 text-xs font-semibold text-muted-foreground">
              Tap the badge to copy your ambassador code.
            </p>

            <div className="mt-5 md:hidden">
              <ReferralQrCode
                value={referralLink}
                expanded={qrExpanded}
                onToggle={() => setQrExpanded((current) => !current)}
              />
              <p className="mt-3 text-center font-display text-sm font-bold text-[#6b520a] dark:text-golden">
                Scan to get 2000 tokens
              </p>
            </div>

            <div className="mt-5 flex min-w-0 items-center gap-2 rounded-xl border border-golden/25 bg-card/55 p-2">
              <span className="min-w-0 flex-1 truncate px-2 font-mono text-xs text-muted-foreground">
                {referralLink}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 rounded-lg border-golden/35 bg-card/70"
                onClick={() => copyReferralValue(referralLink, "link", "Referral link")}
              >
                {copied?.kind === "link" ? (
                  <>
                    <Check /> Copied
                  </>
                ) : (
                  <>
                    <ClipboardCopy /> Copy link
                  </>
                )}
              </Button>
            </div>

            <Button
              asChild
              className="mt-4 h-12 w-full max-w-md rounded-xl bg-[#168c4b] text-white shadow-[0_12px_24px_-14px_#168c4b] hover:bg-[#11783e]"
            >
              <a
                href={`https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="size-5" /> Share on WhatsApp{" "}
                <Send className="ml-auto size-4" />
              </a>
            </Button>
            <p className="mt-2 text-center text-[11px] font-semibold text-muted-foreground sm:text-left">
              “Hey! Join Campus Delight…” is pre-filled for your crew.
            </p>
          </div>

          <div className="relative hidden flex-col items-center justify-center border-t border-dashed border-golden/55 pt-7 md:flex md:border-l md:border-t-0 md:pl-7 md:pt-0">
            <p className="mb-3 flex items-center gap-2 text-sm font-extrabold text-[#6b520a] dark:text-golden">
              <QrCode className="size-5" /> Scan the pass
            </p>
            <ReferralQrCode
              value={referralLink}
              expanded={qrExpanded}
              onToggle={() => setQrExpanded((current) => !current)}
            />
            <p className="mt-3 text-center font-display text-sm font-bold text-[#6b520a] dark:text-golden">
              Scan to get 2000 tokens
            </p>
            <p className="mt-1 max-w-[220px] text-center text-xs leading-relaxed text-muted-foreground">
              A larger target for low-light hostel or cafeteria scans.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="milestones-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-golden">
              Level up together
            </p>
            <h2 id="milestones-title" className="mt-1 font-display text-2xl font-bold">
              Ambassador milestones
            </h2>
          </div>
          <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-extrabold text-secondary-foreground">
            {currentRank}
          </span>
        </div>
        <Card className="overflow-hidden border-golden/25 shadow-soft">
          <CardContent className="p-5 sm:p-6">
            <div className="relative grid gap-5 sm:grid-cols-3 sm:gap-3">
              <div
                className="absolute left-[16%] right-[16%] top-7 hidden h-1 rounded-full bg-gradient-to-r from-primary via-golden to-primary/20 sm:block"
                aria-hidden="true"
              />
              {rankSteps.map((rank) => {
                const Icon = rank.icon;
                const reached = totalFriends >= rank.threshold;
                return (
                  <div
                    key={rank.label}
                    className={`relative flex items-center gap-3 sm:flex-col sm:text-center ${reached ? "" : "opacity-55"}`}
                  >
                    <span
                      className={`grid size-14 shrink-0 place-items-center rounded-2xl border-2 ${reached ? "border-golden bg-golden text-golden-foreground shadow-[0_0_0_5px_rgba(184,134,11,.12)]" : "border-border bg-muted text-muted-foreground"}`}
                    >
                      <Icon className="size-6" />
                    </span>
                    <span>
                      <span className="block font-display text-sm font-bold">{rank.label}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{rank.range}</span>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-7 grid gap-3 border-t border-border/70 pt-5 sm:grid-cols-3">
              <MiniStat
                icon={<Users />}
                label="Total friends invited"
                value={fmtTokens(totalFriends)}
              />
              <MiniStat
                icon={<Coins />}
                label="Unlocked tokens"
                value={fmtTokens(unlocked.length * 100)}
                tone="green"
                hint="Spendable now"
              />
              <MiniStat
                icon={<LockKeyhole />}
                label="Pending tokens"
                value={fmtTokens(pending.length * 100)}
                tone="gold"
                hint="Unlock after first meal"
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="magic-title" className="space-y-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-golden">
            Three easy moves
          </p>
          <h2 id="magic-title" className="mt-1 font-display text-2xl font-bold">
            How the magic works
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <MagicStep
            number="01"
            icon={<Send />}
            title="Drop your invite"
            body="Share your link or code on WhatsApp, group chats, or DMs."
          />
          <MagicStep
            number="02"
            icon={<Gift />}
            title="They get 2,000 tokens"
            body="Your friend signs up and immediately scores their welcome pack."
          />
          <MagicStep
            number="03"
            icon={<Coins />}
            title="You get 100 tokens"
            body="Their first campus meal unlocks your reward into spendable tokens."
          />
        </div>
      </section>

      <section aria-labelledby="quest-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-golden">
              Your crew, in motion
            </p>
            <h2 id="quest-title" className="mt-1 font-display text-2xl font-bold">
              Friend quest tracker
            </h2>
          </div>
          {totalFriends > 0 && (
            <span className="text-sm font-semibold text-muted-foreground">
              {totalFriends} quest{totalFriends === 1 ? "" : "s"} started
            </span>
          )}
        </div>
        <Card>
          <CardContent className="p-0">
            {referrals.length === 0 ? (
              <div className="relative overflow-hidden px-5 py-12 text-center sm:py-16">
                <div className="pointer-events-none absolute left-1/2 top-8 size-24 -translate-x-1/2 rounded-full bg-golden/20 blur-2xl" />
                <div className="relative mx-auto grid size-16 animate-float place-items-center rounded-3xl bg-gradient-golden text-golden-foreground shadow-soft">
                  <Gift className="size-8" />
                </div>
                <h3 className="relative mt-5 font-display text-lg font-bold">
                  Your first quest is waiting
                </h3>
                <p className="relative mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Send an invite and watch your first friend unlock their welcome tokens.
                </p>
                <Button
                  className="relative mt-5 rounded-xl"
                  onClick={() => copyReferralValue(referralLink, "link", "Referral link")}
                >
                  <Copy /> Send your first invite
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/70">
                {referrals.map((referral) => {
                  const isRewarded = referral.status === "rewarded";
                  return (
                    <div
                      key={referral.id}
                      className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={`grid size-10 shrink-0 place-items-center rounded-2xl ${isRewarded ? "bg-secondary text-primary" : "bg-accent text-golden"}`}
                        >
                          {isRewarded ? (
                            <Check className="size-5" />
                          ) : (
                            <CalendarDays className="size-5" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">
                            {referral.referred?.full_name ??
                              referral.referred?.customer_code ??
                              "Campus friend"}
                          </p>
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarDays className="size-3" /> Registered{" "}
                            {formatDateTime(referral.created_at)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold ${isRewarded ? "bg-secondary text-secondary-foreground" : "bg-accent text-accent-foreground"}`}
                      >
                        {isRewarded ? (
                          <Check className="size-3.5" />
                        ) : (
                          <LockKeyhole className="size-3.5" />
                        )}{" "}
                        {isRewarded ? "Reward Unlocked" : "Awaiting First Meal"}
                      </span>
                      <span className="text-left text-sm font-extrabold text-golden sm:text-right">
                        {fmtTokens(referral.locked_tokens || 100)} tokens
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "green" | "gold";
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
      <div
        className={`mb-3 grid size-9 place-items-center rounded-xl ${tone === "green" ? "bg-secondary text-primary" : tone === "gold" ? "bg-accent text-golden" : "bg-card text-muted-foreground"}`}
      >
        {icon}
      </div>
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs font-semibold text-muted-foreground">{label}</p>
      {hint && <p className="mt-2 text-[11px] font-bold text-golden">{hint}</p>}
    </div>
  );
}

function MagicStep({
  number,
  icon,
  title,
  body,
}: {
  number: string;
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card className="relative overflow-hidden border-border/70 shadow-soft">
      <CardContent className="p-5">
        <span className="absolute right-4 top-3 font-display text-5xl font-black text-primary/10">
          {number}
        </span>
        <span className="relative grid size-11 place-items-center rounded-2xl bg-secondary text-primary">
          {icon}
        </span>
        <h3 className="relative mt-5 font-display font-bold">{title}</h3>
        <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
        <ArrowRight className="absolute bottom-5 right-5 size-4 text-golden md:block" />
      </CardContent>
    </Card>
  );
}
