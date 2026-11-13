export const CANONICAL_REFERRAL_ORIGIN = "https://www.campusdelight.net";
const QR_RENDERER_ORIGIN = "https://quickchart.io/qr";

export function referralLinkFor(referralCode: string): string {
  return `${CANONICAL_REFERRAL_ORIGIN}/auth?mode=signup&ref=${encodeURIComponent(referralCode.trim())}`;
}

export function referralQrImageUrl(referralUrl: string): string {
  const query = new URLSearchParams({
    text: referralUrl,
    format: "svg",
    size: "320",
    margin: "4",
    ecLevel: "Q",
    dark: "17220a",
    light: "ffffff",
  });
  return `${QR_RENDERER_ORIGIN}?${query.toString()}`;
}
