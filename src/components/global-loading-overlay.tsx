import { useEffect, useRef, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import logoImg from "@/assets/logo.webp.asset.json";

const LOADING_THRESHOLD_MS = 150;
const EXIT_DURATION_MS = 220;

/**
 * Branded feedback for route transitions and active TanStack Query mutations.
 * The threshold keeps cached navigations from flashing a loader for a frame.
 */
export function GlobalLoadingOverlay() {
  const isRoutePending = useRouterState({ select: (state) => state.status === "pending" });
  const isMutating = useIsMutating() > 0;
  const isLoading = isRoutePending || isMutating;
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);

    if (isLoading) {
      if (mounted) {
        setVisible(true);
      } else {
        showTimer.current = setTimeout(() => {
          setMounted(true);
          setVisible(true);
        }, LOADING_THRESHOLD_MS);
      }
    } else if (mounted) {
      setVisible(false);
      hideTimer.current = setTimeout(() => setMounted(false), EXIT_DURATION_MS);
    }

    return () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [isLoading, mounted]);

  if (!mounted) return null;

  return (
    <div
      className={`cd-global-loading-overlay ${visible ? "cd-global-loading-overlay-visible" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="Loading Campus Delight"
    >
      <div className="cd-global-loading-card">
        <div className="cd-global-loading-mark" aria-hidden="true">
          <div className="cd-global-loading-ring">
            <div className="cd-global-loading-ring-inner">
              <img src={logoImg.url} alt="" className="cd-global-loading-logo" />
            </div>
          </div>
        </div>
        <p className="cd-global-loading-label">Loading Campus Delight…</p>
      </div>
    </div>
  );
}
