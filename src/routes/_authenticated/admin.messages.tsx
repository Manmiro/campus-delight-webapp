import { createFileRoute } from "@tanstack/react-router";
import { DashboardMessages } from "@/components/dashboard-messages";

export const Route = createFileRoute("/_authenticated/admin/messages")({
  component: AdminMessages,
  head: () => ({
    meta: [
      { title: "Messages — Campus Delight HQ" },
      { name: "description", content: "Message every Campus Delight outlet from headquarters." },
    ],
  }),
});

function AdminMessages() {
  return <DashboardMessages mode="hq" />;
}
