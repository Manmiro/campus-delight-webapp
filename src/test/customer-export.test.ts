import { describe, expect, it } from "vitest";
import { customersCsv, customersCsvFilename, type CustomerExportRow } from "@/lib/customer-export";

const base: CustomerExportRow = {
  id: "11111111-1111-1111-1111-111111111111",
  full_name: "Ada Obi",
  email: "ada@example.com",
  phone: "08031234567",
  customer_code: "CD050619",
  referral_code: "CD050620",
  verification_status: "verified",
  is_active: true,
  created_at: "2026-03-04T09:15:00+00:00",
  outlet: { name: "Ebonyi State University Outlet" },
};

function rowsOf(csv: string): string[] {
  return csv.replace(/^\uFEFF/, "").trimEnd().split("\r\n");
}

describe("customersCsv", () => {
  it("starts with a header row and one line per customer", () => {
    const csv = customersCsv([base]);
    const lines = rowsOf(csv);
    expect(lines[0]).toBe("Customer ID,Referral code,Full name,Email,Phone,Outlet,Joined,Status,Verified");
    expect(lines[1]).toBe("CD050619,CD050620,Ada Obi,ada@example.com,08031234567,Ebonyi State University Outlet,2026-03-04,Active,Yes");
    expect(lines).toHaveLength(2);
  });

  it("writes the file with a UTF-8 BOM so Excel keeps accents intact", () => {
    expect(customersCsv([base]).startsWith("\uFEFF")).toBe(true);
  });

  it("quotes and escapes names containing commas and quotes so a row never splits", () => {
    const csv = customersCsv([
      { ...base, full_name: 'Obi, "Junior" \nEze', email: null, phone: null },
    ]);
    const lines = rowsOf(csv);
    expect(lines[1]).toContain('"Obi, ""Junior"" \nEze",,');
    // The embedded newline is inside the quoted field, so the export still has
    // exactly a header plus one data record.
    expect(csv.trimEnd().split("\r\n")).toHaveLength(2);
  });

  it("neutralises contact values that would run as a spreadsheet formula", () => {
    const csv = customersCsv([{ ...base, email: "=HYPERLINK(\"http://evil\")" }]);
    expect(rowsOf(csv)[1]).toContain("'=HYPERLINK(\"\"http://evil\"\")");
  });

  it("marks inactive and unverified customers explicitly", () => {
    const csv = customersCsv([{ ...base, is_active: false, verification_status: "pending", referral_code: null }]);
    expect(rowsOf(csv)[1]).toBe("CD050619,,Ada Obi,ada@example.com,08031234567,Ebonyi State University Outlet,2026-03-04,Inactive,No");
  });

  it("names the file with the export date", () => {
    expect(customersCsvFilename(new Date("2026-10-24T10:00:00Z"))).toBe("campus-delight-customers-2026-10-24.csv");
    expect(customersCsvFilename()).toMatch(/^campus-delight-customers-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
