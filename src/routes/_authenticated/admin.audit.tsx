import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/bits";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/admin/audit")({
  component: AdminAudit,
  head: () => ({ meta: [{ title: "Audit Logs — Campus Delight HQ" }] }),
});

function AdminAudit() {
  const { data: logs } = useQuery({
    queryKey: ["admin", "audit-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  if ((logs ?? []).length === 0) {
    return <EmptyState title="No administrative actions recorded yet" hint="Every admin action — outlet changes, transfer decisions, credit adjustments — is logged here." />;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(logs ?? []).map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap text-xs">{formatDateTime(l.created_at)}</TableCell>
                <TableCell className="text-xs font-semibold">{l.action}</TableCell>
                <TableCell className="text-xs">{l.entity}</TableCell>
                <TableCell className="max-w-md truncate font-mono text-[10px] text-muted-foreground">{l.details ? JSON.stringify(l.details) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
