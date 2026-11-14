import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ClipboardList,
  LockKeyhole,
  Pencil,
  Plus,
  Trash2,
  UnlockKeyhole,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { showFoodieError } from "@/lib/foodie-errors";
import {
  adminDeleteMenuItem,
  adminListOutletCatalog,
  adminListOutletOrders,
  adminListOutlets,
  adminUpdateOutlet,
  adminSetOutletPriceEditLock,
  adminUpsertMenuItem,
  adminUpsertPlanPrice,
} from "@/lib/admin.functions";
import { updateFoodOrder } from "@/lib/transactions.functions";
import { naira, formatDateTime } from "@/lib/format";
import { formatMealCap, parseMealCap } from "@/lib/meal-cap-rules";
import { MealCapField } from "@/components/meal-cap-field";
import { StatusBadge } from "@/components/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/operations")({
  component: AdminOperations,
  head: () => ({
    meta: [
      { title: "Outlet Operations — Campus Delight HQ" },
      {
        name: "description",
        content: "Manage every outlet's menu, prices and orders from Headquarters.",
      },
    ],
  }),
});

const outletsQuery = queryOptions({
  queryKey: ["admin", "operations-outlets"],
  queryFn: () => adminListOutlets(),
});
const CATEGORIES = ["meals", "rice", "pastries", "swallow", "drinks", "snacks", "sides"] as const;
const PLANS = ["weekend", "weekly", "monthly"] as const;
const TIERS = ["basic", "standard", "turbo"] as const;

type MenuForm = {
  id?: string;
  name: string;
  category: string;
  price: string;
  isCreditEligible: boolean;
  isAvailable: boolean;
};

