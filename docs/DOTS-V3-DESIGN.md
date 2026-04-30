# DOTS V3 — 라우터 정체성 + 카피 방지 프레임

> **[2026-04-30 추가] V4로 진화함.** 의미 베이스 임베딩 매칭이 박혔다. 이 노트는 V2 → V3 진화 시점의 기록으로 보존. 현재 시맨틱/Hybrid Search 메커니즘은 [DOTS-V4-DESIGN.md](./DOTS-V4-DESIGN.md) 참조. V3의 5 헌법(라우터 정체성/의도 분류/사용자 시점/학습 진화/색상 시각화)은 V4에서도 그대로 살아 있다 — V4는 그 위에 의미 매칭 한 축을 더 박은 것.

## 배경

2026-04-29 ~ 04-30, 2일에 걸쳐 33+ commit. WebLLM 통합부터 학습 루프 단계 B 큐레이션까지.

진화 라인:

- **V1** (매칭 시스템): 키워드 트리거 → 팩 콘텐츠 노출. 비용 0 강제. 새 패턴마다 키워드 추가 = 무한 반복.
- **V2** (학습 진화 헌법): 자연스러움 우선 + 자동 학습 + 점진적 온디바이스 진화. 정적 헌법 → 동적 헌법.
- **V3** (라우터 정체성): DOTS = AI 라우터. 의도 분류 + 사용자 시점 + 큐레이션. 카피 방지 프레임 정립.

V3는 V2 헌법을 폐기하지 않는다. V2의 4 원칙(자연스러움/자동 학습/점진적 진화/동적 헌법)은 그대로. V3는 그 위에 **정체성** 레이어를 박았다 — DOTS가 무엇인지에 대한 답.

## V3 헌법 (V2 진화)

### 1. 라우터 정체성 (DOTS Core)

DOTS = 매칭 시스템 X
DOTS = 콘텐츠 시스템 X
DOTS = **AI 라우터**

```
사용자 입력 → DOTS 라우터 → 어디로 보낼지 결정:
  ├─ 팩 (로컬 매칭, 0ms, 비용 0)
  ├─ 학습 데이터 (캐시, 0ms, 비용 0)
  ├─ WebLLM (내 기기, 100~500ms, 비용 0)
  └─ Gemini (클라우드, 1~3초, 비용 있음)
```

= 빠른 라우팅 = 진짜 차별점
= 콘텐츠는 누구나 만들지만 라우팅 로직은 1인 스타트업의 자산

### 2. 의도 분류 (Tier 2)

V3 라우터의 핵심 진화. 5개 의도 분류:

- `definition` — "X가 뭐야?", "설명해줘", "처음 들어"
- `search` — "X 만들기", "레시피", "방법"
- `recommend` — "추천", "뭐 먹지", "고민"
- `follow-up` — "더 자세히", "그래서?", "또?"
- `casual` — "안녕", "고마워"
- `unknown` — 위에 안 맞으면 (기존 라우팅으로 흘림)

분류 방식 (`src/lib/packs/intent.ts`):

- WebLLM 짧은 호출 (50~100ms 목표) — 가능 시
- 정규식 fallback — WebLLM 미사용 / 분류 실패 시
- in-memory 캐시 + inflight coalescing — 같은 입력 중복 호출 차단

= 키워드 매칭 X (V2 한계 해결)
= 본질적 의도 인지

분류 결과로 라우팅 게이트:

- `definition` / `casual` / `follow-up` → matchPackContent skip → LLM
- `search` / `recommend` / `unknown` → matchPackContent 시도

### 3. 사용자 시점 우선

어제까지 (개발자 시점):

- WebLLM 우선 (사적 영역 보호 강제)
- Qwen 3B 환각 응답을 사용자에게 강요 ("양자역학 2줄", "찜부추국수")
- 헌법 "사용자 명시 X 자동 작동" 룰에 어긋남

지금 (사용자 시점, commit `7e5bf73`):

