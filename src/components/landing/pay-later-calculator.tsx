import { useState } from "react";
import { Wallet } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_CREDIT_LIMIT_KOBO,
  LOAN_TERM_CHARGE_PERCENT,
  loanTotalDueKobo,
  type LoanTermDays,
} from "@/lib/prd-rules";
import { cn } from "@/lib/utils";

const TERMS: LoanTermDays[] = [7, 14, 30];
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export function PayLaterCalculator() {
  const [term, setTerm] = useState<LoanTermDays>(7);
  const [amountNaira, setAmountNaira] = useState(DEFAULT_CREDIT_LIMIT_KOBO / 100);
  const principal = amountNaira * 100;
  const total = loanTotalDueKobo(principal, term);

  return (
    <div className="rounded-2xl bg-secondary/50 p-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-secondary-foreground">
        <Wallet className="h-4 w-4" /> Try it — what would you repay?
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-sm">
          <span>Borrow (food)</span>
          <span className="font-display text-lg font-bold">{naira(principal)}</span>
        </div>
        <Slider
          className="mt-3"
          min={100}
          max={DEFAULT_CREDIT_LIMIT_KOBO / 100}
          step={100}
          value={[amountNaira]}
          onValueChange={(v) => setAmountNaira(v[0] ?? amountNaira)}
          aria-label="Amount to borrow"
        />
        <p className="mt-1 text-xs text-muted-foreground">Starter limit {naira(DEFAULT_CREDIT_LIMIT_KOBO)}</p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {TERMS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTerm(t)}
            className={cn(
              "rounded-xl border px-2 py-2 text-sm font-semibold transition-all",
              term === t
                ? "scale-105 border-primary bg-primary text-primary-foreground shadow-md"
                : "border-border bg-card hover:border-primary",
            )}
          >
            {t} days
            <span className="block text-xs font-normal opacity-80">+{LOAN_TERM_CHARGE_PERCENT[t]}%</span>
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span>{term}-day charge ({LOAN_TERM_CHARGE_PERCENT[term]}%)</span>
          <span className="font-semibold">{naira(total - principal)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-2">
          <span>Total repayable</span>
          <span key={total} className="animate-pop-in font-display text-lg font-bold">{naira(total)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Settle on time</span>
          <span className="text-primary">Limit → {naira(DEFAULT_CREDIT_LIMIT_KOBO * 2)}</span>
        </div>
      </div>
    </div>
  );
}
