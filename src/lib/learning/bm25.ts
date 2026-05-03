// V5 sparse retrieval — BM25 키워드 매칭. dense (embedding) 매칭만 사용
// 시 cross-lingual / cold-start false positive 가 박힘 (Tei 진단:
// 영어 입력 "I want to learn quantum mechanics" → 한국어 음식 entry 매칭).
// BM25 는 토큰 overlap 자체가 0 이면 점수 0 — 언어 다른 입력은 자동 차단.
//
// 외부 라이브러리 X — corpus 가 작고 (수백 entry) 의존성 부풀림 회피. 표준
// BM25 공식 그대로:
//   score(d, q) = Σ_{t ∈ q} IDF(t) * tf(t, d) * (k1+1)
//                          ──────────────────────────────────
//                          tf(t, d) + k1 * (1 - b + b * |d|/avgdl)
//
// 토크나이저 — script-aware:
//   - Latin: word split (lowercase). "want" / "quantum" 같은 영어 단어 그대로.
//   - Korean: 문자 bigram. "양자역학" → ["양자", "자역", "역학"]. 형태소 분석기
//     의존 없이 부분 일치까지 잡음 ("양자역학" / "양자" 둘 다 매칭). 한국어
//     검색 시스템에서 표준 휴리스틱.
//   - Japanese (히라가나/가타가나): 같은 bigram 전략.
//   - 한자 (CJK Unified Ideographs): bigram (한국어와 같은 처리).

const BM25_K1 = 1.5;
const BM25_B = 0.75;

// V5 정정 (2026-05-02 19:39): 영어 stopword + 짧은 Latin 토큰 게이트.
// 첫 V5 검증에서 발견:
//   "I want to learn about quantum mechanics" → "i want food" entry 매칭
//   공통 토큰 "want" 가 BM25 점수 박아 false positive.
// IDF 가 알아서 weight 낮춰주지만, corpus 가 작으면 (수십 entry) IDF 도
// 충분히 깎이지 X. 명시적 stopword 제거 + 길이 게이트 (≥3) 가 더 안전.
//
// 후보 단어 — 산업 표준 영어 stopword list (NLTK / sklearn 교집합) 의
// 핵심부. 도메인 단어 ("food"/"quantum" 등) 는 박지 X — 사용자 발화의
// 주제 신호.
const ENGLISH_STOPWORDS = new Set<string>([
  // 대명사
  "i",
  "me",
  "my",
  "you",
  "your",
  "we",
  "us",
  "our",
  "they",
  "them",
  "their",
  "he",
  "him",
  "his",
  "she",
  "her",
  "it",
  "its",
  // be 동사 / 활용
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  // 관사
  "a",
  "an",
  "the",
  // 전치사
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "by",
  "with",
  "about",
  "from",
  "into",
  "over",
  "under",
  "up",
  "down",
  "out",
  // 접속사 / 지시어
  "and",
  "or",
  "but",
  "so",
  "if",
  "that",
  "this",
  "these",
  "those",
  // 의미 약한 동사
  "want",
  "wants",
  "wanted",
  "need",
  "needs",
  "like",
  "likes",
  "get",
  "got",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "make",
  "made",
  "go",
  "going",
  "went",
  // 조동사
  "can",
  "could",
  "will",
  "would",
  "should",
  "may",
  "might",
  "must",
  "shall",
  // 양화사 / 정도
  "more",
  "less",
  "much",
  "many",
  "very",
  "some",
  "any",
  "all",
  "few",
  "several",
  // 의문사
  "what",
  "when",
  "where",
  "who",
  "why",
  "how",
  "which",
  "whose",
  // 기타 자주 등장
  "not",
  "no",
  "yes",
  "here",
  "there",
  "just",
  "only",
  "also",
  "too",
  "than",
  "then",
  "now",
  "as",
  "such",
]);

