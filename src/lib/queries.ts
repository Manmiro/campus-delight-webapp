import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

function lagosToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
}

export const profileQuery = queryOptions({
  queryKey: ["me", "profile"],
  queryFn: async () => {
    const id = await getUserId();
    const { data, error } = await supabase.from("profiles").select("*").eq("id", id).single();
    if (error) throw new Error(error.message);
    return data;
  },
});

export const walletQuery = queryOptions({
  queryKey: ["me", "wallet"],
  queryFn: async () => {
    const { data, error } = await supabase.from("wallets").select("balance_kobo").single();
    if (error) throw new Error(error.message);
    return data;
  },
});

export const tokenAccountQuery = queryOptions({
  queryKey: ["me", "tokens"],
  queryFn: async () => {
    const { data, error } = await supabase.from("token_accounts").select("available_tokens, locked_tokens").single();
    if (error) throw new Error(error.message);
    return data;
  },
});

export const subscriptionsQuery = queryOptions({
  queryKey: ["me", "subscriptions"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});

export const todayEntitlementsQuery = queryOptions({
  queryKey: ["me", "entitlements", lagosToday()],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("meal_entitlements")
      .select("id, subscription_id, allowance, redeemed, service_date")
      .eq("service_date", lagosToday());
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});

export const creditQuery = queryOptions({
  queryKey: ["me", "credit"],
  queryFn: async () => {
    const { data, error } = await supabase.from("customer_credit").select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },
});

export const loansQuery = queryOptions({
  queryKey: ["me", "loans"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("loans")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});

export const ordersQuery = queryOptions({
  queryKey: ["me", "orders"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});

export const notificationsQuery = queryOptions({
  queryKey: ["me", "notifications"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});

export const walletLedgerQuery = queryOptions({
  queryKey: ["me", "wallet-ledger"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("wallet_ledger")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});

export const tokenLedgerQuery = queryOptions({
  queryKey: ["me", "token-ledger"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("token_ledger")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});

export const tokenTransfersQuery = queryOptions({
  queryKey: ["me", "token-transfers"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("token_transfers")
      .select("*, sender:profiles!token_transfers_sender_id_fkey(full_name, customer_code), recipient:profiles!token_transfers_recipient_id_fkey(full_name, customer_code)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});

export const referralsQuery = queryOptions({
  queryKey: ["me", "referrals"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("referrals")
      .select("*, referred:profiles!referrals_referred_id_fkey(full_name, customer_code)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});

export const transferApplicationsQuery = queryOptions({
  queryKey: ["me", "transfer-applications"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("outlet_transfer_applications")
      .select("*, from_outlet:outlets!outlet_transfer_applications_from_outlet_id_fkey(name), to_outlet:outlets!outlet_transfer_applications_to_outlet_id_fkey(name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});

export const myMenuQuery = (outletId: string) =>
  queryOptions({
    queryKey: ["menu", outletId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("outlet_id", outletId)
        .order("category")
        .order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

export const myPlanPricesQuery = (outletId: string) =>
  queryOptions({
    queryKey: ["plan-prices", outletId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outlet_plan_prices")
        .select("*")
        .eq("outlet_id", outletId)
        .order("plan")
        .order("price_kobo");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

export const repaymentsQuery = queryOptions({
  queryKey: ["me", "repayments"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("loan_repayments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});

export const creditHistoryQuery = queryOptions({
  queryKey: ["me", "credit-history"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("credit_limit_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});
