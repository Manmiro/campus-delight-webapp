import { describe, expect, it } from "vitest";
import {
  canEnterAdminArea,
  canEnterCustomerArea,
  canEnterOutletArea,
  customerAreaRedirect,
  secondaryAreaFor,
} from "@/lib/role-nav";

describe("Role areas", () => {
  it("lets an ordinary customer into their dashboard but not headquarters", () => {
    expect(canEnterCustomerArea("customer")).toBe(true);
    expect(canEnterAdminArea("customer")).toBe(false);
    expect(canEnterOutletArea("customer")).toBe(false);
    expect(secondaryAreaFor("customer")).toBeNull();
  });

  it("keeps the personal dashboard reachable for headquarters admins who are also customers", () => {
    expect(canEnterCustomerArea("central_admin")).toBe(true);
    expect(canEnterAdminArea("central_admin")).toBe(true);
    expect(secondaryAreaFor("central_admin")).toEqual({ to: "/dashboard", label: "My Dashboard" });
  });

  it("keeps outlet staff out of the customer dashboard and points them at their outlet", () => {
    expect(canEnterCustomerArea("outlet_staff")).toBe(false);
    expect(canEnterOutletArea("outlet_staff")).toBe(true);
    expect(customerAreaRedirect("outlet_staff")).toBe("/outlet");
    expect(customerAreaRedirect("central_admin")).toBe("/admin");
  });
});
