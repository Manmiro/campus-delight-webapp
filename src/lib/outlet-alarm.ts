import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function outletOrderAlarmMessage(customerName: string | null | undefined, outletId: string): string {
  return `Hello manager, there is a new order from ${customerName?.trim() || "a customer"} at outlet ID ${outletId}.`;
}

type BrowserWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let alarmAudioContext: AudioContext | null = null;

function getAlarmAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext ?? (window as BrowserWindow).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  alarmAudioContext ??= new AudioContextConstructor();
  return alarmAudioContext;
}

/** Resume the shared audio context from a user gesture before a future alarm arrives. */
export async function unlockOutletOrderAlarmAudio(): Promise<boolean> {
  try {
    const audio = getAlarmAudioContext();
    if (!audio) return false;
    if (audio.state === "suspended") await audio.resume();
    return audio.state === "running";
  } catch {
    return false;
  }
}

/** Play a short, unmistakable four-note kitchen chime. */
export async function playOutletOrderAlarmChime(): Promise<void> {
  try {
    if (!(await unlockOutletOrderAlarmAudio())) return;
    const audio = alarmAudioContext;
    if (!audio) return;

    const start = audio.currentTime + 0.01;
    const notes = [
      { frequency: 523.25, offset: 0 },
      { frequency: 659.25, offset: 0.12 },
      { frequency: 783.99, offset: 0.24 },
      { frequency: 1046.5, offset: 0.38 },
    ];

    for (const note of notes) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const noteStart = start + note.offset;
      const noteEnd = noteStart + 0.42;
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(note.frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.36, noteStart + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd);
    }
  } catch {
    // Audio is an enhancement; notifications and the toast remain available.
  }
}

type AlarmOrder = {
  id: string;
  status: string;
  customer?: { full_name?: string | null } | null;
};

export function newlyConfirmedOrders(
  orders: AlarmOrder[],
  previousStatuses: ReadonlyMap<string, string>,
): AlarmOrder[] {
  return orders.filter(
    (order) => order.status === "confirmed" && previousStatuses.get(order.id) !== "confirmed",
  );
}

/** Observe newly fetched confirmed orders for either outlet fulfillment screen. */
export function useOutletOrderAlarmListener({
  active,
  alarmEnabled,
  orders,
  outletId,
}: {
  active: boolean;
  alarmEnabled: boolean;
  orders: AlarmOrder[];
  outletId: string;
}) {
  const seenOrderStatuses = useRef<Map<string, string>>(new Map());
  const hasHydratedOrders = useRef(false);
  const previousOutletId = useRef(outletId);

  useEffect(() => {
    if (!active || !outletId) return;
    if (previousOutletId.current !== outletId) {
      seenOrderStatuses.current = new Map();
      hasHydratedOrders.current = false;
      previousOutletId.current = outletId;
    }

    const currentStatuses = new Map(orders.map((order) => [order.id, order.status]));
    if (!hasHydratedOrders.current) {
      seenOrderStatuses.current = currentStatuses;
      hasHydratedOrders.current = true;
      return;
    }

    const freshOrders = newlyConfirmedOrders(orders, seenOrderStatuses.current);
    seenOrderStatuses.current = currentStatuses;
    if (!alarmEnabled) return;

    for (const order of freshOrders) {
      if (order.status !== "confirmed") continue;
      const message = outletOrderAlarmMessage(order.customer?.full_name, outletId);
      toast.info(message, { duration: 12_000 });
      try {
        navigator.vibrate?.([220, 100, 220]);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("New Campus Delight order", { body: message });
        }
        void playOutletOrderAlarmChime();
      } catch {
        // Browser notification/audio permissions are optional; the toast remains visible.
      }
    }
  }, [active, alarmEnabled, orders, outletId]);
}
