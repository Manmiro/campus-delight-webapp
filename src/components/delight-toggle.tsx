import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setDelightFeedback, useDelightFeedback } from "@/lib/delight-feedback";

export function DelightToggle() {
  const enabled = useDelightFeedback();
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="shrink-0"
      aria-pressed={enabled}
      aria-label={`Sound and haptics: ${enabled ? "on" : "off"}`}
      title={`Sound and haptics: ${enabled ? "on" : "off"}`}
      onClick={() => setDelightFeedback(!enabled)}
    >
      {enabled ? (
        <Volume2 className="h-5 w-5" />
      ) : (
        <VolumeX className="h-5 w-5 text-muted-foreground" />
      )}
    </Button>
  );
}
