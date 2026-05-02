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
    } else {
      // Korean / Japanese / CJK: bigram
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
