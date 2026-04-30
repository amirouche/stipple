import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Shell, useShell } from "@/components/Shell";
import { ProcessingTrace } from "@/components/ProcessingTrace";
import { RecipeCard } from "@/components/RecipeCard";
import { PitchCard } from "@/components/PitchCard";
import {
  PACKS,
  getCookingRecipe,
  type Pack,
  type PackRecipe,
  type Route as RouteType,
  type SuggestionOption,
} from "@/lib/dots-data";
import { step } from "@/lib/conversation-engine";
import {
  appendMessage,
  createThread,
  markRecipeServed,
  patchMessage,
  renameThreadIfDefault,
  setThreadPack,
  useConversationStore,
  type ThreadMsg,
} from "@/lib/conversation-store";
import { usePreferences } from "@/lib/preferences";
import { buildContinuations, type ContinueCard } from "@/lib/continuations";
import { composeAnswer } from "@/lib/ai/compose";
import { dispatchLLMCall, type DispatchTurn } from "@/lib/ai/dispatch";
import {
  matchPackContent,
  buildPackSuggestion,
  inferDomainPack,
  hasDefinitionIntent,
} from "@/lib/packs/match";
import { classifyIntent } from "@/lib/packs/intent";
import { buildStoreSuggestion, searchStoreForQuery } from "@/lib/packs/store-search";
import { incrementUsedCount, matchLearnedResponse, saveLearned } from "@/lib/learning";
import { addUserSATProblem, getUserSATProblems } from "@/lib/packs/study/user-store";
import { buildSATMathDummy, buildSATMathFromLLM } from "@/lib/packs/study/parse-llm";
import type { AnswerPayload } from "@/lib/dots-data";

// Words that mean "give me another / something else / please do it" — when
// the previous assistant message is a pack-suggestion and the user's next
// input contains one of these, treat it as a follow-up choice (LLM direct)
// rather than re-running the matcher and showing the same suggestion again.
const FOLLOWUP_ACTION_PATTERNS = [
  "새 문",
  "새문",
  "새거",
  "새 거",
  "다른 거",
  "다른거",
  "다음 거",
  "다음거",
  "받아줘",
  "받아 줘",
  "부탁",
  "또 ",
  "또?",
  "또요",
  "더 줘",
  "더 만들",
  "추가",
];

function hasFollowUpIntent(input: string): boolean {
  const q = input.toLowerCase();
  return FOLLOWUP_ACTION_PATTERNS.some((p) => q.includes(p));
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "대화 — DOTS" },
      {
        name: "description",
        content:
          "DOTS는 사용자에게 맞춰지는 한 겹의 레이어입니다. 팩, 기억, 그리고 깊은 추론 사이를 조용히 오갑니다.",
      },
    ],
  }),
  component: ChatPage,
});

// Theme labels are no longer surfaced on the chat home — kept internal.

// "Continue from here" cards are produced by buildContinuations() —
// scored across recent threads, repeated topics, and recently used packs.

