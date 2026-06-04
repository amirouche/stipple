import { useEffect, useState } from "react";
import type { Route } from "@/lib/dots-data";
import { useT } from "@/lib/i18n";

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
  const t = useT().chat.processingTrace;
  useEffect(() => {
    if (route !== "deep") return;
    const id = setTimeout(() => setShowContext(true), 1100);
    return () => clearTimeout(id);
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
          {packName ? t.deepWithPack : t.deepWithoutPack}
        </p>
      )}
    </div>
  );
}
