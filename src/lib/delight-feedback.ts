import { useSyncExternalStore } from "react";

const STORAGE_KEY = "campus-delight-feedback";
const CHANGE_EVENT = "campus-delight-feedback-change";
let enabled = true;
let context: AudioContext | undefined;
const voices = new Set<OscillatorNode>();

function readPreference() {
  if (typeof window === "undefined") return true;
  try {
    enabled = window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    /* Keep the session preference when storage is unavailable. */
  }
  return enabled;
}

function subscribe(listener: () => void) {
  const changed = () => {
    if (!readPreference()) silence();
    listener();
  };
  window.addEventListener(CHANGE_EVENT, changed);
  window.addEventListener("storage", changed);
  return () => {
    window.removeEventListener(CHANGE_EVENT, changed);
    window.removeEventListener("storage", changed);
  };
}

export function useDelightFeedback() {
  return useSyncExternalStore(subscribe, readPreference, () => true);
}

function silence() {
  voices.forEach((voice) => {
    try {
      voice.stop();
    } catch {
      /* Already stopped. */
    }
  });
  voices.clear();
  try {
    navigator.vibrate?.(0);
  } catch {
    /* Unsupported on this device. */
  }
}

export function setDelightFeedback(value: boolean) {
  enabled = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
  } catch {
    /* Session only. */
  }
  if (value) prepareDelightFeedback();
  else silence();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Call during a user gesture so async mutation success can play its cue. */
export function prepareDelightFeedback() {
  if (!readPreference()) return;
  try {
    const Audio =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return;
    context ??= new Audio();
    if (context.state === "suspended") void context.resume().catch(() => {});
  } catch {
    /* Feedback must never interrupt checkout or rewards. */
  }
}

export type DelightCue = "tokens" | "cart" | "order";

export function playDelightFeedback(cue: DelightCue) {
  if (!readPreference()) return;
  try {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      navigator.vibrate?.(cue === "order" ? [20, 40, 30] : cue === "tokens" ? [12, 25, 12] : 8);
    }
  } catch {
    /* Haptics are optional. */
  }
  prepareDelightFeedback();
  if (!context || context.state !== "running") return;
  try {
    const audio = context;
    const note = (
      frequency: number,
      delay: number,
      duration: number,
      volume: number,
      type: OscillatorType = "sine",
      endFrequency = frequency,
    ) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + delay;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume * 2, start + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      voices.add(oscillator);
      oscillator.onended = () => {
        voices.delete(oscillator);
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.01);
    };
    if (cue === "tokens") {
      // Inharmonic partials and a second strike give a little metallic clink.
      [1760, 2813, 4211].forEach((hz, i) => note(hz, i * 0.012, 0.32, 0.035 / (i + 1)));
      note(2349, 0.09, 0.28, 0.025);
    } else if (cue === "cart") {
      note(950, 0, 0.065, 0.055, "triangle", 130);
      note(2700, 0, 0.025, 0.016, "square", 700);
    } else {
      [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) =>
        note(hz, i * 0.105, 0.3, 0.045, "triangle"),
      );
    }
  } catch {
    /* Browsers may deny audio; the successful action still completes. */
  }
}
