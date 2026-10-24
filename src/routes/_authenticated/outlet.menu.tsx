import { createFileRoute } from '@tanstack/react-router'
import { useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { staffAssignmentQuery, myMenuQuery, myPlanPricesQuery } from "@/lib/queries";
import { naira } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/outlet/menu")({
  component: OutletMenu,
  head: () => ({ meta: [{ title: "Menu & Pricing — Campus Delight" }] }),
});

const CATEGORIES = ["meals", "swallow", "drinks", "snacks", "sides"] as const;
const PLANS = ["weekend", "weekly", "monthly"] as const;
const TIERS = ["basic", "standard", "turbo"] as const;

function OutletMenu() {
  const qc = useQueryClient();
  const { data: assignment } = useSuspenseQuery(staffAssignmentQuery);
  const outletId = assignment?.outlet_id ?? "";
  const isManager = assignment?.staff_role === "outlet_manager";
  const { data: menu } = useSuspenseQuery(myMenuQuery(outletId));
  const { data: prices } = useSuspenseQuery(myPlanPricesQuery(outletId));

  const [name, setName] = useState("");
  const [category, setCategory] = useState("meals");
  const [price, setPrice] = useState("");
  const [creditEligible, setCreditEligible] = useState(true);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  const addItem = useMutation({
    mutationFn: async () => {
      if (!name || !price) throw new Error("Item name and price are required");
      const { error } = await supabase.from("menu_items").insert({
        outlet_id: outletId,
        name: name.trim(),
        category,
        price_kobo: Math.round(Number(price) * 100),
        is_credit_eligible: creditEligible,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Menu item added");
      setName(""); setPrice("");
      void qc.invalidateQueries({ queryKey: ["menu", outletId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add item"),
  });

  const patchItem = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("menu_items").update(patch as { [key: string]: never }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["menu", outletId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const savePrice = useMutation({
    mutationFn: async ({ plan, tier, priceKobo }: { plan: string; tier: string; priceKobo: number }) => {
      const { error } = await supabase
        .from("outlet_plan_prices")
        .upsert({ outlet_id: outletId, plan, tier, price_kobo: priceKobo, is_active: true }, { onConflict: "outlet_id,plan,tier" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Price saved");
      void qc.invalidateQueries({ queryKey: ["plan-prices", outletId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save price"),
  });

  return (
    <div className="space-y-8">
      {isManager && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Add a menu item</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1">
                <Label htmlFor="mi-name">Item name</Label>
                <Input id="mi-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jollof rice and beef" />
              </div>
              <div className="w-40">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="w-36">
                <Label htmlFor="mi-price">Price (₦)</Label>
                <Input id="mi-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1500" />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch id="mi-credit" checked={creditEligible} onCheckedChange={setCreditEligible} />
                <Label htmlFor="mi-credit" className="text-xs">Pay-later eligible</Label>
              </div>
              <Button onClick={() => addItem.mutate()} disabled={addItem.isPending}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Menu items</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Pay-later</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {menu.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-sm font-medium">{m.name}</TableCell>
                  <TableCell className="text-xs capitalize">{m.category}</TableCell>
                  <TableCell className="text-right text-sm">{naira(m.price_kobo)}</TableCell>
                  <TableCell>
                    <Switch checked={m.is_available} disabled={!isManager}
                      onCheckedChange={(v) => patchItem.mutate({ id: m.id, patch: { is_available: v } })} />
                  </TableCell>
                  <TableCell>
                    <Switch checked={m.is_credit_eligible} disabled={!isManager}
                      onCheckedChange={(v) => patchItem.mutate({ id: m.id, patch: { is_credit_eligible: v } })} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-lg">Subscription pricing</CardTitle>
          <p className="text-xs text-muted-foreground">Your outlet's own prices — customers only ever see these rates.</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  {TIERS.map((t) => <TableHead key={t} className="text-right">{t.toUpperCase()}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {PLANS.map((p) => (
                  <TableRow key={p}>
                    <TableCell className="text-sm font-medium capitalize">{p}</TableCell>
                    {TIERS.map((t) => {
                      const current = prices.find((pr) => pr.plan === p && pr.tier === t);
                      const key = `${p}-${t}`;
                      return (
                        <TableCell key={t} className="text-right">
                          {isManager ? (
                            <div className="inline-flex items-center gap-1">
                              <Input
                                className="h-8 w-24 text-right"
                                inputMode="decimal"
                                placeholder={current ? String(current.price_kobo / 100) : "—"}
                                value={priceDrafts[key] ?? ""}
                                onChange={(e) => setPriceDrafts((d) => ({ ...d, [key]: e.target.value }))}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!priceDrafts[key]}
                                onClick={() => savePrice.mutate({ plan: p, tier: t, priceKobo: Math.round(Number(priceDrafts[key]) * 100) })}
                              >
                                Save
                              </Button>
                            </div>
                          ) : (
                            <span className="text-sm">{current ? naira(current.price_kobo) : "—"}</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
