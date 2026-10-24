import { createFileRoute } from '@tanstack/react-router'
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { adminUpdateConfig } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: AdminSettings,
  head: () => ({ meta: [{ title: "System Settings — Campus Delight HQ" }] }),
});

function AdminSettings() {
  const qc = useQueryClient();
  const saveConfig = useServerFn(adminUpdateConfig);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: configs } = useQuery({
    queryKey: ["admin", "config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("system_config").select("*").order("key");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const parsed = JSON.parse(value);
      await saveConfig({ data: { key, value: parsed } });
    },
    onSuccess: () => {
      toast.success("Setting saved");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        These rules drive the whole platform. Existing loans always keep the terms they were created with —
        changes here apply to new activity only. The overdue rule stays marked provisional until the business signs it off.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {(configs ?? []).map((c) => (
          <Card key={c.key}>
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-sm">{c.key}</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                className="h-36 w-full rounded-lg border border-input bg-background p-3 font-mono text-xs"
                value={drafts[c.key] ?? JSON.stringify(c.value, null, 2)}
                onChange={(e) => setDrafts((d) => ({ ...d, [c.key]: e.target.value }))}
              />
              <Button
                size="sm"
                className="mt-2"
                disabled={drafts[c.key] === undefined || save.isPending}
                onClick={() => save.mutate({ key: c.key, value: drafts[c.key] })}
              >
                Save {c.key}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
