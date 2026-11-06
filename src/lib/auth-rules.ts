import { normalizeNigerianPhone } from "@/lib/sms-rules";

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

// Common disposable providers used to evade confirmation and account limits.
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com",
  "10minutemail.net",
  "dispostable.com",
  "emailondeck.com",
  "fakemail.net",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "grr.la",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "minuteinbox.com",
  "moakt.com",
  "sharklasers.com",
  "temp-mail.io",
  "temp-mail.org",
  "tempmail.com",
  "tempmail.net",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.me",
  "yopmail.com",
]);

export function normalizeEmailAddress(value: string): string {
  const email = value.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return email;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!GMAIL_DOMAINS.has(domain)) return email;

  return `${(local.split("+", 1)[0] ?? "").replace(/\./g, "")}@gmail.com`;
}

export function isDisposableEmailAddress(value: string): boolean {
  const email = normalizeEmailAddress(value);
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return false;
  const domain = email.slice(at + 1);
  return Array.from(DISPOSABLE_EMAIL_DOMAINS).some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}

export function validateEmailAddress(value: string, options: { rejectDisposable?: boolean } = {}): string | undefined {
  const email = normalizeEmailAddress(value);
  if (!email) return "Enter your email address";
  if (email.length > 255) return "Email address must be 255 characters or fewer";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "Enter a valid email address, such as you@example.com";
  if (options.rejectDisposable && isDisposableEmailAddress(email)) return "Temporary email addresses are not accepted. Use a permanent email address.";
  return undefined;
}

export function validateSignInCredentials(email: string, password: string) {
  if (!email.trim()) throw new Error("Enter your email address");
  if (!password) throw new Error("Enter your password");
  return { email: normalizeEmailAddress(email), password };
}

export function hasConfirmedEmail(user: { email_confirmed_at?: string | null } | null): boolean {
  return Boolean(user?.email_confirmed_at);
}

export type SignUpForm = {
  fullName: string;
  email: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  outletId: string;
  password: string;
  confirmPassword: string;
  referralCode: string;
  acceptedTerms: boolean;
};

export type FormErrors = Partial<Record<keyof SignUpForm | "referralCode", string>>;

/**
 * Every sign-up field is required except the referral code, which stays optional.
 * Rules live here so the form, future forms and tests all agree.
 */
export function validateSignUpForm(form: SignUpForm): FormErrors {
  const errors: FormErrors = {};

  const fullName = form.fullName.trim();
  if (!fullName) errors.fullName = "Enter your full name";
  else if (fullName.length > 100) errors.fullName = "Full name must be 100 characters or fewer";

  const emailError = validateEmailAddress(form.email, { rejectDisposable: true });
  if (emailError) errors.email = emailError;

  if (!form.phone.trim()) errors.phone = "Enter your phone number";
  else {
    try {
      normalizeNigerianPhone(form.phone);
    } catch {
      errors.phone = "Enter a valid phone number, such as 0803 000 0000";
    }
  }

  if (!form.gender) errors.gender = "Select your gender";
  else if (form.gender !== "male" && form.gender !== "female") errors.gender = "Select your gender";

  if (!form.dateOfBirth) errors.dateOfBirth = "Enter your date of birth";
  else {
    const dob = new Date(form.dateOfBirth);
    if (Number.isNaN(dob.getTime())) errors.dateOfBirth = "Enter a valid date of birth";
    else if (dob.getTime() > Date.now()) errors.dateOfBirth = "Date of birth cannot be in the future";
    else if (dob.getFullYear() < 1900) errors.dateOfBirth = "Enter a real date of birth";
  }

  if (!form.outletId) errors.outletId = "Choose your Campus Delight outlet";

  if (!form.password) errors.password = "Enter a password";
  else if (form.password.length < MIN_PASSWORD_LENGTH) errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;

  if (!form.confirmPassword) errors.confirmPassword = "Confirm your password";
  else if (form.confirmPassword !== form.password) errors.confirmPassword = "Passwords do not match";

  if (!form.acceptedTerms) errors.acceptedTerms = "Please accept the Terms and Conditions and Privacy Policy";

  // referralCode is deliberately never validated: it is optional.
  return errors;
}

export function validateSignInForm(email: string, password: string): { email?: string; password?: string } {
  const errors: { email?: string; password?: string } = {};
  const emailError = validateEmailAddress(email);
  if (emailError) errors.email = emailError;
  if (!password) errors.password = "Enter your password";
  return errors;
}

export const MIN_PASSWORD_LENGTH = 8;

export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: string };

/** 0 = empty, 1 = too short / weak, 2 = fair, 3 = good, 4 = strong. */
export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: "" };
  if (password.length < MIN_PASSWORD_LENGTH) return { score: 1, label: "Too short" };
  let variety = 0;
  if (/[a-z]/.test(password)) variety++;
  if (/[A-Z]/.test(password)) variety++;
  if (/[0-9]/.test(password)) variety++;
  if (/[^A-Za-z0-9]/.test(password)) variety++;
  let points = variety + (password.length >= 12 ? 1 : 0);
  if (points <= 1) return { score: 1, label: "Weak" };
  if (points === 2) return { score: 2, label: "Fair" };
  if (points === 3) return { score: 3, label: "Good" };
  return { score: 4, label: "Strong" };
}
