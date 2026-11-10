import { giftDb } from "./gifting.server";
import { sendTemplateEmail } from "./email-templates/send-email";
import { giftStatusText, recipientDisplayName } from "./gifting-rules";
import { naira } from "./format";

export async function emailGift(reference: string) {
  const { data: g, error } = await giftDb
    .from("gift_payments")
    .select("*")
    .eq("reference", reference)
    .eq("status", "success")
    .maybeSingle();
  if (error) throw error;
  if (!g || g.status !== "success") return;
  const [profile, outlet] = await Promise.all([
    giftDb.from("profiles").select("full_name,email").eq("id", g.customer_id).single(),
    giftDb.from("outlets").select("name").eq("id", g.outlet_id).single(),
  ]);
  if (profile.error) throw profile.error;
  if (outlet.error) throw outlet.error;
  const selection = g.selection as { plan?: string; tier?: string; name?: string };
  const amount = naira(g.amount_kobo);
  const description =
    g.wallet_fallback || g.kind === "wallet"
      ? `${amount} in wallet funding`
      : g.kind === "plan"
        ? `a ${selection.plan} ${selection.tier} food plan`
        : `a surprise meal: ${selection.name}`;
  let status = giftStatusText(g.kind, g.wallet_fallback);
  if (g.kind === "plan" && !g.wallet_fallback && g.related_id) {
    const sub = await giftDb
      .from("subscriptions")
      .select("start_date,end_date")
      .eq("id", g.related_id)
      .single();
    if (sub.error) throw sub.error;
    status += ` Service dates: ${sub.data.start_date} to ${sub.data.end_date}.`;
  }
  const props = {
    sponsorName: g.sponsor_name,
    recipientName: recipientDisplayName(profile.data.full_name),
    amount,
    gift: description,
    note: g.note,
    reference: g.reference,
    status,
    outlet: outlet.data.name,
  };
  // Independent claims let a webhook retry only the email that failed.
  const results = await Promise.allSettled([
    ...(profile.data.email
      ? [
          sendTemplateEmail("gift-receipt", profile.data.email, {
            idempotencyKey: `gift:${g.reference}:student`,
            templateData: {
              ...props,
              audience: "student",
              name: profile.data.full_name.split(" ")[0],
            },
          }),
        ]
      : []),
    sendTemplateEmail("gift-receipt", g.sponsor_email, {
      idempotencyKey: `gift:${g.reference}:sponsor`,
      templateData: { ...props, audience: "sponsor", name: g.sponsor_name },
    }),
  ]);
  const failure = results.find((r) => r.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}
