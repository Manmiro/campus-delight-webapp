import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { setOutletOrderAlarm } from "@/lib/outlet.functions";
import { profileQuery } from "@/lib/queries";
import { playOutletOrderAlarmChime, unlockOutletOrderAlarmAudio } from "@/lib/outlet-alarm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { showFoodieError } from "@/lib/foodie-errors";

export function OutletOrderAlarmControls({
  isCentralAdmin = false,
  isManager = false,
  enabled,
}: {
  isCentralAdmin?: boolean;
  isManager?: boolean;
  enabled: boolean;
}) {
  const saveAlarm = useServerFn(setOutletOrderAlarm);
  const queryClient = useQueryClient();
  const [alarmEnabled, setAlarmEnabled] = useState(enabled);
  const canChange = isManager || isCentralAdmin;

  useEffect(() => setAlarmEnabled(enabled), [enabled]);

  const alarmMutation = useMutation({
    mutationFn: (nextEnabled: boolean) => saveAlarm({ data: { enabled: nextEnabled } }),
    onMutate: (nextEnabled) => setAlarmEnabled(nextEnabled),
    onSuccess: (_result, nextEnabled) => {
      void queryClient.invalidateQueries({ queryKey: profileQuery.queryKey });
      toast.success(`New-order alarm ${nextEnabled ? "on" : "off"}`);
    },
    onError: (error, nextEnabled) => {
      setAlarmEnabled(!nextEnabled);
      showFoodieError(error, "Could not update the order alarm");
    },
  });

  async function toggleAlarm(nextEnabled: boolean) {
    void unlockOutletOrderAlarmAudio();
    if (nextEnabled && "Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    alarmMutation.mutate(nextEnabled);
  }

  async function testAlarm() {
    await playOutletOrderAlarmChime();
    toast.success("Alarm sound tested");
  }

  if (!canChange) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <p className="font-semibold">{isCentralAdmin && !isManager ? "Order alarm sound" : "New-order alarm"}</p>
          <p className="text-sm text-muted-foreground">
            {isCentralAdmin && !isManager
              ? "Use this control to verify the browser chime on this device."
              : alarmEnabled
                ? "On — new confirmed orders will alert this dashboard."
                : "Off — new orders will not trigger an alarm."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => void testAlarm()}>Test Alarm</Button>
          <span className="text-sm font-medium">{alarmEnabled ? "On" : "Off"}</span>
          <Switch checked={alarmEnabled} disabled={alarmMutation.isPending} onCheckedChange={(value) => void toggleAlarm(value)} aria-label="Toggle new-order alarm" />
        </div>
      </CardContent>
    </Card>
  );
}
