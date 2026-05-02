import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Shell, useShell } from "@/components/Shell";
import { ProcessingTrace } from "@/components/ProcessingTrace";
import { RecipeCard } from "@/components/RecipeCard";
import { PitchCard } from "@/components/PitchCard";
import { SummaryMarker } from "@/components/SummaryMarker";
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
  setThreadLastEntry,
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
  findSpecificPackTarget,
} from "@/lib/packs/match";
import {
  classifyActionNegation,
  classifyIntent,
  classifyNegationOrTrend,
  classifyRejection,
  classifySummaryIntent,
} from "@/lib/packs/intent";
import { topicParticle } from "@/lib/text/clean-noun";
import { buildStoreSuggestion, searchStoreForQuery } from "@/lib/packs/store-search";
import {
  buildTopicSummary,
  extractTopic,
  incrementUsedCount,
  matchLearnedResponse,
  matchLearnedTopicGroup,
  rateLearned,
  saveLearned,
  useLearnedRating,
} from "@/lib/learning";
import { addUserSATProblem, getUserSATProblems } from "@/lib/packs/study/user-store";
import { buildSATMathDummy, buildSATMathFromLLM } from "@/lib/packs/study/parse-llm";
import { addDemoTrace } from "@/lib/demo/trace";
import { useMemoryStore } from "@/lib/memory";
import type { ConversationSummary } from "@/lib/memory";
// V5.0 lite Phase I-4: 도메인 인지 layer. matchPackContent 호출 전에
// 사용자 입력의 도메인 점수와 pack의 excluded_domains 비교해 누수 차단.
import { matchDomain, computeDomainExclusions, type DomainMatch } from "@/lib/domain";
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

// V5.0 lite Phase I-4: trace.reason 에 박을 도메인 점수 요약. score > 0 인
// 도메인을 "음식(1)+맛집(2)" 형식으로 묶음. score 0 이거나 dom 미박힘 시 빈
// string — 기존 reason 텍스트에 영향 없게.
function domainSummary(dom: DomainMatch): string {
  if (dom.scores.length === 0) return "";
  return dom.scores.map((s) => `${s.domain}(${s.score})`).join("+");
}

