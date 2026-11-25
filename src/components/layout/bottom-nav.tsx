"use client";

import { useEffect } from "react";
import { CaptureTrigger } from "@/components/capture/capture-trigger";
import { useCapture } from "@/components/capture/capture-provider";

export function CaptureButton() {
  const { available } = useCapture();
  useEffect(() => {
    const root = document.documentElement;
    if (available) root.dataset.mobileCapture = "true";
    return () => { delete root.dataset.mobileCapture; };
  }, [available]);

  if (!available) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(0.875rem,env(safe-area-inset-bottom))] z-30 flex justify-center lg:hidden">
      <CaptureTrigger mobile />
    </div>
  );
}
