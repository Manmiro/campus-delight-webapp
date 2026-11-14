import { createFileRoute } from '@tanstack/react-router'
import { useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { adminCreateOutlet, adminDeleteOutlet, adminListOutlets, adminManagerLifecycle, adminReplaceOutletManager, adminUpdateOutlet } from "@/lib/admin.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Trash2 } from "lucide-react";
import { MealCapField } from "@/components/meal-cap-field";
import { formatMealCap, parseMealCap } from "@/lib/meal-cap-rules";
import { showFoodieError } from "@/lib/foodie-errors";

type ManagerAssignment = {
  id: string;
  user_id: string;
  outlet_id: string;
  staff_role: string;
  status: "active" | "suspended";
  profile: { full_name: string; email: string | null } | null;
};

type OutletForm = {
  name: string;
  code: string;
  location: string;
  address: string;
  contactPhone: string;
  contactEmail: string;
  mealCap: string;
};

export const Route = createFileRoute("/_authenticated/admin/outlets")({
  component: AdminOutlets,
  head: () => ({ meta: [{"title": "Outlet Management — Campus Delight HQ"}, {"name": "description", "content": "View and manage outlet management in your Campus Delight account."}, {"property": "og:title", "content": "Outlet Management — Campus Delight HQ"}, {"property": "og:description", "content": "View and manage outlet management in your Campus Delight account."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
});

const outletsQuery = queryOptions({
  queryKey: ["admin", "outlets-list"],
  queryFn: () => adminListOutlets(),
});

const managersQuery = queryOptions({
  queryKey: ["admin", "outlet-managers"],
  queryFn: async (): Promise<ManagerAssignment[]> => {
    const { data: assignments, error } = await supabase
      .from("outlet_staff")
      .select("id, user_id, outlet_id, staff_role, status")
      .eq("staff_role", "outlet_manager");
    if (error) throw new Error(error.message);
    const rows = assignments ?? [];
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.user_id);
    const { data: profiles, error: profileError } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
    if (profileError) throw new Error(profileError.message);
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    return rows.map((row) => ({ ...row, status: row.status as "active" | "suspended", profile: profileById.get(row.user_id) ?? null }));
  },
});

function AdminOutlets() {
  const qc = useQueryClient();
  const createOutlet = useServerFn(adminCreateOutlet);
  const updateOutlet = useServerFn(adminUpdateOutlet);
  const deleteOutlet = useServerFn(adminDeleteOutlet);
  const replaceManager = useServerFn(adminReplaceOutletManager);
  const manageManager = useServerFn(adminManagerLifecycle);

  const { data: outlets } = useSuspenseQuery(outletsQuery);
  const { data: managers } = useQuery(managersQuery);
  const [form, setForm] = useState({ name: "", code: "", location: "" });
  const [editOutlet, setEditOutlet] = useState<(typeof outlets)[number] | null>(null);
  const [editForm, setEditForm] = useState<OutletForm>({ name: "", code: "", location: "", address: "", contactPhone: "", contactEmail: "", mealCap: "" });
  const [deleteTarget, setDeleteTarget] = useState<(typeof outlets)[number] | null>(null);
  const [mgrForm, setMgrForm] = useState({ outletId: "", email: "", fullName: "", password: "", reason: "" });
  const [managerMode, setManagerMode] = useState<"assign" | "replace">("assign");
  const [managerAction, setManagerAction] = useState<{ outletId: string; action: "remove" | "suspend" | "restore"; name: string } | null>(null);
  const [managerActionReason, setManagerActionReason] = useState("");

  const create = useMutation({
    mutationFn: (input: { name: string; code: string; location: string }) => createOutlet({ data: input }),
    onSuccess: () => {
      toast.success("Outlet created");
      setForm({ name: "", code: "", location: "" });
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => showFoodieError(e, "Could not create outlet"),
  });

  const setStatus = useMutation({
    mutationFn: (input: { outletId: string; status: "active" | "suspended" | "inactive" }) => updateOutlet({ data: input }),
    onSuccess: () => {
      toast.success("Outlet updated");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => showFoodieError(e, "Update failed"),
  });

  const saveEdit = useMutation({
    mutationFn: ({ mealCap, ...input }: OutletForm & { outletId: string }) => {
      const mealCapKobo = parseMealCap(mealCap);
      if (mealCapKobo === null) throw new Error("Enter a valid positive meal cap in naira");
      return updateOutlet({ data: { ...input, mealCapKobo } });
    },
    onSuccess: () => {
      toast.success("Outlet details updated");
      setEditOutlet(null);
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ["delivery-fee"] });
    },
    onError: (e) => showFoodieError(e, "Could not update outlet"),
  });

  const removeOutlet = useMutation({
    mutationFn: (outletId: string) => deleteOutlet({ data: { outletId } }),
    onSuccess: () => {
      toast.success("Outlet deleted");
      setDeleteTarget(null);
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => showFoodieError(e, "Could not delete outlet"),
  });

  const assignManager = useMutation({
    mutationFn: (input: { outletId: string; email: string; fullName: string; password: string; reason: string }) => replaceManager({ data: input }),
    onSuccess: () => {
      toast.success(managerMode === "replace" ? "Outlet manager replaced" : "Outlet manager assigned");
      setMgrForm({ outletId: "", email: "", fullName: "", password: "", reason: "" });
      setManagerMode("assign");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => showFoodieError(e, "Could not update manager"),
  });

  const managerLifecycle = useMutation({
    mutationFn: () => {
      const action = managerAction;
      if (!action) throw new Error("Choose a manager action");
      return manageManager({ data: { outletId: action.outletId, action: action.action, reason: managerActionReason } });
    },
    onSuccess: () => {
      const action = managerAction?.action;
      toast.success(action === "remove" ? "Manager removed" : action === "suspend" ? "Manager suspended" : "Manager restored");
      setManagerAction(null);
      setManagerActionReason("");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => showFoodieError(e, "Could not update manager"),
  });

  const managerForOutlet = (outletId: string) => managers?.find((manager) => manager.outlet_id === outletId);
  const openManagerForm = (outletId: string, mode: "assign" | "replace") => {
    setManagerMode(mode);
    setMgrForm({ outletId, email: "", fullName: "", password: "", reason: mode === "replace" ? "" : "Headquarters manager assignment" });
    requestAnimationFrame(() => {
      const card = document.getElementById("manager-form");
      card?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => document.getElementById("manager-email")?.focus({ preventScroll: true }), 400);
    });
  };
  const managerName = managerAction?.name ?? "this manager";
  const openEdit = (outlet: (typeof outlets)[number]) => {
    setEditOutlet(outlet);
    setEditForm({
      name: outlet.name,
      code: outlet.code,
      location: outlet.location ?? "",
      address: outlet.address ?? "",
      contactPhone: outlet.contact_phone ?? "",
      contactEmail: outlet.contact_email ?? "",
      mealCap: formatMealCap(outlet.meal_cap_kobo),
    });
  };

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
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Outlet managers</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outlet</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outlets.map((outlet) => {
                  const manager = managerForOutlet(outlet.id);
                  return (
                    <TableRow key={outlet.id}>
                      <TableCell className="font-medium">{outlet.name}</TableCell>
                      <TableCell className="text-sm">
                        {manager ? <><p>{manager.profile?.full_name ?? "Unnamed manager"}</p><p className="text-xs text-muted-foreground">{manager.profile?.email ?? "No email"}</p></> : <span className="text-muted-foreground">Not assigned</span>}
                      </TableCell>
                      <TableCell>
                        {manager ? <Badge variant="outline" className="text-[10px] capitalize">{manager.status}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {manager ? (
                            <>
                              <Button type="button" size="sm" variant="outline" onClick={() => openManagerForm(outlet.id, "replace")}>Replace Manager</Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => { setManagerAction({ outletId: outlet.id, action: manager.status === "active" ? "suspend" : "restore", name: manager.profile?.full_name ?? "this manager" }); setManagerActionReason(""); }}>
                                {manager.status === "active" ? "Suspend Manager" : "Restore Manager"}
                              </Button>
                              <Button type="button" size="sm" variant="destructive" onClick={() => { setManagerAction({ outletId: outlet.id, action: "remove", name: manager.profile?.full_name ?? "this manager" }); setManagerActionReason(""); }}>Remove Manager</Button>
                            </>
                          ) : <Button type="button" size="sm" variant="outline" onClick={() => openManagerForm(outlet.id, "assign")}>Assign Manager</Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">All outlets ({outlets.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outlet</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Meal Cap (₦)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outlets.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-sm font-medium">{o.name}</TableCell>
                    <TableCell className="font-mono text-xs">{o.code}</TableCell>
                    <TableCell className="text-xs">{o.location}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">₦{formatMealCap(o.meal_cap_kobo)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">{o.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => openEdit(o)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                        </Button>
                        <Select value={o.status} onValueChange={(v) => setStatus.mutate({ outletId: o.id, status: v as "active" | "suspended" | "inactive" })}>
                          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="suspended">Suspended</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button type="button" size="sm" variant="destructive" onClick={() => setDeleteTarget(o)}>
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card id="manager-form" className={managerMode === "replace" ? "scroll-mt-24 ring-2 ring-primary/40" : "scroll-mt-24"}>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">{managerMode === "replace" ? "Replace outlet manager" : "Assign an outlet manager"}</CardTitle></CardHeader>
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
              <Input id="manager-email" type="email" value={mgrForm.email} onChange={(e) => setMgrForm((f) => ({ ...f, email: e.target.value }))} placeholder="manager@campusdelight.net" />
            </div>
            <div>
              <Label>Temporary password</Label>
              <Input value={mgrForm.password} onChange={(e) => setMgrForm((f) => ({ ...f, password: e.target.value }))} placeholder="min. 6 characters" />
            </div>
            <div className="sm:col-span-2">
              <Label>Reason</Label>
              <Input value={mgrForm.reason} onChange={(e) => setMgrForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Required audit note" maxLength={500} />
            </div>
          </div>
          <Button
            disabled={!mgrForm.outletId || !mgrForm.email || !mgrForm.fullName || mgrForm.password.length < 6 || !mgrForm.reason.trim() || assignManager.isPending}
            onClick={() => assignManager.mutate(mgrForm)}
          >
            {managerMode === "replace" ? "Replace Manager" : "Assign manager"}
          </Button>
          {managerMode === "replace" && <Button type="button" variant="ghost" className="ml-2" onClick={() => { setManagerMode("assign"); setMgrForm({ outletId: "", email: "", fullName: "", password: "", reason: "" }); }}>Cancel replace</Button>}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editOutlet)} onOpenChange={(open) => { if (!open && !saveEdit.isPending) setEditOutlet(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit Outlet Details</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="edit-outlet-name">Outlet name</Label>
              <Input id="edit-outlet-name" className="mt-1" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="edit-outlet-code">Code</Label>
              <Input id="edit-outlet-code" className="mt-1" value={editForm.code} onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
            </div>
            <div>
              <Label htmlFor="edit-outlet-location">Campus / city</Label>
              <Input id="edit-outlet-location" className="mt-1" value={editForm.location} onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="edit-outlet-address">Address</Label>
              <Input id="edit-outlet-address" className="mt-1" value={editForm.address} onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="edit-outlet-phone">Contact phone</Label>
              <Input id="edit-outlet-phone" className="mt-1" value={editForm.contactPhone} onChange={(e) => setEditForm((f) => ({ ...f, contactPhone: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="edit-outlet-email">Contact email</Label>
              <Input id="edit-outlet-email" type="email" className="mt-1" value={editForm.contactEmail} onChange={(e) => setEditForm((f) => ({ ...f, contactEmail: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <MealCapField id="edit-outlet-meal-cap" value={editForm.mealCap} onChange={(mealCap) => setEditForm((f) => ({ ...f, mealCap }))} disabled={saveEdit.isPending} />
            </div>
          </div>
          <Button className="w-full" disabled={!editForm.name.trim() || !editForm.code.trim() || parseMealCap(editForm.mealCap) === null || saveEdit.isPending} onClick={() => editOutlet && saveEdit.mutate({ outletId: editOutlet.id, ...editForm })}>
            {saveEdit.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !removeOutlet.isPending) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete outlet</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Delete <span className="font-semibold text-foreground">{deleteTarget?.name}</span>? This is only allowed when the outlet has no customers or historical orders, subscriptions, loans, or transfers. Otherwise, mark it inactive.
            </p>
            <Button type="button" variant="destructive" className="w-full" disabled={!deleteTarget || removeOutlet.isPending} onClick={() => deleteTarget && removeOutlet.mutate(deleteTarget.id)}>
              {removeOutlet.isPending ? "Deleting…" : "Delete outlet"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(managerAction)} onOpenChange={(open) => { if (!open && !managerLifecycle.isPending) { setManagerAction(null); setManagerActionReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{managerAction?.action === "remove" ? "Remove Manager" : managerAction?.action === "suspend" ? "Suspend Manager" : "Restore Manager"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{managerAction?.action === "remove" ? `Remove ${managerName} from this outlet and clear their manager role?` : managerAction?.action === "suspend" ? `Pause ${managerName}'s outlet assignment and manager role?` : `Restore ${managerName}'s outlet assignment and manager role?`}</p>
            <div>
              <Label htmlFor="manager-action-reason">Reason</Label>
              <Input id="manager-action-reason" className="mt-1" value={managerActionReason} onChange={(event) => setManagerActionReason(event.target.value)} placeholder="Required audit note" maxLength={500} />
            </div>
            <Button type="button" variant={managerAction?.action === "remove" ? "destructive" : "default"} className="w-full" disabled={!managerActionReason.trim() || managerLifecycle.isPending} onClick={() => managerLifecycle.mutate()}>
              {managerLifecycle.isPending ? "Saving…" : managerAction?.action === "remove" ? "Remove Manager" : managerAction?.action === "suspend" ? "Suspend Manager" : "Restore Manager"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
