import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const listOutlets = createServerFn({ method: "GET" }).handler(async () => {
  const db = publicClient();
  const { data, error } = await db
    .from("outlets")
    .select("id, name, code, location, status")
    .eq("status", "active")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const getMenuForOutlet = createServerFn({ method: "GET" })
  .inputValidator((input: { outletId: string }) => input)
  .handler(async ({ data }) => {
    const db = publicClient();
    const { data: items, error } = await db
      .from("menu_items")
      .select("id, name, description, category, price_kobo, is_available, is_credit_eligible")
      .eq("outlet_id", data.outletId)
      .order("category")
      .order("name");
    if (error) throw new Error(error.message);
    return items ?? [];
  });

export const getPlanPricesForOutlet = createServerFn({ method: "GET" })
  .inputValidator((input: { outletId: string }) => input)
  .handler(async ({ data }) => {
    const db = publicClient();
    const { data: prices, error } = await db
      .from("outlet_plan_prices")
      .select("plan, tier, price_kobo, is_active")
      .eq("outlet_id", data.outletId)
      .eq("is_active", true)
      .order("price_kobo");
    if (error) throw new Error(error.message);
    return prices ?? [];
  });
