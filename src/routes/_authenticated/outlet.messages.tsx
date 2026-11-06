import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { DashboardMessages } from "@/components/dashboard-messages";
import { staffAssignmentQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/outlet/messages")({
  component: OutletMessages,
  head: () => ({
    meta: [
      { title: "Messages — Campus Delight Outlet" },
      {
        name: "description",
        content: "Message Campus Delight headquarters from your outlet dashboard.",
      },
    ],
  }),
});

function OutletMessages() {
  const { data: assignment } = useSuspenseQuery(staffAssignmentQuery);
  return <DashboardMessages mode="outlet" outletId={assignment?.outlet_id ?? ""} />;
}
