import { createFileRoute } from '@tanstack/react-router'
import { useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { adminCreateOutlet, adminSetOutletManager, adminUpdateOutlet } from "@/lib/admin.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/outlets")({
  component: AdminOutlets,
  head: () => ({ meta: [{ title: "Outlet Management — Campus Delight HQ" }] }),
});

const outletsQuery = queryOptions({
  queryKey: ["admin", "outlets-list"],
  queryFn: async () => {
    const { data, error } = await supabase.from("outlets").select("id, name, code, location, address, status, created_at").order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});

function AdminOutlets() {
  const qc = useQueryClient();
  const createOutlet = useServerFn(adminCreateOutlet);
  const updateOutlet = useServerFn(adminUpdateOutlet);
  const setManager = useServerFn(adminSetOutletManager);

  const { data: outlets } = useSuspenseQuery(outletsQuery);
  const [form, setForm] = useState({ name: "", code: "", location: "" });
  const [mgrForm, setMgrForm] = useState({ outletId: "", email: "", fullName: "", password: "" });

  const create = useMutation({
    mutationFn: (input: { name: string; code: string; location: string }) => createOutlet({ data: input }),
    onSuccess: () => {
      toast.success("Outlet created");
      setForm({ name: "", code: "", location: "" });
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create outlet"),
  });

  const setStatus = useMutation({
    mutationFn: (input: { outletId: string; status: string }) => updateOutlet({ data: input }),
    onSuccess: () => {
      toast.success("Outlet updated");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const assignManager = useMutation({
    mutationFn: (input: { outletId: string; email: string; fullName: string; password: string }) => setManager({ data: input }),
    onSuccess: () => {
      toast.success("Outlet manager assigned");
      setMgrForm({ outletId: "", email: "", fullName: "", password: "" });
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not assign manager"),
  });

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Create a new outlet</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Label htmlFor="o-name">Outlet name</Label>
              <Input id="o-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="University of Benin Outlet" />
            </div>
            <div className="w-36">
              <Label htmlFor="o-code">Code</Label>
              <Input id="o-code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="UNIBEN" />
            </div>
            <div className="w-56">
              <Label htmlFor="o-loc">Campus / city</Label>
              <Input id="o-loc" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Benin City" />
            </div>
            <Button disabled={!form.name || !form.code || create.isPending} onClick={() => create.mutate(form)}>Create outlet</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Codes must be unique. New outlets are live immediately — menus and prices are configured by the outlet manager.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">All outlets ({outlets.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Outlet</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Set status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outlets.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="text-sm font-medium">{o.name}</TableCell>
                  <TableCell className="font-mono text-xs">{o.code}</TableCell>
                  <TableCell className="text-xs">{o.location}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] capitalize">{o.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Select value={o.status} onValueChange={(v) => setStatus.mutate({ outletId: o.id, status: v })}>
                      <SelectTrigger className="ml-auto h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Assign an outlet manager</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Outlet</Label>
              <Select value={mgrForm.outletId} onValueChange={(v) => setMgrForm((f) => ({ ...f, outletId: v }))}>
                <SelectTrigger className="mt-1 w-full"><SelectValue placeholder="Choose outlet" /></SelectTrigger>
                <SelectContent>
                  {outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Manager full name</Label>
              <Input className="mt-1" value={mgrForm.fullName} onChange={(e) => setMgrForm((f) => ({ ...f, fullName: e.target.value }))} placeholder="Chidi Okeke" />
            </div>
            <div>
              <Label>Manager email (sign-in)</Label>
              <Input type="email" value={mgrForm.email} onChange={(e) => setMgrForm((f) => ({ ...f, email: e.target.value }))} placeholder="manager@campusdelight.com" />
            </div>
            <div>
              <Label>Temporary password</Label>
              <Input value={mgrForm.password} onChange={(e) => setMgrForm((f) => ({ ...f, password: e.target.value }))} placeholder="min. 6 characters" />
            </div>
          </div>
          <Button
            disabled={!mgrForm.outletId || !mgrForm.email || !mgrForm.fullName || mgrForm.password.length < 6 || assignManager.isPending}
            onClick={() => assignManager.mutate(mgrForm)}
          >
            Assign manager
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
