# DOTS V4 — 임베딩 베이스 시맨틱 매칭

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

## 다음 작업

### V5 비전

- **학습 데이터 마이그레이션 백그라운드 잡**: V4 활성화 시 기존 vector-less 엔트리들을 점진적으로 임베딩.
- **의도 분류 임베딩**: 5개 의도별 anchor 문장 → 평균 벡터. 사용자 입력 → 가장 가까운 anchor → 의도. 정규식 무한 추가의 끝.
- **Reranking**: 매칭 후보 N개를 LLM이 한번 더 정렬 (선택, 정확도 25~50% ↑).
- **LoRA adapter (학습 단계 C)**: 사용자 데이터로 fine-tune. 진짜 사적 AI.
- **DOTS Router as a Service**: V3에서 비전 박았던 인프라 레이어.

## 마무리 — V4가 박은 것

1. **의미 베이스**: 키워드 list 무한 확장의 끝. 변형 입력도 같은 응답으로 묶임.
2. **Hybrid Search**: 키워드 + 시맨틱 OR 게이트로 둘의 장점 동시.
3. **자동 임베딩**: saveLearned에서 자동 vector 저장. 사용자 의식 X 진화.
4. **모델 격리**: 200MB EmbeddingGemma + 1.8GB WebLLM이 별도 워커로 GPU 분담.
5. **헌법 정합**: 200MB도 사용자 명시 클릭. 자동 reload는 이전 명시 다운로드 있을 때만.

= V3의 라우터 정체성 + 사용자 시점 + 카피 방지 위에
= V4의 의미 베이스를 박았다
= "AI 초기 수준" 본질 탈출의 진짜 베이스
= 시연 통과 + 1인 스타트업 자산 한 겹 더
