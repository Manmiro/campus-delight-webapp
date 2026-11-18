import { z } from "zod";

export const foodieIdSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^CD\d{6}$/, "Enter an 8-character Foodie ID, e.g. CD050619");
// Sponsors must already know the student's name; the public lookup only confirms a match.
export const recipientNameSchema = z
  .string()
  .trim()
  .min(2, "Enter the student’s first name")
  .max(60, "Enter just the student’s first name");
export const giftReferenceSchema = z.string().regex(/^CDG-[a-f0-9-]{36}$/);
export const giftInputSchema = z
  .object({
    foodieId: foodieIdSchema,
    recipientName: recipientNameSchema,
    outletId: z.guid(),
    kind: z.enum(["wallet", "plan", "meal"]),
    expectedAmountKobo: z.number().int().min(10000).max(100000000),
    plan: z.enum(["weekend", "weekly", "monthly"]).optional(),
    tier: z.enum(["basic", "standard", "turbo"]).optional(),
    menuItemId: z.guid().optional(),
    fulfillment: z.enum(["pickup", "delivery"]).default("pickup"),
    address: z.string().trim().max(500).default(""),
    sponsorName: z.string().trim().min(1).max(80),
    sponsorEmail: z.string().trim().email().max(254),
    note: z.string().trim().max(500).default(""),
    origin: z.string().url(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "plan" && (!v.plan || !v.tier))
      ctx.addIssue({ code: "custom", message: "Choose a plan and tier" });
    if (v.kind === "meal" && !v.menuItemId)
      ctx.addIssue({ code: "custom", message: "Choose a meal" });
    if (v.kind === "meal" && v.fulfillment === "delivery" && v.address.length < 5)
      ctx.addIssue({ code: "custom", message: "Enter a campus delivery address" });
  });
export type GiftInput = z.infer<typeof giftInputSchema>;
export type GiftRecipient = {
  foodieId: string;
  name: string;
  /** The student's own photo (short-lived link) or their default cartoon avatar. */
  avatarUrl: string;
  outlet: { id: string; name: string; deliveryFeeKobo: number };
  prices: { plan: string; tier: string; price_kobo: number }[];
  menu: {
    id: string;
    name: string;
    description: string | null;
    price_kobo: number;
    image_url: string | null;
  }[];
};
function normalizeNamePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** True when the entered name equals one of the student's names (or the full name). */
export function recipientNameMatches(fullName: string, entered: string) {
  const want = normalizeNamePart(entered);
  if (want.length < 2) return false;
  if (normalizeNamePart(fullName) === want) return true;
  return fullName.split(/[\s-]+/).some((part) => normalizeNamePart(part) === want);
}

export function recipientDisplayName(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0] ?? "Student"}${parts.length > 1 ? ` ${parts.at(-1)![0]}.` : ""}`;
}

export function giftStatusText(kind: string, walletFallback = false) {
  if (walletFallback)
    return "The original gift could not be fulfilled. The full payment was credited to the student’s wallet.";
  if (kind === "wallet")
    return "Wallet credited. Existing Pay Later repayments may be applied automatically.";
  if (kind === "plan") return "Meal plan activated with daily meal entitlements.";
  return "Surprise meal confirmed with the campus kitchen.";
}