// V5.0 Phase M-1: ConversationSummary.sourceMessagesCount 는 DispatchTurn
// 기준 (compose의 threadHistory 변환 후 카운트). UI는 ThreadMsg 인덱스가
// 필요. dispatch에 들어간 첫 N 메시지의 마지막에 해당하는 ThreadMsg id를
// 찾아 마커 박을 위치 결정.
function findMarkerMessageId(messages: ThreadMsg[], dispatchTurnCount: number): string | undefined {
  let count = 0;
  for (const m of messages) {
    const eligible = m.role === "user" || (!m.pending && !!m.text);
    if (eligible) count++;
    if (count === dispatchTurnCount) return m.id;
  }
  return undefined;
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

  // V5.0 Phase M-1: 활성 thread에 summary가 있으면 그 시점에 시각 마커 박음.
  // sourceMessagesCount는 DispatchTurn 기준 (user || (!pending && text))
  // 카운트라 ThreadMsg 인덱스로 변환 필요.
  const memSnap = useMemoryStore();
  const activeSummary: ConversationSummary | undefined = thread
    ? memSnap.summaries.find((s) => s.threadId === thread.id)
    : undefined;
  const summaryMarkerAfterId = activeSummary
    ? findMarkerMessageId(messages, activeSummary.sourceMessagesCount)
    : undefined;

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

    // 안정성 정정 (2026-04-30): 회귀 진단용 timing 래퍼(t())는 제거.
    // 남기는 진단 로그는 세 줄 — [send] 입력+의도, [setThreadPack]
    // 매칭 hit 시점, [llm-call]은 dispatch.ts에서 직접. 실 사용자
    // 시연에서 콘솔이 너무 시끄러우면 안 된다.
    //
    // V0 데모 측정 (2026-04-30): startTime은 사용자 입력 받은 시점부터
    // 라우팅이 끝날 때까지의 wall-clock latency를 재기 위함. 각 stage가
    // 자기 시점에서 trace를 박는다 — pack/learned는 매칭 끝나는 즉시,
    // cloud는 composeAnswer.then 안에서.
    const startTime = Date.now();
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
        lastEntry: thread.lastPackEntry?.entryName,
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

    // V5.0 Phase B2: 직전 응답이 partial/fuzzy 매칭이고 사용자가 거부 신호
    // ("없는데"·"무슨소리"·"엉뚱"·…)를 보냈으면 같은 entry 재노출 차단.
    // 즉시 정직 응답 + cloud 옵션으로 escalate. lastPackEntry는 클리어해
    // 다음 turn에서 일반 라우팅으로 복귀.
    const priorEntry = thread.lastPackEntry;
    if (priorEntry && classifyRejection(text)) {
      const userId = crypto.randomUUID();
      const asstId = crypto.randomUUID();
      const requestedLabel = priorEntry.requestedNoun ?? priorEntry.entryName;
      // V5.0 Phase B3c: 받침 인지 조사 — "김치복음밥는" / "김치복음밥은" 자동 선택.
      const honestText = `맞아, ${requestedLabel}${topicParticle(requestedLabel)} ${priorEntry.packName}에 정확히 없어. cloud로 찾아볼까?`;
      appendMessage(thread.id, { id: userId, role: "user", text });
      renameThreadIfDefault(thread.id, text);
      appendMessage(thread.id, {
        id: asstId,
        role: "assistant",
        route: "local",
        state: "found_local",
        reason: "",
        packName: priorEntry.packName,
        pending: false,
        text: honestText,
        suggestion: {
          matchedPackName: priorEntry.packName,
          matchedPackId: priorEntry.packId,
          options: [
            {
              kind: "llm-call",
              label: "cloud로 찾기",
              prompt: priorEntry.requestedNoun
                ? `${priorEntry.requestedNoun}에 대해 알려줘. 한국어로 짧고 정확하게.`
                : `${priorEntry.entryName}와 비슷한 다른 걸 알려줘.`,
            },
          ],
          badge: "local",
        },
      });
      setThreadLastEntry(thread.id, undefined);
      addDemoTrace({
        input: text,
        intent,
        route: "local",
        externalCall: false,
        provider: "none",
        packId: priorEntry.packId,
        packName: priorEntry.packName,
        latencyMs: Date.now() - startTime,
        reason: "skip: user_rejected_prior_match",
      });
      setBusy(false);
      scrollDown();
      return;
    }
    // V5.0 Phase B2: rejection 분기에 안 들어왔다 = 사용자가 다른 turn으로
    // 넘어감. 이전 lastPackEntry는 더 이상 유효 X. Stage 1 hit 시 다시 set.
    if (thread.lastPackEntry) {
      setThreadLastEntry(thread.id, undefined);
    }

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

    // V3.5 게이트 (2026-05-01): demo-stable 우선 정정. matchPackContent
    // 시그니처는 그대로 두고 send() 측 게이트를 보강.
    //
    // 우선순위:
    //   1) negation/trend 토큰 ("말고"/"인기"/...) → 무조건 skip (override all)
    //   2) specific pack target (입력이 installed 팩 trigger에 hit) → 게이트
    //      통과. definition/follow-up/casual을 override (예: "김치찌개는 뭐야"는
    //      definition이지만 김치찌개 트리거 → pack 허용).
    //   3) 1·2 모두 X면 기존 V3 의도 게이트 적용.
    //
    // 결과적으로 "라면 인기있는게 뭐야" / "레시피말고 라면 알아봐"는 negation
    // /trend로 1번에서 skip → cloud. "김치찌개는 뭐야"는 2번에서 통과 → pack.
    // "뭐야" 단독은 specific 없이 definition → skip → cloud.
    const isFollowUpIntent = intent === "follow-up";

    // V5.0 Phase I-4: 도메인 인지 — Tei 누수 케이스 ("짜장면 ... 맛집 ... 배달",
    // "Cooking Essentials에 운동 루틴") 차단. computeDomainExclusions 가 두
    // 룰 (excluded hit + top-domain owner mismatch) 모두 적용한 excludedIds
    // 반환. 매처 본체 (matchPackContent body) 흐름은 그대로, 입력 installed
    // 리스트만 좁힘.
    const dom = matchDomain(text);
    const domainExcludedIds = computeDomainExclusions(dom, installed);
    const eligibleInstalled = installed.filter((p) => !domainExcludedIds.includes(p.id));
    const domSummary = domainSummary(dom);

    const negTrend = classifyNegationOrTrend(text); // "negation" | "trend" | null
    const specificTarget = findSpecificPackTarget(text, eligibleInstalled);

    let skipReason: string | null = null;
    if (negTrend) {
      skipReason = negTrend;
    } else if (!specificTarget) {
      if (intent === "casual") skipReason = "casual";
      else if (intent === "definition") skipReason = "definition";
      else if (isFollowUpIntent) skipReason = "follow-up";
      else if (hasDefinitionIntent(text)) skipReason = "definition";
      else if (justSawSuggestion && hasFollowUpIntent(text)) skipReason = "follow-up";
    }
    // V5.0 Phase I-4: 모든 installed pack이 도메인-excluded 이면 매처 본체
    // 자체를 skip. 이 분기가 Tei "짜장면 ... 맛집 ... 배달" 누수 차단의 핵심.
    if (!skipReason && eligibleInstalled.length === 0 && domainExcludedIds.length > 0) {
      skipReason = `domain-excluded:${domainExcludedIds.join(",")}`;
    }
    const skipMatchStep = skipReason !== null;

    const matched = skipMatchStep
      ? null
      : await matchPackContent(text, eligibleInstalled, undefined, intent);
    // V5.0 Phase I-6: 사용자 발화의 negation-aware 행동 영역 인지. 매칭이 hit
    // 한 시점에 박음 — buildPackSuggestion 이 동일 영역 카드 drop. matchPackContent
    // 본체 흐름 변경 X. excludedActions 빈 배열이면 builder 가 기존 옵션 그대로.
    const excludedActions = matched ? classifyActionNegation(text) : [];
    if (matched) {
      const userId = crypto.randomUUID();
      const asstId = crypto.randomUUID();
      const payload = buildPackSuggestion(matched, excludedActions);
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
      // V3 lastPackId 정책: 명시적 매칭 hit일 때만 lastPackId 갱신.
      // skipMatchStep 게이트가 definition/casual/follow-up을 이미 막았으므로
      // 여기 도달했다 = intent ∈ {search, recommend, unknown} + matchPackContent
      // hit. routeQuery의 loose trigger matching("뭐야" → study) 같은 추정으로
      // 박지 않는다.
      if (import.meta.env.DEV) {
        console.log("[setThreadPack]", {
          from: "stage1-match",
          packId: matched.pack.id,
          intent,
        });
      }
      setThreadPack(thread.id, matched.pack.id);
      // V5.0 lite Phase B trace.reason 형식 (confidence별):
      //   exact:       "pack: <id> / <name> [facet=<kind>] [match=exact]"
      //   exact-alias: "pack: <id> / <name> [facet=<kind>] [match=exact-alias, alias=<a>]"  (B3b)
      //   partial:     "pack: <id> / <name> [facet=<kind>] [match=partial]"
      //   fuzzy:       "pack: <id> / <name> [match=fuzzy, requested=<noun>]"
      const entryName = matched.topEntryName ?? "?";
      const facetTag = matched.facet ? `[facet=${matched.facet.kind}]` : "[facet=none]";
      const conf = matched.confidence ?? "fuzzy";
      // V5.0 Phase B3b: exact 분기에서 matchedAlias가 있으면 exact-alias로 분기.
      const matchTag =
        conf === "fuzzy"
          ? `[match=fuzzy, requested=${matched.requestedNoun ?? "(none)"}]`
          : conf === "exact" && matched.matchedAlias
            ? `[match=exact-alias, alias=${matched.matchedAlias}]`
            : `[match=${conf}]`;
      const baseReason =
        conf === "fuzzy"
          ? `pack: ${matched.pack.id} / ${entryName} ${matchTag}`
          : `pack: ${matched.pack.id} / ${entryName} ${facetTag} ${matchTag}`;
      // V5.0 Phase I-4: 도메인 요약을 trace 에 박음 (있을 때만).
      // V5.0 Phase I-6: excludedActions 박힘 → trace 에 명시 (사용자 인지 검증).
      const reasonText = [
        baseReason,
        domSummary ? `domain:${domSummary}` : null,
        excludedActions.length > 0 ? `negation:${excludedActions.join(",")}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      addDemoTrace({
        input: text,
        intent,
        route: "pack",
        externalCall: false,
        provider: "pack",
        packId: matched.pack.id,
        packName: matched.pack.name,
        latencyMs: Date.now() - startTime,
        reason: reasonText,
      });
      // V5.0 Phase B2: partial/fuzzy 시 lastPackEntry 저장 → 다음 turn의
      // rejection 검출에 사용. exact 또는 매칭 미스는 클리어.
      if (conf === "partial" || conf === "fuzzy") {
        setThreadLastEntry(thread.id, {
          packId: matched.pack.id,
          packName: matched.pack.name,
          entryName,
          confidence: conf,
          requestedNoun: matched.requestedNoun,
          setAt: Date.now(),
        });
      } else {
        setThreadLastEntry(thread.id, undefined);
      }
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
        addDemoTrace({
          input: text,
          intent,
          route: "store",
          externalCall: false,
          provider: "none",
          latencyMs: Date.now() - startTime,
          reason: "팩스토어 매칭 — 새 팩 제안",
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
    //
    // V4.1 종합 모드: "정리" / "전부" / "다 보여" 같은 메모 종합 의도가
    // 박혀 있고 같은 topic 그룹 entry 가 하나 이상 있으면, 가장 가까운
    // 1개 대신 그룹 전체를 메모 형태로 합쳐 노출. Pack 매처는 영향 X —
    // 메모리 layer 만의 행동.
    const skipLearnedStep = isFollowUpIntent || (justSawSuggestion && hasFollowUpIntent(text));
    if (!skipLearnedStep && classifySummaryIntent(text)) {
      const group = matchLearnedTopicGroup(text);
      const topic = extractTopic(text);
      if (group.length > 0 && topic) {
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
          packName: undefined,
          pending: false,
          text: buildTopicSummary(topic, group),
          provider: "learned",
          // 종합 모드는 단일 entry rating 대상 X — learnedId 미박힘.
        });
        // 종합 모드도 사용된 entry 의 usedCount 를 모두 bump — 시연 시
        // dotsLearning.list() 로 어느 entry가 자주 호출되는지 추적 가능.
        for (const e of group) void incrementUsedCount(e.id);
        addDemoTrace({
          input: text,
          intent,
          route: "learned",
          externalCall: false,
          provider: "learned",
          latencyMs: Date.now() - startTime,
          reason: `학습 캐시 종합 — topic=${topic}, ${group.length}개 합침`,
        });
        setBusy(false);
        scrollDown();
        return;
      }
    }
    if (!skipLearnedStep) {
      const learned = await matchLearnedResponse(text);
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
          // Phase B: 학습 hit이면 그 응답의 id를 그대로 핸들로 박는다 —
          // 사용자가 "다른 거" 누르면 이 id로 priority -1 → 다음 같은
          // 입력은 새 LLM 호출로 흘러간다.
          learnedId: learned.id,
        });
        void incrementUsedCount(learned.id);
        addDemoTrace({
          input: text,
          intent,
          route: "learned",
          externalCall: false,
          provider: "learned",
          packId: learned.packId,
          packName: learned.packName,
          latencyMs: Date.now() - startTime,
          reason: `학습 캐시 hit — 사용 ${learned.usedCount + 1}회 (priority ${learned.priority})`,
        });
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
      // V5.0 Phase I-5: Stage 3 cloud-direct 메시지 표시 — UI 라벨 강화
      // (ProviderBadge 가 "Cloud (Pack 외부)" 형태) + 검수 디버그 용.
      cloudMode: true,
    });

    // V3: Stage 3 진입 = matchPackContent miss = lastPackId 변경 X.
    // routeQuery의 trigger 기반 pack 추정은 너무 loose하다 — Study가
    // "뭐야"를 trigger로 가지고 있어서 모든 정의 질문이 study-companion
    // 누수를 일으켰던 회귀 (Tei 검증 2026-04-30). Stage 1에서 명시적
    // 매칭 hit일 때만 setThreadPack을 부른다. result.pack은 voice/tone용
    // composePack 계산에만 그대로 쓰인다.
    if (import.meta.env.DEV && result.pack) {
      console.log("[lastPackId-skip]", {
        from: "stage3-routeQuery",
        candidatePackId: result.pack.id,
        intent,
        reason: "match miss — routeQuery trigger 추정으로는 박지 않음",
      });
    }

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
        const learnedId = crypto.randomUUID();
        void saveLearned({
          id: learnedId,
          userInput: text,
          response: body,
          provider,
          packId: composePack?.id,
          packName: composePack?.name,
          voice: composePack?.voice,
          tone: composePack?.tone,
          createdAt: Date.now(),
          usedCount: 0,
          priority: 0,
        });
        // Phase B: 메시지 버블에 학습 id를 박아둬야 사용자가 "좋아"·
        // "다른 거"를 눌렀을 때 어느 엔트리를 평가할지 알 수 있다.
        patchMessage(thread.id, asstId, { learnedId });
      }
    };

    // Greeting short-circuit: V3 casual intent은 LLM(짧은 응답)으로 흘려야
    // 하므로 캔드 응답 분기를 건너뛴다. 분류기가 unknown으로 떨어졌어도
    // engine이 "안녕"을 greeting으로 잡으면 이전처럼 캔드 사용.
    if (result.state === "greeting" && intent !== "casual") {
      setTimeout(() => renderPayload(result.payload), 500);
      addDemoTrace({
        input: text,
        intent,
        route: "local",
        externalCall: false,
        provider: "none",
        packId: composePack?.id,
        packName: composePack?.name,
        latencyMs: Date.now() - startTime,
        reason: "캔드 인사 응답 (engine greeting)",
      });
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
      // V5.0 Phase M-1: thread id 전달 → 임계점 도달 시 summary 자동 생성/활용.
      // suggestion onClick 분기는 ad-hoc compose라 threadId 미박힘 (의도).
      threadId: thread.id,
      // V5.0 Phase I-5: Stage 3 cloud-direct = matchPackContent miss 후 cloud
      // 호출. composePack 이 박혀 있어도 (thread.lastPackId 으로 inferred)
      // pack identity 흉내 X — 일반 cloud 톤. Tei 발견 ("Cooking Essentials에는
      // ... 정보는 없어") 누수 차단.
      cloudMode: true,
    }).then(({ payload, provider, summaryUsed, summaryGenerated }) => {
      renderPayload(payload, provider);
      // Stage 3 trace는 composeAnswer 결과가 돌아온 시점에. provider가
      // 박혔으면 클라우드 호출 성공, 없으면 catch path (캔드 fallback)인데
      // 둘 다 외부 호출은 시도된 것이라 externalCall: true로 통일.
      // payload.kind가 pack-suggestion인 비정상 경로는 발생할 일이 없지만
      // route는 "cloud"로 둔다 — Stage 3 흐름임을 보존.
      //
      // V3.5 trace.reason 새 형식: skipReason이 박혔으면 "skip: <reason>"이
      // 곧 cloud로 떨어진 사유. 매처를 통과해 cloud까지 간 경우(매칭 미스)는
      // 기존 "클라우드 LLM (...)" 텍스트 유지.
      addDemoTrace({
        input: text,
        intent,
        route: "cloud",
        externalCall: true,
        provider: provider ?? "none",
        packId: composePack?.id,
        packName: composePack?.name,
        latencyMs: Date.now() - startTime,
        reason: [
          skipReason
            ? `skip: ${skipReason}`
            : provider
              ? `클라우드 LLM (${provider})`
              : "클라우드 LLM 실패 → 캔드 fallback",
          summaryGenerated
            ? "summary 생성됨 (별도 LLM 호출)"
            : summaryUsed
              ? "summary 활용됨"
              : null,
          // V5.0 Phase I-4: 도메인 점수 요약 — skip / cloud 어느 쪽이든
          // 박힘 (있을 때만). Tei 시각 검증용.
          domSummary ? `domain:${domSummary}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    });
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
      const clickStart = Date.now();
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
            addDemoTrace({
              input: option.label,
              intent: "follow-up",
              route: "cloud",
              externalCall: true,
              provider: res.provider,
              packName: matchedPack?.name,
              latencyMs: Date.now() - clickStart,
              reason: postAction
                ? `선택지 클릭 — 클라우드 LLM (postAction: ${postAction})`
                : "선택지 클릭 — 클라우드 LLM (custom systemPrompt)",
            });
          })
          .catch(onFail);
      } else {
        composeAnswer({
          query: option.prompt,
          pack: matchedPack,
          fallback: { kind: "text", text: "지금은 응답을 가져오지 못했어." },
          history: threadHistory(thread.messages),
          onToken: streamToken,
          // V5.0 Phase M-1: 일반 suggestion → thread context 유지 → summary 활성.
          // 위 분기 (option.systemPrompt — 예: SAT 출제) 는 ad-hoc 페르소나라
          // summary 비활성 (의도된 omit).
          threadId: thread.id,
        })
          .then(({ payload, provider, summaryUsed, summaryGenerated }) => {
            onDoneTextWithProvider(payload.kind === "text" ? payload.text : "", provider);
            addDemoTrace({
              input: option.label,
              intent: "follow-up",
              route: "cloud",
              externalCall: true,
              provider: provider ?? "none",
              packId: matchedPack?.id,
              packName: matchedPack?.name,
              latencyMs: Date.now() - clickStart,
              reason: [
                provider
                  ? `선택지 클릭 — 클라우드 LLM (${provider})`
                  : "선택지 클릭 — 클라우드 LLM 실패",
                summaryGenerated
                  ? "summary 생성됨 (별도 LLM 호출)"
                  : summaryUsed
                    ? "summary 활용됨"
                    : null,
              ]
                .filter(Boolean)
                .join(" · "),
            });
          })
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
        summaryMarkerAfterId={summaryMarkerAfterId}
        activeSummary={activeSummary}
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
  summaryMarkerAfterId,
  activeSummary,
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
  // V5.0 Phase M-1: summary 마커 위치 + summary 본체.
  summaryMarkerAfterId?: string;
  activeSummary?: ConversationSummary;
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

          {messages.map((m) => {
            const node =
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end fade-in">
                  <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-ink text-background text-[14px] leading-relaxed">
                    {m.text}
                  </div>
                </div>
              ) : (
                <AssistantBubble key={m.id} m={m} onSuggestionAction={onSuggestionAction} />
              );
            // V5.0 Phase M-1: summary 마커. summary가 cover한 마지막 메시지
            // 직후 박힘. dispatch가 그 이후부터 raw multi-turn 보냄.
            if (activeSummary && m.id === summaryMarkerAfterId) {
              return (
                <div key={`${m.id}-with-marker`} className="space-y-8">
                  {node}
                  <SummaryMarker summary={activeSummary} />
                </div>
              );
            }
            return node;
          })}
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
          {!m.pending && m.provider && (
            <ProviderBadge provider={m.provider} cloudMode={m.cloudMode} />
          )}
          {!m.pending && m.learnedId && <RatingControls learnedId={m.learnedId} />}
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

