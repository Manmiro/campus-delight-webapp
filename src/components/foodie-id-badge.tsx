import { useEffect, useState } from "react";
import { BadgeCheck, Barcode, Check, Copy, GraduationCap, Microchip, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { showFoodieError } from "@/lib/foodie-errors";

export function FoodieIdBadge({ customerCode, compact = false }: { customerCode: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2400);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(customerCode);
      setCopied(true);
      toast.success("Campus Delight ID copied!", {
        description: "Share with friends to receive tokens or referrals",
      });
      // Vibration is optional: unsupported devices must still get copy feedback.
      try { navigator.vibrate?.(20); } catch { /* Toast remains available. */ }
    } catch {
      showFoodieError("Could not copy your ID. Please try again.");
    }
  }

  return (
    <Button type="button" variant="ghost" disabled={!customerCode} onClick={() => void copyId()}
      aria-label="Copy Campus Delight ID" title="Copy Campus Delight ID"
      className={compact
        ? "group h-auto min-h-11 max-w-full justify-start gap-2 rounded-lg border border-primary-foreground/30 px-2.5 py-2 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
        : "foodie-pass group relative h-auto min-h-20 w-full max-w-sm justify-start gap-3 whitespace-normal rounded-lg border border-golden/60 bg-card px-4 py-3 text-card-foreground hover:bg-accent hover:text-accent-foreground md:w-auto md:min-w-60 motion-safe:transition-transform motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 motion-safe:hover:rotate-1 motion-safe:active:scale-95"}>
      {compact ? <Microchip aria-hidden="true" className="text-current" /> : <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-golden"><GraduationCap aria-hidden="true" /></span>}
      <span className="min-w-0 text-left">
        {!compact && <span className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">Foodie ID <Sparkles aria-hidden="true" className="text-golden motion-safe:group-hover:animate-wiggle" /></span>}
        <span className={`block select-all font-mono font-bold ${compact ? "text-sm" : "text-xl sm:text-2xl"}`}>{customerCode}</span>
        {!compact && <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-primary"><BadgeCheck aria-hidden="true" />Verified ID</span>}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2 border-l border-dashed border-current/20 pl-3">
        {!compact && <Barcode aria-hidden="true" className="text-golden" />}
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </span>
      <span className="sr-only" role="status" aria-live="polite">{copied ? "Campus Delight ID copied" : ""}</span>
    </Button>
  );
}
