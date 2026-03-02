let sharedAudioContext: AudioContext | null = null;
let lastPlayedAt = 0;

const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioContext) {
    sharedAudioContext = new Ctx();
  }
  return sharedAudioContext;
};

export const resumeNotificationAudio = async () => {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // Browser can block this until gesture timing is valid.
    }
  }
};

export const playNotificationBeep = async () => {
  const now = Date.now();
  if (now - lastPlayedAt < 350) return;
  lastPlayedAt = now;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const startAt = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.04, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.26);
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, startAt);
    osc.frequency.setValueAtTime(660, startAt + 0.11);
    osc.connect(gain);
    osc.start(startAt);
    osc.stop(startAt + 0.27);
  } catch {
    // Ignore audio restrictions.
  }
};

