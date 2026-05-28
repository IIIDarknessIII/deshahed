// Audio alert for newly fired air-raid alerts in the user's subscribed oblast.
// Two layers run in sequence: a Web-Audio siren sweep and a Ukrainian TTS
// announcement of the oblast title. Both require an explicit user gesture
// before the AudioContext / speechSynthesis are allowed to make sound — the
// SoundToggle component handles that gesture.

const LS_ENABLED = "deshahed.soundEnabled";
const LS_REGION = "deshahed.pushRegion";
const COOLDOWN_MS = 12_000;

let ctx: AudioContext | null = null;
let lastFiredAt = 0;

export function soundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(LS_ENABLED) === "1";
}

export function setSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  if (enabled) localStorage.setItem(LS_ENABLED, "1");
  else localStorage.removeItem(LS_ENABLED);
  window.dispatchEvent(new CustomEvent("deshahed:soundChange"));
}

export function subscribedOblast(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_REGION);
}

/** Build / resume the AudioContext under a user gesture so subsequent
 *  playback works even in tabs the user has already left focus on. */
export async function unlockAudio(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") await ctx.resume();
}

/** WW2-style sweep siren, 2 cycles, ~3 seconds total. */
function playSiren(duration = 3): void {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.18, t0 + 0.1);
  gain.gain.setValueAtTime(0.18, t0 + duration - 0.15);
  gain.gain.linearRampToValueAtTime(0, t0 + duration);
  const half = duration / 2;
  osc.frequency.setValueAtTime(440, t0);
  osc.frequency.linearRampToValueAtTime(880, t0 + half);
  osc.frequency.linearRampToValueAtTime(440, t0 + duration);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/** Speak the oblast name in Ukrainian. */
function speakOblast(oblast: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(`Повітряна тривога. ${oblast}.`);
  u.lang = "uk-UA";
  u.rate = 1;
  u.pitch = 1;
  u.volume = 1;
  // Pick a Ukrainian voice if one's installed, else let the OS choose.
  const voices = window.speechSynthesis.getVoices();
  const uk = voices.find((v) => v.lang?.toLowerCase().startsWith("uk"));
  if (uk) u.voice = uk;
  window.speechSynthesis.speak(u);
}

/** Trigger sound for a new alert if it matches the user's subscription. */
export function notifyAlertStarted(oblastTitle: string): void {
  if (!soundEnabled()) return;
  const region = subscribedOblast();
  // null region means "all of Ukraine" — siren everywhere is too noisy, so
  // only play when the user has picked a specific oblast.
  if (!region || region !== oblastTitle) return;
  const now = Date.now();
  if (now - lastFiredAt < COOLDOWN_MS) return;
  lastFiredAt = now;
  // The AudioContext may still be suspended if the toggle was flipped off
  // and back on; resume() returns a Promise but we don't await — the siren
  // schedule is fine to skip a tick if context isn't ready yet.
  if (ctx && ctx.state === "suspended") void ctx.resume();
  playSiren();
  // Stagger TTS so the siren finishes first.
  setTimeout(() => speakOblast(oblastTitle), 3_200);
}
