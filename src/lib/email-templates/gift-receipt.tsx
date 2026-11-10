import React from "react";
import { Section, Text } from "@react-email/components";
import { AuthEmailLayout, authTextStyle } from "./auth-email-layout";
import type { TemplateEntry } from "./registry";

export interface GiftReceiptProps {
  audience: "student" | "sponsor";
  name: string;
  sponsorName: string;
  recipientName: string;
  amount: string;
  gift: string;
  note: string;
  reference: string;
  status: string;
  outlet: string;
}
export function GiftReceipt({
  audience,
  name,
  sponsorName,
  recipientName,
  amount,
  gift,
  note,
  reference,
  status,
  outlet,
}: GiftReceiptProps) {
  const title =
    audience === "student" ? `Good news! A gift from ${sponsorName}` : "Your gift is confirmed";
  return (
    <AuthEmailLayout
      title={title}
      preview={`${title} · ${amount}`}
      notice="Keep this reference if you need help with your gift. Campus Delight will never ask for your password or card PIN by email."
    >
      <Text style={authTextStyle}>Hi {name},</Text>
      <Text style={authTextStyle}>
        {audience === "student"
          ? `${sponsorName} just sent you ${gift}.`
          : `Thank you for feeding ${recipientName}! Your payment of ${amount} for ${gift} is confirmed.`}
      </Text>
      <Section style={{ backgroundColor: "#F3F7EC", padding: 20, borderRadius: 12 }}>
        <Text style={{ ...authTextStyle, fontWeight: 700 }}>
          {amount} · {outlet}
        </Text>
        <Text style={authTextStyle}>{status}</Text>
        {note && (
          <Text style={{ ...authTextStyle, whiteSpace: "pre-wrap" }}>
            A personal message from {sponsorName}:<br />“{note}”
          </Text>
        )}
        <Text style={{ ...authTextStyle, fontSize: 12, marginBottom: 0 }}>
          Transaction reference: {reference}
        </Text>
      </Section>
    </AuthEmailLayout>
  );
}
export const template = {
  component: GiftReceipt,
  subject: (data: Record<string, unknown>) =>
    data["audience"] === "student"
      ? `Good news! ${data["sponsorName"]} sent you a gift — Campus Delight`
      : "Your gift is confirmed — Campus Delight",
  displayName: "Feed Someone gift confirmation",
} satisfies TemplateEntry;
