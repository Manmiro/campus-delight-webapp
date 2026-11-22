import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, CheckCircle2, LockKeyhole, Smartphone } from "lucide-react";
import { toast } from "sonner";
import {
  registerManagerPushSubscription,
  removeManagerPushSubscription,
  sendManagerPushTest,
  setOutletPushPolicy,
} from "@/lib/push.functions";
import {
  currentBrowserPushEndpoint,
  registerBrowserPush,
  removeBrowserPushSubscription,
} from "@/lib/push-client";
import { showFoodieError } from "@/lib/foodie-errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PushOutletPolicy = "on" | "off" | "locked";

export type PushOutlet = {
  id: string;
  name: string;
  manager_push_policy: PushOutletPolicy;
};

function policyLabel(policy: PushOutletPolicy) {
  return policy === "on" ? "On" : policy === "off" ? "Off" : "Locked";
}

function policyHint(policy: PushOutletPolicy) {
  return policy === "on"
    ? "Managers can activate their own devices."
    : policy === "off"
      ? "No alerts will be delivered until headquarters turns this back on."
      : "Alerts are locked off by headquarters.";
}

export function ManagerPushNotificationCard({
  outletId,
  outletName,
  policy = "on",
  isManager = false,
}: {
  outletId: string;
  outletName: string;
  policy?: PushOutletPolicy;
  isManager?: boolean;
}) {
  const register = useServerFn(registerManagerPushSubscription);
  const remove = useServerFn(removeManagerPushSubscription);
  const test = useServerFn(sendManagerPushTest);
  const [enabled, setEnabled] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    void currentBrowserPushEndpoint().then((endpoint) => setEnabled(Boolean(endpoint)));
  }, []);

  async function enable() {
    setWorking(true);
    try {
      const subscription = await registerBrowserPush();
      await register({
        data: {
          outletId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      });
      setEnabled(true);
      toast.success("Lock-screen notifications enabled");
    } catch (error) {
      showFoodieError(error, "Could not enable lock-screen notifications");
    } finally {
      setWorking(false);
    }
  }

  async function disable() {
    setWorking(true);
    try {
      const endpoint = await currentBrowserPushEndpoint();
      if (endpoint) await remove({ data: { outletId, endpoint } });
      await removeBrowserPushSubscription();
      setEnabled(false);
      toast.success("Lock-screen notifications disabled on this device");
    } catch (error) {
      showFoodieError(error, "Could not disable notifications");
    } finally {
      setWorking(false);
    }
  }

  async function testAlert() {
    try {
      const result = await test({ data: { outletId } });
      if (result.sent === 0) toast.error("No active device is registered for this outlet");
      else toast.success("Test alert sent — check the device banner");
    } catch (error) {
      showFoodieError(error, "Could not send the test alert");
    }
  }

  return (
    <Card className="border-golden/40 bg-golden/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BellRing className="h-4 w-4 text-golden" />
              Enable Lock Screen Notifications
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Wake {outletName} with the order number, items, and delivery destination.
            </p>
          </div>
          <Badge variant={policy === "on" ? "default" : "secondary"}>{policyLabel(policy)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {policy !== "on" && (
          <p className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
            <LockKeyhole className="h-4 w-4 shrink-0" />
            {policyHint(policy)}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {policy === "on" && (
            <Button
              type="button"
              size="sm"
              disabled={working || policy !== "on"}
              onClick={() => void enable()}
            >
              <Smartphone className="mr-2 h-4 w-4" />
              {enabled ? "Refresh this device" : "Enable on this device"}
            </Button>
          )}
          {enabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={working}
              onClick={() => void disable()}
            >
              Disable on this device
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={working || policy !== "on"}
            onClick={() => void testAlert()}
          >
            Send Test Alert
          </Button>
          {enabled && (
            <span className="flex items-center gap-1 text-xs text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" />
              This device is registered
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Alerts use a distinctive kitchen vibration pattern and open directly to outlet orders when
          tapped.
        </p>
        {!isManager && (
          <p className="text-xs text-muted-foreground">
            HQ device registration is scoped to this outlet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function HeadquartersPushNotificationCard({ outlets }: { outlets: PushOutlet[] }) {
  const queryClient = useQueryClient();
  const setPolicy = useServerFn(setOutletPushPolicy);
  const register = useServerFn(registerManagerPushSubscription);
  const test = useServerFn(sendManagerPushTest);
  const [selectedOutletId, setSelectedOutletId] = useState(outlets[0]?.id ?? "");
  const [workingOutletId, setWorkingOutletId] = useState<string | null>(null);

  useEffect(() => {
    if (!outlets.some((outlet) => outlet.id === selectedOutletId))
      setSelectedOutletId(outlets[0]?.id ?? "");
  }, [outlets, selectedOutletId]);

  async function changePolicy(outlet: PushOutlet, nextPolicy: PushOutletPolicy) {
    setWorkingOutletId(outlet.id);
    try {
      await setPolicy({ data: { outletId: outlet.id, policy: nextPolicy } });
      outlet.manager_push_policy = nextPolicy;
      await queryClient.invalidateQueries({ queryKey: ["admin", "push-outlets"] });
      toast.success(`${outlet.name} notifications set to ${policyLabel(nextPolicy)}`);
    } catch (error) {
      showFoodieError(error, "Could not update outlet notification policy");
    } finally {
      setWorkingOutletId(null);
    }
  }

  async function enableHqDevice() {
    if (!selectedOutletId) return;
    setWorkingOutletId(selectedOutletId);
    try {
      const subscription = await registerBrowserPush();
      await register({
        data: {
          outletId: selectedOutletId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      });
      toast.success("This HQ device is registered for the selected outlet");
    } catch (error) {
      showFoodieError(error, "Could not register this HQ device");
    } finally {
      setWorkingOutletId(null);
    }
  }

  async function sendTest(outletId: string) {
    setWorkingOutletId(outletId);
    try {
      const result = await test({ data: { outletId } });
      if (result.sent === 0)
        toast.error("No active manager or HQ device is registered for this outlet");
      else toast.success("Test alert sent");
    } catch (error) {
      showFoodieError(error, "Could not send the test alert");
    } finally {
      setWorkingOutletId(null);
    }
  }

  return (
    <Card className="border-golden/40 bg-golden/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-4 w-4 text-golden" />
          Enable Lock Screen Notifications
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Headquarters controls whether each outlet can wake its kitchen device.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {outlets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No outlets are available yet.</p>
        ) : (
          outlets.map((outlet) => (
            <div
              key={outlet.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{outlet.name}</p>
                <p className="text-xs text-muted-foreground">
                  {policyHint(outlet.manager_push_policy)}
                </p>
              </div>
              <Select
                value={outlet.manager_push_policy}
                disabled={workingOutletId === outlet.id}
                onValueChange={(value) => void changePolicy(outlet, value as PushOutletPolicy)}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">On</SelectItem>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="locked">Lock</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={workingOutletId === outlet.id || outlet.manager_push_policy !== "on"}
                onClick={() => void sendTest(outlet.id)}
              >
                Test
              </Button>
            </div>
          ))
        )}
        {outlets.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Select value={selectedOutletId} onValueChange={setSelectedOutletId}>
              <SelectTrigger className="min-w-52 flex-1">
                <SelectValue placeholder="Select an outlet" />
              </SelectTrigger>
              <SelectContent>
                {outlets.map((outlet) => (
                  <SelectItem key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              disabled={
                !selectedOutletId ||
                workingOutletId === selectedOutletId ||
                outlets.find((outlet) => outlet.id === selectedOutletId)?.manager_push_policy !==
                  "on"
              }
              onClick={() => void enableHqDevice()}
            >
              <Smartphone className="mr-2 h-4 w-4" />
              Enable this HQ device
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
