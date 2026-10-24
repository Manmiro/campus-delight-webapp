export function naira(kobo: number | null | undefined): string {
  const value = (kobo ?? 0) / 100;
  return `₦${value.toLocaleString("en-NG", { minimumFractionDigits: value % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function tokens(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("en-NG");
}

export function formatTokensWithNaira(n: number | null | undefined): string {
  return `${tokens(n)} (${naira(n ?? 0)})`;
}

export function planLabel(plan: string): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export function tierLabel(tier: string): string {
  return tier.toUpperCase();
}

export function statusLabel(status: string): string {
  return status.split("_").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-NG", { dateStyle: "medium" });
}