function ChatPage() {
  const [installed] = useState<Pack[]>(PACKS.filter((p) => p.installed));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { threads, activeId } = useConversationStore();
  const prefs = usePreferences();

  // Always have at least one thread; fall back to seeded one.
  useEffect(() => {
    if (threads.length === 0) createThread("open", "새 대화");
  }, [threads.length]);

  const thread = threads.find((t) => t.id === activeId) ?? threads[0];
  const messages = thread?.messages ?? [];

  // CONSTITUTION: send() must NEVER call the LLM on its own.
  //   - Stage 1 (matchPackContent hit) → render suggestion + return
  //   - Stage 2 (searchStoreForQuery hit) → render suggestion + return
  //   - Stage 3 (no match anywhere) → engine + composeAnswer is allowed,
  //     because at that point we've exhausted local + store options.
  // The LLM is otherwise only invoked from onSuggestionAction("llm-call"),
  // which fires from an explicit user button click. If you're touching
  // this function: keep the early-returns, never let stages cascade.
  async function send(text: string) {
    if (!text.trim() || busy || !thread) return;

    // V3 라우터: 의도 분류부터. WebLLM ready면 LLM 분류 (50~100ms 목표,
    // 실제 500ms~1s), 아니면 규칙 fallback. 이후 모든 stage는 분류 결과를
    // 보고 자기가 돌지 결정한다.
    setBusy(true);
    setInput("");
    const intentResult = await classifyIntent(text);
    const intent = intentResult.intent;

    if (import.meta.env.DEV) {
      console.log("[send]", {
        input: text,
        intent,
        confidence: intentResult.confidence,
        lastPackId: thread.lastPackId,
      });
    }

    // No `activePack` lookup: there's no "active mode" anymore.
    // matchPackContent (Stage 1) handles routing to the right pack;
    // when nothing matches, Stage 3 calls the LLM with default voice.
    const scrollDown = () =>
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current?.scrollHeight ?? 0,
          behavior: "smooth",
        });
      });

    // ---- On-device match: runs FIRST, before the engine and before any
    // pending bubble. The whole "이 기기 안에서" promise breaks if the user
    // sees a fallback line ("이건 안에서는 안 잡혀…") flash before the
    // suggestion. So when a match hits we skip the engine entirely and
    // render the user msg + final suggestion msg in one step.
    //
    // Skip the matcher when the previous assistant turn was a suggestion
    // AND this input has a follow-up action word ("새 문제", "또 부탁",
    // …). Re-matching on those would just show the same suggestion card
    // again. The exception preserved by design: typing the topic word
    // alone ("수학") still re-triggers a fresh match.
    const lastAsst = [...thread.messages]
      .reverse()
      .find((m): m is Extract<ThreadMsg, { role: "assistant" }> => m.role === "assistant");
    const justSawSuggestion = Boolean(lastAsst?.suggestion);

    // V3: 의도 기반 게이트. definition / follow-up / casual은 매칭 카드가
    // 의도와 어긋나므로 Stage 1+2를 건너뛴다. search / recommend / unknown은
    // 매칭 시도. (V2의 hasDefinitionIntent는 V3 분류기 fallback 안에서 똑같이
    // 작동하므로 별도 호출은 필요 없지만, 분류기 자체가 미사용/실패한
    // 극단 환경에서도 정의 요청 회귀를 막기 위해 OR로 살려둔다.)
    const isExplanatoryIntent = intent === "definition" || intent === "casual";
    const isFollowUpIntent = intent === "follow-up";

    const skipMatchStep =
      isExplanatoryIntent ||
      isFollowUpIntent ||
      hasDefinitionIntent(text) ||
      (justSawSuggestion && hasFollowUpIntent(text));
    const matched = skipMatchStep ? null : matchPackContent(text, installed, undefined);
    if (matched) {
      const userId = crypto.randomUUID();
      const asstId = crypto.randomUUID();
      const payload = buildPackSuggestion(matched);
      const sugText = payload.kind === "pack-suggestion" ? payload.text : "";
      const sugData =
        payload.kind === "pack-suggestion"
          ? {
              matchedPackName: payload.matchedPackName,
              matchedPackId: payload.matchedPackId,
              options: payload.options,
              badge: payload.badge ?? "local",
            }
          : undefined;

      appendMessage(thread.id, { id: userId, role: "user", text });
      renameThreadIfDefault(thread.id, text);
      appendMessage(thread.id, {
        id: asstId,
        role: "assistant",
        route: "local",
        state: "found_local",
        reason: "",
        packName: matched.pack.name,
        pending: false,
        text: sugText,
        suggestion: sugData,
      });
      // No setThreadPack here — typing "수학" in a cooking thread should
      // surface the Study match without flipping the thread's mode out
      // from under the user.
      setBusy(false);
      scrollDown();
      return;
    }

    // ---- Stage 2: store search. Local match failed, but the input might
    // map to a recognized study/lifestyle domain we can route to the
    // marketplace. If a domain is detected (with or without store hits),
    // we render a store-suggestion bubble instead of dropping straight
    // to the LLM. Skipped on follow-up intent so we don't loop. ----
    const skipStoreStep = skipMatchStep;
    if (!skipStoreStep) {
      const storeResult = searchStoreForQuery(text);
      if (storeResult) {
        const payload = buildStoreSuggestion(text, storeResult);
        const userId = crypto.randomUUID();
        const asstId = crypto.randomUUID();
        const sugText = payload.kind === "pack-suggestion" ? payload.text : "";
        const sugData =
          payload.kind === "pack-suggestion"
            ? {
                matchedPackName: payload.matchedPackName,
                options: payload.options,
                badge: payload.badge ?? "store",
              }
            : undefined;
        appendMessage(thread.id, { id: userId, role: "user", text });
        renameThreadIfDefault(thread.id, text);
        appendMessage(thread.id, {
          id: asstId,
          role: "assistant",
          route: "local",
          state: "found_local",
          reason: "",
          packName: "팩스토어",
          pending: false,
          text: sugText,
          suggestion: sugData,
        });
        setBusy(false);
        scrollDown();
        return;
      }
    }

    // ---- Stage 2.5: learned cache. V2 헌법 2번 (자동 학습) + 3번
    // (점진적 온디바이스 진화). Phase A: exact-match (lower+trim) on
    // userInput. Hit → render the cached response directly, no LLM call,
    // bump usedCount. Skipped on follow-up intent so "다른거" goes to a
    // fresh LLM turn instead of replaying the previous cached one.
    // Casual은 학습된 인사 응답 hit이면 그대로 사용 (인사 자체를 캐싱) — V2 동작.
    const skipLearnedStep = isFollowUpIntent || (justSawSuggestion && hasFollowUpIntent(text));
    if (!skipLearnedStep) {
      const learned = matchLearnedResponse(text);
      if (learned) {
        const userId = crypto.randomUUID();
        const asstId = crypto.randomUUID();
        appendMessage(thread.id, { id: userId, role: "user", text });
        renameThreadIfDefault(thread.id, text);
        appendMessage(thread.id, {
          id: asstId,
          role: "assistant",
          route: "local",
          state: "found_local",
          reason: "",
          packName: learned.packName,
          pending: false,
          text: learned.response,
          provider: "learned",
        });
        void incrementUsedCount(learned.id);
        setBusy(false);
        scrollDown();
        return;
      }
    }

    // ---- Stage 3: nothing matched anywhere. Existing engine + composeAnswer flow. ----
    const userId = crypto.randomUUID();
    const asstId = crypto.randomUUID();

    const result = step(text, installed, {
      contextPackId: thread.lastPackId,
      servedRecipeIds: thread.servedRecipeIds,
    });
    const route: RouteType =
      result.state === "checking_external"
        ? "deep"
        : result.intent === "memory_lookup"
          ? "memory"
          : "local";

    appendMessage(thread.id, { id: userId, role: "user", text });
    renameThreadIfDefault(thread.id, text);
    appendMessage(thread.id, {
      id: asstId,
      role: "assistant",
      route,
      state: result.state,
      reason: result.reason,
      packName: result.pack?.name,
      pending: true,
    });

    if (result.pack) setThreadPack(thread.id, result.pack.id);

    // V2 voice/tone inference: when matchPackContent returned null due to
    // the threshold (or routeQuery couldn't pin a pack), there may still
    // be a domain leaning. inferDomainPack returns the closest pack —
    // "메뉴 추천" → cooking, "수학" → study — so the LLM answers in the
    // right voice even when nothing was strong enough to surface a card.
    // Falls back to undefined for fully off-topic input ("양자역학").
    const composePack = result.pack ?? inferDomainPack(text, installed);

    // setBusy(true)/setInput("") are now done at the top of send() before
    // classifyIntent — by the time we get to Stage 3 they're already set.

    const renderPayload = (payload: AnswerPayload, provider?: "webllm" | "gemini") => {
      let body = "";
      let recipes: PackRecipe[] | undefined;
      let suggestion:
        | {
            matchedPackName: string;
            options: SuggestionOption[];
            badge?: "local" | "store" | "create";
          }
        | undefined;
      if (payload.kind === "text") {
        body = payload.text;
      } else if (payload.kind === "recipe") {
        const r = getCookingRecipe(payload.recipeId);
        recipes = r ? [r] : undefined;
        body = payload.intro ?? "";
        if (r) markRecipeServed(thread.id, r.id);
      } else if (payload.kind === "memory-recipes") {
        recipes = payload.recipeIds
          .map((id) => getCookingRecipe(id))
          .filter((r): r is PackRecipe => Boolean(r));
        body = payload.intro;
      } else if (payload.kind === "pack-suggestion") {
        body = payload.text;
        suggestion = {
          matchedPackName: payload.matchedPackName,
          options: payload.options,
          badge: payload.badge ?? "local",
        };
      }
      patchMessage(thread.id, asstId, {
        pending: false,
        text: body,
        recipes,
        pitch: payload.kind === "pack-suggestion" ? undefined : payload.pitch,
        suggestion,
        provider,
      });
      setBusy(false);
      scrollDown();

      // V2 Phase 2 자동 학습. Save only when an LLM actually ran (provider
      // set) and produced plain text — recipe cards / memory-recipes are
      // structured outputs whose value lives in the recipe ids, not the
      // intro text; pack-suggestion bubbles aren't LLM output at all.
      // Constitution: 사용자 명시 X 자동 작동 — but here we're caching a
      // call the user already made, not making a new one. Cache use on
      // the next exact-match query is what skips a future LLM call.
      if (provider && payload.kind === "text" && body.trim()) {
        void saveLearned({
          id: crypto.randomUUID(),
          userInput: text,
          response: body,
          provider,
          packId: composePack?.id,
          packName: composePack?.name,
          voice: composePack?.voice,
          tone: composePack?.tone,
          createdAt: Date.now(),
          usedCount: 0,
        });
      }
    };

    // Greeting short-circuit: V3 casual intent은 LLM(짧은 응답)으로 흘려야
    // 하므로 캔드 응답 분기를 건너뛴다. 분류기가 unknown으로 떨어졌어도
    // engine이 "안녕"을 greeting으로 잡으면 이전처럼 캔드 사용.
    if (result.state === "greeting" && intent !== "casual") {
      setTimeout(() => renderPayload(result.payload), 500);
      return;
    }

    // Streaming: each delta extends the bubble's text while still pending.
    // The final renderPayload below replaces with the canonical text and
    // flips pending: false. text/recipe/memory-recipes payloads use the
    // streamed text as their body or intro; pack-suggestion payloads
    // ignore it (they don't carry LLM-generated prose).
    const onToken = (_delta: string, sofar: string) => {
      patchMessage(thread.id, asstId, { text: sofar });
      scrollDown();
    };

    composeAnswer({
      query: text,
      pack: composePack,
      lookup: result.lookup,
      fallback: result.payload,
      history: threadHistory(thread.messages),
      onToken,
      intent,
    }).then(({ payload, provider }) => renderPayload(payload, provider));
  }

  // Suggestion buttons — invoked from rendered messages. Each option is one
  // explicit user choice: open the folder, show a recipe inline (no LLM),
  // or call the LLM with a tailored prompt. Adds new assistant messages
  // rather than mutating the suggestion bubble so the conversation keeps
  // a clean trail.
  //
  // The `busy` guard is intentional: this handler is the ONLY entry point
  // for cloud calls outside Stage 3 of send(). Blocking it while another
  // call is in flight closes the door on accidental double-fires from
  // double-clicks or any unexpected re-invocation of the click handler.
  function onSuggestionAction(option: SuggestionOption, matchedPackId?: string) {
    if (!thread || busy) return;
    // The matched pack is the one the suggestion came from. It used to be
    // looked up via thread.lastPackId (the old "active mode"), but with
    // activation removed, the suggestion itself carries the pack id —
    // matching IS the activation now.
    const matchedPack = matchedPackId ? installed.find((p) => p.id === matchedPackId) : undefined;
    if (option.kind === "open-folder") {
      navigate({ to: option.target });
      return;
    }
    if (option.kind === "show-recipe") {
      const r = getCookingRecipe(option.recipeId);
      if (!r) return;
      const id = crypto.randomUUID();
      appendMessage(thread.id, {
        id,
        role: "assistant",
        route: "local",
        state: "found_local",
        reason: "",
        packName: matchedPack?.name,
        pending: false,
        recipes: [r],
      });
      markRecipeServed(thread.id, r.id);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current?.scrollHeight ?? 0,
          behavior: "smooth",
        });
      });
      return;
    }
    if (option.kind === "llm-call") {
      const id = crypto.randomUUID();
      appendMessage(thread.id, {
        id,
        role: "assistant",
        route: "deep",
        state: "checking_external",
        reason: "클라우드로 보낼게.",
        packName: option.systemPrompt ? "SAT 수학 튜터" : matchedPack?.name,
        pending: true,
      });
      setBusy(true);

      const scrollDown = () => {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({
            top: scrollRef.current?.scrollHeight ?? 0,
            behavior: "smooth",
          });
        });
      };
      const onDoneText = (text: string) => {
        patchMessage(thread.id, id, { pending: false, text });
        setBusy(false);
        scrollDown();
      };
      // postAction "save-as-sat-problem": parse the LLM response into a
      // SATMathProblem, persist it to the user store, and replace the
      // pending bubble with a folder-open suggestion. The raw LLM text
      // never goes to chat —헌법: LLM 응답을 일회용으로 흘려보내지 않는다.
      const onSavedProblem = (source: "llm" | "dummy") => {
        const noteText =
          source === "llm"
            ? "새 SAT 수학 문제를 만들어서 Study 팩에 저장했어."
            : "(샘플 문제로 대체) Study 팩에 저장됐어. 폴더에서 풀어볼래?";
        patchMessage(thread.id, id, {
          pending: false,
          text: noteText,
          packName: "Study Companion",
          suggestion: {
            matchedPackName: "Study Companion",
            options: [{ kind: "open-folder", label: "폴더 열기", target: "/study" }],
          },
        });
        setBusy(false);
        scrollDown();
      };

      const postAction = option.postAction;
      const onFail = (err: unknown) => {
        console.error("[suggestion llm-call] failed:", err);
        if (postAction === "save-as-sat-problem") {
          // LLM down — still honor the constitution by storing a dummy.
          const dummy = buildSATMathDummy(getUserSATProblems().length);
          addUserSATProblem(dummy);
          onSavedProblem("dummy");
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        onDoneText(`(클라우드 호출 실패: ${msg})`);
      };

      // Streaming token sink — same shape as Stage 3. Skip while a
      // postAction will replace the bubble entirely (save-as-sat-problem
      // builds a "Study에 저장됨" message, so streaming raw output then
      // overwriting it would just flicker).
      const streamToken =
        postAction === "save-as-sat-problem"
          ? undefined
          : (_delta: string, sofar: string) => {
              patchMessage(thread.id, id, { text: sofar });
              scrollDown();
            };

      const onDoneTextWithProvider = (text: string, provider?: "webllm" | "gemini") => {
        patchMessage(thread.id, id, { pending: false, text, provider });
        setBusy(false);
        scrollDown();
      };

      // Two paths:
      //  - With option.systemPrompt: bypass composeAnswer entirely so the
      //    matched-pack persona (e.g. SAT 수학 튜터) can override the
      //    chat thread's active mode. Without this override the cooking
      //    persona refuses SAT math requests. We also skip pack injection
      //    for the same reason — the option's prompt IS the persona.
      //  - Without: keep the active-pack injection from composeAnswer so
      //    "다른 음식" stays in cooking voice.
      if (option.systemPrompt) {
        dispatchLLMCall(
          {
            userMessage: option.prompt,
            systemPrompt: option.systemPrompt,
            history: threadHistory(thread.messages),
          },
          streamToken,
        )
          .then((res) => {
            if (postAction === "save-as-sat-problem") {
              const built = buildSATMathFromLLM(res.text, getUserSATProblems().length);
              addUserSATProblem(built.problem);
              onSavedProblem(built.source);
            } else {
              onDoneTextWithProvider(res.text, res.provider);
            }
          })
          .catch(onFail);
      } else {
        composeAnswer({
          query: option.prompt,
          pack: matchedPack,
          fallback: { kind: "text", text: "지금은 응답을 가져오지 못했어." },
          history: threadHistory(thread.messages),
          onToken: streamToken,
        })
          .then(({ payload, provider }) =>
            onDoneTextWithProvider(payload.kind === "text" ? payload.text : "", provider),
          )
          .catch(onFail);
      }
    }
  }

  // Convert thread messages → DispatchTurn[] for LLM context. Drops
  // pending bubbles, recipe-only / suggestion-only assistant messages
  // (no `text`), and anything that wouldn't help the model interpret
  // the next user turn. dispatch trims to N internally.
  function threadHistory(msgs: ThreadMsg[]): DispatchTurn[] {
    const turns: DispatchTurn[] = [];
    for (const m of msgs) {
      if (m.role === "user") {
        turns.push({ role: "user", content: m.text });
      } else if (!m.pending && m.text) {
        turns.push({ role: "assistant", content: m.text });
      }
    }
    return turns;
  }

  if (!thread) return null;

  // Score-based "Continue from here" — capped at 2.
  // Honors home priority by giving a small boost to the matching source.
  const baseContinues = buildContinuations(threads, installed);
  const orderedContinues =
    prefs.homePriority === "memory-first"
      ? [...baseContinues].sort((a, b) =>
          a.source === "topic" ? -1 : b.source === "topic" ? 1 : 0,
        )
      : prefs.homePriority === "packs-first"
        ? [...baseContinues].sort((a, b) =>
            a.source === "pack" ? -1 : b.source === "pack" ? 1 : 0,
          )
        : baseContinues;

  // Quick-entry pack row (top 3) — shown on mobile as shortcuts.
  const quickPacks = installed.slice(0, 3);
  const hasMessages = messages.length > 0;

  return (
    <Shell>
      <ChatBody
        quickPacks={quickPacks}
        hasMessages={hasMessages}
        orderedContinues={orderedContinues}
        messages={messages}
        scrollRef={scrollRef}
        input={input}
        setInput={setInput}
        busy={busy}
        send={send}
        onSuggestionAction={onSuggestionAction}
        onOpenFolder={(route) => navigate({ to: route })}
      />
    </Shell>
  );
}

