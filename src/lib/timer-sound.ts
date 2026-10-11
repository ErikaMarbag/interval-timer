let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** Deve ser chamado dentro de um gesto do usuário para liberar o áudio no Android/iOS. */
export function unlockAudio() {
  const audio = getCtx();
  if (audio && audio.state === "suspended") void audio.resume();
}

function tone(startOffset: number, frequency: number, duration: number, gainValue: number) {
  const audio = getCtx();
  if (!audio) return;
  const now = audio.currentTime + startOffset;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

export type SoundId = "grave" | "agudo" | "curto" | "duplo" | "mudo";

export const SOUND_OPTIONS: { id: SoundId; label: string }[] = [
  { id: "grave", label: "Grave" },
  { id: "agudo", label: "Agudo" },
  { id: "curto", label: "Curto" },
  { id: "duplo", label: "Duplo" },
  { id: "mudo", label: "Sem som" },
];

export const DEFAULT_REST_SOUND: SoundId = "grave";
export const DEFAULT_WORK_SOUND: SoundId = "agudo";

export function isSoundId(value: unknown): value is SoundId {
  return SOUND_OPTIONS.some((option) => option.id === value);
}

/** Sinal grave e longo: entrada na pausa. */
export function playRestSignal() {
  unlockAudio();
  tone(0, 440, 0.25, 0.25);
  tone(0.22, 300, 0.45, 0.25);
}

/** Sinal agudo em três toques: volta ao exercício. */
export function playWorkSignal() {
  unlockAudio();
  tone(0, 700, 0.14, 0.25);
  tone(0.18, 700, 0.14, 0.25);
  tone(0.36, 1050, 0.3, 0.28);
}

export function playSound(id: SoundId) {
  if (id === "mudo") return;
  unlockAudio();
  switch (id) {
    case "grave":
      playRestSignal();
      break;
    case "agudo":
      playWorkSignal();
      break;
    case "curto":
      tone(0, 880, 0.12, 0.26);
      break;
    case "duplo":
      tone(0, 620, 0.16, 0.26);
      tone(0.24, 620, 0.16, 0.26);
      break;
  }
}

export function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* silencioso */
  }
}
