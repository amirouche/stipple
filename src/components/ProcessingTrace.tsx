import { useEffect, useState } from "react";
import type { Route } from "@/lib/dots-data";

// Quiet processing UI. No system labels, no handoff language — just a soft
// pulse and, on longer waits, a brief personal note while DOTS thinks.
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
    const t = setTimeout(() => setShowContext(true), 1100);
    return () => clearTimeout(t);
  }, [route]);

  if (!reason && route === "local") return null;

  if (route === "local") {
    return (
      <div className="flex items-center gap-2.5 text-[13px] text-ink-soft fade-in">
        <span className="dot-local" />
        <span className="leading-snug">{reason}</span>
      </div>
    );
  }

  return (
    <div className="fade-in space-y-2">
      <div className="flex items-center gap-2.5 text-[13px] text-ink-soft">
        <span className="dot-deep" />
        <span className="leading-snug">{reason}</span>
      </div>
      {showContext && (
        <p className="text-[12.5px] text-ink-soft/90 leading-relaxed pl-4 fade-in">
          {packName
            ? `Pulling in what I remember about your ${packName.toLowerCase()} preferences.`
            : "I'll keep it tight and flag anything I'm unsure about."}
        </p>
      )}
    </div>
  );
}
