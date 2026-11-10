import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setDelightFeedback, useDelightFeedback } from "@/lib/delight-feedback";

export function DelightToggle() {
  const enabled = useDelightFeedback();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0 rounded-full"
      aria-pressed={enabled}
      aria-label={`Sound and haptics: ${enabled ? "on" : "off"}`}
      onClick={() => setDelightFeedback(!enabled)}
    >
      {enabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
      Sound & haptics{" "}
      <span className="text-xs text-muted-foreground">{enabled ? "On" : "Off"}</span>
    </Button>
  );
}
