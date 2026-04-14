let sharedAudioContext: AudioContext | null = null;

type SoundType = "round-end" | "warning" | "danger" | "time-up";

export function playSound(type: SoundType): void {
  const audioContext = getAudioContext();
  if (!audioContext) {
    return;
  }

  if (audioContext.state === "suspended") {
    void audioContext.resume().catch(() => {
      // Some browsers still require an extra user gesture.
    });
  }

  switch (type) {
    case "round-end":
      playBell(audioContext, 988, 0.9, 0.32);
      window.setTimeout(() => {
        playBell(audioContext, 1318, 0.7, 0.24);
      }, 180);
      break;
    case "warning":
      playTone(audioContext, 800, 0.1, 0.5, "square");
      window.setTimeout(() => {
        playTone(audioContext, 1000, 0.1, 0.5, "square");
      }, 100);
      break;
    case "danger":
      playTone(audioContext, 900, 0.08, 0.6, "square");
      window.setTimeout(() => {
        playTone(audioContext, 1100, 0.08, 0.6, "square");
      }, 80);
      window.setTimeout(() => {
        playTone(audioContext, 1300, 0.08, 0.6, "square");
      }, 160);
      break;
    case "time-up":
      playTone(audioContext, 400, 0.2, 0.6, "sawtooth");
      window.setTimeout(() => {
        playTone(audioContext, 300, 0.3, 0.6, "sawtooth");
      }, 200);
      break;
  }
}

function getAudioContext(): AudioContext | null {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }

  sharedAudioContext ??= new AudioContextCtor();
  return sharedAudioContext;
}

function playBell(audioContext: AudioContext, frequency: number, duration: number, volume: number): void {
  const partials = [
    { ratio: 1, gain: 1, type: "sine" as OscillatorType },
    { ratio: 2.1, gain: 0.38, type: "triangle" as OscillatorType },
    { ratio: 2.92, gain: 0.2, type: "sine" as OscillatorType },
  ];

  partials.forEach((partial) => {
    playTone(audioContext, frequency * partial.ratio, duration, volume * partial.gain, partial.type);
  });
}

function playTone(
  audioContext: AudioContext,
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
): void {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  oscillator.type = type;

  gainNode.gain.setValueAtTime(Math.max(0.0001, volume), audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + duration * 0.18);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration);
}

export function isSoundEnabled(): boolean {
  const saved = window.localStorage.getItem("debate-chess-clock-sound-enabled");
  return saved === null ? true : saved === "true";
}

export function setSoundEnabled(enabled: boolean): void {
  window.localStorage.setItem("debate-chess-clock-sound-enabled", String(enabled));
}