- **Gemini 기본** (정확함, 자연스러움)
- **WebLLM 모드** = 사적 영역 의식 사용자 옵션 (trade-off 명시)
- "WebLLM 우선" 어중간한 옵션 폐기 + localStorage 마이그레이션

= 사용자 신뢰 베이스
= 부정확한 응답을 의식 없이 받지 않게

### 4. 학습 진화 (시간 진화)

시간 축:

- T=0: LLM 비중 높음 (Gemini)
- T=N: 학습 데이터 ↑ → 로컬 매칭 비중 ↑
- T=∞: LoRA adapter (베타) → 진짜 사적 AI

학습 루프 진척:

- **단계 A** (commit `cd3ee01`): LLM 응답 자동 저장 + exact-match 매칭
- **단계 B** (commit `2724b2a`): 사용자 큐레이션 — "좋아 / 다른 거" → priority 기반 매칭. bad는 매칭에서 제외, good은 정렬 우선.
- **단계 C** (베타): LoRA adapter

큐레이션의 의미:

- 좋은 응답만 학습 데이터에 남음
- 잘못된 응답 priority ↓ → 매칭 skip → 다음 같은 입력은 새 LLM 호출
- = 시간 지날수록 학습 매칭 정확도 ↑

### 5. 색상 = 비용 시각화 (헌법 자연 시각화)

- 빨간점 = 로컬 매칭 (학습 결과 포함)
- 초록점 = WebLLM (사적 영역, 외부 호출 0)
- 파란점 = Gemini (외부 API)

= 시간 지날수록 빨간점 ↑, 파란점 ↓
= 사용자가 자기 AI가 자기를 알아가는 걸 눈으로 본다
= 헌법(점진적 온디바이스 진화)이 코드 주석이 아니라 UI에서 작동

## 카피 방지 프레임 (Tei 짚은 4가지 시점)

V3 가장 중요한 부분. 빅테크가 카피해도 — Tei가 만든 프레임 안에서 움직이게 하는 메커니즘.

### 1. 팩 = 행동 패턴 (콘텐츠 X)

```
Cooking Pack ≠ 레시피 DB
Cooking Pack = 배고픔 감지 → 후보 제시 → 선택 → 로컬 처리 → 반복 학습 → 패턴 저장
```

카피하려면:

- 의도 감지 (V3 라우터)
- 라우팅 로직 (Tier 1/2/3)
- 학습 루프 (단계 A + B)
- 색상 시각화

…모두 재현 필요.

콘텐츠 카피 = 쉬움. 행동 패턴 카피 = 진짜 어려움.

### 2. 라우팅 블랙박스

**공개 (티저, 데모)**:

- Local / Pack / Cloud / Store 흐름
- 색상 3단계 시각화
- 의도 분류 5개

**비공개**:

- 라우팅 기준 (Stage 1/2/2.5 임계값)
- 점수 알고리즘 (`SPECIFIC_HIT_SCORE = 60`, `DOMAIN_HIT_SCORE = 30`, `MATCH_THRESHOLD = 30`)
- 학습 매칭 키 정규화 방식
- 도메인 감지 키워드 list (`STUDY_DOMAIN`, `COOKING_DOMAIN`)
- 의도 분류 시스템 프롬프트
- intent fallback 정규식 패턴 우선순위

### 3. 학습 흔적 시연 (카피 방지 무기)

시연 장면:

```
1회차: "양자역학" → Cloud (파란점, Gemini, 풍부한 응답, 1~3초)
2회차: "양자역학" → Local (빨간점 "학습됨", 즉시, 비용 0)
3회차: "다른 거" 클릭 → priority -1 → Cloud 새 응답
4회차: "좋아" 클릭 → priority +1 → 다음 매칭 우선
```

= 겉으로 따라하기 쉬워 보임
= 실제로는: 저장(localStorage 마이그레이션 포함) + 라우팅(Stage 2.5) + 매칭(priority 정렬) + 색상(ProviderBadge) + 큐레이션(rateLearned + useLearnedRating 구독)
= 카피 시도 → 빌드 비용 ↑

