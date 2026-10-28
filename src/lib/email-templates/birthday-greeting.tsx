import React from 'react';
import { Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text } from '@react-email/components';
import type { TemplateEntry } from './registry';

export interface BirthdayProps { name?: string; gender?: string; age?: number }

const c = { green: '#78A61B', deep: '#4F7410', gold: '#B8860B', cream: '#FFF8E6', white: '#FFFFFF', ink: '#23321D', muted: '#626D5A', soft: '#F3F7EC' };
const origin = 'https://campus-delight-webapp.lovable.app';

/** Gender-aware inspiring copy; falls back to neutral wording. */
export function birthdayCopy(gender?: string) {
  const g = (gender ?? '').toLowerCase();
  if (g === 'male') return { title: 'Happy birthday, king of the campus! 👑', line: 'Today we celebrate the man you are becoming — focused, brave and full of promise. Keep building, keep leading, and never forget how far you have already come.', blessing: 'May this new year bring you strength for every lecture, wisdom for every choice, and a plate that is always full.' };
  if (g === 'female') return { title: 'Happy birthday, queen of the campus! 👑', line: 'Today we celebrate the woman you are becoming — brilliant, bold and beautifully unstoppable. Keep shining, keep dreaming, and walk into this new year like it already belongs to you.', blessing: 'May this new year bring you joy in every lecture, grace in every step, and a plate that is always full.' };
  return { title: 'Happy birthday, campus star! 🌟', line: 'Today we celebrate you — your hard work, your dreams and everything you are becoming. Keep going; your best chapters are still being written.', blessing: 'May this new year bring you strength, joy and a plate that is always full.' };
}

export function BirthdayGreeting({ name, gender, age }: BirthdayProps) {
  const first = name?.split(' ')[0] || 'friend';
  const copy = birthdayCopy(gender);
  return <Html lang="en"><Head /><Preview>{`${first}, today is all about you 🎂 — love from Campus Delight`}</Preview>
    <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: c.ink, margin: 0 }}>
      <Container style={{ maxWidth: 560, padding: '24px 16px' }}>
        <Section style={{ textAlign: 'center', paddingBottom: 18 }}>
          <Img src={`${origin}/apple-touch-icon.png`} alt="Campus Delight" width="64" height="64" style={{ borderRadius: 32, margin: '0 auto' }} />
          <Text style={{ fontSize: 19, fontWeight: 700, margin: '10px 0 0' }}>CAMPUS DELIGHT</Text>
          <Text style={{ color: c.gold, fontSize: 12, margin: '4px 0' }}>Feeding the Future with Honour</Text>
        </Section>
        <Section style={{ backgroundColor: c.green, borderRadius: 16, padding: '30px 24px', textAlign: 'center' }}>
          <Text style={{ fontSize: 34, letterSpacing: 6, margin: 0 }}>🎈🎂🎉</Text>
          <Text style={{ color: c.cream, fontSize: 12, fontWeight: 700, letterSpacing: 2, margin: '14px 0 6px' }}>{age ? `CELEBRATING ${age} YEARS OF YOU` : 'IT’S YOUR SPECIAL DAY'}</Text>
          <Heading style={{ color: c.white, fontSize: 28, lineHeight: '36px', margin: 0 }}>{copy.title}</Heading>
          <Text style={{ color: c.white, fontSize: 16, margin: '12px 0 0' }}>Dear {first},</Text>
        </Section>
        <Img src={`${origin}/email-meal.jpg`} alt="A celebration plate of jollof rice and chicken" width="528" style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 16, marginTop: 14 }} />
        <Section style={{ padding: '22px 8px 0' }}>
          <Text style={{ fontSize: 15, lineHeight: '25px', margin: '0 0 16px' }}>{copy.line}</Text>
          <Section style={{ backgroundColor: c.cream, borderLeft: `4px solid ${c.gold}`, borderRadius: 12, padding: '18px 20px' }}>
            <Text style={{ color: c.gold, fontSize: 12, fontWeight: 700, margin: '0 0 6px' }}>✨ OUR BIRTHDAY WISH FOR YOU</Text>
            <Text style={{ fontSize: 15, lineHeight: '24px', fontStyle: 'italic', margin: 0 }}>“{copy.blessing}”</Text>
          </Section>
          <Section style={{ backgroundColor: c.soft, borderRadius: 12, padding: '16px 20px', marginTop: 14, textAlign: 'center' }}>
            <Text style={{ fontSize: 14, lineHeight: '22px', color: c.deep, fontWeight: 700, margin: 0 }}>“The future belongs to those who believe in the beauty of their dreams.”</Text>
          </Section>
          <Section style={{ textAlign: 'center', padding: '24px 0 8px' }}>
            <Button href={`${origin}/dashboard`} style={{ backgroundColor: c.green, color: c.white, borderRadius: 999, fontSize: 14, fontWeight: 700, padding: '14px 26px' }}>Open my Campus Delight 🎁</Button>
          </Section>
          <Text style={{ fontSize: 13, color: c.muted, textAlign: 'center', lineHeight: '20px' }}>With love and warm plates,<br /><strong style={{ color: c.gold }}>The Campus Delight family</strong></Text>
        </Section>
      </Container>
    </Body>
  </Html>;
}

export const template = {
  component: BirthdayGreeting,
  subject: (d: Record<string, any>) => `Happy birthday, ${String(d['name'] ?? '').split(' ')[0] || 'friend'}! 🎂 — Campus Delight`,
  displayName: 'Birthday greeting',
  previewData: { name: 'Amaka Obi', gender: 'female', age: 21 },
} satisfies TemplateEntry;