function ChatBody({
  quickPacks,
  hasMessages,
  orderedContinues,
  messages,
  scrollRef,
  input,
  setInput,
  busy,
  send,
  onSuggestionAction,
  onOpenFolder,
}: {
  quickPacks: Pack[];
  hasMessages: boolean;
  orderedContinues: ContinueCard[];
  messages: ThreadMsg[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  input: string;
  setInput: (v: string) => void;
  busy: boolean;
  send: (text: string) => void;
  onSuggestionAction: (option: SuggestionOption, matchedPackId?: string) => void;
  onOpenFolder: (route: string) => void;
}) {
  const shell = useShell();

  return (
    <div className="flex flex-col h-screen">
      {/* Header — mobile menu button + quick pack row, no titles or status */}
      <header className="border-b border-border">
        <div className="flex items-center gap-2 px-3 sm:px-8 md:px-12 py-3">
          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => shell?.openMobile()}
            className="md:hidden shrink-0 h-9 w-9 -ml-1 inline-flex items-center justify-center rounded-md text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
            aria-label="메뉴 열기"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>

          {/* Pack pill row — each pill is a folder shortcut. There is no
              "active mode" anymore: voice/tone is decided by what the user
              types (auto-matching), not by what they toggled. Clicking a
              pack opens its folder if it has one, otherwise the catalog. */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {quickPacks.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenFolder(p.folderRoute ?? "/packs")}
                className="shrink-0 px-3 py-1.5 rounded-full hairline text-[12px] bg-surface-2 text-ink-soft hover:text-ink transition-colors"
                title={p.folderRoute ? `${p.name} 폴더 열기` : `${p.name} 카드 보기`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
        {/* Single-line tagline — replaces the old "{name} 모드 · voice · tone"
            indicator. With activation gone, voice/tone is decided by the
            input itself, so there's nothing fixed to display here. */}
        <div className="px-3 sm:px-8 md:px-12 pb-2 -mt-1 text-[11px] text-ink-soft">
          DOTS — 한국어 도우미. 입력에 맞춰 자동으로 톤이 바뀌어.
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 md:px-10 py-6 sm:py-10 space-y-8">
          {!hasMessages && <WelcomeState continues={orderedContinues} onPick={send} />}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end fade-in">
                <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-ink text-background text-[14px] leading-relaxed">
                  {m.text}
                </div>
              </div>
            ) : (
              <AssistantBubble key={m.id} m={m} onSuggestionAction={onSuggestionAction} />
            ),
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-surface">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 md:px-10 py-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-3 rounded-xl border border-border bg-card px-4 py-3 focus-within:border-strong transition-colors"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey) return;
                // 한국어 IME 합자 중 Enter는 합자 확정에만 쓰여. 여기서
                // send()를 부르면 setInput("") 후에 IME가 마지막 글자를
                // 다시 끼워넣어 입력창에 한 글자가 남는 React + IME 동기화
                // 버그가 난다. keyCode 229는 구형 브라우저용 백업.
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                e.preventDefault();
                send(input);
              }}
              rows={1}
              placeholder="DOTS에게 말 걸기"
              className="flex-1 resize-none bg-transparent outline-none text-[14.5px] leading-relaxed text-ink placeholder:text-ink-soft/70 max-h-40"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              className="shrink-0 h-8 px-3 rounded-md bg-ink text-background text-[12.5px] font-medium disabled:opacity-30 transition-opacity"
            >
              보내기
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function AssistantBubble({
  m,
  onSuggestionAction,
}: {
  m: Extract<ThreadMsg, { role: "assistant" }>;
  onSuggestionAction: (option: SuggestionOption, matchedPackId?: string) => void;
}) {
  // Streaming state: while pending, partial text from onToken trickles
  // in. Show the trace until the first delta lands, then swap to the
  // streaming bubble with a blinking caret. When pending flips false
  // the caret disappears and the rest of the bubble (suggestions,
  // recipes, pitch) renders.
  const isStreaming = Boolean(m.pending && m.text);
  const showTrace = m.pending ? !m.text : m.route === "deep";
  return (
    <div className="space-y-3 fade-in">
      {showTrace && <ProcessingTrace route={m.route} reason={m.reason} packName={m.packName} />}
      {(isStreaming || !m.pending) && (
        <div className="space-y-3">
          {m.text && (
            <div className="text-[14.5px] leading-[1.65] text-ink max-w-2xl whitespace-pre-wrap">
              {m.text}
              {isStreaming && (
                <span
                  aria-hidden
                  className="inline-block w-[2px] h-[1em] align-[-0.15em] ml-[1px] bg-ink animate-pulse"
                />
              )}
            </div>
          )}
          {!m.pending && m.provider && <ProviderBadge provider={m.provider} />}
          {!m.pending && m.suggestion && (
            <SuggestionBlock
              packName={m.suggestion.matchedPackName}
              options={m.suggestion.options}
              badge={m.suggestion.badge ?? "local"}
              onAction={(opt) => onSuggestionAction(opt, m.suggestion?.matchedPackId)}
            />
          )}
          {!m.pending && m.recipes?.map((r) => <RecipeCard key={r.id} recipe={r} />)}
          {!m.pending && m.pitch && <PitchCard pitch={m.pitch} />}
        </div>
      )}
    </div>
  );
}

