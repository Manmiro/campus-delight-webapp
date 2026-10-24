import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from "@tanstack/react-query";
import { staffAssignmentQuery } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/outlet/staff")({
  component: OutletStaff,
  head: () => ({ meta: [{"title": "Staff — Campus Delight"}, {"name": "description", "content": "View and manage staff in your Campus Delight account."}, {"property": "og:title", "content": "Staff — Campus Delight"}, {"property": "og:description", "content": "View and manage staff in your Campus Delight account."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
});

function OutletStaff() {
  const { data: assignment } = useSuspenseQuery(staffAssignmentQuery);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Your assignment</CardTitle></CardHeader>
        <CardContent className="text-sm">
          <p>You are <Badge variant="outline" className="mx-1 bg-secondary text-secondary-foreground">{assignment?.staff_role === "outlet_manager" ? "Outlet Manager" : "Outlet Staff"}</Badge> at <span className="font-semibold">{assignment?.outlet?.name}</span>.</p>
          <p className="mt-2 text-muted-foreground">
            Staff accounts are created and assigned by headquarters. As manager, you control the outlet's menu,
            prices, and daily fulfillment — customer and transaction records stay inside this outlet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
