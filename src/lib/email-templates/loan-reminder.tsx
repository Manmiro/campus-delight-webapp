import React from 'react';
import { Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text } from '@react-email/components';
import type { TemplateEntry } from './registry';
import { dueLabel, reminderCopy } from '../loan-reminder-rules';

export interface LoanReminderProps {
  name?: string; daysLeft?: number; balance?: string; dueDate?: string; items?: string; outlet?: string;
}

const c = { green: '#78A61B', deep: '#4F7410', gold: '#B8860B', cream: '#FFF8E6', white: '#FFFFFF', ink: '#23321D', muted: '#626D5A', soft: '#F3F7EC' };
const origin = 'https://campus-delight-webapp.lovable.app';

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return <Text style={{ margin: '0 0 8px', fontSize: 14, color: c.ink }}><span style={{ color: c.muted }}>{label}: </span><strong>{value}</strong></Text>;
}

export function LoanReminder({ name, daysLeft = 3, balance, dueDate, items, outlet }: LoanReminderProps) {
  const first = name?.split(' ')[0] || 'friend';
  const copy = reminderCopy(daysLeft);
  return <Html lang="en"><Head /><Preview>{`${first}, your Pay Later repayment is due ${dueLabel(daysLeft)} — ${balance ?? ''}`}</Preview>
    <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: c.ink, margin: 0 }}>
      <Container style={{ maxWidth: 560, padding: '24px 16px' }}>
        <Section style={{ textAlign: 'center', paddingBottom: 18 }}>
          <Img src={`${origin}/apple-touch-icon.png`} alt="Campus Delight" width="64" height="64" style={{ borderRadius: 32, margin: '0 auto' }} />
          <Text style={{ fontSize: 19, fontWeight: 700, margin: '10px 0 0' }}>CAMPUS DELIGHT</Text>
          <Text style={{ color: c.gold, fontSize: 12, margin: '4px 0' }}>Feeding the Future with Honour</Text>
        </Section>
        <Section style={{ backgroundColor: c.green, borderRadius: 16, padding: '28px 24px', textAlign: 'center' }}>
          <Text style={{ color: c.cream, fontSize: 12, fontWeight: 700, letterSpacing: 2, margin: '0 0 8px' }}>EAT NOW &amp; PAY LATER · DUE {dueLabel(daysLeft).toUpperCase()}</Text>
          <Heading style={{ color: c.white, fontSize: 26, lineHeight: '34px', margin: 0 }}>{copy.title}</Heading>
          <Text style={{ color: c.white, fontSize: 16, margin: '12px 0 0' }}>Hi {first},</Text>
        </Section>
        <Img src={`${origin}/email-meal.jpg`} alt="A warm plate of jollof rice and chicken" width="528" style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 16, marginTop: 14 }} />
        <Section style={{ padding: '22px 8px 0' }}>
          <Text style={{ fontSize: 15, lineHeight: '25px', margin: '0 0 16px' }}>{copy.line}</Text>
          <Section style={{ backgroundColor: c.soft, borderRadius: 14, padding: '18px 20px', textAlign: 'center' }}>
            <Text style={{ color: c.muted, fontSize: 12, fontWeight: 700, letterSpacing: 1, margin: 0 }}>AMOUNT LEFT TO PAY</Text>
            <Text style={{ color: c.deep, fontSize: 32, fontWeight: 700, margin: '6px 0 12px' }}>{balance}</Text>
            <Row label="Due date" value={dueDate} />
            <Row label="Meal" value={items} />
            <Row label="Outlet" value={outlet} />
          </Section>
          <Section style={{ backgroundColor: c.cream, borderLeft: `4px solid ${c.gold}`, borderRadius: 12, padding: '14px 18px', marginTop: 14 }}>
            <Text style={{ fontSize: 14, lineHeight: '22px', margin: 0, color: c.ink }}>{copy.perk}</Text>
          </Section>
          <Section style={{ textAlign: 'center', padding: '24px 0 8px' }}>
            <Button href={`${origin}/credit`} style={{ backgroundColor: c.green, color: c.white, borderRadius: 999, fontSize: 14, fontWeight: 700, padding: '14px 26px' }}>Repay now in seconds 💚</Button>
          </Section>
          <Text style={{ fontSize: 13, color: c.muted, textAlign: 'center', lineHeight: '20px' }}>Already paid? Thank you — please ignore this note.<br />With warm plates,<br /><strong style={{ color: c.gold }}>The Campus Delight family</strong></Text>
        </Section>
      </Container>
    </Body>
  </Html>;
}

export const template = {
  component: LoanReminder,
  subject: (d: Record<string, any>) => {
    const days = Number(d['daysLeft'] ?? 3);
    return `${String(d['name'] ?? '').split(' ')[0] || 'Hi'}, your Pay Later repayment is due ${dueLabel(days)} — Campus Delight`;
  },
  displayName: 'Pay Later repayment reminder',
  previewData: { name: 'Amaka Obi', daysLeft: 2, balance: '₦920', dueDate: 'Mon, 2 Nov 2026', items: 'Jollof rice', outlet: 'Ebonyi State University Outlet' },
} satisfies TemplateEntry;
