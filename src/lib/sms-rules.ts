export function smsPhone(raw: string): string {
  const value = raw.trim().replace(/[\s()-]/g, "");
  const international = /^0\d{10}$/.test(value) ? `+234${value.slice(1)}` : /^234\d{10}$/.test(value) ? `+${value}` : value;
  if (!/^\+[1-9]\d{7,14}$/.test(international)) throw new Error("Enter a valid phone number in your profile, such as 0803 000 0000");
  return international;
}

export function verificationMessage(code: string): string {
  if (!/^\d{5}$/.test(code)) throw new Error("Invalid verification code");
  return `Your Campus Delight verification code is ${code}. It expires in 5 minutes. Do not share this code.`;
}