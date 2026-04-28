// Web Speech API thin wrapper. Korean-first.
//
// Browsers gate `speechSynthesis.speak()` behind a prior user gesture in
// most cases. The scheduler accounts for this by also re-checking on the
// first click/keydown — so the very first wake after a fresh page load
// fires once the user touches the page.
//
// Voice selection prefers cloud / higher-quality voices over the OS default,
// which on macOS/iOS lands on "유나" by default — fine but flat. The priority
// list below moves to a more natural voice when one is installed.

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Trigger voice list population. Some browsers (Chrome) hydrate the list on
// first `getVoices()` call, then fire `voiceschanged` when ready.
if (isSpeechSupported()) {
  window.speechSynthesis.getVoices();
}

type VoicePredicate = (v: SpeechSynthesisVoice) => boolean;

// Ordered: first matching voice wins. Tuned for macOS/iOS Korean voice names
// — falls back to any cloud-backed ko voice, then any ko voice at all.
const VOICE_PRIORITY: VoicePredicate[] = [
  // 1. Google's Korean voice — the most natural option when present.
  (v) => v.name.includes("Google 한국"),
  // 2. Sandy — premium macOS/iOS Korean voice.
  (v) => /^sandy\b/i.test(v.name) && v.lang.startsWith("ko"),
  // 3. Shelley — same family as Sandy, good prosody.
  (v) => /^shelley\b/i.test(v.name) && v.lang.startsWith("ko"),
  // 4. Any ko-KR voice that isn't the local OS default (cloud-backed tend
  //    to sound less robotic than localService=true).
  (v) => v.lang.startsWith("ko") && !v.localService,
  // 5. Last resort: whatever Korean voice the OS provides.
  (v) => v.lang.startsWith("ko"),
];

function pickKoreanVoice(): SpeechSynthesisVoice | undefined {
  if (!isSpeechSupported()) return undefined;
  const voices = window.speechSynthesis.getVoices();
  for (const pred of VOICE_PRIORITY) {
    const hit = voices.find(pred);
    if (hit) return hit;
  }
  return undefined;
}

export type SpeakOpts = {
  lang?: string;
  rate?: number;
  pitch?: number;
};

export function speak(text: string, opts: SpeakOpts = {}): boolean {
  if (!isSpeechSupported() || !text.trim()) return false;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = opts.lang ?? "ko-KR";
  utter.rate = opts.rate ?? 1.0;
  utter.pitch = opts.pitch ?? 1.0;
  const voice = pickKoreanVoice();
  if (voice) utter.voice = voice;
  // Cancel any pending utterance so back-to-back fires don't queue.
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
  return true;
}

export function cancelSpeech(): void {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
}
