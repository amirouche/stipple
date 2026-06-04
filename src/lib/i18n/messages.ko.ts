// Phase 2 i18n — 한국어 사전 (마스터). Messages 타입의 source-of-truth.
// EN 사전은 이 구조를 satisfies 로 강제 매칭 — 타입 빌드 단계에서 키 누락
// 자동 감지.
//
// 키 구조: nested namespace (shell, home, packs, store, sudoku, study, …).
// 함수 값 허용 — 파라미터 보간이 필요한 문자열은 (n: number) => string 형태.
// 템플릿 토큰 ({n}) 대신 함수로 정의해 TS 가 파라미터 타입까지 보장.

export const MESSAGES_KO = {
  // 언어 토글 자기 라벨. UX 관행상 양쪽 언어 사용자 모두 자기 언어를
  // 직관적으로 알아볼 수 있게 KO/EN 사전 동일값 — 토글 컴포넌트는 이걸
  // 거치지 않고 하드코딩 literal 사용 (사전 등록은 일관성 + 추후 참조용).
  toggle: { korean: "한국어", english: "English" },

  // 사이드바 (Shell.tsx).
  shell: {
    nav: {
      packs: "팩",
      store: "팩스토어",
      memory: "기억",
      settings: "설정",
      demo: "데모 측정",
    },
    newThread: "새 대화",
    newThreadDefaultTitle: "새 대화",
    sectionChats: "채팅",
    sectionSystem: "시스템",
    emptyTitle: "아직 시작된 대화가 없어.",
    emptyHint: "위의 + 새 대화로 시작해.",
    deviceBadge: "이 기기 안에서",
    menuOpen: "메뉴 열기",
    relTime: {
      justNow: "방금",
      minutesAgo: (m: number) => `${m}분 전`,
      hoursAgo: (h: number) => `${h}시간 전`,
      daysAgo: (d: number) => `${d}일 전`,
    },
  },

  // 채팅 홈 (routes/index.tsx).
  home: {
    tagline: "DOTS — 한국어 도우미. 입력에 맞춰 자동으로 톤이 바뀌어.",
    chipTitleFolder: (name: string) => `${name} 폴더 열기`,
    chipTitleCards: (name: string) => `${name} 카드 보기`,
    composerPlaceholder: "DOTS에게 말 걸기",
    send: "보내기",
  },

  // 팩 카탈로그 (routes/packs.tsx).
  packs: {
    eyebrow: "팩 라이브러리",
    title: "팩",
    subtitle:
      "팩은 작은 실행 단위. DOTS가 같은 질문을 어떻게 해석하고 정리해줄지 한 영역에서 바꿔.",
    detailsMore: "더 자세히",
    install: "설치",
    uninstall: "제거",
    pause: "일시정지",
    activate: "활성화",
    categories: {
      all: "전체",
      game: "게임",
      education: "학습",
      lifestyle: "라이프",
    },
    state: {
      notInstalled: "설치 안 됨",
      active: "활성",
      idle: "대기",
    },
    behaviorLines: {
      cookingEssentials: "요리 질문을 재료·순서·시간으로 바로 정리해줘.",
      studyCompanion: "설명 대신 단계로 풀고, 막힌 지점을 먼저 물어봐.",
      sudoku: "한 판 풀면 직전 결과 보고 다음 판 난이도를 한 단계 조정해.",
      morningRoutine: "오늘 일정·날씨를 기기 안에서 바로 답해.",
    },
  },

  // 팩스토어 (routes/store.tsx).
  store: {
    eyebrow: "마켓플레이스",
    title: "팩스토어",
    subtitle: "더 많은 콘텐츠와 행동 패턴을 추가하세요. 설치한 팩은 채팅과 매칭에서 곧장 작동해.",
    searchPlaceholder: "팩, 작가, 주제 검색",
    categories: {
      all: "전체",
      learning: "학습",
      cooking: "요리",
      lifestyle: "라이프스타일",
      work: "업무",
      entertainment: "엔터테인먼트",
    },
    emptyTitle: "지금은 추가 가능한 팩이 없어.",
    emptyDescription: "실제 동작하는 팩만 진열하기로 정리했어. 곧 새 팩이 도착할 거야.",
    buttonInstalledRemove: "설치됨 — 제거",
    buttonFreeInstall: "무료 설치",
    buttonBuyInstall: "구매하고 설치",
    priceFree: "무료",
  },

  // 스도쿠 (routes/sudoku.tsx). Phase 1 의 LABELS 객체에서 흡수.
  sudoku: {
    title: "스도쿠",
    description:
      "한 판 풀면 직전 결과를 기억해 다음 판 난이도를 한 단계 올리거나 내려. 채팅과 같은 기억 레이어 — 화면이 달라도 DOTS 는 너를 따라가.",
    difficulty: "난이도",
    demoBoard: "데모 보드",
    demoTooltip: "3칸만 채우면 끝나는 데모 보드 — 촬영용",
    newGame: "새 게임",
    check: "확인",
    nextGame: "다음 게임",
    clearTooltip: "지우기",
    incomplete: (n: number) => `아직 빈칸이 ${n}개 남았어. 다 채운 뒤 확인을 눌러.`,
    solved: (time: string) => `맞췄어. 오답 0개, ${time}.`,
    mistakes: (n: number, time: string) => `오답 ${n}개, ${time}.`,
    nextAdjust: (diff: string) => `다음 판은 ${diff} 로 조정.`,
    nextHold: (diff: string) => `다음 판도 ${diff} 유지.`,
  },

  // 채팅 응답 메타 — ProviderBadge / SuggestionBlock / RatingControls /
  // ProcessingTrace. 응답마다 노출되는 핵심 영역.
  chat: {
    // ProviderBadge — 응답 출처. 색·라벨 짝.
    provider: {
      webllm: "내 기기 (WebLLM) · 외부 호출 0",
      geminiCloud: "Cloud (Pack 외부) · Gemini API",
      gemini: "클라우드 (Gemini) · 외부 API",
      learned: "학습됨 · 캐시에서 (외부 호출 0)",
    },
    // SuggestionBlock footer — 매칭 출처.
    suggestionFooter: {
      local: (packName: string) => `${packName}에서 매칭됨 · 로컬 매칭`,
      store: "팩스토어에서 검색됨 · 로컬 매칭",
      create: "콘텐츠 없음 · 새로 만들 수 있어",
    },
    // SuggestionBlock 옵션 버튼 hover title.
    optionTitle: {
      llm: "이 옵션은 클라우드 호출이 들어가",
      local: "이 기기 안에서 처리",
    },
    // RatingControls — 응답 평가 (✓ 좋아함 / 다른 거 + 버튼).
    rating: {
      liked: "✓ 좋아함",
      shownDifferent: "✓ 다른 거 표시됨",
      like: "좋아",
      different: "다른 거",
    },
    // ProcessingTrace deep route — 1초 후 표시되는 부가 라벨.
    processingTrace: {
      deepWithPack: "일단 안에 있는 걸 먼저 봤는데, 더 찾아보면 정확해질 것 같아.",
      deepWithoutPack: "지금 가진 걸로는 애매해서 조금 더 확인해볼게.",
    },
  },

  // 기억 (routes/memory.tsx) — 4 선반 + relTime + archive window + header/footer.
  memory: {
    eyebrow: "개인 레이어",
    title: "기억",
    subtitle: "한 통이 아니라 네 칸이야. 각자 역할이 달라서, 무엇을 가까이 둘지는 네가 정해.",
    shelves: {
      temporary: {
        name: "임시 기억",
        desc: "지금 대화 안에서만 살아 있어. 따로 저장하지 않으면 곧 잊어.",
        badge: "휘발",
        empty: "지금은 비어 있어. 새 대화에서 잠깐 머무는 정보가 여기 들어와.",
      },
      frequent: {
        name: "자주 나온 것",
        desc: "여러 대화에 반복해서 등장한 주제. 가까이에 두고 바로 꺼내.",
        badge: "근접",
        empty: "아직 자주 등장한 게 없어. 같은 주제가 반복되면 여기로 올라와.",
      },
      saved: {
        name: "저장된 것",
        desc: "내가 직접 보관한 것. 팩이 필요할 때 먼저 여기서 찾아.",
        badge: "고정",
        empty: "저장된 게 아직 없어.",
      },
      archive: {
        name: "아카이브",
        desc: "지난 대화 기록. 추론에는 쓰이지 않고, 필요할 때 들춰볼 수 있어.",
        badge: "보관만",
        empty: "아카이브가 비어 있어. 오래된 대화가 쌓이면 여기로 모여.",
      },
    },
    accessCount: (topic: string, n: number) => `${topic} — ${n}번 등장`,
    archiveItemCount: (n: number) => `${n}개 항목`,
    relTime: {
      justNow: "방금",
      minutesAgo: (m: number) => `${m}분 전`,
      hoursAgo: (h: number) => `${h}시간 전`,
      daysAgo: (d: number) => `${d}일 전`,
      weeksAgo: (w: number) => `${w}주 전`,
      monthDay: (month: number, day: number) => `${month}월 ${day}일`,
      ymd: (y: number, m: number, d: number) => `${y}.${m}.${d}`,
    },
    archiveWindow: {
      today: "오늘",
      yesterday: "어제",
      daysAgo: (n: number) => `${n}일 전`,
      monthDayWeek: (month: number, day: number) => `${month}월 ${day}일 주`,
      ymdWeek: (y: number, m: number, d: number) => `${y}.${m}.${d} 주`,
      thisWeek: "이번 주",
      lastWeek: "지난주",
      weeksAgo: (n: number) => `${n}주 전`,
      thisMonth: "이번 달",
      lastMonth: "지난달",
      monthOnly: (m: number) => `${m}월`,
      yearMonth: (y: number, m: number) => `${y}년 ${m}월`,
      thisQuarter: "이번 분기",
      thisYearSeason: (season: string) => `올해 ${season}`,
      yearSeason: (y: number, season: string) => `${y}년 ${season}`,
      thisYear: "올해",
      lastYear: "작년",
      twoYearsAgo: "재작년",
      yearOnly: (y: number) => `${y}년`,
    },
    seasons: { winter: "겨울", spring: "봄", summer: "여름", autumn: "가을" },
    footerLine1: "기기 밖으로 안 나가.",
    footerLine2: "기억은 이 기기 안에 머물러. 아카이브는 언제든 설정에서 내보낼 수 있어.",
  },

  // 설정 (routes/settings.tsx) — 주요 섹션. 기술 섹션 (Pitch/Wake/Embedding/
  // Reranker/WebLLM) 의 세부는 본 사전 외부 (data layer) 라 별도.
  settings: {
    eyebrow: "환경",
    title: "설정",
    homePriority: {
      title: "홈에서 먼저 보여줄 흐름",
      desc: "DOTS가 새 대화를 열 때 어디서부터 시작할지.",
      memoryFirst: {
        title: "기억 우선",
        desc: "전에 얘기한 것부터 꺼내. 같은 주제 반복이 잦을 때 좋아.",
      },
      packsFirst: {
        title: "팩 우선",
        desc: "활성 팩의 결과를 먼저 보여줘. 새 일에 빠르게 들어갈 때.",
      },
      balanced: { title: "균형", desc: "그 순간 가장 자연스러운 쪽으로. 기본값." },
    },
    defaultMode: {
      title: "기본 모드",
      desc: "답의 길이와 속도의 기본값.",
      calm: { title: "차분한 모드", desc: "짧고 부드럽게. 끼어들지 않게." },
      fast: { title: "빠른 모드", desc: "한 줄 답을 먼저. 필요하면 더 풀어줄게." },
      deep: { title: "깊은 모드", desc: "단계적으로 풀어. 시간이 조금 더 걸려." },
    },
    packOrder: {
      title: "팩 우선순위",
      desc: "위에 있는 팩이 라이브러리와 홈에서 먼저 보여.",
      installed: "설치됨",
      notInstalled: "설치 안 됨",
      moveUp: "위로",
      moveDown: "아래로",
    },
    privacy: {
      title: "프라이버시",
      badge: "기기 안",
      line1: "개인화된 데이터는 이 기기 안에 머물러.",
      line2:
        "기억, 팩 설정, 학습된 습관은 로컬에 저장돼. 더 깊은 추론이 필요할 때만 프롬프트와 팩 시그니처가 베이스 모델로 가.",
      telemetry: "익명 사용 통계",
      telemetryDesc: "팩 개선용. 기본은 꺼져 있어.",
    },
    about: {
      title: "DOTS 정보",
      version: "버전",
      versionValue: "0.1.0 · 프로토타입",
      baseModel: "베이스 모델",
      baseModelValue: "설정 가능",
      personalLayer: "개인 레이어",
      personalLayerValue: "로컬",
    },
    // 비활성 카드 (WebLLM/Reranker) — 데모용 컨셉 carrier.
    disabledCards: {
      webllmTitle: "온디바이스 LLM",
      webllmStatus: "준비 중",
      webllmDesc:
        "브라우저 안에서 도는 AI 모드. 외부 호출이 사라지는 대신 응답 정보량이 줄어든다. 지금은 안정성 작업 중이라 잠시 비활성화 — 모든 응답은 기본 모드(클라우드)로 흘러간다.",
      webllmFooter: "다음 단계 (베타) — 인프라 안정화 후 복구",
      rerankerTitle: "정확도 향상 (V4.5)",
      rerankerStatus: "다음 단계 (베타)",
      rerankerDesc:
        "Cross-encoder 재정렬 — V4 임베딩이 잡은 후보를 한 번 더 정밀 점검. 모델 호환성 작업 중이라 잠시 가려둠. V4 시맨틱 매칭은 그대로 작동.",
    },
  },

  // 404 + 사이드바 외 공통 — __root.tsx.
  notFound: {
    code: "404",
    title: "Nothing routed here.",
    subtitle: "DOTS could not match this path to a local pack or known screen.",
    backToChat: "Back to chat",
  },

  // SAT / Study (routes/study.tsx). Phase 1 의 LABELS 객체에서 흡수.
  study: {
    packFolder: "팩 폴더",
    packShortSuffix: "답안 검증은 이 기기 안에서. 더 깊은 설명만 클라우드로 넘어가.",
    backToChat: "← 채팅으로",
    backToFolder: "← 폴더",
    problemsSuffix: (n: number) => `SAT 수학 · ${n}문제`,
    newProblem: "새 문제",
    retry: "다시 풀기",
    showHint: "힌트 보기",
    hint: "힌트",
    correct: "정답",
    incorrect: "오답",
    chosenLabel: "선택",
    correctLabel: "정답",
    showSolution: "정답 풀이 보기",
    matchedLocal: "· 이 기기 안에서 매칭됨",
    cloudFallback: "자주 틀리는 답 목록엔 안 잡혀. 더 깊게 보려면 클라우드로 넘길게.",
    moreExplain: "더 자세한 설명 보기",
    loadingExplain: "설명 가져오는 중…",
    makeVariant: "변형 문제 만들어줘",
    loadingVariant: "변형 문제 만드는 중…",
    moreExplainSection: "추가 설명",
    variantSection: "변형 문제",
    cloudFailed: "클라우드 호출 실패",
    cloudBadge: "클라우드",
    metaPrefix: "SAT 수학",
  },
};

// Messages 타입 — 구조형 (값 = string / 함수). as const 로 literal 좁히면
// EN 사전의 다른 literal 값이 satisfy 실패하므로 의도적으로 widen.
export type Messages = typeof MESSAGES_KO;
