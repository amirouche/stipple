// V5.0 lite Phase B3c — extractNouns가 ENDING strip으로 만든 어색한 형태
// ("풀고싶어" → "풀고싶") 를 자연 형태로 복원. originalText 안에서 noun
// 으로 시작하는 token을 찾아 더 긴 원본 형태가 있으면 그것을 반환.
//
// 또한 한국어 받침 인지 헬퍼. B2 거부 처리 ("김치복음밥는" vs "김치복음밥은")
// 같은 조사 자동 선택에 사용.

export function cleanRequestedNoun(noun: string, originalText: string): string {
  const tokens = originalText.trim().split(/\s+/);
  for (const tok of tokens) {
    // noun이 token의 prefix이고 token이 더 길면 token이 원본 형태.
    // 정확히 같으면 그대로 (이미 자연 형태).
    if (tok.startsWith(noun) && tok.length > noun.length) {
      return tok;
    }
  }
  return noun;
}

// 한국어 음절의 받침 (final consonant) 유무. Korean syllables U+AC00 ~ U+D7A3.
// syllable index = (initial * 588) + (medial * 28) + final. final 0이면 받침 없음.
export function hasFinalConsonant(word: string): boolean {
  if (!word) return false;
  const lastChar = word[word.length - 1];
  const code = lastChar.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

// 주제 조사 — "은" (받침 있음) / "는" (받침 없음). 한국어 외 단어는 "는" 디폴트.
export function topicParticle(word: string): "은" | "는" {
  return hasFinalConsonant(word) ? "은" : "는";
}
