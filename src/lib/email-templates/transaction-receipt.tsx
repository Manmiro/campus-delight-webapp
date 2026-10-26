import React from 'react';
import { Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text } from '@react-email/components';
import type { TemplateEntry } from './registry';

export const RECEIPT_TYPES = {
  funding: ['Wallet funded', 'Your wallet top-up is confirmed.'],
  subscription: ['Your meal plan is active', 'Your subscription payment is confirmed.'],
  order: ['Your order is confirmed', 'Your campus kitchen has received your order.'],
  fulfilled: ['Your meal is ready', 'Your outlet has fulfilled your order.'],
  cancelled: ['Order cancelled', 'Your order was cancelled. Any applicable reversal is reflected in your account.'],
  transfer_out: ['Tokens sent', 'Your token transfer is complete.'],
  transfer_in: ['Tokens received', 'A token transfer has arrived in your account.'],
  reward: ['Tokens added to your plate', 'Your check-in reward has been credited.'],
  welcome: ['Your welcome tokens are here', 'Your registration reward has been credited.'],
  referral_locked: ['Referral tokens reserved', 'Your referral reward is locked until your friend’s first qualifying order.'],
  referral_unlock: ['Referral tokens unlocked', 'Your friend’s qualifying order unlocked your referral reward.'],
  repayment: ['Repayment confirmed', 'Your food-credit repayment has been applied.'],
  outlet_fee: ['Outlet transfer submitted', 'Your application fee is paid. Headquarters will review your application.'],
  credit_adjustment: ['Your credit limit changed', 'Headquarters updated your food-credit limit. Existing debt remains payable.'],
  outlet_approved: ['Your outlet transfer is complete', 'Your next orders will use your newly assigned outlet.'],
  outlet_rejected: ['Outlet transfer decision', 'Your outlet-transfer application was not approved. The application fee is non-refundable.'],
} as const;
export type ReceiptKind = keyof typeof RECEIPT_TYPES;
export interface ReceiptProps {
  kind?: ReceiptKind;
  name?: string;
  amount?: string;
  reference?: string;
  date?: string;
  details?: { label: string; value: string }[];
}

const colours = { green: '#78A61B', gold: '#B8860B', white: '#FFFFFF', ink: '#23321D', muted: '#626D5A', line: '#E4EADB', soft: '#F3F7EC' };
const origin = 'https://campus-delight-webapp.lovable.app';
export function TransactionReceipt({ kind = 'funding', name, amount = '₦2,000', reference = 'CDPS-EXAMPLE', date = '26 October 2026, 16:12', details = [] }: ReceiptProps) {
  const [title, description] = RECEIPT_TYPES[kind] ?? RECEIPT_TYPES.funding;
  return <Html lang="en"><Head /><Preview>{title} — {amount} · Campus Delight</Preview>
    <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: colours.ink, margin: 0 }}>
      <Container style={{ maxWidth: 560, padding: '24px 16px' }}>
        <Section style={{ padding: '0 0 20px' }}>
          <Img src={`${origin}/apple-touch-icon.png`} alt="Campus Delight" width="64" height="64" style={{ borderRadius: 32, margin: '0 auto' }} />
          <Text style={{ textAlign: 'center', fontSize: 19, fontWeight: 700, margin: '10px 0 0' }}>CAMPUS DELIGHT</Text>
          <Text style={{ textAlign: 'center', color: colours.gold, fontSize: 12, margin: '4px 0' }}>Feeding the Future with Honour</Text>
        </Section>
        <Img src={`${origin}/email-meal.jpg`} alt="Jollof rice, chicken and plantain" width="528" style={{ display: 'block', width: '100%', height: 'auto', borderRadius: '8px 8px 0 0' }} />
        <Section style={{ backgroundColor: colours.green, padding: '24px', borderRadius: '0 0 8px 8px' }}>
          <Text style={{ color: colours.white, fontSize: 12, margin: '0 0 8px', fontWeight: 700 }}>YOUR TRANSACTION RECEIPT</Text>
          <Heading style={{ color: colours.white, fontSize: 27, lineHeight: '34px', margin: 0 }}>{title}</Heading>
        </Section>
        <Section style={{ padding: '24px 8px 8px' }}>
          <Text style={{ fontSize: 16, margin: '0 0 8px' }}>Hi {name?.split(' ')[0] || 'there'},</Text>
          <Text style={{ color: colours.muted, fontSize: 14, lineHeight: '22px', margin: '0 0 20px' }}>{description}</Text>
          <Section style={{ backgroundColor: colours.soft, borderRadius: 8, padding: '20px' }}>
            <Text style={{ fontSize: 12, color: colours.muted, margin: '0 0 6px' }}>Transaction amount</Text>
            <Text style={{ fontSize: 30, fontWeight: 700, color: colours.ink, margin: 0 }}>{amount}</Text>
            <Hr style={{ borderColor: colours.line, margin: '16px 0' }} />
            {[...details, { label: 'Reference', value: reference }, { label: 'Date · Lagos time', value: date }].map((row, i) => <Text key={i} style={{ fontSize: 13, lineHeight: '20px', margin: '8px 0', wordBreak: 'break-word' }}><span style={{ color: colours.muted }}>{row.label}</span><br /><strong>{row.value}</strong></Text>)}
          </Section>
          <Section style={{ textAlign: 'center', padding: '24px 0' }}><Button href={`${origin}/history`} style={{ backgroundColor: colours.green, color: colours.white, borderRadius: 8, fontSize: 14, fontWeight: 700, padding: '14px 24px' }}>View my account activity →</Button></Section>
          <Text style={{ fontSize: 12, lineHeight: '20px', color: colours.muted, textAlign: 'center' }}>Your receipt, fresh from Campus Delight.<br />If you don’t recognise this activity, check your account immediately.</Text>
        </Section>
      </Container>
    </Body></Html>;
}

export const template = {
  component: TransactionReceipt,
  subject: (data: Record<string, unknown>) => `${RECEIPT_TYPES[data['kind'] as ReceiptKind]?.[0] ?? 'Transaction confirmed'} — Campus Delight`,
  displayName: 'Campus Delight transaction receipt',
  previewData: { kind: 'funding', name: 'Ada Okafor', amount: '₦2,000', reference: 'CDPS-PREVIEW', date: '26 October 2026, 16:12', details: [{ label: 'Wallet balance after funding', value: '₦5,000' }] },
} satisfies TemplateEntry;