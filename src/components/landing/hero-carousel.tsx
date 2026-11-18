import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coins,
  Gift,
  UtensilsCrossed,
  WalletCards,
  Zap,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import heroImg from "@/assets/hero-meal.webp.asset.json";
import { WELCOME_TOKENS } from "@/lib/prd-rules";

const AUTO_ROTATE_MS = 5500;

const slides = [
  {
    id: "meal-plans",
    label: "Meal Plans",
    badge: "Plan your week",
    badgeIcon: CalendarDays,
    title: (
      <>
        Put your daily meals <span className="block">on autopilot.</span>
      </>
    ),
    description:
      "Weekend, Weekly or Monthly plans with BASIC, STANDARD or TURBO daily meal entitlements. Choose the rhythm that fits campus life.",
    stats: [
      { value: "3", label: "Plan options" },
      { value: "1–3", label: "Meals per day" },
      { value: "₦1", label: "Wallet = ₦1" },
    ],
    primary: "Explore meal plans",
    primaryHref: "/auth",
    secondary: "See how it works",
    secondaryHref: "#plans",
  },
  {
    id: "pay-later",
    label: "Pay Later",
    badge: "New · Eat Now & Pay Later",
    badgeIcon: Zap,
    title: (
      <>
        Hungry now? <span className="block">Eat now, pay later.</span>
      </>
    ),
    description:
      "Order hot campus meals today and repay in 7, 14 or 30 days. Verified students start with a ₦2,100 credit limit — repay on time and it doubles.",
    stats: [
      { value: "₦2,100", label: "Starter limit" },
      { value: "7–30", label: "Days to repay" },
      { value: "2×", label: "Limit on time" },
    ],
    primary: "Start eating on credit",
    primaryHref: "/auth",
    secondary: "See what you'd repay",
    secondaryHref: "#pay-later",
  },
  {
    id: "wallet-order",
    label: "Wallet Order",
    badge: "Fast, flexible checkout",
    badgeIcon: WalletCards,
    title: (
      <>
        Good food, <span className="block">one easy wallet.</span>
      </>
    ),
    description:
      "Top up once, order from your chosen outlet, and keep every meal, token and payment in one simple campus wallet.",
    stats: [
      { value: "₦1", label: "1 token = ₦1" },
      { value: "3", label: "Ways to pay" },
      { value: "24/7", label: "Order access" },
    ],
    primary: "Create your wallet",
    primaryHref: "/auth",
    secondary: "Browse outlets",
    secondaryHref: "#outlets",
  },
] as const;

