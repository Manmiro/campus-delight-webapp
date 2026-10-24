import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { staffAssignmentQuery, outletOrdersQuery } from "@/lib/queries";
import { naira, formatDateTime } from "@/lib/format";
import { EmptyState, StatusBadge } from "@/components/bits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/_outlet/orders")({
  component: OutletOrders,
  head: () => ({ meta: [{ title: "Orders & Fulfillment — Campus Delight" }] }),
});

function OutletOrders() {
  const qc = useQueryClient();
  const { data: assignment } = useSuspenseQuery(staffAssignmentQuery);
  const { data: orders } = useSuspenseQuery(outletOrdersQuery(assignment?.outlet_id ?? ""));

  const act = useMutation({
    mutationFn: async ({ orderId, action }: { orderId: string; action: "fulfill" | "cancel" }) => {
      const { error } = await supabase.rpc(action === "fulfill" ? "fulfill_order" : "cancel_order", {
        p_order_id: orderId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Done");
      void qc.invalidateQueries({ queryKey: ["outlet"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action failed"),
  });

  if (orders.length === 0) {
    return <EmptyState title="No orders yet" hint="Customer orders at your outlet will appear here for fulfillment." />;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="whitespace-nowrap text-xs">{formatDateTime(o.created_at)}</TableCell>
                <TableCell className="text-xs">
                  <p className="font-medium">{o.customer?.full_name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{o.customer?.customer_code}</p>
                </TableCell>
                <TableCell className="max-w-52 text-xs">{o.order_items.map((i: { item_name: string; quantity: number }) => `${i.item_name} ×${i.quantity}`).join(", ")}</TableCell>
                <TableCell className="text-xs">{o.payment_method.replace("_", " ")}</TableCell>
                <TableCell className="text-right text-xs font-semibold">{naira(o.total_kobo)}</TableCell>
                <TableCell><StatusBadge status={o.status} /></TableCell>
                <TableCell className="text-right">
                  {o.status === "confirmed" ? (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" onClick={() => act.mutate({ orderId: o.id, action: "fulfill" })}>Fulfill</Button>
                      <Button size="sm" variant="outline" onClick={() => act.mutate({ orderId: o.id, action: "cancel" })}>Cancel</Button>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
