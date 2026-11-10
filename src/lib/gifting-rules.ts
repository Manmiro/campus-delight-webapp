import { z } from "zod";

export const foodieIdSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^CD\d{6}$/, "Enter an 8-character Foodie ID, e.g. CD050619");
export const giftReferenceSchema = z.string().regex(/^CDG-[a-f0-9-]{36}$/);
export const giftInputSchema = z
  .object({
    foodieId: foodieIdSchema,
    outletId: z.string().uuid(),
    kind: z.enum(["wallet", "plan", "meal"]),
    expectedAmountKobo: z.number().int().min(10000).max(100000000),
    plan: z.enum(["weekend", "weekly", "monthly"]).optional(),
    tier: z.enum(["basic", "standard", "turbo"]).optional(),
    menuItemId: z.string().uuid().optional(),
    fulfillment: z.enum(["pickup", "delivery"]).default("pickup"),
    address: z.string().trim().max(500).default(""),
    sponsorName: z.string().trim().min(1).max(80),
    sponsorEmail: z.string().trim().email().max(254),
    note: z.string().trim().max(500).default(""),
    origin: z.string().url(),
    captchaToken: z.string().min(1).max(2048),
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
  gender: string | null;
  avatarUrl: string | null;
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
