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

/** The console a signed-in person can hop to next, or null when they have no access to it. */
export const headquartersLink = (role: AppRole): { to: "/admin"; label: string } | null =>
  canEnterAdminArea(role) ? { to: "/admin", label: "Headquarters" } : null;

export const personalDashboardLink = (role: AppRole): { to: "/dashboard"; label: string } | null =>
  canEnterCustomerArea(role) ? { to: "/dashboard", label: "My Dashboard" } : null;

