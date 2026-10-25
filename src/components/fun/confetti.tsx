import { useEffect, useState } from "react";

const COLORS = ["var(--primary)", "var(--golden)", "var(--accent)", "var(--primary-foreground)"];

/** Lightweight CSS confetti burst. Change `fire` (e.g. a counter) to trigger. */
export function Confetti({ fire }: { fire: number }) {
  const [pieces, setPieces] = useState<{ id: number; left: number; delay: number; color: string; rot: number }[]>([]);
  useEffect(() => {
    if (!fire) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    setPieces(Array.from({ length: 60 }, (_, i) => ({
      id: fire * 100 + i, left: Math.random() * 100, delay: Math.random() * 0.4,
      color: COLORS[i % COLORS.length] ?? "var(--primary)", rot: Math.random() * 360,
    })));
    const t = setTimeout(() => setPieces([]), 2600);
    return () => clearTimeout(t);
  }, [fire]);
  if (!pieces.length) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {pieces.map((p) => (
        <span key={p.id} className="absolute top-0 h-3 w-2 animate-confetti rounded-sm"
          style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, transform: `rotate(${p.rot}deg)` }} />
      ))}
    </div>
  );
}
