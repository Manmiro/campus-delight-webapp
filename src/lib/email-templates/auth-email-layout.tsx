import * as React from 'react';
import { Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text } from '@react-email/components';

const origin = 'https://campus-delight-webapp.lovable.app';
const palette = { green: '#78A61B', gold: '#B8860B', white: '#FFFFFF', ink: '#23321D', muted: '#626D5A', soft: '#F3F7EC' };

interface AuthEmailLayoutProps {
  siteName?: string;
  preview: string;
  title: string;
  children: React.ReactNode;
  actionLabel?: string;
  actionUrl?: string;
  notice: string;
}

export function AuthEmailLayout({ siteName = 'Campus Delight', preview, title, children, actionLabel, actionUrl, notice }: AuthEmailLayoutProps) {
  return <Html lang="en" dir="ltr"><Head /><Preview>{preview}</Preview>
    <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: palette.ink, margin: 0 }}>
      <Container style={{ maxWidth: 560, padding: '24px 16px' }}>
        <Section style={{ textAlign: 'center', padding: '0 0 20px' }}>
          <Img src={`${origin}/apple-touch-icon.png`} alt="Campus Delight logo" width="64" height="64" style={{ margin: '0 auto', borderRadius: 32 }} />
          <Text style={{ fontSize: 19, fontWeight: 700, margin: '10px 0 4px' }}>{siteName}</Text>
          <Text style={{ color: palette.gold, fontSize: 12, margin: 0 }}>Feeding the Future with Honour</Text>
        </Section>
        <Img src={`${origin}/email-meal.jpg`} alt="Jollof rice, chicken and plantain" width="528" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px 8px 0 0' }} />
        <Section style={{ backgroundColor: palette.green, padding: 24, borderRadius: '0 0 8px 8px' }}>
          <Text style={{ color: palette.white, fontSize: 12, fontWeight: 700, margin: '0 0 8px' }}>YOUR CAMPUS DELIGHT ACCOUNT</Text>
          <Heading style={{ color: palette.white, fontSize: 27, lineHeight: '34px', margin: 0 }}>{title}</Heading>
        </Section>
        <Section style={{ padding: '24px 8px 0' }}>
          {children}
          {actionLabel && actionUrl && <Section style={{ textAlign: 'center', padding: '12px 0 24px' }}>
            <Button href={actionUrl} style={{ backgroundColor: palette.green, color: palette.white, borderRadius: 8, fontWeight: 700, fontSize: 14, padding: '14px 24px' }}>{actionLabel} →</Button>
          </Section>}
          <Section style={{ backgroundColor: palette.soft, padding: 16, borderRadius: 8 }}>
            <Text style={{ color: palette.muted, fontSize: 12, lineHeight: '20px', margin: 0 }}>{notice}</Text>
          </Section>
          <Text style={{ textAlign: 'center', color: palette.gold, fontSize: 12, margin: '24px 0 8px' }}>Fresh from Campus Delight · Just for your account</Text>
        </Section>
      </Container>
    </Body>
  </Html>;
}

export const authTextStyle = { color: palette.muted, fontSize: 15, lineHeight: '24px', margin: '0 0 18px', overflowWrap: 'anywhere' as const };
export const authCodeStyle = { backgroundColor: palette.soft, color: palette.ink, border: `1px solid ${palette.gold}`, borderRadius: 8, fontFamily: 'Courier, monospace', fontSize: 30, fontWeight: 700, textAlign: 'center' as const, padding: '18px 12px', margin: '8px 0 24px' };