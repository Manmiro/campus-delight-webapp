import { useState } from "react";
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  component: AdminCustomers,
  head: () => ({ meta: [{"title": "Customers — Campus Delight HQ"}, {"name": "description", "content": "View and manage customers in your Campus Delight account."}, {"property": "og:title", "content": "Customers — Campus Delight HQ"}, {"property": "og:description", "content": "View and manage customers in your Campus Delight account."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
});

type AdminCustomer = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  customer_code: string;
  verification_status: string | null;
  is_active: boolean;
  created_at: string;
  outlet: { name?: string } | null;
};

function normalizeCode(raw: string) {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().replace(/^CD+/, "");
}

const CUSTOMER_FIELDS = "id, full_name, email, phone, customer_code, verification_status, is_active, created_at, outlet:outlets(name)";

function AdminCustomers() {
  const [search, setSearch] = useState("");
  const digits = normalizeCode(search);

  const { data: customers, isLoading } = useQuery({
    queryKey: ["admin", "customers", digits],
    queryFn: async () => {
      let q = supabase.from("profiles").select(CUSTOMER_FIELDS);
      if (digits) q = q.ilike("customer_code", `%CD${digits}%`).limit(50);
      else q = q.order("created_at", { ascending: false }).limit(300);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as AdminCustomer[];
    },
  });


  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Outlet</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(customers ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-xs">
                  <p className="font-medium">{c.full_name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{c.customer_code}</p>
                </TableCell>
                <TableCell className="text-xs">{c.phone ?? c.email ?? "—"}</TableCell>
                <TableCell className="text-xs">{(c.outlet as { name?: string } | null)?.name ?? "—"}</TableCell>
                <TableCell className="text-xs">{formatDate(c.created_at)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">
                    {c.is_active ? "Active" : "Inactive"}{c.verification_status === "verified" ? " · Verified" : ""}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {(customers ?? []).length === 0 && !isLoading && (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">No customers yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
