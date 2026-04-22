import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/Shell";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — DOTS" },
      {
        name: "description",
        content: "Manage privacy, mode, and personal data preferences in DOTS.",
      },
    ],
  }),
  component: SettingsPage,
});

type Mode = "normal" | "youth";

function SettingsPage() {
  const [mode, setMode] = useState<Mode>("normal");
  const [telemetry, setTelemetry] = useState(false);

  return (
    <Shell>
      <div className="flex flex-col">
        <header className="px-8 md:px-12 pt-10 pb-8 border-b border-border">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">
            Preferences
          </p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tight text-ink">
            Settings
          </h1>
        </header>

        <div className="px-8 md:px-12 py-10 max-w-2xl space-y-6">
          {/* Privacy */}
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[15px] font-semibold tracking-tight text-ink">
                Privacy
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
                on-device
              </span>
            </div>
            <p className="text-[14px] text-ink leading-relaxed">
              Personalized data stays on this device.
            </p>
            <p className="mt-2 text-[12.5px] text-ink-soft leading-relaxed">
              Memory, pack preferences, and learned habits are stored locally.
              Only the prompt and pack signature travel to the base model when
              deeper inference is required.
            </p>

            <div className="mt-5 pt-5 border-t border-border flex items-center justify-between">
              <div>
                <p className="text-[13.5px] text-ink">Anonymous usage telemetry</p>
                <p className="text-[12px] text-ink-soft">
                  Helps improve packs. Off by default.
                </p>
              </div>
              <Toggle on={telemetry} onChange={setTelemetry} />
            </div>
          </section>

          {/* Mode */}
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink mb-1">
              Mode
            </h2>
            <p className="text-[12.5px] text-ink-soft mb-4">
              Sets the default safety profile across all packs.
            </p>

            <div className="space-y-2">
              <ModeOption
                active={mode === "normal"}
                onClick={() => setMode("normal")}
                title="Normal"
                desc="Full pack capability. Standard model behavior."
              />
              <ModeOption
                active={mode === "youth"}
                onClick={() => setMode("youth")}
                title="Youth-safe"
                desc="Stricter content filters and gentler tone across every pack."
              />
            </div>
          </section>

          {/* About */}
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink mb-3">
              About DOTS
            </h2>
            <dl className="grid grid-cols-2 gap-y-2 text-[13px]">
              <dt className="text-ink-soft">Version</dt>
              <dd className="font-mono text-ink">0.1.0 · prototype</dd>
              <dt className="text-ink-soft">Base model</dt>
              <dd className="font-mono text-ink">configurable</dd>
              <dt className="text-ink-soft">Personal layer</dt>
              <dd className="font-mono text-ink">local</dd>
            </dl>
          </section>
        </div>
      </div>
    </Shell>
  );
}

function ModeOption({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-lg border transition-colors flex items-start gap-3 ${
        active
          ? "border-strong bg-surface"
          : "border-border bg-card hover:border-strong"
      }`}
    >
      <span
        className={`mt-1 h-3.5 w-3.5 rounded-full border-2 shrink-0 transition-all ${
          active ? "border-primary bg-primary" : "border-border-strong"
        }`}
      />
      <span>
        <span className="block text-[13.5px] font-medium text-ink">{title}</span>
        <span className="block text-[12px] text-ink-soft mt-0.5">{desc}</span>
      </span>
    </button>
  );
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`h-5 w-9 rounded-full transition-colors relative ${
        on ? "bg-ink" : "bg-border-strong"
      }`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-transform ${
          on ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