function AdminOperations() {
  const qc = useQueryClient();
  const { data: outlets } = useSuspenseQuery(outletsQuery);
  const [outletId, setOutletId] = useState("");
  const [section, setSection] = useState<"catalog" | "orders">("catalog");
  const [menuForm, setMenuForm] = useState<MenuForm | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [lockReason, setLockReason] = useState("");
  const [capDraft, setCapDraft] = useState<string | null>(null);

  useEffect(() => {
    if (!outletId && outlets[0]) setOutletId(outlets[0].id);
  }, [outletId, outlets]);

  const selectedOutlet = outlets.find((outlet) => outlet.id === outletId) ?? null;
  const catalogQuery = useQuery({
    queryKey: ["admin", "outlet-catalog", outletId],
    queryFn: () => adminListOutletCatalog({ data: { outletId } }),
    enabled: Boolean(outletId),
  });
  const ordersQuery = useQuery({
    queryKey: ["admin", "outlet-orders", outletId],
    queryFn: () => adminListOutletOrders({ data: { outletId } }),
    enabled: Boolean(outletId) && section === "orders",
    refetchInterval: section === "orders" ? 5_000 : false,
    refetchIntervalInBackground: true,
  });

  const saveMenuItem = useServerFn(adminUpsertMenuItem);
  const deleteMenuItem = useServerFn(adminDeleteMenuItem);
  const savePlanPrice = useServerFn(adminUpsertPlanPrice);
  const setPriceLock = useServerFn(adminSetOutletPriceEditLock);
  const updateOutlet = useServerFn(adminUpdateOutlet);
  const submitOrderAction = useServerFn(updateFoodOrder);

  const refresh = () =>
    void qc.invalidateQueries({ queryKey: ["admin", "outlet-catalog", outletId] });
  const menuMutation = useMutation({
    mutationFn: (form: MenuForm) => {
      if (!outletId) throw new Error("Choose an outlet");
      if (!/^\d+(\.\d{1,2})?$/.test(form.price.trim()) || Number(form.price) <= 0)
        throw new Error("Enter a valid price in naira");
      return saveMenuItem({
        data: {
          outletId,
          name: form.name,
          category: form.category,
          priceKobo: Math.round(Number(form.price) * 100),
          isCreditEligible: form.isCreditEligible,
          isAvailable: form.isAvailable,
          ...(form.id ? { menuItemId: form.id } : {}),
        },
      });
    },
    onSuccess: () => {
      toast.success("Menu item saved");
      setMenuForm(null);
      refresh();
    },
    onError: (error) =>
      showFoodieError(error, "Could not save menu item"),
  });
  const deleteMutation = useMutation({
    mutationFn: (menuItemId: string) => deleteMenuItem({ data: { outletId, menuItemId } }),
    onSuccess: () => {
      toast.success("Menu item removed");
      refresh();
    },
    onError: (error) =>
      showFoodieError(error, "Could not remove menu item"),
  });
  const planMutation = useMutation({
    mutationFn: ({ plan, tier, price }: { plan: string; tier: string; price: string }) => {
      if (!/^\d+(\.\d{1,2})?$/.test(price.trim())) throw new Error("Enter a valid price in naira");
      return savePlanPrice({
        data: { outletId, plan, tier, priceKobo: Math.round(Number(price) * 100), isActive: true },
      });
    },
    onSuccess: () => {
      toast.success("Plan price saved");
      refresh();
    },
    onError: (error) =>
      showFoodieError(error, "Could not save plan price"),
  });
  const lockMutation = useMutation({
    mutationFn: (locked: boolean) => {
      if (!lockReason.trim()) throw new Error("Enter a reason for this price-edit control");
      return setPriceLock({ data: { outletId, locked, reason: lockReason } });
    },
    onSuccess: () => {
      toast.success(
        selectedOutlet?.price_edit_locked ? "Price edits unlocked" : "Price edits locked",
      );
      setLockReason("");
      void qc.invalidateQueries({ queryKey: outletsQuery.queryKey });
      void qc.invalidateQueries({ queryKey: ["admin", "outlet-catalog", outletId] });
    },
    onError: (error) =>
      showFoodieError(error, "Could not update price-edit lock"),
  });
  const orderMutation = useMutation({
    mutationFn: (input: { orderId: string; action: "fulfill" | "cancel" }) =>
      submitOrderAction({ data: input }),
    onSuccess: () => {
      toast.success("Order updated");
      void qc.invalidateQueries({ queryKey: ["admin", "outlet-orders", outletId] });
    },
    onError: (error) =>
      showFoodieError(error, "Could not update order"),
  });

  const menu = catalogQuery.data?.menu ?? [];
  const capMutation = useMutation({
    mutationFn: ({ outletId, capKobo }: { outletId: string; capKobo: number }) =>
      updateOutlet({ data: { outletId, mealCapKobo: capKobo } }),
    onSuccess: () => {
      toast.success("Meal cap updated");
      setCapDraft(null);
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ["delivery-fee"] });
    },
    onError: (error) => showFoodieError(error, "Could not update meal cap"),
  });
  const prices = catalogQuery.data?.prices ?? [];
  const locked =
    catalogQuery.data?.outlet.price_edit_locked ?? selectedOutlet?.price_edit_locked ?? false;
  const currentCap = catalogQuery.data?.outlet.meal_cap_kobo ?? selectedOutlet?.meal_cap_kobo;
  const capValue = capDraft ?? (currentCap === undefined ? "" : formatMealCap(currentCap));
  const parsedCap = parseMealCap(capValue);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="min-w-0 flex-1 basis-64">
            <Label htmlFor="operations-outlet">Outlet</Label>
            <Select
              value={outletId}
              disabled={capMutation.isPending}
              onValueChange={(value) => {
                setOutletId(value);
                setPriceDrafts({});
                setCapDraft(null);
              }}
            >
              <SelectTrigger id="operations-outlet" className="mt-1">
                <SelectValue placeholder="Choose an outlet" />
              </SelectTrigger>
              <SelectContent>
                {outlets.map((outlet) => (
                  <SelectItem key={outlet.id} value={outlet.id}>
                    {outlet.name} ({outlet.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              variant={section === "catalog" ? "default" : "outline"}
              onClick={() => setSection("catalog")}
            >
              <UtensilsCrossed className="mr-2 h-4 w-4" /> Menu & prices
            </Button>
            <Button
              variant={section === "orders" ? "default" : "outline"}
              onClick={() => setSection("orders")}
            >
              <ClipboardList className="mr-2 h-4 w-4" /> Orders
            </Button>
          </div>
        </CardContent>
      </Card>

      {section === "catalog" && (
        <>
          <h2 className="font-display text-lg font-semibold">Outlet Settings</h2>
          <section aria-label="Outlet Settings" className="grid min-w-0 gap-4 lg:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-lg">Price Edit Lock</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {locked
                      ? "Managers cannot change menu or food-plan prices at this outlet."
                      : "The outlet manager may edit this outlet's prices."}
                  </p>
                  <Badge variant={locked ? "destructive" : "outline"}>
                    {locked ? "Price edits locked" : "Price edits open"}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-0 flex-1 basis-64">
                    <Label htmlFor="lock-reason">Reason (required for audit)</Label>
                    <Input
                      id="lock-reason"
                      className="mt-1"
                      value={lockReason}
                      onChange={(event) => setLockReason(event.target.value)}
                      maxLength={500}
                      placeholder="HQ pricing review"
                    />
                  </div>
                  <Button
                    variant={locked ? "outline" : "destructive"}
                    disabled={lockMutation.isPending || !lockReason.trim()}
                    onClick={() => lockMutation.mutate(!locked)}
                  >
                    {locked ? (
                      <UnlockKeyhole className="mr-2 h-4 w-4" />
                    ) : (
                      <LockKeyhole className="mr-2 h-4 w-4" />
                    )}
                    {locked ? "Unlock price edits" : "Lock price edits"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-lg">Meal Plan Cap Per Meal</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <MealCapField id="operations-meal-cap" value={capValue} onChange={setCapDraft} disabled={capMutation.isPending || currentCap === undefined} />
                <Button disabled={capMutation.isPending || currentCap === undefined || parsedCap === null || parsedCap === currentCap}
                  onClick={() => { if (parsedCap !== null) capMutation.mutate({ outletId, capKobo: parsedCap }); }}>
                  {capMutation.isPending ? "Updating…" : "Update Cap"}
                </Button>
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="font-display text-lg">Menu items</CardTitle>
              <Button
                onClick={() =>
                  setMenuForm({
                    name: "",
                    category: "rice",
                    price: "",
                    isCreditEligible: true,
                    isAvailable: true,
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" /> Add item
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead>Available</TableHead>
                      <TableHead>Pay-later</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {menu.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="capitalize">{item.category}</TableCell>
                        <TableCell className="text-right">{naira(item.price_kobo)}</TableCell>
                        <TableCell>{item.is_available ? "Yes" : "No"}</TableCell>
                        <TableCell>{item.is_credit_eligible ? "Yes" : "No"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setMenuForm({
                                  id: item.id,
                                  name: item.name,
                                  category: item.category,
                                  price: String(item.price_kobo / 100),
                                  isCreditEligible: item.is_credit_eligible,
                                  isAvailable: item.is_available,
                                })
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive"
                              onClick={() => deleteMutation.mutate(item.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {menu.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-8 text-center text-sm text-muted-foreground"
                        >
                          No menu items configured for this outlet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-lg">Food plan prices</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    {TIERS.map((tier) => (
                      <TableHead key={tier} className="text-right">
                        {tier.toUpperCase()}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PLANS.map((plan) => (
                    <TableRow key={plan}>
                      <TableCell className="font-medium capitalize">{plan}</TableCell>
                      {TIERS.map((tier) => {
                        const current = prices.find(
                          (price) => price.plan === plan && price.tier === tier,
                        );
                        const key = `${plan}-${tier}`;
                        const draft =
                          priceDrafts[key] ?? (current ? String(current.price_kobo / 100) : "");
                        return (
                          <TableCell key={tier} className="text-right">
                            <div className="inline-flex items-center gap-1">
                              <Input
                                className="h-8 w-28 text-right"
                                inputMode="decimal"
                                value={draft}
                                onChange={(event) =>
                                  setPriceDrafts((drafts) => ({
                                    ...drafts,
                                    [key]: event.target.value,
                                  }))
                                }
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!draft || planMutation.isPending}
                                onClick={() => planMutation.mutate({ plan, tier, price: draft })}
                              >
                                Save
                              </Button>
                            </div>
                            {current && !current.is_active && (
                              <p className="mt-1 text-[10px] text-muted-foreground">Inactive</p>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {section === "orders" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-lg">
              Orders — {selectedOutlet?.name ?? "Outlet"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Fulfillment</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(ordersQuery.data ?? []).map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDateTime(order.created_at)}
                      </TableCell>
                      <TableCell className="text-xs">
                        <p className="font-medium">{order.customer?.full_name}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {order.customer?.customer_code}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-60 text-xs">
                        {order.order_items
                          .map(
                            (item: { item_name: string; quantity: number }) =>
                              `${item.item_name} ×${item.quantity}`,
                          )
                          .join(", ")}
                      </TableCell>
                      <TableCell className="max-w-60 text-xs">
                        <p className="capitalize font-semibold">{order.fulfillment_method}</p>
                        {order.fulfillment_method === "delivery" && (
                          <>
                            <p className="whitespace-normal break-words">
                              {order.delivery_address}
                            </p>
                            <p className="text-muted-foreground">
                              Fee: {naira(order.delivery_fee_kobo)}
                            </p>
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold">
                        {naira(order.total_kobo)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {order.status === "confirmed" && (
                          <Button
                            size="sm"
                            onClick={() =>
                              orderMutation.mutate({ orderId: order.id, action: "fulfill" })
                            }
                            disabled={orderMutation.isPending}
                          >
                            Fulfill
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(ordersQuery.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        No orders for this outlet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={Boolean(menuForm)}
        onOpenChange={(open) => {
          if (!open && !menuMutation.isPending) setMenuForm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{menuForm?.id ? "Edit menu item" : "Add menu item"}</DialogTitle>
            <DialogDescription>
              Headquarters changes apply immediately at this outlet.
            </DialogDescription>
          </DialogHeader>
          {menuForm && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="hq-menu-name">Item name</Label>
                <Input
                  id="hq-menu-name"
                  className="mt-1"
                  value={menuForm.name}
                  onChange={(event) => setMenuForm({ ...menuForm, name: event.target.value })}
                />
              </div>
              <div>
                <Label>Category</Label>
                <Select
                  value={menuForm.category}
                  onValueChange={(value) => setMenuForm({ ...menuForm, category: value })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category} className="capitalize">
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="hq-menu-price">Price (₦)</Label>
                <Input
                  id="hq-menu-price"
                  className="mt-1"
                  inputMode="decimal"
                  value={menuForm.price}
                  onChange={(event) => setMenuForm({ ...menuForm, price: event.target.value })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="hq-menu-available">Available</Label>
                <Switch
                  id="hq-menu-available"
                  checked={menuForm.isAvailable}
                  onCheckedChange={(checked) => setMenuForm({ ...menuForm, isAvailable: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="hq-menu-credit">Pay-later eligible</Label>
                <Switch
                  id="hq-menu-credit"
                  checked={menuForm.isCreditEligible}
                  onCheckedChange={(checked) =>
                    setMenuForm({ ...menuForm, isCreditEligible: checked })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMenuForm(null)}>
              Cancel
            </Button>
            <Button
              disabled={!menuForm || !menuForm.name.trim() || menuMutation.isPending}
              onClick={() => menuForm && menuMutation.mutate(menuForm)}
            >
              Save item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
