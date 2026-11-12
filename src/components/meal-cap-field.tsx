import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMealCap, MEAL_CAP_HELP, parseMealCap } from "@/lib/meal-cap-rules";

export function MealCapField({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const kobo = parseMealCap(value);
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>Meal Plan Cap Per Meal</Label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        >
          ₦
        </span>
        <Input
          id={id}
          className="pl-8"
          role="spinbutton"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          maxLength={24}
          aria-valuemin={0.01}
          aria-valuemax={Number.MAX_SAFE_INTEGER / 100}
          aria-valuenow={kobo === null ? undefined : kobo / 100}
          aria-describedby={`${id}-help`}
          aria-invalid={kobo === null}
          onKeyDown={(event) => {
            if (kobo !== null && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
              event.preventDefault();
              const next = kobo + (event.key === "ArrowUp" ? 100 : -100);
              if (next > 0 && Number.isSafeInteger(next)) onChange(formatMealCap(next));
            }
          }}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => {
            if (kobo !== null) onChange(formatMealCap(kobo));
          }}
        />
      </div>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {MEAL_CAP_HELP}
      </p>
    </div>
  );
}