function ProviderBadge({ provider }: { provider: "webllm" | "gemini" | "learned" }) {
  // Three-tone visual contract across the chat:
  //   red   — local match or learned cache (no LLM call this turn)
  //   green — WebLLM (private, on-device, zero external calls)
  //   blue  — Gemini  (cloud API)
  // V2 narrative: as the learning cache grows, red appears more often
  // and blue/green less. The user watches their AI go local over time.
  // Hidden when showLLMProvenance is off (no settings UI yet).
  const prefs = usePreferences();
  if (!prefs.showLLMProvenance) return null;
  const dot =
    provider === "webllm" ? "bg-green-500" : provider === "gemini" ? "bg-blue-500" : "bg-red-500";
  const label =
    provider === "webllm"
      ? "내 기기 (WebLLM) · 외부 호출 0"
      : provider === "gemini"
        ? "클라우드 (Gemini) · 외부 API"
        : "학습됨 · 캐시에서 (외부 호출 0)";
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </p>
  );
}

function SuggestionBlock({
  packName,
  options,
  badge,
  onAction,
}: {
  packName: string;
  options: SuggestionOption[];
  badge: "local" | "store" | "create";
  onAction: (option: SuggestionOption) => void;
}) {
  // Footer label tracks where the suggestion came from. "local" = installed
  // pack content; "store" = marketplace search hit; "create" = no match
  // anywhere yet, the LLM button would manufacture it.
  const footer =
    badge === "local"
      ? `${packName}에서 매칭됨 · 로컬 매칭`
      : badge === "store"
        ? "팩스토어에서 검색됨 · 로컬 매칭"
        : "콘텐츠 없음 · 새로 만들 수 있어";
  // Red dot = on-device match (Stage 1/2). Used uniformly across the
  // three badge variants — the differentiation now lives in the footer
  // text, not the color. "create" stays slightly dim because nothing
  // actually exists yet; clicking will trigger a fresh LLM call that
  // would then earn the blue ProviderBadge below.
  const dotTone = badge === "create" ? "bg-red-500/40" : "bg-red-500";
  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap gap-2">
        {options.map((o, idx) => {
          const isLlm = o.kind === "llm-call";
          return (
            <button
              key={`${o.kind}-${idx}`}
              // Explicit type="button" so this button never gets pulled into
              // any sibling form's submit handler and accidentally fires the
              // LLM call on Enter / form submission. Constitution: cloud
              // calls only on explicit user click.
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAction(o);
              }}
              className={`h-9 px-3.5 rounded-full text-[12.5px] font-medium transition-colors ${
                isLlm
                  ? "border border-border text-ink-soft hover:text-ink hover:bg-surface-2"
                  : "bg-ink text-background hover:opacity-90"
              }`}
              title={isLlm ? "이 옵션은 클라우드 호출이 들어가" : "이 기기 안에서 처리"}
            >
              {o.label}
              {isLlm && (
                <span className="ml-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] opacity-70">
                  cloud
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
        <span className={`h-1.5 w-1.5 rounded-full ${dotTone}`} />
        {footer}
      </div>
    </div>
  );
}

function WelcomeState({
  continues,
  onPick,
}: {
  continues: ContinueCard[];
  onPick: (s: string) => void;
}) {
  // Cap at 2 — the home is intentionally minimal before chat begins.
  const items = continues.slice(0, 2);
  if (items.length === 0) return null;

  return (
    <div className="fade-in pt-4 sm:pt-10">
      <div className="grid sm:grid-cols-2 gap-2">
        {items.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c.prompt)}
            className="text-left px-4 py-3 sm:p-4 rounded-xl border border-border bg-card hover:border-strong hover:bg-surface transition-colors"
          >
            <p className="text-[13.5px] text-ink leading-snug">{c.label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
