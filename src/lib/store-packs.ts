// 팩스토어 더미 데이터. 마켓플레이스 컨셉 증명용 — 실제 설치 동작은 없고
// UI 흐름만 보여준다. 가격은 KRW. priceWon === 0이면 무료.
//
// 헌법: "모든 데이터는 팩 시스템 안에서 살아남." 스토어는 그 데이터를
// 어디서 더 가져올 수 있는지 보여주는 진열창이다.

export type StoreCategory = "학습" | "요리" | "라이프스타일" | "업무" | "엔터테인먼트";

export type StorePack = {
  id: string;
  name: string;
  category: StoreCategory;
  short: string;
  contentCount: string;
  priceWon: number;
  author: string;
  // Same shape as Pack.voice / Pack.tone in dots-data.ts. Surfaces in
  // store cards so the user can pick by persona before install — the
  // demo's hero moment.
  voice: string;
  tone: string;
  installed?: boolean;
  // Phase EN-fix F: /store 카드 렌더 + 검색 (matchesQuery) 용 평행 EN 필드.
  // 미박힘 시 KO fallback. author 가 이미 영어/중립 표기 (예: "JLPT Pro",
  // "Sommelier KR") 면 authorEn 생략 — 그대로 노출.
  nameEn?: string;
  shortEn?: string;
  voiceEn?: string;
  toneEn?: string;
  contentCountEn?: string;
  authorEn?: string;
};