### 4. 팩스토어 = 비용 절감 엔진

> "Packs are not content. Packs are local cost-reduction patterns."
> "팩은 콘텐츠가 아니라, 로컬 비용 절감 패턴이다."

= App Store 모델 X
= 비용 절감 마켓플레이스
= 빅테크 광고 모델과 충돌 — 사용자 데이터를 자산으로 쓰는 쪽 vs 사용자 비용을 줄이는 쪽

## 카피 방지 메시지 (한 줄 요약)

> 카피하려는 순간에도 DOTS가 만든 프레임 안에서 움직이게 만들어야 한다.

= 빅테크가 카피해도 — 사용자 시점, 학습 진화, 색상 시각화, 라우터 정체성을 모두 가져와야 의미가 생긴다
= 이 4개 중 하나라도 빠지면 "그냥 또 하나의 클라우드 챗봇"
= 1인 스타트업이 빅테크와 차이를 유지하는 진짜 메커니즘

## V3 시스템 (3-tier 라우터)

### Tier 1: 명시적 매칭 (구체적 키워드)

`src/lib/packs/match.ts` — `matchPackContent`

- "김치찌개" / "양자역학" / "수학 문제"
- = 단어 자체가 답을 가리킴
- = 로컬 매칭 (비용 0, 빨간점)
- 점수 시스템: specific(60) + domain(30) + generic(5), threshold 30

게이트: 의도 분류 결과가 `definition` / `casual` / `follow-up`이면 skip.

### Tier 2: 의도 분류 (NEW V3)

`src/lib/packs/intent.ts` — `classifyIntent`

- WebLLM 짧은 호출 또는 정규식
- 5개 의도 + unknown
- 분류 결과 → 적절한 라우팅

게이트: 모든 입력이 거치는 첫 단계. send()의 첫 await.

### Tier 2.5: 학습 캐시

`src/lib/learning/match.ts` — `matchLearnedResponse`

- exact-match (lower + trim) on userInput
- priority < 0 (사용자가 "다른 거") → 매칭 제외
- 같은 입력 여러 응답 → priority desc + createdAt desc 정렬

게이트: `follow-up` 의도이면 skip (다른 거 요청 시 캐시 재생 X).

### Tier 3: LLM 호출 (필요 시)

`src/lib/ai/dispatch.ts` — `dispatchLLMCall`

- **Gemini 기본** (정확함)
- **WebLLM 옵션** (사적 영역, `webllm-only` 모드)
- 응답 자동 저장 (단계 A) → 다음 같은 입력은 학습 캐시로 흘러감

## 빅테크와 차이

| 축               | 빅테크 GPT            | DOTS V3                   |
| ---------------- | --------------------- | ------------------------- |
| 데이터 흐름      | 사용자 → 클라우드     | 사용자 → 로컬             |
| 응답 종류        | 평균 응답 (모두 동일) | 그 사용자 전용 (학습됨)   |
| 사적 영역        | X                     | ✓                         |
| 시간에 따른 비용 | ↑ (사용자 늘수록)     | ↓ (학습 캐시 늘수록)      |
| 응답 정확도      | 평균치                | 사용자 별 진화            |
| 사용자 데이터    | 자산 (광고)           | 자산 (사용자의)           |
| 정체성           | 챗봇                  | AI 라우터 (인프라 레이어) |

## 다음 작업

### V4 비전

- **학습 루프 단계 C**: LoRA adapter — 사용자 데이터로 작은 모델 fine-tune. 진짜 사적 AI.
- **WebLLM Tier 2 진짜 호출**: 의도 분류 외에 일반 응답에도 우선 시도하는 모드 (현재 webllm-only 옵션의 확장).
- **모바일 대응**: Tailwind sm/md breakpoint 작업.
- **음성 입력/출력**: Web Speech API 통합 (이미 wake에서 출력은 작동 중).
- **i18n**: 다국어 (현재 한국어 전용).
- **콘텐츠 확장**: Wine, Morning, Cooking 30+ 레시피.

