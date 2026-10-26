import * as React from 'react';
import { Text } from '@react-email/components';
import { AuthEmailLayout, authTextStyle } from './auth-email-layout';

interface InviteEmailProps { siteName: string; siteUrl: string; confirmationUrl: string; }

export const InviteEmail = ({ siteName, confirmationUrl }: InviteEmailProps) => (
  <AuthEmailLayout siteName={siteName} preview={`You have been invited to ${siteName}`} title="Your invitation is ready" actionLabel="Accept my invitation" actionUrl={confirmationUrl} notice="If you weren’t expecting this invitation, you can safely ignore this email.">
    <Text style={authTextStyle}>You’ve been invited to join {siteName}. Accept your invitation to set up your account.</Text>
    
  </AuthEmailLayout>
);

export default InviteEmail;
