import { useEffect, useState } from "react";
import type { Route } from "@/lib/dots-data";

// Subtle processing UI. Same voice across both modes — the only difference is
// how long DOTS needs and whether it surfaces a small contextual note while
// you wait. No "system handoff" language.
export function ProcessingTrace({
  route,
  reason,
  packName,
}: {
  route: Route;
  reason: string;
  packName?: string;
}) {
  const [showContext, setShowContext] = useState(false);
  useEffect(() => {
    if (route !== "deep") return;
    const t = setTimeout(() => setShowContext(true), 900);
    return () => clearTimeout(t);
  }, [route]);

  if (route === "local") {
    return (
      <div className="flex items-center gap-2.5 text-[13px] text-ink-soft fade-in">
        <span className="dot-local" />
        <span className="leading-snug">{reason}</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden fade-in">
      <div className="px-4 py-3 flex items-center gap-2.5">
        <span className="dot-deep" />
        <span className="text-[13px] text-ink leading-snug">{reason}</span>
      </div>

      {showContext && (
        <div className="px-4 py-3 border-t border-border bg-surface fade-in">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-1.5">
            While you wait
          </p>
          <p className="text-[12.5px] text-ink leading-relaxed">
            {packName
              ? `You usually ask follow-ups about timing on ${packName.toLowerCase()} questions. I'll line that up alongside the answer.`
              : "I'll keep the reply tight and flag anything I'm not sure about, instead of guessing."}
          </p>
        </div>
      )}
    </div>
  );
}
