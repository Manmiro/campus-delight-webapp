import * as React from 'react';
import { Text } from '@react-email/components';
import { AuthEmailLayout, authCodeStyle, authTextStyle } from './auth-email-layout';

interface ReauthenticationEmailProps { token: string }
export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <AuthEmailLayout preview="Your Campus Delight verification code" title="Confirm it’s really you" notice="This code expires shortly. Never share it with anyone. If you didn’t request it, ignore this email.">
    <Text style={authTextStyle}>Use this verification code to confirm your identity and continue your account request:</Text>
    <Text style={authCodeStyle}>{token}</Text>
  </AuthEmailLayout>
);
export default ReauthenticationEmail;