// V5.1 Korean stopword (2026-05-03). 영어 110+ stopword 박은 후 한국어 leak
// 이 그대로 남음 — Tei 진단 (브라우저 검증):
//   "술을 너무 많이 마셔서 힘들어" → "성적이 떨어져서 속상하겠다" (false positive)
//     원인: "너무" + 감정 단어 공통 → BM25 점수 ↑
//   "숙취 해소에 좋은거 알려줘" → "양자역학…" (false positive)
//     원인: "알려줘" 공통 → BM25 점수 ↑
// 같은 진단의 후속 — 영어 stopword 110+ 같은 처리가 한국어에 부족했음.
//
// 채택 기준 — 발화 안에서 의미 운반력이 약한 단어:
//   1) 정도 부사 (강도 표현) — 의미 X, 톤 modifier
//   2) 형용사 stem — 평가어 (의미 약 형용사)
//   3) 의미 약 동사 — 요청 형식어 (실제 동사 의미는 X)
//   4) 의문사 — 정보 요청 신호 (주제 X)
//   5) 관계어 / 연결어 — 문장 연결 기능
//   6) 의존명사 / 형식명사 — 단독으론 의미 X
//   7) 어미 — 종결 / 연결 morpheme 잔여
//   8) 감탄사 / 응대어 — 대화 윤활
//
// "주제 단어" 는 박지 X — "양자역학" / "숙취" / "성적" / "음식" 등은 발화의
// 진짜 의미 신호. 이런 단어가 매칭에서 살아있어야 단일 모드가 작동.
const KOREAN_STOPWORD_WORDS = new Set<string>([
  // 1) 정도 부사
  "너무",
  "많이",
  "좀",
  "조금",
  "더",
  "덜",
  "매우",
  "진짜",
  "정말",
  "엄청",
  "아주",
  "굉장",
  "상당",
  "약간",
  "살짝",
  "그냥",
  "막",
  "워낙",
  "되게",
  "꽤",
  "참",
  // 2) 형용사 stem (의미 약 형용사)
  "힘들",
  "좋을",
  "어떨",
  "어때",
  "좋은",
  "나쁜",
  "맛있",
  "싫은",
  "쉬운",
  "어려운",
  "빠른",
  "느린",
  "큰",
  "작은",
  "새로운",
  "괜찮",
  "괜찮은",
  "이상",
  "별로",
  // 3) 의미 약 동사 (요청형 / 보조동사)
  "알려",
  "보여",
  "가르쳐",
  "해줘",
  "줘",
  "봐",
  "가",
  "와",
  "해",
  "하",
  "되",
  "있",
  "없",
  "같",
  "보",
  "받",
  "주",
  "할까",
  "할게",
  "할래",
  "해야",
  // 4) 의문사
  "뭐",
  "무엇",
  "어떻게",
  "어떤",
  "왜",
  "어디",
  "언제",
  "누가",
  "누구",
  "어느",
  "얼마",
  "몇",
  "뭐가",
  "뭘",
  // 5) 관계어 / 연결어
  "때문",
  "위해",
  "위한",
  "같은",
  "처럼",
  "만큼",
  "보다",
  "까지",
  "부터",
  "마저",
  "조차",
  "라도",
  "마다",
  "또는",
  "혹은",
  "그런",
  "이런",
  "저런",
  // 6) 의존명사 / 형식명사
  "거",
  "것",
  "게",
  "걸",
  "데",
  "수",
  "적",
  "줄",
  "척",
  "양",
  "통",
  "참",
  "동안",
  "사이",
  // 7) 어미 / 활용형 잔여
  "인데",
  "했어",
  "했는데",
  "거든",
  "던데",
  "잖아",
  "네요",
  "군요",
  "어요",
  "았어",
  "였어",
  "였던",
  "했던",
  "했지",
  "이야",
  "이지",
  "구나",
  "구만",
  // 8) 감탄사 / 응대어
  "아",
  "어",
  "음",
  "그래",
  "응",
  "네",
  "아니",
  "어머",
  "와",
  "헐",
  "아이고",
  "그럼",
]);

