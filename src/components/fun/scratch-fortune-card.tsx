import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Coins, Loader2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DailyPrize = { spin: number; bonus: number };

export function ScratchFortuneCard({
  prize,
  busy,
  disabled,
  error,
  onReveal,
  onPrepare,
}: {
  prize: DailyPrize | null;
  busy: boolean;
  disabled: boolean;
  error: boolean;
  onReveal: () => void;
  onPrepare: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<number | null>(null);
  const previous = useRef<{ x: number; y: number } | null>(null);
  const requested = useRef(false);
  const [started, setStarted] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const gradient = ctx.createLinearGradient(0, 0, 640, 320);
    gradient.addColorStop(0, "#b77c16");
    gradient.addColorStop(0.45, "#ffdf81");
    gradient.addColorStop(1, "#c18c27");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 640, 320);
    ctx.strokeStyle = "#83560c";
    ctx.setLineDash([8, 8]);
    ctx.strokeRect(18, 18, 604, 284);
    ctx.fillStyle = "#55380b";
    ctx.textAlign = "center";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText("YOUR GOLDEN TICKET", 320, 140);
    ctx.font = "23px sans-serif";
    ctx.fillText("Rub here to reveal", 320, 186);
    setCanvasReady(true);
  }, []);

  // A failed server claim can be retried using the accessible reveal button.
  useEffect(() => {
    if (error) requested.current = false;
  }, [error]);

  const reveal = () => {
    if (requested.current || disabled || busy || prize) return;
    requested.current = true;
    onPrepare();
    onReveal();
  };

  const scratch = (event: PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current !== event.pointerId || disabled || busy || prize || requested.current)
      return;
    const element = canvas.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const point = {
      x: ((event.clientX - rect.left) * 640) / rect.width,
      y: ((event.clientY - rect.top) * 320) / rect.height,
    };
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = 64;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(previous.current?.x ?? point.x, previous.current?.y ?? point.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(point.x, point.y, 32, 0, Math.PI * 2);
    ctx.fill();
    previous.current = point;
  };

  const finish = (event: PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current !== event.pointerId) return;
    scratch(event);
    pointer.current = null;
    previous.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || disabled || busy || prize) return;
    const pixels = ctx.getImageData(0, 0, 640, 320).data;
    let clear = 0;
    let samples = 0;
    // Sample actual erased area, so rubbing the same spot never completes a card.
    for (let y = 8; y < 320; y += 16) {
      for (let x = 8; x < 640; x += 16) {
        samples++;
        if ((pixels[(y * 640 + x) * 4 + 3] ?? 255) < 128) clear++;
      }
    }
    if (clear / samples >= 0.4) reveal();
  };

  return (
    <section
      className="min-w-0 rounded-3xl border border-golden/40 bg-gradient-to-br from-golden/15 via-card to-golden/5 p-5 shadow-soft"
      aria-label="Daily fortune card"
    >
      <h2 className="flex items-center gap-2 font-display font-bold">
        <Ticket className="size-5 text-golden" /> Daily fortune
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        One daily prize. Spin or scratch — your choice.
      </p>
      <div className="relative mt-4 grid h-40 place-items-center overflow-hidden rounded-2xl border border-golden/40 bg-card text-center">
        <div className="p-3" role="status" aria-live="polite">
          {prize ? (
            <>
              <Coins className="mx-auto mb-1 size-7 text-golden" />
              <p className="font-display text-2xl font-extrabold text-primary">
                +{prize.spin + prize.bonus} tokens
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {prize.bonus ? `Includes +${prize.bonus} streak bonus · ` : ""}Added to your tokens
              </p>
            </>
          ) : busy ? (
            <>
              <Loader2 className="mx-auto mb-2 size-6 animate-spin text-golden" />
              <p className="text-sm">Opening your fortune…</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">A little delight is waiting ✨</p>
          )}
        </div>
        <canvas
          ref={canvas}
          width={640}
          height={320}
          aria-hidden="true"
          className={`absolute inset-0 h-full w-full ${prize || busy ? "hidden" : ""} ${disabled ? "pointer-events-none" : "touch-none cursor-crosshair"}`}
          onPointerDown={(event) => {
            if (disabled || busy || event.button !== 0 || pointer.current !== null) return;
            pointer.current = event.pointerId;
            previous.current = null;
            event.currentTarget.setPointerCapture(event.pointerId);
            setStarted(true);
            onPrepare();
            scratch(event);
          }}
          onPointerMove={scratch}
          onPointerUp={finish}
          onLostPointerCapture={() => {
            pointer.current = null;
            previous.current = null;
          }}
          onPointerCancel={() => {
            pointer.current = null;
            previous.current = null;
          }}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        className="mt-4 w-full rounded-full border-golden/50"
        disabled={disabled || busy || !!prize}
        onClick={reveal}
      >
        {prize
          ? "Come back tomorrow"
          : busy
            ? "Revealing…"
            : error
              ? "Try reveal again"
              : "Reveal my fortune"}
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {prize
          ? "A fresh ticket arrives at midnight, Lagos time."
          : started
            ? "Keep rubbing, then lift to reveal. Or use the button."
            : canvasReady
              ? "Scratch with your finger or cursor, or use the button."
              : "Use the button to uncover your daily prize."}
      </p>
    </section>
  );
}
