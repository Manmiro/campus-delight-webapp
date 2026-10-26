import { smsPhone } from "@/lib/sms-rules";

export function validateSignInCredentials(email: string, password: string) {
  if (!email.trim()) throw new Error("Enter your email address");
  if (!password) throw new Error("Enter your password");
  return { email: email.trim(), password };
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

  const email = form.email.trim();
  if (!email) errors.email = "Enter your email address";
  else if (email.length > 255) errors.email = "Email address must be 255 characters or fewer";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = "Enter a valid email address, such as you@example.com";

  if (!form.phone.trim()) errors.phone = "Enter your phone number";
  else {
    try {
      smsPhone(form.phone);
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
  else if (form.password.length < 6) errors.password = "Password must be at least 6 characters";

  if (!form.acceptedTerms) errors.acceptedTerms = "Please accept the Terms and Conditions and Privacy Policy";

  // referralCode is deliberately never validated: it is optional.
  return errors;
}

export function validateSignInForm(email: string, password: string): { email?: string; password?: string } {
  const errors: { email?: string; password?: string } = {};
  if (!email.trim()) errors.email = "Enter your email address";
  if (!password) errors.password = "Enter your password";
  return errors;
}