// 빠른 bigram-level filter set. KOREAN_STOPWORD_WORDS 의 길이 ≥ 2 stopword
// 의 모든 bigram 을 박음. tokenize 의 bigram 출력에서 이 set 박힌 토큰
// 제외. 활용형 흡수 효과 — "힘들어" → bigrams ["힘들","들어"] 중 "힘들"
// (stopword bigram) 만 제거. "힘드네" → ["힘드","드네"] 는 "힘드" 가
// 박혀있지 않아 그대로 — 활용형마다 stopword 명시가 필요 X.
const KOREAN_STOPWORD_BIGRAMS = new Set<string>();
for (const sw of KOREAN_STOPWORD_WORDS) {
  if (sw.length < 2) continue;
  for (let i = 0; i < sw.length - 1; i++) {
    KOREAN_STOPWORD_BIGRAMS.add(sw.slice(i, i + 2));
  }
}

// V5.1 verbal connective bigram noise — 활용형 안에서 자주 등장하는 morpheme
// 경계 bigram. 의미 단어 X, 작은 corpus 에서 IDF 가 높게 박혀 매칭 잡음
// 박힘. 진단:
//   "마음이 힘들어" entry 와 "술을 마셔서 힘들어" query 가 "들어" bigram
//   (힘+들+어 의 들|어 boundary) 1개로 BM25 ≈ 2.5 — 1.5 게이트 통과 →
//   false positive. "들어" 제거 → 0 → 정직 차단.
//
// 채택 기준 — 두 자리에서 자주 등장 + 의미 운반력 X:
const KOREAN_VERBAL_BIGRAMS = ["들어", "어서", "아서", "져서", "었어", "었던"];
for (const bg of KOREAN_VERBAL_BIGRAMS) KOREAN_STOPWORD_BIGRAMS.add(bg);

// 문자 클래스 판정. Unicode property escapes 가 ESBuild 에서 안전 사용 가능.
function isLatin(ch: string): boolean {
  return /[A-Za-z0-9]/.test(ch);
}

function isKorean(ch: string): boolean {
  // 한글 음절 (가-힣) + 자모 (Hangul Jamo)
  const code = ch.charCodeAt(0);
  return (code >= 0xac00 && code <= 0xd7a3) || (code >= 0x1100 && code <= 0x11ff);
}

function isJapanese(ch: string): boolean {
  // 히라가나 (3040-309F), 가타가나 (30A0-30FF)
  const code = ch.charCodeAt(0);
  return (code >= 0x3040 && code <= 0x30ff) || (code >= 0x31f0 && code <= 0x31ff);
}

function isCJK(ch: string): boolean {
  // CJK Unified Ideographs — 한자
  const code = ch.charCodeAt(0);
  return code >= 0x4e00 && code <= 0x9fff;
}

