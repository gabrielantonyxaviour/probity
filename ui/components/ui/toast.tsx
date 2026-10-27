"use client";
import { Toaster, toast } from "sonner";
import type { Tone } from "@/lib/labels";

const TONE_VAR: Record<Tone, string> = { agree: "var(--agree)", gap: "var(--gap)", conflict: "var(--conflict)", info: "var(--info)", neutral: "var(--fg-muted)" };

/** Bottom-centre toast: 6px tone dot, radius 12, 4 s, paused on hover or focus by sonner. role=status. */
export function notify(message: string, tone: Tone = "neutral") {
  toast.custom(
    () => (
      <div className="p-toast t-ui" role="status" style={{ ["--tone" as string]: TONE_VAR[tone] }}>
        <span className="p-toast__dot" aria-hidden />
        <span className="text-fg">{message}</span>
      </div>
    ),
    { duration: 4000 },
  );
}

export function ToastHost() {
  return <Toaster position="bottom-center" offset={24} visibleToasts={3} gap={8} />;
}
