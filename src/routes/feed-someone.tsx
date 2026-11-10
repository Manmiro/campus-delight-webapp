import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Gift,
  Heart,
  Loader2,
  MapPin,
  ShieldCheck,
  Utensils,
  Wallet,
} from "lucide-react";
import { z } from "zod";
import { lookupGiftRecipient, initializeGift, verifyGift } from "@/lib/gifting.functions";
import {
  giftInputSchema,
  giftReferenceSchema,
  giftStatusText,
  type GiftRecipient,
} from "@/lib/gifting-rules";
import { defaultAvatarFor } from "@/lib/avatar";
import { naira } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TurnstileWidget } from "@/components/turnstile-widget";
import type { TurnstileFailure } from "@/lib/turnstile";
import { LegalLinks } from "@/components/legal-page";
import logo from "@/assets/logo.webp.asset.json";

export const Route = createFileRoute("/feed-someone")({
  validateSearch: (search: Record<string, unknown>) =>
    z.object({ reference: giftReferenceSchema.optional().catch(undefined) }).parse(search),
  head: () => ({
    meta: [
      { title: "Feed someone — Campus Delight" },
      {
        name: "description",
        content:
          "Send a student a meal, a food plan or wallet funding. A little love goes a long way. No account needed.",
      },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: FeedSomeone,
});

const steps = ["Find your person", "Choose their gift", "Send some love", "Gift status"];
const choices = [
  {
    kind: "wallet",
    icon: Wallet,
    title: "Fund their wallet",
    body: "A little freedom to choose their favourites.",
  },
  {
    kind: "plan",
    icon: CalendarDays,
    title: "Give a food plan",
    body: "Keep them nourished, one day at a time.",
  },
  {
    kind: "meal",
    icon: Utensils,
    title: "Send a surprise meal",
    body: "Something delicious, straight from their kitchen.",
  },
] as const;
const selectClass = "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm";
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";

function FeedSomeone() {
  const { reference } = Route.useSearch();
  const lookup = useServerFn(lookupGiftRecipient);
  const checkout = useServerFn(initializeGift);
  const verify = useServerFn(verifyGift);
  const [step, setStep] = useState(1);
  const [foodieId, setFoodieId] = useState("");
  const [recipient, setRecipient] = useState<GiftRecipient | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState("");
  const [reset, setReset] = useState(0);
  const attempted = useRef("");
  const [kind, setKind] = useState<"wallet" | "plan" | "meal">("wallet");
  const [amount, setAmount] = useState("5000");
  const [plan, setPlan] = useState<"weekend" | "weekly" | "monthly">("weekly");
  const [tier, setTier] = useState<"basic" | "standard" | "turbo">("standard");
  const [menuItemId, setMenuItemId] = useState("");
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [address, setAddress] = useState("");
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorEmail, setSponsorEmail] = useState("");
  const [note, setNote] = useState("");
  const [paying, setPaying] = useState(false);
  const handleSecurityToken = useCallback((token: string | null) => {
    setCaptchaToken(token);
    if (token) setSecurityError("");
  }, []);
  const handleSecurityError = useCallback((failure: TurnstileFailure) => {
    setCaptchaToken(null);
    setSecurityError(failure.message);
  }, []);

  useEffect(() => {
    if (
      reference ||
      step !== 1 ||
      !/^CD\d{6}$/.test(foodieId) ||
      !captchaToken ||
      attempted.current === foodieId
    )
      return;
    let cancelled = false;
    const timer = setTimeout(() => {
      attempted.current = foodieId;
      setChecking(true);
      setError("");
      void lookup({ data: { foodieId, captchaToken } })
        .then((result) => {
          if (cancelled) return;
          setRecipient(result);
          if (!result)
            setError(
              "We couldn’t find an active student with that Foodie ID. Check the ID with them and try again.",
            );
        })
        .catch((e) => {
          if (!cancelled) setError(errorText(e));
        })
        .finally(() => {
          if (!cancelled) setChecking(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [foodieId, captchaToken, step, reference, lookup]);

  const receipt = useQuery({
    queryKey: ["gift-receipt", reference],
    enabled: !!reference,
    queryFn: () => verify({ data: { reference: reference! } }),
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      query.state.data?.applied || query.state.dataUpdateCount >= 12 || query.state.error
        ? false
        : 5000,
  });
  const selectedPrice = recipient?.prices.find((p) => p.plan === plan && p.tier === tier);
  const selectedMeal = recipient?.menu.find((m) => m.id === menuItemId);
  const total =
    kind === "wallet"
      ? Math.round(Number(amount) * 100)
      : kind === "plan"
        ? (selectedPrice?.price_kobo ?? 0)
        : (selectedMeal?.price_kobo ?? 0) +
          (fulfillment === "delivery" ? (recipient?.outlet.deliveryFeeKobo ?? 0) : 0);
  const validGift =
    Number.isSafeInteger(total) &&
    total >= 10000 &&
    total <= 100000000 &&
    (kind !== "meal" || !!selectedMeal) &&
    (kind !== "meal" || fulfillment !== "delivery" || address.trim().length >= 5);
  function changeStep(next: number) {
    setStep(next);
    setError("");
    setSecurityError("");
    setCaptchaToken(null);
    setReset((r) => r + 1);
  }
  function retryLookup() {
    attempted.current = "";
    setCaptchaToken(null);
    setReset((r) => r + 1);
    setChecking(false);
    setError("");
    setSecurityError("");
  }
  async function pay() {
    if (!recipient || !captchaToken || paying) return;
    setError("");
    const parsed = giftInputSchema.safeParse({
      foodieId,
      outletId: recipient.outlet.id,
      kind,
      expectedAmountKobo: total,
      plan,
      tier,
      ...(menuItemId ? { menuItemId } : {}),
      fulfillment,
      address,
      sponsorName,
      sponsorEmail,
      note,
      origin: window.location.origin,
      captchaToken,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your gift details");
      return;
    }
    setPaying(true);
    try {
      const result = await checkout({ data: parsed.data });
      window.location.assign(result.authorizationUrl);
    } catch (e) {
      setError(errorText(e));
      setCaptchaToken(null);
      setReset((r) => r + 1);
      setPaying(false);
    }
  }
  const displayStep = reference ? 4 : step;
  return (
    <div className="min-h-screen bg-canvas text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2 font-display text-sm font-bold sm:text-lg"
        >
          <img
            src={logo.url}
            width={40}
            height={40}
            alt=""
            className="rounded-full"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          Campus Delight
        </Link>
        <Link
          to="/"
          className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground sm:text-sm"
        >
          <ArrowLeft size={15} /> Back home
        </Link>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
        <div className="mx-auto max-w-2xl py-7 text-center sm:py-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-golden/15 px-4 py-2 text-sm font-semibold">
            <Heart className="h-4 w-4 text-golden" /> A little love. A full plate.
          </span>
          <h1 className="mt-5 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Feed someone.
            <br />
            <span className="text-primary">Make their day.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
            From home, across town, or across the world. Send a student a meal, a food plan, or a
            little extra in their wallet. No account needed.
          </p>
        </div>
        <ol aria-label="Gift progress" className="mx-auto mb-8 grid max-w-3xl grid-cols-4 gap-2">
          {steps.map((label, i) => (
            <li
              key={label}
              aria-current={displayStep === i + 1 ? "step" : undefined}
              className="text-center"
            >
              <span
                className={`mx-auto mb-2 grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${displayStep >= i + 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                {displayStep > i + 1 ? <CheckCircle2 size={18} /> : i + 1}
              </span>
              <span
                className={`text-[10px] sm:text-xs ${displayStep === i + 1 ? "font-bold" : "text-muted-foreground"}`}
              >
                {label}
              </span>
            </li>
          ))}
        </ol>
        {reference ? (
          <section
            className="mx-auto max-w-2xl rounded-3xl border bg-card p-6 text-center shadow-soft sm:p-10"
            aria-live="polite"
          >
            {receipt.data?.applied ? (
              <>
                <Gift className="mx-auto h-12 w-12 text-primary" />
                <h2 className="mt-4 font-display text-2xl font-bold">
                  You just made someone’s day.
                </h2>
                <p className="mt-3 text-muted-foreground">
                  {giftStatusText(receipt.data.kind ?? "", receipt.data.walletFallback)}
                </p>
                <p className="mt-3 text-sm">
                  {receipt.data.emailStatus === "unavailable"
                    ? "Your gift is settled. Confirmation emails are delayed; you can check again to retry delivery."
                    : "Confirmation emails have been processed for you and the student."}
                </p>
              </>
            ) : (
              <>
                <Loader2
                  className={`mx-auto h-10 w-10 text-golden ${receipt.isFetching ? "animate-spin" : ""}`}
                />
                <h2 className="mt-4 font-display text-2xl font-bold">
                  {receipt.isFetching ? "Checking your gift…" : "Your gift is not confirmed yet"}
                </h2>
                <p className="mt-3 text-muted-foreground">
                  {receipt.error
                    ? errorText(receipt.error)
                    : "We’ll confirm your payment with Paystack before delivering your gift. If you have been charged, keep this reference and check again."}
                </p>
              </>
            )}
            <p className="mt-6 break-all rounded-xl bg-canvas p-3 font-mono text-xs">{reference}</p>
            {(!receipt.data?.applied || receipt.data.emailStatus === "unavailable") && (
              <Button
                className="mt-5"
                disabled={receipt.isFetching}
                onClick={() => void receipt.refetch()}
              >
                Check again
              </Button>
            )}
            {receipt.data?.applied && (
              <Button asChild variant="outline" className="mt-5">
                <Link to="/feed-someone" search={{}}>
                  Send another gift
                </Link>
              </Button>
            )}
          </section>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="min-w-0 rounded-3xl border bg-card p-5 shadow-soft sm:p-8">
              {step === 1 && (
                <>
                  <h2 className="font-display text-2xl font-bold">Who are we feeding?</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Ask them for their Foodie ID. We’ll help you check it’s the right person.
                  </p>
                  <Label htmlFor="foodie-id" className="mt-6 block">
                    Student’s Foodie ID
                  </Label>
                  <Input
                    id="foodie-id"
                    value={foodieId}
                    maxLength={8}
                    autoComplete="off"
                    placeholder="CD050619"
                    className="mt-2 h-14 font-mono text-xl uppercase tracking-widest"
                    onChange={(e) => {
                      setFoodieId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                      setRecipient(null);
                      setChecking(false);
                      setError("");
                      // A token is single-use after lookup, but typing before
                      // lookup must not restart Cloudflare on every keystroke.
                      if (attempted.current) {
                        setCaptchaToken(null);
                        setReset((r) => r + 1);
                      }
                      attempted.current = "";
                    }}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    8 characters · starts with CD
                  </p>
                  <div className="mt-5">
                    <TurnstileWidget
                      key="lookup"
                      action="gift"
                      resetSignal={reset}
                      onToken={handleSecurityToken}
                      onError={handleSecurityError}
                    />
                  </div>
                  <div aria-live="polite">
                    {checking && (
                      <p className="mt-4 flex items-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Finding your person…
                      </p>
                    )}
                    {recipient && (
                      <div className="mt-5 flex items-center gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
                        <img
                          src={recipient.avatarUrl ?? defaultAvatarFor(recipient.gender)}
                          onError={(e) => {
                            const fallback = defaultAvatarFor(recipient.gender);
                            if (e.currentTarget.src === fallback)
                              e.currentTarget.style.visibility = "hidden";
                            else e.currentTarget.src = fallback;
                          }}
                          alt="Student avatar"
                          width={64}
                          height={64}
                          className="h-16 w-16 shrink-0 rounded-full object-cover"
                        />
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-lg font-bold">
                            {recipient.name}
                            <BadgeCheck size={20} className="shrink-0 text-primary" />
                          </p>
                          <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                            <MapPin size={14} className="shrink-0" />
                            {recipient.outlet.name}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  {error && (
                    <Button variant="ghost" onClick={retryLookup} className="mt-2">
                      Try verification again
                    </Button>
                  )}
                  <Button
                    className="mt-6 w-full rounded-xl"
                    size="lg"
                    disabled={!recipient || checking}
                    onClick={() => changeStep(2)}
                  >
                    Yes, that’s my person <ArrowRight size={16} />
                  </Button>
                </>
              )}
              {step === 2 && (
                <>
                  <h2 className="font-display text-2xl font-bold">
                    How would you like to feed {recipient?.name}?
                  </h2>
                  <div className="mt-6 grid gap-3" role="group" aria-label="Gift type">
                    {choices.map((c) => (
                      <button
                        key={c.kind}
                        type="button"
                        aria-pressed={kind === c.kind}
                        onClick={() => {
                          setKind(c.kind);
                          setError("");
                        }}
                        className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition-colors ${kind === c.kind ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-canvas"}`}
                      >
                        <span className="rounded-xl bg-golden/15 p-3 text-golden">
                          <c.icon size={22} />
                        </span>
                        <span>
                          <span className="block font-semibold">{c.title}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">{c.body}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  {kind === "wallet" && (
                    <div className="mt-6">
                      <Label htmlFor="gift-amount">Wallet funding amount (₦)</Label>
                      <div className="my-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[2000, 5000, 10000, 20000].map((n) => (
                          <Button
                            key={n}
                            variant={Number(amount) === n ? "default" : "outline"}
                            onClick={() => setAmount(String(n))}
                          >
                            {naira(n * 100)}
                          </Button>
                        ))}
                      </div>
                      <Input
                        id="gift-amount"
                        type="number"
                        min="100"
                        max="1000000"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                        Choose an amount from ₦100 to ₦1,000,000. Existing Pay Later repayments may
                        be deducted automatically.
                      </p>
                    </div>
                  )}
                  {kind === "plan" && (
                    <div className="mt-6 space-y-4">
                      <div>
                        <Label htmlFor="gift-plan">Food plan</Label>
                        <select
                          id="gift-plan"
                          value={plan}
                          onChange={(e) => setPlan(e.target.value as typeof plan)}
                          className={`${selectClass} mt-2`}
                        >
                          <option value="weekend">Weekend · next Friday–Sunday</option>
                          <option value="weekly">Weekly · 7 days from payment</option>
                          <option value="monthly">Monthly · today to calendar month end</option>
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="gift-tier">Meals per day</Label>
                        <select
                          id="gift-tier"
                          value={tier}
                          onChange={(e) => setTier(e.target.value as typeof tier)}
                          className={`${selectClass} mt-2`}
                        >
                          <option value="basic">Basic · 1 meal a day</option>
                          <option value="standard">Standard · 2 meals a day</option>
                          <option value="turbo">Turbo · 3 meals a day</option>
                        </select>
                      </div>
                      <p className="text-sm font-semibold">
                        {selectedPrice
                          ? `${naira(selectedPrice.price_kobo)} · live outlet price`
                          : "This plan and tier are not currently available at their outlet."}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Service dates are set when payment completes. Monthly plans cover the
                        remaining calendar month at the displayed price. Delivery for subscription
                        meals is charged separately to the student’s wallet.
                      </p>
                    </div>
                  )}
                  {kind === "meal" && (
                    <div className="mt-6 space-y-4">
                      <Label htmlFor="gift-meal">Fresh from their campus kitchen</Label>
                      {!recipient?.menu.length ? (
                        <p className="text-sm text-muted-foreground">
                          No meals are available right now. You can still fund their wallet or give
                          a food plan.
                        </p>
                      ) : (
                        <select
                          id="gift-meal"
                          value={menuItemId}
                          onChange={(e) => setMenuItemId(e.target.value)}
                          className={selectClass}
                        >
                          <option value="">Choose a surprise meal</option>
                          {recipient.menu.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} · {naira(m.price_kobo)}
                            </option>
                          ))}
                        </select>
                      )}
                      {selectedMeal?.description && (
                        <p className="text-sm text-muted-foreground">{selectedMeal.description}</p>
                      )}
                      <div>
                        <Label htmlFor="gift-fulfillment">How should they receive it?</Label>
                        <select
                          id="gift-fulfillment"
                          value={fulfillment}
                          onChange={(e) => setFulfillment(e.target.value as typeof fulfillment)}
                          className={`${selectClass} mt-2`}
                        >
                          <option value="pickup">Pickup at their campus outlet · free</option>
                          <option value="delivery">
                            Campus delivery · {naira(recipient?.outlet.deliveryFeeKobo)}
                          </option>
                        </select>
                      </div>
                      {fulfillment === "delivery" && (
                        <div>
                          <Label htmlFor="gift-address">Campus delivery address</Label>
                          <Textarea
                            id="gift-address"
                            value={address}
                            maxLength={500}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="Hostel, block, room, and a useful landmark"
                            className="mt-2"
                          />
                          <p className="mt-2 text-xs text-muted-foreground">
                            Confirm the address with the student. Delivery is within their outlet’s
                            campus service area.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-7 flex gap-3">
                    <Button variant="outline" onClick={() => changeStep(1)}>
                      Back
                    </Button>
                    <Button className="flex-1" disabled={!validGift} onClick={() => changeStep(3)}>
                      Add your personal touch <ArrowRight size={16} />
                    </Button>
                  </div>
                </>
              )}
              {step === 3 && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void pay();
                  }}
                >
                  <h2 className="font-display text-2xl font-bold">Send it with love.</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    A few words can mean as much as a full plate.
                  </p>
                  <div className="mt-6 space-y-5">
                    <div>
                      <Label htmlFor="sponsor-name">Your name, as they know you</Label>
                      <Input
                        id="sponsor-name"
                        required
                        maxLength={80}
                        autoComplete="name"
                        value={sponsorName}
                        onChange={(e) => setSponsorName(e.target.value)}
                        placeholder="Mum, Uncle David, your biggest fan…"
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label htmlFor="gift-note">
                        A personal note <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <Textarea
                        id="gift-note"
                        maxLength={500}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Good luck with your exams! Make sure you eat well ❤️"
                        className="mt-2 min-h-28"
                      />
                      <p className="mt-1 text-right text-xs text-muted-foreground">
                        {note.length}/500
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="sponsor-email">Your email for the receipt</Label>
                      <Input
                        id="sponsor-email"
                        type="email"
                        autoComplete="email"
                        required
                        maxLength={254}
                        value={sponsorEmail}
                        onChange={(e) => setSponsorEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="mt-2"
                      />
                    </div>
                    <TurnstileWidget
                      key="checkout"
                      action="gift"
                      resetSignal={reset}
                      onToken={handleSecurityToken}
                      onError={handleSecurityError}
                    />
                  </div>
                  <p className="mt-5 text-xs leading-5 text-muted-foreground">
                    You’ll pay securely with Paystack in Naira. If the gift cannot be fulfilled
                    after payment, the full amount will be credited to the student’s wallet. Their
                    existing account and repayment rules apply.
                  </p>
                  <div className="mt-6 flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={paying}
                      onClick={() => changeStep(2)}
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      size="lg"
                      disabled={!captchaToken || !validGift || paying}
                      className="flex-1 rounded-xl bg-golden text-golden-foreground hover:bg-golden/90"
                    >
                      {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart size={18} />}
                      {paying ? "Opening Paystack…" : `Send gift · ${naira(total)}`}
                    </Button>
                  </div>
                </form>
              )}
              {error && (
                <p role="alert" className="mt-4 text-sm text-destructive">
                  {error}
                </p>
              )}
              {securityError && (
                <div className="mt-4 space-y-3">
                  <p role="alert" className="text-sm text-destructive">
                    {securityError}
                  </p>
                  <Button type="button" variant="outline" disabled={paying} onClick={retryLookup}>
                    Try security check again
                  </Button>
                </div>
              )}
            </section>
            <aside className="min-w-0 space-y-4 lg:sticky lg:top-6">
              <div className="rounded-3xl bg-primary p-6 text-primary-foreground">
                <Gift size={30} className="mb-4" />
                <h2 className="font-display text-xl font-bold">
                  Small gesture.
                  <br />
                  Big difference.
                </h2>
                <p className="mt-3 text-sm leading-6 opacity-90">
                  One less worry. One more reason to smile. You’re helping someone focus on their
                  future, with a full plate today.
                </p>
              </div>
              {recipient && (
                <div className="rounded-3xl border bg-card p-6">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Your gift to {recipient.name}
                  </p>
                  <p className="mt-2 break-words text-sm">{recipient.outlet.name}</p>
                  <p className="mt-4 font-semibold">
                    {choices.find((c) => c.kind === kind)?.title}
                  </p>
                  <p className="mt-2 font-display text-3xl font-bold text-primary">
                    {total > 0 && Number.isFinite(total) ? naira(total) : "Choose your gift"}
                  </p>
                  {kind === "meal" && fulfillment === "delivery" && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Includes {naira(recipient.outlet.deliveryFeeKobo)} delivery
                    </p>
                  )}
                </div>
              )}
              <p className="flex items-start gap-2 px-3 text-xs leading-5 text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Secure Paystack checkout. No account or password needed. Every gift goes to the
                verified Foodie ID.
              </p>
            </aside>
          </div>
        )}
        <footer className="mt-10 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
          <span>Feeding the Future with Honour</span>
          <LegalLinks />
        </footer>
      </main>
    </div>
  );
}
