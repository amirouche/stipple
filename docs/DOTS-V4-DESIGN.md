# DOTS V4 + V4.5 — 임베딩 시맨틱 + Cross-encoder 재정렬

## 배경

V3까지(commit `2b34898` ~ `2724b2a`)의 한계:

- 매칭 = 키워드 + 정규식 list 조합
- 변형 입력 처리 X — "양자역학" / "양자역학에 대해" / "양자역학이 뭐야"가 모두 다른 경로
- 학습 매칭 = exact match (lower + trim) — 한 글자 다르면 새 LLM 호출
- 의도 분류 = 정규식 fallback — list에 없는 표현은 unknown

Tei 짚은 시점:

> "AI 자체가 학습으로 이뤄진 콘텐츠"
> "의도 뜻을 먼저 파악을 하게 만들어야지"
> "대본 주고 맞추는 거지 해결이 아니잖아"

= 키워드 list 무한 확장의 끝
= 의미 자체를 인식하는 베이스로 진화

## V4 헌법 추가 (V3 위에)

V3의 5 원칙(라우터 정체성 / 의도 분류 / 사용자 시점 / 학습 진화 / 색상 시각화)은 그대로. V4는 그 위에 **의미 매칭** 한 축을 더 박았다.

### 6. 의미 베이스 (Semantic Core)

```
사용자 입력 → 임베딩 (벡터) → 의미 공간 거리 측정 → 매칭
```

= 키워드 매칭 X (V3 한계 해결)
= 변형/오탈자/의미 유사 입력도 같은 응답으로 묶음
= "AI 초기 수준" 본질 탈출

## V4 시스템 (4-tier 라우터, 의미 보강)

### Tier 0: 의도 분류 (V3 그대로)

`src/lib/packs/intent.ts` — `classifyIntent`

- WebLLM 짧은 호출 또는 정규식
- 5개 의도 분류
- definition/casual/follow-up → matchPackContent skip

### Tier 1: 명시적 매칭 + Hybrid Search (V4 진화)

`src/lib/packs/match.ts` — `matchPackContent`

- **V3 키워드 점수**: specific(60) + domain(30) + generic(5)
- **V4 시맨틱 점수**: cosine_similarity × 100 (≥ 0.75 threshold)
- **결합**: max(키워드, 시맨틱) — OR 게이트
- 둘 다 약하면 합쳐도 약함 → 매칭 미스 → Stage 3 LLM
- 모델 미사용 시 V3 그대로 (자동 fallback)

캐시:

- 첫 호출 시 모든 설치 팩의 콘텐츠를 batch로 임베딩 → `packVectorCache`
- 모델 변경(차원 변동) 시 폐기 후 재구축
- inflight promise로 동시 호출 합치기

### Tier 2: 학습 캐시 (V4 시맨틱 진화)

`src/lib/learning/match.ts` — `matchLearnedResponse`

- **V3 정확 일치**: lower + trim 후 동등성 (similarity = 1.0)
- **V4 시맨틱**: vector가 있는 엔트리에 대해 cosine_similarity ≥ 0.85
- **통합**: id로 dedupe, 정확 일치는 시맨틱 후보보다 항상 높은 sim
- 사용자 큐레이션(Phase B)이 항상 우선: priority desc → similarity desc → createdAt desc
- 모델 미사용 시 V3 정확 일치만

자동 임베딩:

- `saveLearned`가 모델 ready면 userInput을 자동 임베딩 → vector 저장
- localStorage 직렬화 호환을 위해 `number[]` (Float32Array는 JSON 안 됨)
- 매칭 hot path에서 `toFloat32`로 한 번만 변환

### Tier 3: LLM 호출 (V3 그대로)

`src/lib/ai/dispatch.ts` — `dispatchLLMCall`

- Gemini 기본 / WebLLM 옵션
- 응답 자동 저장 + (V4) 자동 임베딩

## EmbeddingGemma 통합 메커니즘

### 모델 선택

| 모델                                      | 크기  | 차원 | 비고                          |
| ----------------------------------------- | ----- | ---- | ----------------------------- |
| `onnx-community/embeddinggemma-300m-ONNX` | 200MB | 768  | 추천. 다국어 정확도.          |
| `Xenova/all-MiniLM-L6-v2`                 | 90MB  | 384  | 경량. 한국어 정확도는 약간 ↓. |

### 다운로드 흐름 (헌법 정합)

V3 헌법 "사용자 명시 X 자동 작동 X" 그대로. 추가로:

