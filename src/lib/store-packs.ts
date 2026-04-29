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
};

export const STORE_PACKS: StorePack[] = [
  {
    id: "sat-english-5",
    name: "SAT 영어 5문제",
    category: "학습",
    short: "기본 독해 5문제로 SAT 영어 페이스를 잡아.",
    contentCount: "5문제",
    priceWon: 0,
    author: "DOTS 공식",
    voice: "영어 강사",
    tone: "정확하고 격식 있는 — 문법·독해·작문 분석 위주",
  },
  {
    id: "toefl-speaking-10",
    name: "TOEFL 스피킹 10문제",
    category: "학습",
    short: "iBT 형식 그대로, 답안 자동 분석 포함.",
    contentCount: "10문제",
    priceWon: 2900,
    author: "ETS 협력",
    voice: "영어 코치",
    tone: "격려하는 — 답안 분석 + 발음·문장 구조 피드백",
  },
  {
    id: "japanese-conversation-50",
    name: "일본어 회화 50개",
    category: "학습",
    short: "여행·일상·비즈니스 상황별 회화 50개.",
    contentCount: "50개 대화",
    priceWon: 4900,
    author: "JLPT Pro",
    voice: "일본어 선생님",
    tone: "친근한 — 상황별 표현 + 문화 컨텍스트",
  },
  {
    id: "baek-korean-recipes",
    name: "백종원 한식 레시피팩",
    category: "요리",
    short: "찌개·밑반찬·면 요리까지 36가지.",
    contentCount: "36 레시피",
    priceWon: 0,
    author: "백종원",
    voice: "백종원 톤 한식 마스터",
    tone: "투박하면서 친근한 — 재료·불·시간 위주",
  },
  {
    id: "wine-pairing",
    name: "와인 페어링 가이드",
    category: "라이프스타일",
    short: "한식·양식·아시안 페어링 추천 카드.",
    contentCount: "120 페어링",
    priceWon: 1900,
    author: "Sommelier KR",
    voice: "소믈리에",
    tone: "차분하고 전문적 — 향·맛·페어링 분석",
  },
  {
    id: "morning-stretch-5",
    name: "5분 스트레칭 루틴",
    category: "라이프스타일",
    short: "아침에 5분, 저녁에 5분. 영상 없이 텍스트 가이드.",
    contentCount: "12 루틴",
    priceWon: 0,
    author: "DOTS 공식",
    voice: "필라테스 강사",
    tone: "활기찬 격려 — 동작·호흡·시간 단계별",
  },
  {
    id: "code-review-rust",
    name: "Rust 코드 리뷰 팩",
    category: "업무",
    short: "ownership·trait 패턴 위주 리뷰 휴리스틱.",
    contentCount: "리뷰 룰 84개",
    priceWon: 3900,
    author: "Rust Korea",
    voice: "Rust 시니어 엔지니어",
    tone: "직접적이고 정확 — 안전성·성능·이디엄 위주",
  },
  {
    id: "git-pro",
    name: "Git Pro — 커맨드 사전",
    category: "업무",
    short: "rebase, cherry-pick, reflog까지 자주 쓰는 30개.",
    contentCount: "30 시나리오",
    priceWon: 0,
    author: "DOTS 공식",
    voice: "Git 전문가",
    tone: "간결하고 정확 — 명령어 + 사용 시나리오",
  },
  {
    id: "movie-mood",
    name: "기분별 영화 추천",
    category: "엔터테인먼트",
    short: "오늘 기분에 어울리는 영화 한 편을 빠르게.",
    contentCount: "150 작품",
    priceWon: 1900,
    author: "Cinekick",
    voice: "영화 큐레이터",
    tone: "공감적이고 따뜻 — 장르·분위기·감정 매칭",
  },
  {
    id: "indie-music-2026",
    name: "2026 인디 뮤직 큐레이션",
    category: "엔터테인먼트",
    short: "월간 업데이트되는 한국 인디 신곡 모음.",
    contentCount: "월 30곡",
    priceWon: 0,
    author: "Indie Weekly",
    voice: "음악 큐레이터",
    tone: "감각적이고 차분 — 아티스트·앨범·분위기",
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

export function formatPrice(won: number): string {
  if (won === 0) return "무료";
  return `₩${won.toLocaleString("ko-KR")}`;
}
