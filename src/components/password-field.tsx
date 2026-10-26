import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { passwordStrength } from "@/lib/auth-rules";

type Props = React.ComponentProps<typeof Input>;

/** Password input with an animated show/hide eye button. */
export const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput({ className, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} {...props} type={visible ? "text" : "password"} className={cn("pr-12", className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className={cn(
          "group absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full transition-all duration-300",
          "text-muted-foreground hover:scale-110 hover:bg-primary/10 hover:text-primary active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          visible && "bg-primary/10 text-primary",
        )}
      >
        <span className="relative h-5 w-5">
          <Eye
            className={cn(
              "absolute inset-0 h-5 w-5 transition-all duration-300 ease-out",
              visible ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0",
            )}
          />
          <EyeOff
            className={cn(
              "absolute inset-0 h-5 w-5 transition-all duration-300 ease-out",
              visible ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100",
            )}
          />
        </span>
      </button>
    </div>
  );
});

const LEVEL_STYLES = [
  { bar: "bg-muted", text: "text-muted-foreground", emoji: "" },
  { bar: "bg-destructive", text: "text-destructive", emoji: "😬" },
  { bar: "bg-accent", text: "text-accent", emoji: "🙂" },
  { bar: "bg-primary/70", text: "text-primary", emoji: "😋" },
  { bar: "bg-primary", text: "text-primary", emoji: "💪" },
];

/** Four-segment animated strength meter shown while typing. */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label } = passwordStrength(password);
  if (!password) {
    return <p className="mt-1.5 text-xs text-muted-foreground">Use at least 8 characters. Mix letters, numbers and symbols.</p>;
  }
  const style = LEVEL_STYLES[score] ?? LEVEL_STYLES[0]!;
  return (
    <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-300" aria-live="polite">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all duration-500 ease-out", i <= score ? style.bar : "bg-transparent")}
              style={{ width: i <= score ? "100%" : "0%", transitionDelay: `${(i - 1) * 60}ms` }}
            />
          </div>
        ))}
      </div>
      <p className={cn("mt-1.5 flex items-center justify-between text-xs font-semibold", style.text)}>
        <span>Password strength: {label} {style.emoji}</span>
        {score > 0 && score < 4 && <span className="font-normal text-muted-foreground">Try numbers, capitals or symbols</span>}
      </p>
    </div>
  );
}
