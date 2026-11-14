import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const DURATION_MS = 1800;

/** Where the countdown starts for a given live total (always above it). */
export function countdownStart(target: number) {
  return target <= 0 ? 0 : Math.max(target * 4, target + 30);
}

/**
 * Animated countdown that rolls from a higher number down to the live
 * outlet total once it scrolls into view, then lands with a golden pop.
 * The final number is always the live `value` passed in.
 */
export function OutletCountdown({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const [landed, setLanded] = useState(false);
  const played = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || value <= 0) {
      setShown(value);
      return;
    }
    if (played.current) {
      setShown(value);
      return;
    }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      played.current = true;
      setShown(value);
      setLanded(true);
      return;
    }

    const start = countdownStart(value);
    setShown(start);
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        played.current = true;
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / DURATION_MS);
          const eased = 1 - Math.pow(1 - p, 4); // slows down near the end
          setShown(Math.round(start - (start - value) * eased));
          if (p < 1) raf = requestAnimationFrame(tick);
          else setLanded(true);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  const digits = String(shown).split("");

  return (
    <span ref={ref} className={cn("relative inline-flex items-center", className)} aria-label={`${value}`}>
      <span aria-hidden className={cn("inline-flex tabular-nums", landed && "cd-count-land")}>
        {digits.map((d, i) => (
          <span key={`${digits.length - i}-${d}`} className="cd-count-digit inline-block">
            {d}
          </span>
        ))}
      </span>
      {landed && (
        <>
          <span aria-hidden className="cd-count-ring pointer-events-none absolute inset-0 -m-2 rounded-full border-2 border-golden" />
          <span aria-hidden className="ml-1.5 inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-golden" />
        </>
      )}
    </span>
  );
}
