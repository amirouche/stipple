# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager: **bun** (see `bun.lockb`, `bunfig.toml`). `package-lock.json` is also present, so npm works as a fallback.

- `bun run dev` — Vite dev server (TanStack Start, SSR-capable).
- `bun run build` — production build. Cloudflare Workers output via `@cloudflare/vite-plugin` (entry: `@tanstack/react-start/server-entry`, see `wrangler.jsonc`).
- `bun run build:dev` — build in development mode.
- `bun run preview` — preview the production build locally.
- `bun run lint` — ESLint (flat config in `eslint.config.js`; `@typescript-eslint/no-unused-vars` is intentionally off).
- `bun run format` — Prettier write across the repo.

There is **no test runner configured** — do not invent one. There is no typecheck script either; `tsc --noEmit` works (`noEmit: true` in `tsconfig.json`).

Path alias: `@/* → ./src/*` (configured in both `tsconfig.json` and `components.json`).

## Vite config — do not extend by hand

`vite.config.ts` uses `@lovable.dev/vite-tanstack-config`, which already wires up `tanstackStart`, `viteReact`, `tailwindcss`, `tsConfigPaths`, the Cloudflare plugin (build only), `componentTagger` (dev only), `VITE_*` env injection, the `@` alias, React/TanStack dedupe, error-logger plugins, and sandbox port/host detection. **Adding any of these manually will break the build with duplicate-plugin errors.** Pass extra config via `defineConfig({ vite: { ... } })` if needed — do not replace the wrapper.

## Architecture

This is a **front-end-only mock/prototype** of "DOTS", a personal-layer concept over an AI model. There is no backend, no API calls, no database — every behavior is simulated against in-memory data in `src/lib/`. Most user-facing copy is in Korean.

### Routing — TanStack Start, file-based

Routes live in `src/routes/` and are compiled to `src/routeTree.gen.ts` by `@tanstack/router-plugin` (auto-regenerated; do not edit by hand). The router is built in `src/router.tsx` (`getRouter()` is the SSR entry point hook). Routes:

- `/` (`index.tsx`) — chat home; the main interactive surface.
- `/packs`, `/memory`, `/settings` — supporting screens.
- `__root.tsx` — HTML shell, head metadata, 404 component. Imports `styles.css?url` so SSR ships the stylesheet link tag.

### State — three hand-rolled `useSyncExternalStore` stores

There is no Redux/Zustand/Jotai. Each store is a module-level mutable object plus a `Set` of listeners; React subscribes via `useSyncExternalStore`. **State is not persisted** — page reload resets everything.

- `src/lib/conversation-store.ts` — multi-thread chat state. Threads are themed (`cooking | study | routine | open`); pinned themed threads are seeded so the sidebar feels lived-in on first load. Each thread tracks `lastPackId` (for pack-aware follow-ups) and `servedRecipeIds` (so "다른거?" rotates to a new recipe instead of repeating).
- `src/lib/preferences.ts` — UI prefs (home priority, default mode, pack order).
- The chat-engine "recently said" buffer is a module-level `recentLines` array inside `conversation-engine.ts` — not part of any store, but it is global mutable state that affects answers.

### The simulated DOTS pipeline

The conceptual flow `user input → intent → route → pack/memory answer` is split across three files. When changing chat behavior, expect to touch more than one:

1. **`src/lib/conversation-engine.ts`** — `step(query, installed, ctx)` is the entry point called from `routes/index.tsx`. It classifies intent (`greeting | memory_lookup | pack_lookup | follow_up | external_request`) via Korean+English keyword regex/lists, applies follow-up logic that keeps a thread inside its current pack, and returns an `EngineStep` (state + payload + reason).
2. **`src/lib/dots-data.ts`** — the data layer **and** the dumb router. Defines `PACKS`, `LOCAL_MEMORY`, `SAVED_RECIPES`, `COOKING_RECIPES`, `STUDY_PACK`. Exposes `routeQuery()` (greeting/memory/pack/deep decision), `recallFromMemory()`, `answerFor()` (composes the actual reply payload), and `getCookingRecipe()`. The conversation engine wraps these.
3. **`src/lib/continuations.ts`** — `buildContinuations(threads, packs)` scores "Continue from here" cards on the empty home state. Scoring blends recency, repeated topics, and recently-used/installed packs; capped at 2 cards. Several signals (recently used pack ids, topic counts) are **hardcoded mocks** at the top of the file.

`AnswerPayload` is a discriminated union (`text | recipe | memory-recipes`) — `routes/index.tsx` switches on `payload.kind` to render text, a single `RecipeCard`, or a list of recipe cards. Artificial latency (`setTimeout` in `index.tsx::send`) varies by `state` to make the routing feel real (greeting=500ms, found_local=700ms, deep=2400ms).

### UI

- `src/components/Shell.tsx` — app shell with sidebar (themed pinned threads, recent threads, nav). Exposes a `ShellContext` so child routes can open the mobile sidebar from their own header (`useShell().openMobile()`).
- `src/components/ProcessingTrace.tsx`, `RecipeCard.tsx` — domain components.
- `src/components/ui/` — shadcn/ui (style: `new-york`, base color: `slate`, icons: `lucide`). Configured in `components.json`; aliases follow `@/components/ui`, `@/lib/utils` (`cn` helper), `@/hooks`.
- Tailwind v4 via `@tailwindcss/vite`, with custom design tokens (`--ink`, `--ink-soft`, `--surface`, `--surface-2`, `--trace`, `--border-strong`) declared in `src/styles.css`. Use these tokens in classes like `text-ink`, `bg-surface-2`, `border-strong` — they are not stock Tailwind names.

### Adding a new pack

A "pack" is a behavior preset, not code. To add one:

1. Append a `Pack` entry to `PACKS` in `src/lib/dots-data.ts` (`triggers` is a list of substring matches checked by `routeQuery`).
2. If the pack should produce structured output (like cooking recipes), add a content table and a branch in `answerFor()` keyed on `pack.id`.
3. If it has follow-up behavior (the equivalent of "다른거?"), add a branch in `conversation-engine.ts::step` under the `intent === "follow_up"` block.
4. Add the pack id to `preferences.ts::packOrder` so it appears in Settings.
5. Optionally add a phrasing branch in `continuations.ts` so it can surface as a "Continue from here" card.
