import * as React from 'react';
import { Text } from '@react-email/components';
import { AuthEmailLayout, authTextStyle } from './auth-email-layout';

interface MagicLinkEmailProps { siteName: string; confirmationUrl: string; }

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <AuthEmailLayout siteName={siteName} preview={`Your sign-in link for ${siteName}`} title="Your sign-in link is ready" actionLabel="Sign in to my account" actionUrl={confirmationUrl} notice="This link expires shortly. If you didn’t request it, you can safely ignore this email.">
    <Text style={authTextStyle}>You requested a sign-in link for {siteName}. Use the button below to securely access your account.</Text>
    
  </AuthEmailLayout>
);

export default MagicLinkEmail;
