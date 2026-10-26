import * as React from 'react';
import { Text } from '@react-email/components';
import { AuthEmailLayout, authTextStyle } from './auth-email-layout';

interface RecoveryEmailProps { siteName: string; confirmationUrl: string; }

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <AuthEmailLayout siteName={siteName} preview={`Reset your password for ${siteName}`} title="Reset your password" actionLabel="Reset my password" actionUrl={confirmationUrl} notice="If you didn’t request this, ignore this email. Your password will not change unless you complete the reset.">
    <Text style={authTextStyle}>We received a request to reset your password for {siteName}. Choose a new password using the button below.</Text>
    
  </AuthEmailLayout>
);

export default RecoveryEmail;
