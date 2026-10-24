export function validateSignInCredentials(email: string, password: string) {
  if (!email.trim()) throw new Error("Enter your email address");
  if (!password) throw new Error("Enter your password");
  return { email: email.trim(), password };
}

export function hasConfirmedEmail(user: { email_confirmed_at?: string | null } | null): boolean {
  return Boolean(user?.email_confirmed_at);
}