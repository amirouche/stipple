import { useEffect, useState } from "react";
import type { Route } from "@/lib/dots-data";

// Subtle processing UI. "local" stays compact; "deep" expands into a trace
// strip with a small TTC slot — Time-To-Context — surfaced during longer waits.
export function ProcessingTrace({
  route,
  reason,
  packName,
}: {
  route: Route;
  reason: string;
  packName?: string;
}) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (route !== "deep") return;
    const timers = [
      setTimeout(() => setStage(1), 600),
      setTimeout(() => setStage(2), 1400),
    ];
    return () => timers.forEach(clearTimeout);
  }, [route]);

  if (route === "local") {
    return (
      <div className="flex items-center gap-2.5 text-[12px] text-ink-soft fade-in">
        <span className="dot-local" />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em]">
          {reason}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden fade-in">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2.5">
          <span className="dot-deep" />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-soft">
            {reason}
          </span>
        </div>
        <span className="font-mono text-[10px] text-ink-soft/70">
          {packName ? `pack: ${packName}` : "base model"}
        </span>
      </div>

      <div className="px-4 py-3 space-y-2">
        <TraceLine done label="local memory checked" />
        <TraceLine done={stage >= 1} label="pack heuristics applied" />
        <TraceLine
          done={stage >= 2}
          label="composing response from base model"
        />
      </div>

      {stage >= 1 && (
        <div className="px-4 py-3 border-t border-border bg-surface fade-in">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-1.5">
            While you wait · TTC
          </p>
          <p className="text-[12.5px] text-ink leading-relaxed">
            You usually ask follow-ups about timing. I'll surface a short timeline
            once the answer lands.
          </p>
        </div>
      )}
    </div>
  );
}

function TraceLine({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`h-1 w-1 rounded-full ${
          done ? "bg-primary" : "bg-border-strong"
        }`}
      />
      <span
        className={`text-[12px] ${
          done ? "text-ink" : "text-ink-soft"
        } transition-colors`}
      >
        {label}
      </span>
      {!done && <span className="ml-auto shimmer h-px w-16 rounded-full" />}
    </div>
  );
}
