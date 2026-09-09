export type PracticeFeedbackSound = "correct" | "incorrect" | "complete";

type BrowserWindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext
    ?? (window as BrowserWindowWithWebkitAudio).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContext ??= new AudioContextConstructor();
  return audioContext;
}

function playNotes(context: AudioContext, notes: Array<{ frequency: number; offset: number; duration: number }>): void {
  const start = context.currentTime + 0.01;

  notes.forEach(({ frequency, offset, duration }) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = start + offset;
    const noteEnd = noteStart + duration;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.045, noteStart + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.02);
  });
}

const SOUND_NOTES: Record<PracticeFeedbackSound, Array<{ frequency: number; offset: number; duration: number }>> = {
  correct: [
    { frequency: 659.25, offset: 0, duration: 0.12 },
    { frequency: 880, offset: 0.11, duration: 0.18 },
  ],
  incorrect: [
    { frequency: 220, offset: 0, duration: 0.14 },
    { frequency: 164.81, offset: 0.12, duration: 0.2 },
  ],
  complete: [
    { frequency: 523.25, offset: 0, duration: 0.15 },
    { frequency: 659.25, offset: 0.12, duration: 0.15 },
    { frequency: 783.99, offset: 0.24, duration: 0.15 },
    { frequency: 1046.5, offset: 0.36, duration: 0.28 },
  ],
};

export function playPracticeFeedbackSound(sound: PracticeFeedbackSound): void {
  const context = getAudioContext();
  if (!context || context.state === "closed") return;

  const play = () => {
    if (context.state !== "closed") playNotes(context, SOUND_NOTES[sound]);
  };

  if (context.state === "suspended") {
    void context.resume().then(play).catch(() => undefined);
    return;
  }

  play();
}
