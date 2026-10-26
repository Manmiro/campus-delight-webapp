import * as React from 'react';
import { Text } from '@react-email/components';
import { AuthEmailLayout, authTextStyle } from './auth-email-layout';

interface SignupEmailProps { siteName: string; siteUrl: string; recipient: string; confirmationUrl: string; }

export const SignupEmail = ({ siteName, recipient, confirmationUrl }: SignupEmailProps) => (
  <AuthEmailLayout siteName={siteName} preview={`Confirm your email for ${siteName}`} title="Confirm your email" actionLabel="Verify my email" actionUrl={confirmationUrl} notice="If you didn’t create this account, you can safely ignore this email.">
    <Text style={authTextStyle}>Thanks for joining {siteName}. Confirm your email address to finish setting up your account.</Text>
    <Text style={authTextStyle}>Email address: <strong>{recipient}</strong></Text>
  </AuthEmailLayout>
);

export default SignupEmail;
