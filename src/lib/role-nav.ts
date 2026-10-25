export type AppRole = "customer" | "outlet_manager" | "outlet_staff" | "central_admin";

/**
 * A headquarters admin is also an ordinary customer: they keep their own profile,
 * wallet, tokens and outlet. The personal dashboard must stay reachable for them,
 * otherwise there is no way to leave the headquarters console.
 */
export const canEnterCustomerArea = (role: AppRole) => role === "customer" || role === "central_admin";

export const canEnterAdminArea = (role: AppRole) => role === "central_admin";

export const canEnterOutletArea = (role: AppRole) => role === "outlet_manager" || role === "outlet_staff";

/** Where a customer-area visit goes when the role is not allowed there. */
export const customerAreaRedirect = (role: AppRole): "/admin" | "/outlet" =>
  role === "central_admin" ? "/admin" : "/outlet";

/** The other console a signed-in person can hop to, or null when there is none. */
export const secondaryAreaFor = (role: AppRole): { to: "/dashboard"; label: string } | null =>
  role === "central_admin" ? { to: "/dashboard", label: "My Dashboard" } : null;
