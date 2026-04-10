let sharedAudioContext: AudioContext | null = null;
let sharedMasterNode: GainNode | null = null;
let lastPlayedAt = 0;
let lastRingPlayedAt = 0;

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

const getMasterNode = (ctx: AudioContext) => {
  if (sharedMasterNode) return sharedMasterNode;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-24, ctx.currentTime);
  compressor.knee.setValueAtTime(30, ctx.currentTime);
  compressor.ratio.setValueAtTime(12, ctx.currentTime);
  compressor.attack.setValueAtTime(0.003, ctx.currentTime);
  compressor.release.setValueAtTime(0.2, ctx.currentTime);

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.95, ctx.currentTime);

  compressor.connect(master);
  master.connect(ctx.destination);
  sharedMasterNode = master;

  return {
    compressor,
    master,
  };
};

const connectToMaster = (ctx: AudioContext, source: AudioNode) => {
  const destination = getMasterNode(ctx);
  if (destination instanceof GainNode) {
    source.connect(destination);
    return;
  }
  source.connect(destination.compressor);
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
    gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.34);
    connectToMaster(ctx, gain);

    const oscPrimary = ctx.createOscillator();
    oscPrimary.type = 'square';
    oscPrimary.frequency.setValueAtTime(1020, startAt);
    oscPrimary.frequency.setValueAtTime(760, startAt + 0.14);
    oscPrimary.connect(gain);
    oscPrimary.start(startAt);
    oscPrimary.stop(startAt + 0.35);

    const oscSecondary = ctx.createOscillator();
    oscSecondary.type = 'triangle';
    oscSecondary.frequency.setValueAtTime(510, startAt);
    oscSecondary.frequency.setValueAtTime(430, startAt + 0.14);
    oscSecondary.connect(gain);
    oscSecondary.start(startAt);
    oscSecondary.stop(startAt + 0.35);
  } catch {
    // Ignore audio restrictions.
  }
};

export const playNotificationRing = async (repeat = 3) => {
  const now = Date.now();
  if (now - lastRingPlayedAt < 1200) return;
  lastRingPlayedAt = now;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const loops = Math.max(1, Math.min(repeat, 10));
    const gap = 0.38;
    const toneDuration = 0.28;
    const startAt = ctx.currentTime;

    for (let i = 0; i < loops; i += 1) {
      const toneStart = startAt + i * gap;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, toneStart);
      gain.gain.exponentialRampToValueAtTime(0.24, toneStart + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + toneDuration);
      connectToMaster(ctx, gain);

      const oscPrimary = ctx.createOscillator();
      oscPrimary.type = 'square';
      oscPrimary.frequency.setValueAtTime(1120, toneStart);
      oscPrimary.frequency.setValueAtTime(860, toneStart + 0.12);
      oscPrimary.connect(gain);
      oscPrimary.start(toneStart);
      oscPrimary.stop(toneStart + toneDuration + 0.01);

      const oscSecondary = ctx.createOscillator();
      oscSecondary.type = 'triangle';
      oscSecondary.frequency.setValueAtTime(560, toneStart);
      oscSecondary.frequency.setValueAtTime(430, toneStart + 0.12);
      oscSecondary.connect(gain);
      oscSecondary.start(toneStart);
      oscSecondary.stop(toneStart + toneDuration + 0.01);
    }
  } catch {
    // Ignore audio restrictions.
  }
};
