import * as React from 'react';
import { Text } from '@react-email/components';
import { AuthEmailLayout, authTextStyle } from './auth-email-layout';

interface EmailChangeEmailProps { siteName: string; oldEmail: string; email: string; newEmail: string; confirmationUrl: string; }

export const EmailChangeEmail = ({ siteName, oldEmail, newEmail, confirmationUrl }: EmailChangeEmailProps) => (
  <AuthEmailLayout siteName={siteName} preview={`Confirm your email change for ${siteName}`} title="Confirm your email change" actionLabel="Confirm email change" actionUrl={confirmationUrl} notice="If you didn’t request this change, secure your account immediately.">
    <Text style={authTextStyle}>You requested to change your email address for {siteName}. Confirm this change using the button below.</Text>
    <Text style={authTextStyle}>Current email: <strong>{oldEmail || 'Your current address'}</strong><br />New email: <strong>{newEmail || 'Your requested address'}</strong></Text>
  </AuthEmailLayout>
);

export default EmailChangeEmail;
