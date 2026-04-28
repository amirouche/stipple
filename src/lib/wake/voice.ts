// Web Speech API thin wrapper. Korean-first.
//
// Browsers gate `speechSynthesis.speak()` behind a prior user gesture in
// most cases. The scheduler accounts for this by also re-checking on the
// first click/keydown — so the very first wake after a fresh page load
// fires once the user touches the page.

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
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
  // Pick a Korean voice if available. Voices load async, so we just try once.
  const voices = window.speechSynthesis.getVoices();
  const koVoice = voices.find((v) => v.lang.startsWith("ko"));
  if (koVoice) utter.voice = koVoice;
  // Cancel any pending utterance so back-to-back fires don't queue.
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
  return true;
}

export function cancelSpeech(): void {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
}