export const STORE_PACKS: StorePack[] = [
  {
    id: "sat-english-5",
    name: "SAT 영어",
    nameEn: "SAT English",
    category: "학습",
    short: "기본 독해 5문제로 SAT 영어 페이스를 잡아.",
    shortEn: "Five reading problems to set your SAT English pace.",
    contentCount: "5문제",
    contentCountEn: "5 problems",
    priceWon: 0,
    author: "DOTS 공식",
    authorEn: "DOTS Official",
    voice: "영어 강사",
    voiceEn: "English instructor",
    tone: "정확하고 격식 있는 — 문법·독해·작문 분석 위주",
    toneEn: "Precise and formal — grammar, reading, and writing analysis",
  },
  {
    id: "toefl-speaking-10",
    name: "TOEFL 스피킹",
    nameEn: "TOEFL Speaking",
    category: "학습",
    short: "iBT 형식 그대로, 답안 자동 분석 포함.",
    shortEn: "iBT format with automatic answer analysis.",
    contentCount: "10문제",
    contentCountEn: "10 prompts",
    priceWon: 2900,
    author: "ETS 협력",
    authorEn: "ETS Partner",
    voice: "영어 코치",
    voiceEn: "English coach",
    tone: "격려하는 — 답안 분석 + 발음·문장 구조 피드백",
    toneEn: "Encouraging — answer analysis + pronunciation and sentence feedback",
  },
  {
    id: "japanese-conversation-50",
    name: "일본어 회화",
    nameEn: "Japanese Conversation",
    category: "학습",
    short: "여행·일상·비즈니스 상황별 회화 50개.",
    shortEn: "50 dialogues across travel, daily life, and business situations.",
    contentCount: "50개 대화",
    contentCountEn: "50 dialogues",
    priceWon: 4900,
    author: "JLPT Pro",
    voice: "일본어 선생님",
    voiceEn: "Japanese teacher",
    tone: "친근한 — 상황별 표현 + 문화 컨텍스트",
    toneEn: "Friendly — situational phrases + cultural context",
  },
  {
    id: "baek-korean-recipes",
    name: "백종원 한식 레시피팩",
    nameEn: "Baek's Korean Recipes",
    category: "요리",
    short: "찌개·밑반찬·면 요리까지 36가지.",
    shortEn: "36 recipes spanning stews, side dishes, and noodles.",
    contentCount: "36 레시피",
    contentCountEn: "36 recipes",
    priceWon: 0,
    author: "백종원",
    authorEn: "Baek Jong-won",
    voice: "백종원 톤 한식 마스터",
    voiceEn: "Korean cuisine master, Baek style",
    tone: "투박하면서 친근한 — 재료·불·시간 위주",
    toneEn: "Rustic but warm — focused on ingredients, heat, and timing",
  },
  {
    id: "wine-pairing",
    name: "와인 페어링 가이드",
    nameEn: "Wine Pairing Guide",
    category: "라이프스타일",
    short: "한식·양식·아시안 페어링 추천 카드.",
    shortEn: "Pairing cards spanning Korean, Western, and Asian cuisines.",
    contentCount: "120 페어링",
    contentCountEn: "120 pairings",
    priceWon: 1900,
    author: "Sommelier KR",
    voice: "소믈리에",
    voiceEn: "Sommelier",
    tone: "차분하고 전문적 — 향·맛·페어링 분석",
    toneEn: "Calm and expert — aroma, palate, and pairing analysis",
  },
  {
    id: "morning-stretch-5",
    name: "스트레칭 루틴",
    nameEn: "Morning Stretching",
    category: "라이프스타일",
    short: "아침에 5분, 저녁에 5분. 영상 없이 텍스트 가이드.",
    shortEn: "Five minutes in the morning, five at night. Text guide, no video.",
    contentCount: "12 루틴",
    contentCountEn: "12 routines",
    priceWon: 0,
    author: "DOTS 공식",
    authorEn: "DOTS Official",
    voice: "필라테스 강사",
    voiceEn: "Pilates instructor",
    tone: "활기찬 격려 — 동작·호흡·시간 단계별",
    toneEn: "Energetic encouragement — step-by-step on movement, breath, and timing",
  },
  {
    id: "code-review-rust",
    name: "Rust 코드 리뷰 팩",
    nameEn: "Rust Code Review",
    category: "업무",
    short: "ownership·trait 패턴 위주 리뷰 휴리스틱.",
    shortEn: "Review heuristics centered on ownership and trait patterns.",
    contentCount: "리뷰 룰 84개",
    contentCountEn: "84 rules",
    priceWon: 3900,
    author: "Rust Korea",
    voice: "Rust 시니어 엔지니어",
    voiceEn: "Senior Rust engineer",
    tone: "직접적이고 정확 — 안전성·성능·이디엄 위주",
    toneEn: "Direct and precise — safety, performance, and idiomatic style",
  },
  {
    id: "git-pro",
    name: "Git Pro — 커맨드 사전",
    nameEn: "Git Pro — Command Cookbook",
    category: "업무",
    short: "rebase, cherry-pick, reflog까지 자주 쓰는 30개.",
    shortEn: "30 frequently used commands including rebase, cherry-pick, and reflog.",
    contentCount: "30 시나리오",
    contentCountEn: "30 scenarios",
    priceWon: 0,
    author: "DOTS 공식",
    authorEn: "DOTS Official",
    voice: "Git 전문가",
    voiceEn: "Git expert",
    tone: "간결하고 정확 — 명령어 + 사용 시나리오",
    toneEn: "Concise and precise — commands + use scenarios",
  },
  {
    id: "movie-mood",
    name: "기분별 영화 추천",
    nameEn: "Movies by Mood",
    category: "엔터테인먼트",
    short: "오늘 기분에 어울리는 영화 한 편을 빠르게.",
    shortEn: "A film matched to today's mood, fast.",
    contentCount: "150 작품",
    contentCountEn: "150 titles",
    priceWon: 1900,
    author: "Cinekick",
    voice: "영화 큐레이터",
    voiceEn: "Film curator",
    tone: "공감적이고 따뜻 — 장르·분위기·감정 매칭",
    toneEn: "Empathetic and warm — matching genre, mood, and feeling",
  },
  {
    id: "indie-music-2026",
    name: "인디 뮤직 큐레이션",
    nameEn: "Indie Music Curation",
    category: "엔터테인먼트",
    short: "월간 업데이트되는 한국 인디 신곡 모음.",
    shortEn: "Monthly-updated Korean indie new releases.",
    contentCount: "월 30곡",
    contentCountEn: "30 tracks / month",
    priceWon: 0,
    author: "Indie Weekly",
    voice: "음악 큐레이터",
    voiceEn: "Music curator",
    tone: "감각적이고 차분 — 아티스트·앨범·분위기",
    toneEn: "Sensorial and calm — artist, album, and mood",
  },
];

export const STORE_CATEGORIES: ("전체" | StoreCategory)[] = [
  "전체",
  "학습",
  "요리",
  "라이프스타일",
  "업무",
  "엔터테인먼트",
];

// Phase 2 i18n: freeLabel 은 caller (store.tsx) 가 t.store.priceFree 박아 전달.
// 통화 기호 (₩) 와 그룹 콤마는 한·영 동일 표기라 locale 무관.
export function formatPrice(won: number, freeLabel: string): string {
  if (won === 0) return freeLabel;
  return `₩${won.toLocaleString("en-US")}`;
}