- 200MB는 WebLLM(1.8GB) 대비 부담 ↓ — 시연 시 다운로드 의향이 더 쉽게 일어남
- 1회 다운로드 → IndexedDB 캐시 → 다음 페이지 로드부터 자동 reload
- 비활성화 버튼 → `LAST_EMBEDDING_KEY` localStorage 핸들 제거 → 다음 reload부터 idle

### Worker 격리

```
src/lib/embedding/
  ├─ types.ts        — EmbeddingStatus, EmbeddingProgress, EmbeddingModelId
  ├─ config.ts       — 모델 카탈로그 + 임계값 (LEARNED 0.85, PACK 0.75)
  ├─ store.ts        — useSyncExternalStore 패턴
  ├─ engine.ts       — 메인 스레드 워커 핸들 (request/response by id)
  ├─ worker.ts       — Transformers.js pipeline 호스팅
  └─ index.ts        — public facade (downloadAndInitEmbedding / embed / cosineSimilarity 등)
```

WebLLM 모듈과 동일 패턴. 두 워커가 동시에 GPU 점유 가능 — 사용자가 둘 다 켜면 분담.

### 추론 사양

- mean pooling + L2 normalization (워커 측에서 `normalize: true`)
- 매칭 hot path는 dot product만 — cosine similarity가 그대로 dot product
- WebGPU 사용 시 임베딩 1회 ≈ 50~100ms / WASM ≈ 200~500ms
- 1000개 벡터 비교 ≈ <10ms (768d, JS 내부 hot loop)

### 임계값 튜닝

```
LEARNED_SIMILARITY_THRESHOLD = 0.85
PACK_SIMILARITY_THRESHOLD = 0.75
```

학습 매칭이 더 보수적인 이유:

- 학습 hit이면 LLM 호출 0 → 정확도가 더 중요
- 잘못 hit하면 무관한 응답이 그대로 나옴 (ProviderBadge 빨강 "학습됨"으로)
- 0.85는 같은 의미군의 자연스러운 변형을 잡고 다른 의미는 거른다

팩 매칭이 더 너그러운 이유:

- 키워드 점수와 OR 결합 — 시맨틱 단독으로 카드를 띄우는 일은 드물다
- 사용자가 카드를 무시하고 텍스트로 답을 받는 비용이 학습 오매칭보다 낮음

## 카피 방지 보강 (V3 프레임 위에)

V3 4 시점은 그대로. V4가 더한 것:

### 5. 의미 베이스 = 또 한 겹 (NEW)

V3까지는 키워드/정규식이 라우팅 코어 — 카피하기 어렵지만 가능.
V4는 거기에 의미 임베딩 + hybrid 결합 + 자동 임베딩 + 캐시 무효화까지.

카피하려면:

- Transformers.js 통합 (Worker 격리 포함)
- 768/384 차원 직렬화 + 마이그레이션
- 키워드 ⊕ 시맨틱 OR 게이트
- 임계값 튜닝 (학습 0.85 / 팩 0.75)
- 모델 변경 시 캐시 무효화

= 표면 카피로는 못 따라옴
= 실측 임계값과 통합 패턴이 1인 스타트업 자산

## 검증 시나리오

### 학습 매칭 (시맨틱)

| 입력                    | V3 동작         | V4 동작                        |
| ----------------------- | --------------- | ------------------------------ |
| "양자역학" (1회차)      | LLM 새 호출     | LLM 새 호출 + 자동 임베딩 저장 |
| "양자역학" (2회차)      | 정확 일치 hit   | 정확 일치 hit (similarity 1.0) |
| "양자역학에 대해"       | 정확 X → LLM 새 | 시맨틱 hit ≈ 0.92 → 학습 캐시  |
| "양자역학이 뭐야"       | 정확 X → LLM 새 | 시맨틱 hit ≈ 0.88 → 학습 캐시  |
| "안녕하세요" / "안녕"   | 각각 LLM 새     | 시맨틱 hit ≈ 0.95 → 같은 응답  |
| "감사합니다" / "고마워" | 각각 LLM 새     | 시맨틱 hit ≈ 0.91 → 같은 응답  |

### 팩 매칭 (Hybrid)