### V5 비전 (인프라 레이어)

- **DOTS Router as a Service**: 다른 앱들이 DOTS 라우팅 사용.
- = AI 인프라 레이어 정체성.
- = 챗봇 X, 라우터 ✓.

## 33 commit 누적 (4/29 ~ 4/30)

오늘 시점에서 핵심 마일스톤만:

| commit    | 내용                                                                   |
| --------- | ---------------------------------------------------------------------- |
| `43ca2e0` | 팩 시스템 본격 작동 — 시스템 프롬프트 자동 주입                        |
| `d421e58` | SAT 수학 팩 — 온디바이스 답안 검증 + LLM 폴백                          |
| `f3ba895` | 온디바이스 우선 매칭 — 콘텐츠 있으면 LLM 호출 전에 옵션 제시           |
| `52ecb1c` | 매칭 정확도 + 팩스토어 검색 통합 (3단계 흐름)                          |
| `81e3e64` | 자동 LLM 호출 차단 — 매칭 hit 시 즉시 종료 (헌법 강화)                 |
| `28d5966` | voice + tone 메타데이터 — 페르소나를 UI 표면으로                       |
| `ee1e63f` | WebLLM 1단계 — 라이브러리 설치 + WebGPU 호환성                         |
| `221388e` | WebLLM 2단계 — 엔진 초기화 + Web Worker                                |
| `7e3a9d2` | WebLLM 3단계 — Stage 3 LLM 호출에 WebLLM 우선 (당시) + Gemini fallback |
| `14bc596` | WebLLM 4단계 — 설정 화면 + 다운로드 UI                                 |
| `78e4bed` | WebLLM 5단계 — 토큰 스트리밍 UI                                        |
| `9a28473` | 활성화 제거 + 자동 voice/tone + 색상 구분                              |
| `f19e1ee` | WebLLM 자동 재로드 — 캐시 있으면 ready                                 |
| `5d34a2e` | 색상 3단계 + WebLLM 시스템 프롬프트 강화                               |
| `f477ec4` | V2 디자인 노트 (이전 진화)                                             |
| `a157d8c` | 매칭 점수 임계값 + 자연스러운 LLM 폴백                                 |
| `0385d39` | inferDomainPack soft 모드 + recommendation 디시플린                    |
| `cd3ee01` | **학습 루프 단계 A** — LLM 응답 자동 저장 + 매칭                       |
| `fbcfe8f` | thread.lastPackId 누수 + 무관 입력 시 Cooking 강제 노출 제거           |
| `af7e6bc` | 도메인 점수 + Study 키워드 보강 (회귀 진단 BUG #1, #2)                 |
| `26f4916` | 정의 요청 의도 분리 — 매칭 skip + LLM 호출 (V2 라우터 진화)            |
| `1f71dd6` | **V3 라우터 Tier 2** — WebLLM 의도 분류 (5개)                          |
| `2b34898` | lastPackId 누수 재발 차단 — setThreadPack 호출 trace                   |
| `7e5bf73` | **LLMProvider 사용자 시점** — Gemini 기본 + 환각 감소                  |
| `2724b2a` | **학습 루프 단계 B** — good/bad 사용자 큐레이션 + priority             |

(그 외 광고 차단기 우회 리네임, 음성 알람, 팩 시스템 정정 등 33 → 35 commit)

## 마무리 — V3가 박은 것

1. **정체성**: DOTS = AI 라우터.
2. **의도 분류**: 키워드 list 무한 추가의 끝.
3. **사용자 시점**: Gemini 기본. 신뢰 베이스.
4. **큐레이션**: 시간 진화의 사용자 참여 베이스.
5. **카피 방지 프레임**: 빅테크가 카피해도 Tei의 프레임으로 들어옴.

= V2의 자연스러움 + 학습 헌법 위에
= V3의 정체성 + 사용자 시점 + 카피 방지를 박았다
= 1인 스타트업이 빅테크 막는 진짜 메커니즘 베이스
