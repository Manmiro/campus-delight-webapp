import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import {
  createTelegramConnectionLink,
  getTelegramConnectionStatus,
  sendTelegramTest,
} from "@/lib/telegram.functions";
import { showFoodieError } from "@/lib/foodie-errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TelegramOutlet = { id: string; name: string };

function TelegramButtons({ outletId, hq = false }: { outletId: string; hq?: boolean }) {
  const createLink = useServerFn(createTelegramConnectionLink);
  const getStatus = useServerFn(getTelegramConnectionStatus);
  const sendTest = useServerFn(sendTelegramTest);
  const [status, setStatus] = useState<{ privateConnected: boolean; groupCount: number } | null>(
    null,
  );
  const [working, setWorking] = useState<"private" | "group" | "test" | null>(null);

  useEffect(() => {
    void getStatus({ data: { outletId } })
      .then(setStatus)
      .catch(() => undefined);
  }, [getStatus, outletId]);

  async function openConnection(purpose: "private" | "group") {
    const popup = window.open("about:blank", "_blank", "noopener,noreferrer");
    if (!popup) {
      toast.error("Allow pop-ups to open Telegram");
      return;
    }
    setWorking(purpose);
    try {
      const link = await createLink({ data: { outletId, purpose } });
      popup.location.href = link.url;
      toast.success(
        purpose === "group"
          ? "Telegram opened — choose the kitchen group"
          : "Telegram opened — press Start to connect",
      );
      setTimeout(
        () =>
          void getStatus({ data: { outletId } })
            .then(setStatus)
            .catch(() => undefined),
        2_000,
      );
    } catch (error) {
      popup.close();
      showFoodieError(error, "Could not create the Telegram connection link");
    } finally {
      setWorking(null);
    }
  }

  async function test() {
    setWorking("test");
    try {
      const result = await sendTest({ data: { outletId } });
      if (!result.sent) toast.error("No connected Telegram chat was found for this outlet");
      else
        toast.success(`Telegram test sent to ${result.sent} chat${result.sent === 1 ? "" : "s"}`);
    } catch (error) {
      showFoodieError(error, "Could not send the Telegram test");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        disabled={working !== null}
        onClick={() => void openConnection("private")}
      >
        <MessageCircle className="mr-2 h-4 w-4" />
        Connect my Telegram
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={working !== null}
        onClick={() => void openConnection("group")}
      >
        <Send className="mr-2 h-4 w-4" />
        Add to kitchen group
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={working !== null}
        onClick={() => void test()}
      >
        Send Telegram Test
      </Button>
      {status && (status.privateConnected || status.groupCount > 0) && (
        <span className="flex items-center gap-1 text-xs text-primary">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {hq
            ? `${status.groupCount + (status.privateConnected ? 1 : 0)} chat${status.groupCount + (status.privateConnected ? 1 : 0) === 1 ? "" : "s"} connected`
            : "Telegram connected"}
        </span>
      )}
    </div>
  );
}

export function ManagerTelegramCard({
  outletId,
  outletName,
}: {
  outletId: string;
  outletName: string;
}) {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4 text-primary" />
          Telegram kitchen alerts
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Connect Telegram for {outletName} to receive confirmed orders in a private chat or kitchen
          group.
        </p>
      </CardHeader>
      <CardContent>
        <TelegramButtons outletId={outletId} />
      </CardContent>
    </Card>
  );
}

export function HeadquartersTelegramCard({ outlets }: { outlets: TelegramOutlet[] }) {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4 text-primary" />
          Telegram kitchen alerts
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Connect an HQ chat or kitchen group for each outlet and test the delivery.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {outlets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No outlets are available yet.</p>
        ) : (
          outlets.map((outlet) => (
            <div key={outlet.id} className="space-y-2 rounded-2xl bg-card p-3">
              <p className="truncate text-sm font-semibold">{outlet.name}</p>
              <TelegramButtons outletId={outlet.id} hq />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