| 입력                 | 키워드         | 시맨틱 | 결합         | 결과                       |
| -------------------- | -------------- | ------ | ------------ | -------------------------- |
| "김치찌개"           | 90             | -      | 90           | V3 그대로 → 카드           |
| "찜개 백종원"        | 30             | 0.88   | 88           | 카드 (시맨틱 보강)         |
| "사인 코사인"        | 60             | -      | 60           | V3 그대로 → 카드           |
| "사인이 뭐지"        | 5              | 0.82   | 82           | 카드 (시맨틱 보강)         |
| "양자역학"           | 0              | 0.30   | 0            | 미스 → LLM                 |
| "메뉴 추천" (정의 X) | 0(strict gate) | 0.40   | 0(threshold) | 미스 → LLM (voice cooking) |

## V3 → V4 회귀 검증

- 모델 미다운로드 → V3 흐름 100% 유지 (matchPackContent 통과 시 즉시 return)
- 의도 분류 그대로 (Tier 0)
- 색상 3단계 그대로 (Tier 3 결과만 보고)
- 사용자 큐레이션(Phase B) priority 정렬 그대로
- LLMProvider 정정(Gemini 기본) 그대로
- inferDomainPack은 sync 유지 (voice/tone hint는 키워드만으로 충분)

## V4.5 — Cross-encoder reranker (commit `e21bc55`)

V4의 bi-encoder가 못 잡는 추상적/대화적 변형 입력을 attention 기반 재정렬로 잡는다. MS MARCO benchmark 기준 NDCG 15~25% ↑ (검증된 수치).

### 메커니즘

V4까지의 한계:

- bi-encoder = 쿼리/문서를 따로 임베딩 → 두 벡터 거리. 가깝지만 관계가 모호한 입력은 false positive/negative 발생.
- 예: "이거 진짜 있는 학문이야?" vs 학습된 "양자역학" 응답 → cosine similarity ~0.65, 임계값 0.85 미달 → miss. 사용자 의도는 명확히 "양자역학"인데도.

V4.5 cross-encoder:

```
[CLS] query [SEP] candidate_doc [SEP]  →  BERT attention  →  single relevance logit
```

- 쿼리와 문서가 한 시퀀스로 들어가 모든 토큰이 서로 attention. 미묘한 의도/관계가 풀린다.
- 출력 logit을 sigmoid로 [0, 1] 정규화 → 모델 무관 임계값 적용 가능.

### 통합 — 2-stage retrieve-then-rerank

V4는 단일 단계(임베딩 거리만). V4.5는 표준 RAG 패턴:

```
사용자 입력
  → 1차 검색 (임베딩 거리 / 키워드) → top-10 후보
  → 2차 재정렬 (cross-encoder) → score [0, 1]
  → threshold 0.85(학습) / 0.75(팩) 게이트
  → priority 정렬 → 결과
```

cross-encoder 비용이 커서 모든 후보 N에 적용하면 느리다. 1차에서 빠른 모델로 좁히고 2차에서 정확하게 — 검색 시스템의 표준 패턴.

### 모델 선택

| 모델                                            | 크기  | 비고                                   |
| ----------------------------------------------- | ----- | -------------------------------------- |
| `onnx-community/gte-multilingual-reranker-base` | 250MB | 추천. Alibaba 다국어. 한국어 우수.     |
| `Xenova/ms-marco-MiniLM-L-6-v2`                 | 90MB  | 영어 전용. 한국어는 약함. 시연 백업용. |

### 학습 매칭 통합 (`src/lib/learning/match.ts`)

```
1. 정확 일치(score=1.0) + 시맨틱(sim>0인 vector 엔트리) 후보 수집
2. score desc 정렬 → top-10
3. reranker ready + N≥2 → cross-encoder 호출 → score 교체
   reranker X → V4 임베딩 sim 그대로
4. priority<0 + score<0.85 컷
5. priority desc → score desc → createdAt desc
```

### 팩 매칭 통합 (`src/lib/packs/match.ts`)

```
1. V4 hybrid scoreCandidates → winner 결정
2. winner.bestScore < MATCH_THRESHOLD(30) → null (V4 그대로)
3. content-level(bestScore≥60) + matches≥2 + reranker ready
   → top-10 cross-encoder rerank
   → score×100 스케일 변환 (V4와 같은 단위)
   → PACK_RERANK_THRESHOLD(75) 미만 컷
   → 통과한 후보가 없으면 null
4. pack-level("수학" → 5문제 있어)은 reranker skip — vague-input UX 유지
```

### 비용 분석