function bigrams(word: string): string[] {
  if (word.length < 2) return [];
  const out: string[] = [];
  for (let i = 0; i < word.length - 1; i++) out.push(word.slice(i, i + 2));
  return out;
}

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];

  // 1단계: 같은 script 끼리 묶어서 word 단위 분리. 공백 / 구두점 / 다른 script
  // 전환 시점에서 자른다.
  let buf = "";
  let bufScript: "latin" | "ko" | "ja" | "cjk" | null = null;

  const flush = () => {
    if (!buf || !bufScript) {
      buf = "";
      bufScript = null;
      return;
    }
    if (bufScript === "latin") {
      // Latin: 길이 ≥ 3 + stopword 미포함. "to"/"of" 같은 짧은 기능어 + "i"/
      // "want" 같은 stopword 둘 다 노이즈 토큰 (false positive 의 주요 원인).
      // "go"/"ai" 같은 2-char 단어는 demo 시연 시 손실 미미.
      if (buf.length >= 3 && !ENGLISH_STOPWORDS.has(buf)) tokens.push(buf);
    } else if (bufScript === "ko") {
      // V5.1 Korean: 두 단계 stopword 필터.
      //   word-level: whitespace-separated word 가 stopword 면 통째로 skip.
      //               "너무" / "알려" 같은 단독 등장 차단.
      //   bigram-level: 활용형 ("힘들어" → ["힘들","들어"]) 중 stopword bigram
      //                 ("힘들") 만 제거. 비stopword bigram ("들어") 은 보존.
      if (KOREAN_STOPWORD_WORDS.has(buf)) {
        // skip 통째로
      } else {
        for (const bg of bigrams(buf)) {
          if (!KOREAN_STOPWORD_BIGRAMS.has(bg)) tokens.push(bg);
        }
      }
    } else {
      // Japanese / CJK: bigram (stopword 처리 미박음 — 시연 범위 X)
      tokens.push(...bigrams(buf));
    }
    buf = "";
    bufScript = null;
  };

  for (const ch of lower) {
    let script: "latin" | "ko" | "ja" | "cjk" | null = null;
    if (isLatin(ch)) script = "latin";
    else if (isKorean(ch)) script = "ko";
    else if (isJapanese(ch)) script = "ja";
    else if (isCJK(ch)) script = "cjk";

    if (script === null) {
      // 공백 / 구두점 / 기타 — flush
      flush();
      continue;
    }
    if (bufScript !== null && script !== bufScript) {
      flush();
    }
    buf += ch;
    bufScript = script;
  }
  flush();

  return tokens;
}

// IDF = ln(1 + (N - df + 0.5) / (df + 0.5)). lucene 변형 — df 0 도 안전.
function idf(documentFreq: number, totalDocs: number): number {
  return Math.log(1 + (totalDocs - documentFreq + 0.5) / (documentFreq + 0.5));
}

// Token 통계 — 한 corpus 에 대해 1회 계산 후 재사용.
type CorpusStats = {
  totalDocs: number;
  avgDocLen: number;
  // term → 그 term 이 박힌 document 수
  documentFreq: Map<string, number>;
};

export function computeCorpusStats(corpus: string[][]): CorpusStats {
  const totalDocs = corpus.length;
  const documentFreq = new Map<string, number>();
  let totalLen = 0;
  for (const doc of corpus) {
    totalLen += doc.length;
    const seen = new Set<string>();
    for (const t of doc) seen.add(t);
    for (const t of seen) documentFreq.set(t, (documentFreq.get(t) ?? 0) + 1);
  }
  const avgDocLen = totalDocs > 0 ? totalLen / totalDocs : 0;
  return { totalDocs, avgDocLen, documentFreq };
}

export function bm25Score(queryTokens: string[], docTokens: string[], stats: CorpusStats): number {
  if (queryTokens.length === 0 || docTokens.length === 0) return 0;
  const docLen = docTokens.length;
  // doc 의 term 빈도
  const tf = new Map<string, number>();
  for (const t of docTokens) tf.set(t, (tf.get(t) ?? 0) + 1);

  // query 토큰별 점수 합산. dedupe — "양자역학" 의 bigram 이 query 에서 중복돼도
  // 한 번만 가산 (BM25 표준 변형).
  let score = 0;
  const querySeen = new Set<string>();
  for (const qt of queryTokens) {
    if (querySeen.has(qt)) continue;
    querySeen.add(qt);
    const tfTd = tf.get(qt) ?? 0;
    if (tfTd === 0) continue;
    const df = stats.documentFreq.get(qt) ?? 0;
    if (df === 0) continue; // OOV
    const idfT = idf(df, stats.totalDocs);
    const numerator = tfTd * (BM25_K1 + 1);
    const denominator =
      tfTd + BM25_K1 * (1 - BM25_B + (BM25_B * docLen) / Math.max(stats.avgDocLen, 1));
    score += idfT * (numerator / denominator);
  }
  return score;
}
