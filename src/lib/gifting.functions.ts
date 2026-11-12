import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  foodieIdSchema,
  giftInputSchema,
  giftReferenceSchema,
  type GiftInput,
} from "./gifting-rules";

export const lookupGiftRecipient = createServerFn({ method: "POST" })
  .inputValidator((input: { foodieId: string }) =>
    z.object({ foodieId: foodieIdSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { enforcePublicRequestLimit } = await import("./rate-limit.server");
    await enforcePublicRequestLimit("gift-lookup", 20);
    const { lookupRecipient } = await import("./gifting.server");
    return lookupRecipient(data.foodieId);
  });

export const initializeGift = createServerFn({ method: "POST" })
  .inputValidator((input: GiftInput) => giftInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { enforcePublicRequestLimit } = await import("./rate-limit.server");
    await enforcePublicRequestLimit("gift-checkout", 5);
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
    const { enforcePublicRequestLimit } = await import("./rate-limit.server");
    await enforcePublicRequestLimit("gift-verification", 30);
    const { settleGift } = await import("./gifting.server");
    return settleGift(data.reference);
  });