export function HeroCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setIsReducedMotion(mediaQuery.matches);
    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);
    return () => mediaQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    if (isPaused || isReducedMotion) return;

    const id = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % slides.length);
    }, AUTO_ROTATE_MS);

    return () => window.clearInterval(id);
  }, [isPaused, isReducedMotion]);

  function goToSlide(index: number) {
    setActiveIndex((index + slides.length) % slides.length);
  }

  function goToPrevious() {
    goToSlide(activeIndex - 1);
  }

  function goToNext() {
    goToSlide(activeIndex + 1);
  }

  return (
    <section
      aria-label="Campus Delight highlights"
      aria-roledescription="carousel"
      className="relative min-w-0 overflow-hidden rounded-3xl bg-gradient-brand text-primary-foreground shadow-glow"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onPointerDown={() => setIsPaused(true)}
      onPointerUp={() => setIsPaused(false)}
      onPointerCancel={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsPaused(false);
      }}
    >
      <picture className="absolute inset-y-0 right-0 hidden h-full w-1/2 sm:block">
        <source media="(min-width: 640px)" srcSet={heroImg.url} />
        <img
          width={1200}
          height={640}
          fetchPriority="high"
          decoding="async"
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover opacity-90 [mask-image:linear-gradient(to_right,transparent,black_40%)]"
        />
      </picture>

      <div className="relative min-h-[640px] sm:min-h-[600px]">
        {slides.map((slide, index) => {
          const SlideIcon = slide.badgeIcon;
          const isActive = index === activeIndex;

          return (
            <article
              key={slide.id}
              aria-hidden={!isActive}
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${slides.length}: ${slide.label}`}
              className={`absolute inset-0 flex flex-col p-6 pb-20 transition-[opacity,transform] duration-500 ease-out sm:max-w-[68%] sm:p-10 sm:pb-20 ${
                isActive
                  ? "translate-x-0 opacity-100"
                  : index < activeIndex
                    ? "-translate-x-8 opacity-0"
                    : "translate-x-8 opacity-0"
              } ${isActive ? "visible" : "invisible pointer-events-none"} ${isReducedMotion ? "transition-none" : ""}`}
            >
              <div>
                <Badge className="mb-4 max-w-full whitespace-normal bg-golden text-golden-foreground hover:bg-golden">
                  <SlideIcon className="mr-1 h-3.5 w-3.5" /> {slide.badge}
                </Badge>
                <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
                  {slide.title}
                </h1>
                <p className="mt-4 text-base opacity-90 sm:text-lg">{slide.description}</p>
                <div className="mt-5 grid max-w-md grid-cols-3 gap-2">
                  {slide.stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-2xl bg-primary-foreground/15 px-3 py-2.5 backdrop-blur"
                    >
                      <p className="font-display text-lg font-bold sm:text-xl">{stat.value}</p>
                      <p className="text-xs opacity-85">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-auto pt-7">
                <div className="flex flex-wrap gap-3">
                  <Button
                    size="lg"
                    variant="secondary"
                    className="rounded-full transition-transform hover:-translate-y-0.5"
                    asChild
                  >
                    <Link to={slide.primaryHref} search={{}}>
                      {slide.primary} <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-full border-primary-foreground/50 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                    asChild
                  >
                    <a href={slide.secondaryHref}>{slide.secondary}</a>
                  </Button>
                  {slide.id === "meal-plans" && (
                    <Button
                      size="lg"
                      className="rounded-full bg-golden text-golden-foreground hover:bg-golden/90"
                      asChild
                    >
                      <Link to="/feed-someone">
                        <Gift className="mr-2 h-4 w-4" />
                        Feed someone
                      </Link>
                    </Button>
                  )}
                </div>
                <p className="mt-4 flex items-center gap-1.5 text-xs opacity-85">
                  {slide.id === "wallet-order" ? (
                    <WalletCards className="h-3.5 w-3.5" />
                  ) : slide.id === "meal-plans" ? (
                    <UtensilsCrossed className="h-3.5 w-3.5" />
                  ) : (
                    <Coins className="h-3.5 w-3.5" />
                  )}
                  {slide.id === "wallet-order"
                    ? "Your meals, balance and tokens in one place"
                    : `Plus ${WELCOME_TOKENS.toLocaleString("en-NG")} free tokens on signup · 1 token = ₦1`}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="absolute inset-x-6 bottom-5 flex items-center justify-between gap-4 sm:inset-x-10">
        <div className="flex items-center gap-2" role="tablist" aria-label="Choose a highlight">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-label={`Show ${slide.label}`}
              onClick={() => goToSlide(index)}
              className={`h-2.5 rounded-full transition-[width,background-color,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-golden ${index === activeIndex ? "w-9 bg-golden" : "w-2.5 bg-primary-foreground/55 hover:bg-golden/80"}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous highlight"
            onClick={goToPrevious}
            className="grid h-9 w-9 place-items-center rounded-full bg-primary-foreground/15 text-primary-foreground transition-colors hover:bg-golden hover:text-golden-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-golden"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next highlight"
            onClick={goToNext}
            className="grid h-9 w-9 place-items-center rounded-full bg-primary-foreground/15 text-primary-foreground transition-colors hover:bg-golden hover:text-golden-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-golden"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