function RatingControls({ learnedId }: { learnedId: string }) {
  // Phase B 큐레이션. LLM 응답(웹llm/gemini) 또는 학습 hit(learned) 메시지
  // 아래 "좋아 / 다른 거" 텍스트 버튼을 띄운다. 사용자가 평가하면 store가
  // 갱신되고 같은 입력의 다음 매칭에 곧장 반영된다 — bad는 매칭에서 제외,
  // good은 priority 정렬 우선.
  const rating = useLearnedRating(learnedId);
  if (rating === "good" || rating === "bad") {
    return (
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
        ✓ {rating === "good" ? "좋아함" : "다른 거 표시됨"}
      </p>
    );
  }
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <button
        type="button"
        onClick={() => void rateLearned(learnedId, "good")}
        className="text-ink-soft hover:text-ink transition-colors"
      >
        좋아
      </button>
      <span className="text-ink-soft/40">·</span>
      <button
        type="button"
        onClick={() => void rateLearned(learnedId, "bad")}
        className="text-ink-soft hover:text-ink transition-colors"
      >
        다른 거
      </button>
    </div>
  );
}

function ProviderBadge({
  provider,
  cloudMode,
}: {
  provider: "webllm" | "gemini" | "learned";
  // V5.0 Phase I-5: Stage 3 cloud-direct 응답 (matchPackContent miss). 박혀
  // 있으면 gemini 라벨이 "Cloud (Pack 외부) · 외부 API" 형태로 강화 — pack
  // identity 응답 (suggestion onClick 등) 과 시각 분리.
  cloudMode?: boolean;
}) {
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
        ? cloudMode
          ? "Cloud (Pack 외부) · Gemini API"
          : "클라우드 (Gemini) · 외부 API"
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
