// Micro-ad card rendered next to an assistant answer. Auto-loops the GIF,
// labels the source, and lets the user dismiss with a single click. The
// dismissal is recorded in sessionStorage so the same ad won't reappear in
// this session.

import { useState } from "react";
import { dismissAd } from "@/lib/ads";
import type { Ad } from "@/lib/ads/types";

export function AdCard({ ad }: { ad: Ad }) {
  const [hidden, setHidden] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  if (hidden) return null;

  function close(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    dismissAd(ad.id);
    setHidden(true);
  }

  const Wrapper = ad.ctaUrl ? "a" : "div";
  const wrapperProps = ad.ctaUrl
    ? { href: ad.ctaUrl, target: "_blank", rel: "noopener noreferrer" }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className="relative block w-full max-w-md rounded-xl border border-border bg-card hover:border-strong transition-colors overflow-hidden group"
    >
      <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-background/80 backdrop-blur px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
        협찬 · {ad.brand}
      </span>

      <button
        type="button"
        onClick={close}
        aria-label="광고 닫기"
        className="absolute top-2 right-2 z-10 h-6 w-6 inline-flex items-center justify-center rounded-full bg-background/80 backdrop-blur text-ink-soft hover:text-ink transition-colors"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>

      <div className="flex items-stretch">
        <div className="w-[112px] shrink-0 bg-surface-2 flex items-center justify-center overflow-hidden">
          {imgFailed ? (
            <div className="flex flex-col items-center justify-center text-center px-2 py-3 w-full h-full">
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft">
                GIF
              </span>
              <span className="mt-1 text-[10.5px] text-ink-soft truncate max-w-full">
                {ad.duration}s
              </span>
            </div>
          ) : (
            <img
              src={ad.gifPath}
              alt={ad.brand}
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover"
            />
          )}
        </div>

        <div className="flex-1 min-w-0 px-3 py-3 flex flex-col justify-center">
          <p className="text-[12.5px] text-ink leading-snug line-clamp-2">{ad.tagline}</p>
          {ad.ctaUrl && (
            <p className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
              자세히 →
            </p>
          )}
        </div>
      </div>
    </Wrapper>
  );
}
