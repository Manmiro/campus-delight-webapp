import { useEffect, useRef, useState } from "react";
import { Check, Coins, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";

const MENU = [
  { name: "Jollof rice & beef", price: 1500 },
  { name: "Fried rice & chicken", price: 1800 },
  { name: "Beans & bread", price: 800 },
];
const START_WALLET = 4200;
const MEALS_PER_DAY = 2;

// Steps: 0 idle, 1 add item0, 2 add item1, 3 confirmed, 4 referral reward, then loop.
const STEP_MS = 1700;
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

export function DemoPhoneCard() {
  const [step, setStep] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % 6), STEP_MS);
    return () => window.clearInterval(id);
  }, []);

  const added = Math.min(Math.max(step - 0, 0), 2); // items 0 and 1
  const mealsLeft = MEALS_PER_DAY - added;
  const wallet = START_WALLET - MENU.slice(0, added).reduce((a, m) => a + m.price, 0);
  const tokens = step >= 4 ? 1100 : 1000;

  function onMove(e: React.MouseEvent) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setTilt({
      x: ((e.clientY - r.top) / r.height - 0.5) * -14,
      y: ((e.clientX - r.left) / r.width - 0.5) * 14,
    });
  }

  return (
    <div className="relative mx-auto w-full max-w-sm [perspective:1000px]">
      <div className="animate-float">
        <div
          ref={ref}
          onMouseMove={onMove}
          onMouseLeave={() => setTilt({ x: 0, y: 0 })}
          style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) rotate(2deg)` }}
          className="relative rounded-[2rem] border border-border bg-card p-5 shadow-glow transition-transform duration-200 ease-out [transform-style:preserve-3d]"
        >
          <div className="rounded-3xl bg-gradient-brand p-5 text-primary-foreground">
            <p className="text-sm opacity-80">Good day, Ada 👋</p>
            <p className="font-display text-2xl font-bold">Ebonyi State University Outlet</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-primary-foreground/15 p-3">
                <p className="text-xs opacity-80">Wallet</p>
                <p key={wallet} className="animate-pop-in font-display text-xl font-bold">{naira(wallet)}</p>
              </div>
              <div className="rounded-2xl bg-primary-foreground/15 p-3">
                <p className="text-xs opacity-80">Tokens</p>
                <p key={tokens} className="animate-pop-in font-display text-xl font-bold">{tokens.toLocaleString("en-NG")}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {MENU.map((m, i) => {
              const isAdded = i < added;
              return (
                <div
                  key={m.name}
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition-all duration-300",
                    isAdded ? "scale-[1.02] border-primary bg-secondary" : "border-border",
                  )}
                >
                  <span>{m.name} · {naira(m.price)}</span>
                  <span
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold transition-colors",
                      isAdded ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    {isAdded ? <><Check className="h-3 w-3" /> Added</> : "+ Add"}
                  </span>
                </div>
              );
            })}
            <div className="flex items-center justify-between rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground">
              <span>Meals left today</span>
              <span key={mealsLeft} className="animate-pop-in">{mealsLeft} of {MEALS_PER_DAY}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Popping badges */}
      {step === 3 && (
        <div className="animate-badge-pop absolute -left-4 top-1/3 z-10 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-lg">
          <PartyPopper className="h-4 w-4" /> Order confirmed!
        </div>
      )}
      {step === 4 && (
        <div className="animate-badge-pop absolute -right-3 top-6 z-10 flex items-center gap-1.5 rounded-full bg-golden px-3 py-1.5 text-sm font-bold text-golden-foreground shadow-lg">
          <Coins className="h-4 w-4" /> +100 tokens · friend joined
        </div>
      )}
    </div>
  );
}