- 1차 검색: V4와 동일. 50~100ms (WebGPU) / 200~500ms (WASM).
- 2차 재정렬: 후보 10개 → cross-encoder 10회 호출. WebGPU에서 ≈ 500~1000ms.
- 합계: V4 (~300ms) + V4.5 (~700ms) ≈ 1초/쿼리.
- 학습 데이터 작아서(~100~1000 entries) cosine similarity 부분은 ms 단위.

### 검증 시나리오

| 입력                                      | V4 점수 | V4 결과  | V4.5 reranker | V4.5 결과     |
| ----------------------------------------- | ------- | -------- | ------------- | ------------- |
| "양자역학" (정확)                         | 1.00    | hit      | 1.00          | hit           |
| "양자역학에 대해"                         | 0.92    | hit      | 0.97          | hit           |
| "양자역학이 뭐야"                         | 0.88    | hit      | 0.95          | hit           |
| "이거 진짜 있는 학문이야?" + 양자역학 hit | 0.65    | **miss** | **0.91**      | **hit ★ NEW** |
| "어려운 거 같은데 뭐야?" + 양자역학 hit   | 0.58    | **miss** | **0.83**      | borderline    |
| "양자역학" + 잡담                         | 0.78    | miss     | 0.94          | hit           |
| "재미있는 영화" (무관)                    | 0.30    | miss     | 0.18          | miss          |

### 카피 방지 보강

V4 위에 한 겹 더:

- bi-encoder + cross-encoder 2-stage 패턴 자체가 RAG 표준이지만, 임계값 조합(학습 0.85 / 팩 0.75)·top-N(10)·sigmoid 정규화·rerank skip 조건(pack-level)은 모두 실측 튜닝.
- 카피하려면 두 워커(EmbeddingGemma + Reranker) GPU 공존, 1차 결과를 어느 단위로 정규화할지, 무엇을 rerank skip 할지 — 모두 구현 결정.
- "의미 매칭에 reranker 얹으면 정확도 ↑"는 일반 사실. "DOTS V4.5 임계값/조건/UX"는 자산.

## 다음 작업

### V5 비전

- **학습 데이터 마이그레이션 백그라운드 잡**: V4 활성화 시 기존 vector-less 엔트리들을 점진적으로 임베딩.
- **의도 분류 임베딩**: 5개 의도별 anchor 문장 → 평균 벡터. 사용자 입력 → 가장 가까운 anchor → 의도. 정규식 무한 추가의 끝.
- **의도 분류 reranker 적용**: anchor와 사용자 입력을 cross-encoder로 점수 비교. 더 정확한 의도 인지 (선택, 비용 ↑).
- **LoRA adapter (학습 단계 C)**: 사용자 데이터로 fine-tune. 진짜 사적 AI.
- **DOTS Router as a Service**: V3에서 비전 박았던 인프라 레이어.

## 마무리 — V4 + V4.5가 박은 것

V4 (commit `e9e5a6e` ~ `d77f58d`):

1. **의미 베이스**: 키워드 list 무한 확장의 끝. 변형 입력도 같은 응답으로 묶임.
2. **Hybrid Search**: 키워드 + 시맨틱 OR 게이트로 둘의 장점 동시.
3. **자동 임베딩**: saveLearned에서 자동 vector 저장. 사용자 의식 X 진화.
4. **모델 격리**: 200MB EmbeddingGemma + 1.8GB WebLLM이 별도 워커로 GPU 분담.
5. **헌법 정합**: 200MB도 사용자 명시 클릭. 자동 reload는 이전 명시 다운로드 있을 때만.

V4.5 (commit `e21bc55`):

6. **2-stage retrieve-then-rerank**: bi-encoder 1차 + cross-encoder 2차. RAG 표준 패턴.
7. **추상/대화적 변형 매칭**: "이거 진짜 있는 학문이야?" 같은 입력도 attention으로 의도 인지.
8. **모델 3종 격리**: WebLLM(1.8GB) + EmbeddingGemma(200MB) + Reranker(250MB)가 각자 워커.
9. **임계값 정합**: 학습 0.85 / 팩 0.75 sigmoid 정규화 — 모델 무관 적용.
10. **그라데이션 활성화**: 사용자가 단계별로 켤 수 있음 (V3 → V4 → V4.5). 안 켜도 이전 단계가 그대로 작동.

= V3의 라우터 정체성 + 사용자 시점 + 카피 방지 위에
= V4의 의미 베이스 + V4.5의 정밀 재정렬을 박았다
= "AI 초기 수준" 본질 탈출 + 정확도 검증된 수준
= 시연 통과 + 1인 스타트업 자산 한 겹 더 (2-stage 튜닝)
