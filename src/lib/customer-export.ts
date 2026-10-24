import { CSV_BOM, toCsv } from "./csv";

export type CustomerExportRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  customer_code: string;
  referral_code?: string | null;
  verification_status: string | null;
  is_active: boolean;
  created_at: string;
  outlet: { name?: string } | null;
};

const HEADERS = [
  "Customer ID",
  "Referral code",
  "Full name",
  "Email",
  "Phone",
  "Outlet",
  "Joined",
  "Status",
  "Verified",
];

function joinedDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** Build the CSV for exactly the customer rows the admin page is showing. */
export function customersCsv(customers: CustomerExportRow[]): string {
  const rows = customers.map((c) => [
    c.customer_code,
    c.referral_code ?? "",
    c.full_name,
    c.email ?? "",
    c.phone ?? "",
    c.outlet?.name ?? "",
    joinedDate(c.created_at),
    c.is_active ? "Active" : "Inactive",
    c.verification_status === "verified" ? "Yes" : "No",
  ]);
  return CSV_BOM + toCsv(HEADERS, rows);
}

export function customersCsvFilename(date: Date = new Date()): string {
  return `campus-delight-customers-${date.toISOString().slice(0, 10)}.csv`;
}
