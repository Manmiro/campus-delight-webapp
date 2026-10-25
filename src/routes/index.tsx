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
import { ThemeToggle } from "@/components/theme-toggle";
import { LegalLinks } from "@/components/legal-page";
import logoImg from "@/assets/logo.jpg";
import heroImg from "@/assets/hero-meal.jpg";

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
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-border/60 bg-card/90 px-3 py-2.5 shadow-soft backdrop-blur sm:flex sm:justify-between sm:px-4">
          <Logo />
          <nav className="hidden items-center gap-1 rounded-full bg-canvas p-1 text-sm font-medium md:flex">
            {[
              { href: "#how", label: "How it works" },
              { href: "#plans", label: "Meal plans" },
              { href: "#pay-later", label: "Pay later" },
              { href: "#outlets", label: "Outlets" },
            ].map((n) => (
              <a key={n.href} href={n.href} className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link to="/auth" search={{}}>Sign in</Link>
            </Button>
            <Button asChild className="rounded-full">
              <Link to="/auth" search={{}}>Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-3 py-6 sm:px-4 sm:py-8">
        {/* Hero banner + demo */}
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="relative min-w-0 overflow-hidden rounded-3xl bg-gradient-brand text-primary-foreground shadow-glow">
            <img src={heroImg} alt="A plate of Nigerian campus meals" className="absolute inset-y-0 right-0 hidden h-full w-1/2 object-cover opacity-90 [mask-image:linear-gradient(to_right,transparent,black_40%)] sm:block" />
            <div className="relative p-6 sm:max-w-[68%] sm:p-10">
              <Badge className="mb-4 max-w-full whitespace-normal bg-golden text-golden-foreground hover:bg-golden">
                <Coins className="mr-1 h-3.5 w-3.5" /> 1 token = ₦1 · 1,000 free tokens on signup
              </Badge>
              <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
                Hot, affordable meals
                <span className="block">right on your campus.</span>
              </h1>
              <p className="mt-4 text-base opacity-90 sm:text-lg">
                Campus Delight connects you to your campus food outlet — subscribe to meal plans,
                pay with your wallet or tokens, refer friends, and even eat now &amp; pay later.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button size="lg" variant="secondary" className="rounded-full transition-transform hover:-translate-y-0.5" asChild>
                  <Link to="/auth" search={{}}>
                    Create free account <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="rounded-full border-primary-foreground/50 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" asChild>
                  <a href="#outlets">Find your outlet</a>
                </Button>
              </div>
            </div>
          </div>
          <div className="flex min-w-0 items-center justify-center rounded-3xl border border-border/60 bg-card p-4 shadow-soft">
            <DemoPhoneCard />
          </div>
        </section>

        {/* KPI cards */}
        <section className="grid grid-cols-3 gap-3 sm:gap-6">
          {[
            { label: "Outlets", value: `${outlets.length}`, icon: MapPin },
            { label: "Meal plans", value: "3", icon: CalendarDays },
            { label: "Daily tiers", value: "B–T", icon: Zap },
          ].map((s) => (
            <div key={s.label} className="flex min-w-0 flex-col gap-2 rounded-3xl border border-border/60 bg-card p-4 shadow-soft sm:flex-row sm:items-center sm:gap-4 sm:p-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary sm:h-12 sm:w-12">
                <s.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground sm:text-sm">{s.label}</p>
                <p className="font-display text-2xl font-bold sm:text-3xl">{s.value}</p>
              </div>
            </div>
          ))}
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-24 rounded-3xl border border-border/60 bg-card p-5 shadow-soft sm:p-8">
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">How Campus Delight works</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 120}>
                <div className="group h-full rounded-2xl bg-canvas p-5 transition-all hover:-translate-y-1 hover:bg-primary hover:text-primary-foreground">
                  <div className="flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-card text-primary shadow-soft">
                      <s.icon className="h-5 w-5" />
                    </span>
                    <span className="font-display text-3xl font-extrabold text-primary/20 group-hover:text-primary-foreground/40">0{i + 1}</span>
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground group-hover:text-primary-foreground/85">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Plans + Pay later bento */}
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div id="plans" className="min-w-0 scroll-mt-24 rounded-3xl border border-border/60 bg-card p-5 shadow-soft sm:p-8">
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Meal plans for every schedule</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Every outlet sets its own prices — you always see your outlet's rates. Three tiers: BASIC (1 meal/day), STANDARD (2), TURBO (3).
            </p>
            <div className="mt-6 space-y-3">
              {[
                { name: "Weekend", days: "Fridays, Saturdays & Sundays only" },
                { name: "Weekly", days: "Seven days of service" },
                { name: "Monthly", days: "A full calendar month" },
              ].map((p, i) => (
                <Reveal key={p.name} delay={i * 120}>
                  <div className={`flex items-center gap-4 rounded-2xl p-4 transition-all hover:-translate-y-0.5 ${i === 1 ? "bg-primary text-primary-foreground shadow-glow" : "bg-canvas"}`}>
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${i === 1 ? "bg-primary-foreground/15" : "bg-card text-primary"}`}>
                      <CalendarDays className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-display text-lg font-bold">{p.name}</h3>
                      <p className={`text-sm ${i === 1 ? "opacity-85" : "text-muted-foreground"}`}>{p.days}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          <Reveal>
            <div id="pay-later" className="h-full min-w-0 scroll-mt-24 rounded-3xl border border-border/60 bg-card p-5 shadow-soft sm:p-8">
              <Badge className="bg-golden text-golden-foreground hover:bg-golden">Eat Now &amp; Pay Later</Badge>
              <h2 className="mt-3 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Eat today, repay in 7, 14 or 30 days.
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Verified customers get a ₦2,100 starter credit limit. Repay on time and it doubles —
                repay late and it drops by exactly 30%. Your limit, your record, always visible.
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                {["Five-digit OTP verification before your first loan", "Flexible part-payments any time", "₦1 is exactly ₦1 — no rounding games"].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {t}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <PayLaterCalculator />
              </div>
            </div>
          </Reveal>
        </section>

        {/* Outlets */}
        <section id="outlets" className="scroll-mt-24 rounded-3xl border border-border/60 bg-card p-5 shadow-soft sm:p-8">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Campus Delight outlets</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Pick your outlet when you register — your menu, prices and services follow your outlet.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {outlets.map((o) => (
              <div key={o.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-canvas px-4 py-3 transition-all hover:-translate-y-0.5 hover:ring-2 hover:ring-primary">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-card text-primary">
                  <MapPin className="h-4 w-4" />
                </span>
                <div className="min-w-0 break-words">
                  <p className="font-semibold">{o.name}</p>
                  <p className="text-sm text-muted-foreground">{o.location}</p>
                </div>
                <Badge variant="outline" className="bg-card font-mono text-xs">{o.code}</Badge>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <Reveal>
          <section className="relative overflow-hidden rounded-3xl bg-gradient-golden p-8 text-center text-golden-foreground shadow-soft sm:p-12">
            <Users className="mx-auto h-8 w-8 opacity-80" />
            <h2 className="mt-3 font-display text-3xl font-bold">Hungry? Your outlet is ready.</h2>
            <p className="mx-auto mt-2 max-w-lg opacity-90">
              Register in under two minutes and get 1,000 Campus Delight tokens on the house.
            </p>
            <Button size="lg" className="mt-6 rounded-full" asChild>
              <Link to="/auth" search={{}}>
                Join Campus Delight <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </section>
        </Reveal>
      </main>

      <footer className="px-3 pb-6 sm:px-4">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card px-5 py-5 shadow-soft sm:flex-row">
          <Logo size="sm" />
          <LegalLinks />
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Campus Delight Solutions Limited</p>
        </div>
      </footer>
    </div>
  );
}
