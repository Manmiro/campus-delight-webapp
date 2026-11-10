import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  foodieIdSchema,
  giftInputSchema,
  giftReferenceSchema,
  type GiftInput,
} from "./gifting-rules";

export const lookupGiftRecipient = createServerFn({ method: "POST" })
  .inputValidator((input: { foodieId: string; captchaToken: string }) =>
    z.object({ foodieId: foodieIdSchema, captchaToken: z.string().min(1).max(2048) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { lookupRecipient } = await import("./gifting.server");
    return lookupRecipient(data.foodieId, data.captchaToken);
  });

export const initializeGift = createServerFn({ method: "POST" })
  .inputValidator((input: GiftInput) => giftInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { startGift } = await import("./gifting.server");
    return startGift(data);
  });

// A random reference is a receipt capability. Return fulfillment status only;
// never expose sponsor email, delivery address, recipient id or account balances.
export const verifyGift = createServerFn({ method: "POST" })
  .inputValidator((input: { reference: string }) =>
    z.object({ reference: giftReferenceSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { settleGift } = await import("./gifting.server");
    return settleGift(data.reference);
  });
