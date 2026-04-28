import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import { hydrateMemoryStore, registerScheduler, tickScheduler } from "@/lib/memory";
import { hydrateWakeStore, registerWakeScheduler, checkWakeAlarms } from "@/lib/wake";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">404</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
          Nothing routed here.
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          DOTS could not match this path to a local pack or known screen.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-ink px-4 py-2 text-sm font-medium text-background"
        >
          Back to chat
        </a>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "DOTS — a personal layer over your AI" },
      {
        name: "description",
        content:
          "DOTS is a user-adaptive layer that sits on top of a strong AI model. Packs and on-device memory shape every response.",
      },
      { property: "og:title", content: "DOTS — a personal layer over your AI" },
      {
        property: "og:description",
        content:
          "Packs change how the same model behaves. Local memory answers fast. Deeper inference takes over only when needed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: () => <Outlet />,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void hydrateMemoryStore().then(() => {
      tickScheduler();
      registerScheduler();
    });
    hydrateWakeStore();
    checkWakeAlarms();
    registerWakeScheduler();
    if (import.meta.env.DEV) {
      void import("@/lib/memory/debug").then((m) => m.setupDebugHandle());
    }
  }, []);

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
