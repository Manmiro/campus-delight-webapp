import { toast } from "sonner";

export type FoodieErrorContext = {
  fallback?: string;
  amountKobo?: number;
  balanceKobo?: number;
  creditLimitKobo?: number;
  outstandingKobo?: number;
};

export type FoodieErrorCopy = {
  title: string;
  description: string;
};

type ErrorRecord = Record<string, unknown>;

function record(value: unknown): ErrorRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ErrorRecord)
    : null;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function errorParts(error: unknown): { message: string; code: string; status: number | undefined } {
  const root = record(error);
  const nested = record(root?.["error"]) ?? record(root?.["cause"]);
  const message = firstString(
    root?.["message"],
    nested?.["message"],
    typeof error === "string" ? error : undefined,
  );
  const code = firstString(root?.["code"], nested?.["code"]).toLowerCase();
  const rawStatus =
    root?.["status"] ?? root?.["statusCode"] ?? nested?.["status"] ?? nested?.["statusCode"];
  const status = typeof rawStatus === "number" ? rawStatus : Number(rawStatus);
  return { message, code, status: Number.isFinite(status) ? status : undefined };
}

function nairaFromKobo(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", {
    minimumFractionDigits: kobo % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function nairaFromText(value: string): string | undefined {
  const match = value.match(/₦\s?([\d,]+(?:\.\d{1,2})?)/i);
  return match?.[1] ? `₦${match[1]}` : undefined;
}

function safeReason(message: string, fallback: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  if (
    !clean ||
    /^(error|failed|request failed|unknown error)$/i.test(clean) ||
    /^[{[]/.test(clean) ||
    /\b(?:pgrst|sqlstate|postgres|plpgsql|relation|constraint)\b/i.test(clean)
  )
    return fallback;
  return clean.length > 240 ? fallback : clean;
}

/** Turns backend, network and validation failures into warm, two-line Campus Delight copy. */
export function formatFoodieError(
  error: unknown,
  context: FoodieErrorContext = {},
): FoodieErrorCopy {
  const { message, code, status } = errorParts(error);
  const lower = `${code} ${message}`.toLowerCase();
  const walletGap =
    context.amountKobo !== undefined && context.balanceKobo !== undefined
      ? Math.max(0, context.amountKobo - context.balanceKobo)
      : undefined;
  const outstanding =
    context.outstandingKobo !== undefined ? nairaFromKobo(context.outstandingKobo) : undefined;

  if (
    lower.includes("email_not_confirmed") ||
    lower.includes("email not confirmed") ||
    lower.includes("confirm your email")
  ) {
    return {
      title: "Check your inbox first",
      description:
        "We sent a verification link to your email. Confirm it to unlock your welcome bonus.",
    };
  }
  if (
    lower.includes("invalid login") ||
    lower.includes("invalid credentials") ||
    code === "invalid_credentials"
  ) {
    return {
      title: "Wrong recipe!",
      description:
        "The email or password didn't match our records. Tap ‘Forgot Password’ if you're stuck.",
    };
  }
  if (lower.includes("temporary email") || lower.includes("disposable email")) {
    return {
      title: "We need your real table address",
      description:
        "Disposable email addresses aren't allowed. Please use your permanent personal or campus email.",
    };
  }
  if (lower.includes("passwords do not match")) {
    return {
      title: "The secret ingredients don't match",
      description: "Make sure both password fields are identical.",
    };
  }
  if (lower.includes("enter your email") || lower.includes("email address is required")) {
    return {
      title: "Let's get your seat ready",
      description: "Enter your email address so we know where to send your Campus Delight updates.",
    };
  }
  if (lower.includes("enter your password")) {
    return {
      title: "Add your secret ingredient",
      description: "Enter your password to continue. Tap ‘Forgot Password’ if you need a hand.",
    };
  }

  if (lower.includes("insufficient wallet") || lower.includes("wallet balance")) {
    const gap =
      walletGap !== undefined
        ? ` You need ${nairaFromKobo(walletGap)} more`
        : " Your wallet balance is lower than this order total";
    return {
      title: "Pocket's a little light for this feast",
      description: `${gap.trim()}. Top up your wallet in one tap, then try again.`,
    };
  }
  if (lower.includes("insufficient") && lower.includes("token")) {
    const need = message.match(/need\s+(\d[\d,]*)/i)?.[1];
    const have = message.match(/have\s+(\d[\d,]*)/i)?.[1];
    const detail =
      need && have
        ? ` You have ${have} tokens, but this meal needs ${need}.`
        : " Your token jar doesn't cover this meal yet.";
    return {
      title: "Not quite enough tokens in your jar",
      description: `${detail.trim()} Switch to Cash Wallet or top up, then try again.`,
    };
  }
  if (
    lower.includes("never combine") ||
    lower.includes("only one payment") ||
    lower.includes("cash and tokens cannot")
  ) {
    return {
      title: "One bowl, one recipe!",
      description:
        "Meals must be paid with either tokens or your cash wallet, never split between the two.",
    };
  }
  if (
    lower.includes("meal cap") ||
    lower.includes("meal allowance") ||
    lower.includes("meal copay") ||
    lower.includes("expected meal")
  ) {
    return {
      title: "Over your plan’s meal allowance",
      description:
        "This dish is above your outlet's meal allowance. The extra amount will come from your cash wallet.",
    };
  }

  if (
    lower.includes("available credit") ||
    lower.includes("credit limit exceeded") ||
    lower.includes("exceeds your available credit") ||
    lower.includes("credit plate")
  ) {
    const limit =
      nairaFromText(message) ??
      (context.creditLimitKobo !== undefined
        ? nairaFromKobo(context.creditLimitKobo)
        : "your current limit");
    return {
      title: "That's past your credit plate",
      description: `Your Pay Later limit is ${limit}. Repay an active loan or remove an item to fit your limit.`,
    };
  }
  if (
    lower.includes("overdue") &&
    (lower.includes("pay later") ||
      lower.includes("ordering") ||
      lower.includes("credit") ||
      lower.includes("loan"))
  ) {
    if (lower.includes("ordering") || lower.includes("paused") || lower.includes("cash orders")) {
      return {
        title: "Kitchen paused on credit",
        description:
          "Cash orders are on pause until your overdue loan is settled. Your subscription meal plan still works as normal!",
      };
    }
    const amount = outstanding
      ? `You have an overdue balance of ${outstanding}.`
      : "Your Pay Later balance is overdue.";
    return {
      title: "Clear your last plate first",
      description: `${amount} Settle it now to unlock Pay Later again.`,
    };
  }
  if (
    lower.includes("outstanding loan") ||
    lower.includes("loan is overdue") ||
    lower.includes("repay it before borrowing")
  ) {
    return {
      title: "Clear your last plate first",
      description:
        "You have an active Pay Later balance. Settle it before starting another credit meal.",
    };
  }
  if (
    lower.includes("more than you owe") ||
    lower.includes("exceeds outstanding") ||
    /repayment.*outstanding/.test(lower)
  ) {
    return {
      title: "Too generous!",
      description: `Your total outstanding balance is ${outstanding ?? "lower than that amount"}. You don't need to pay more than that.`,
    };
  }

  if (
    lower.includes("transfers") &&
    (lower.includes("frozen") || lower.includes("overdue") || lower.includes("pause"))
  ) {
    return {
      title: "Transfers on pause",
      description: "Settle your pending Pay Later meal before sharing tokens with friends.",
    };
  }
  if (lower.includes("yourself") || lower.includes("self-transfer")) {
    return {
      title: "Self-feeding not allowed!",
      description:
        "You can't transfer tokens to your own account. Share them with a coursemate instead.",
    };
  }
  if (
    lower.includes("recipient not found") ||
    lower.includes("recipient_not_found") ||
    lower.includes("couldn't find") ||
    lower.includes("could not find")
  ) {
    return {
      title: "Couldn't spot that Delighter",
      description:
        "Double-check the Campus Delight ID (e.g. CD123456) or phone number and try again.",
    };
  }
  if (lower.includes("daily limit") || lower.includes("daily principal limit")) {
    const remaining = message.match(/at most\s+(\d[\d,]*)\s+more/i)?.[1];
    return {
      title: "You’ve shared enough love today!",
      description: remaining
        ? `You can share ${remaining} more tokens today. Your counter resets tomorrow morning.`
        : "You've reached your daily 500-token sharing limit. Your counter resets tomorrow morning.",
    };
  }

  if (status === 413 || lower.includes("too large") || lower.includes("5 mb")) {
    return {
      title: "That photo is a whole feast!",
      description: "Please upload an avatar image under 5 MB.",
    };
  }
  if (
    status === 0 ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("offline") ||
    lower.includes("network request")
  ) {
    return {
      title: "Lost connection to the kitchen",
      description: "Your campus network seems weak right now. Reconnect and tap to retry.",
    };
  }
  if (status === 401 || lower.includes("not authenticated") || lower.includes("unauthorized")) {
    return {
      title: "Your table timed out",
      description: "Please sign in again and we’ll get you back to your meal.",
    };
  }
  if (status === 403 || lower.includes("forbidden")) {
    return {
      title: "This plate is off-limits",
      description:
        "Your account doesn't have access to that action. Please check your account or contact Campus Delight.",
    };
  }
  if (status === 429 || lower.includes("rate limit") || lower.includes("too many requests")) {
    return {
      title: "The kitchen is a little busy",
      description: "Please wait a moment, then tap retry. Your money and order are safe.",
    };
  }
  if (
    (status !== undefined && status >= 500) ||
    lower.includes("unexpected server") ||
    lower.includes("internal server")
  ) {
    return {
      title: "Our kitchen hit a quick bump",
      description: "Nothing was charged. Please wait a second and try tapping again.",
    };
  }

  const fallback = context.fallback ?? "Please try again in a moment.";
  return {
    title: "A small kitchen hiccup",
    description: `${safeReason(message, fallback)} Your money is safe. If this keeps happening, please try again or contact Campus Delight.`,
  };
}

/** Sonner adapter: every visible error is a friendly headline plus an exact next step. */
export function showFoodieError(
  error: unknown,
  fallback?: string,
  context: Omit<FoodieErrorContext, "fallback"> = {},
): void {
  const copy = formatFoodieError(
    error,
    fallback === undefined ? context : { ...context, fallback },
  );
  toast.error(copy.title, { description: copy.description });
}
