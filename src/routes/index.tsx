import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, CalendarDays, Coins, Gift, MapPin, Users, Zap } from "lucide-react";
import { listOutlets } from "@/lib/catalog.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DemoPhoneCard } from "@/components/landing/demo-phone-card";
import { PayLaterCalculator } from "@/components/landing/pay-later-calculator";
import { Reveal } from "@/components/landing/reveal";
import logoImg from "@/assets/logo.jpg";

const outletsQuery = queryOptions({
  queryKey: ["public-outlets"],
  queryFn: () => listOutlets(),
});

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(outletsQuery),
  head: () => ({
    meta: [
      { title: "Campus Delight — Affordable campus meals, subscriptions & rewards" },
      {
        name: "description",
        content:
          "Subscribe to meal plans, pay with your wallet or Campus Delight tokens, refer friends, and eat now & pay later — from your campus outlet.",
      },
      { property: "og:title", content: "Campus Delight — Affordable campus meals" },
      {
        property: "og:description",
        content: "Meal subscriptions, wallets, tokens, referrals and Eat Now & Pay Later — all from your campus outlet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: "https://campus-delight-webapp.lovable.app/og-image.jpg" },
      { name: "twitter:image", content: "https://campus-delight-webapp.lovable.app/og-image.jpg" },
    ],
  }),
  component: Landing,
});

const steps = [
  { icon: BadgeCheck, title: "Create your account", body: "Pick your campus outlet, get your Campus Delight ID, wallet and 1,000 welcome tokens instantly." },
  { icon: CalendarDays, title: "Choose a meal plan", body: "Weekend, Weekly or Monthly — with BASIC, STANDARD or TURBO daily meal entitlements." },
  { icon: UtensilsIcon, title: "Order your food", body: "Pay with your subscription entitlement, wallet cash, or tokens. Never both at once." },
  { icon: Gift, title: "Refer & earn", body: "Invite friends with your referral link and earn 100 tokens when their first order lands." },
];

function UtensilsIcon(props: { className?: string }) {
  return <Zap className={props.className} />;
}

function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <img
        src={logoImg}
        alt="Campus Delight logo"
        className={`shrink-0 rounded-full ${size === "sm" ? "h-8 w-8" : "h-11 w-11"}`}
      />
      <span className={`min-w-0 font-display font-bold ${size === "sm" ? "text-base" : "text-base sm:text-xl"}`}>
        Campus Delight
      </span>
    </span>
  );
}

function Landing() {
  const { data: outlets } = useSuspenseQuery(outletsQuery);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto grid grid-cols-[minmax(0,1fr)_auto] gap-2 max-w-6xl items-center px-4 py-3 sm:flex sm:justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link to="/auth" search={{}}>Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/auth" search={{}}>Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-hero">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2 lg:py-24">
            <div>
              <Badge className="mb-4 max-w-full whitespace-normal bg-secondary text-secondary-foreground hover:bg-secondary">
                <Coins className="mr-1 h-3.5 w-3.5" /> 1 token = ₦1 · 1,000 free tokens on signup
              </Badge>
              <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                Hot, affordable meals
                <span className="block bg-gradient-brand bg-clip-text text-transparent">right on your campus.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground">
                Campus Delight connects you to your campus food outlet — subscribe to meal plans,
                pay with your wallet or tokens, refer friends, and even eat now &amp; pay later.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" className="shadow-glow transition-transform hover:-translate-y-0.5 hover:scale-105" asChild>
                  <Link to="/auth" search={{}}>
                    Create free account <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#outlets">Find your outlet</a>
                </Button>
              </div>
              <dl className="mt-10 grid max-w-md grid-cols-3 gap-4">
                {[
                  { label: "Outlets", value: `${outlets.length}` },
                  { label: "Meal plans", value: "3" },
                  { label: "Daily tiers", value: "B–T" },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
                    <dt className="text-xs text-muted-foreground">{s.label}</dt>
                    <dd className="font-display text-2xl font-bold text-primary">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <DemoPhoneCard />
          </div>
        </section>

        {/* How it works */}
        <section className="border-y border-border bg-secondary/40">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="font-display text-3xl font-bold tracking-tight">How Campus Delight works</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => (
                <Reveal key={s.title} delay={i * 120}>
                <div className="h-full rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:border-primary hover:shadow-glow">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 animate-wiggle place-items-center rounded-xl bg-primary/10 text-primary">
                      <s.icon className="h-5 w-5" />
                    </span>
                    <span className="font-display text-sm font-bold text-muted-foreground">Step {i + 1}</span>
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
                </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Plans */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="font-display text-3xl font-bold tracking-tight">Meal plans for every schedule</h2>
          <p className="mt-2 text-muted-foreground">
            Every outlet sets its own prices — you always see your outlet's rates. Three tiers: BASIC (1 meal/day), STANDARD (2), TURBO (3).
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { name: "Weekend", days: "Fridays, Saturdays & Sundays only", icon: CalendarDays },
              { name: "Weekly", days: "Seven days of service", icon: CalendarDays },
              { name: "Monthly", days: "A full calendar month", icon: CalendarDays },
            ].map((p, i) => (
              <Reveal key={p.name} delay={i * 120}>
              <div className={`h-full rounded-2xl border p-6 transition-all hover:-translate-y-1 hover:shadow-glow ${i === 1 ? "border-primary bg-secondary/30" : "border-border bg-card"}`}>
                <p.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-3 font-display text-xl font-bold">{p.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.days}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Pay later */}
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <Reveal>
          <div className="grid min-w-0 items-center gap-8 rounded-3xl border border-border bg-card p-4 sm:p-8 lg:grid-cols-2">
            <div>
              <Badge className="bg-golden text-golden-foreground hover:bg-golden">Eat Now &amp; Pay Later</Badge>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">
                Eat today, repay in 7, 14 or 30 days.
              </h2>
              <p className="mt-3 text-muted-foreground">
                Verified customers get a ₦2,100 starter credit limit. Repay on time and it doubles —
                repay late and it drops by exactly 30%. Your limit, your record, always visible.
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                {["Five-digit OTP verification before your first loan", "Flexible part-payments any time", "₦1 is exactly ₦1 — no rounding games"].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <BadgeCheck className="mt-0.5 h-4 w-4 text-primary" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <PayLaterCalculator />
          </div>
          </Reveal>
        </section>

        {/* Outlets */}
        <section id="outlets" className="border-t border-border bg-secondary/40">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <h2 className="font-display text-3xl font-bold tracking-tight">Campus Delight outlets</h2>
            </div>
            <p className="mt-2 text-muted-foreground">Pick your outlet when you register — your menu, prices and services follow your outlet.</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {outlets.map((o) => (
                <div key={o.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-primary">
                  <div className="min-w-0 break-words">
                    <p className="font-semibold">{o.name}</p>
                    <p className="text-sm text-muted-foreground">{o.location}</p>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs">{o.code}</Badge>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <Reveal>
          <div className="rounded-3xl bg-gradient-brand p-10 text-center text-primary-foreground shadow-glow">
            <Users className="mx-auto h-8 w-8 opacity-80" />
            <h2 className="mt-3 font-display text-3xl font-bold">Hungry? Your outlet is ready.</h2>
            <p className="mx-auto mt-2 max-w-lg opacity-90">
              Register in under two minutes and get 1,000 Campus Delight tokens on the house.
            </p>
            <Button size="lg" variant="secondary" className="mt-6" asChild>
              <Link to="/auth" search={{}}>
                Join Campus Delight <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row">
          <Logo size="sm" />
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Campus Delight Solutions Limited</p>
        </div>
      </footer>
    </div>
  );
}
