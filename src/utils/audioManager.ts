export type SFXType = 'correct' | 'wrong' | 'streak5' | 'end';

const SFX_URLS: Record<SFXType, string> = {
  correct: '/true.mp3',
  wrong: '/false.mp3',
  streak5: '/streak5.mp3',
  end: '/end.mp3',
};

let audioCtx: AudioContext | null = null;
const bufferCache = new Map<SFXType, AudioBuffer>();
const loadingPromises = new Map<SFXType, Promise<AudioBuffer | null>>();
let unlockedOnce = false;
let globalListenersAttached = false;

/**
 * Configures iOS WebKit AudioSession (iOS 16.4+/17+/18+) to 'ambient'
 * so app sound effects and audio mix with Spotify / Apple Music instead of pausing them.
 */
export function setAmbientAudioSession(): void {
  try {
    const nav = navigator as Navigator & {
      audioSession?: { type: string };
    };
    if (nav.audioSession && nav.audioSession.type !== 'ambient') {
      nav.audioSession.type = 'ambient';
    }
  } catch {
    // Ignore when AudioSession API is unavailable
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) {
    audioCtx = new AudioCtx();
  }
  return audioCtx;
}

function decodeAudioDataCompat(ctx: AudioContext, arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    try {
      const maybePromise = ctx.decodeAudioData(
        arrayBuffer,
        (decoded) => resolve(decoded),
        (err) => reject(err)
      );
      if (maybePromise && typeof (maybePromise as Promise<AudioBuffer>).then === 'function') {
        (maybePromise as Promise<AudioBuffer>).then(resolve, reject);
      }
    } catch (err) {
      reject(err);
    }
  });
}

async function loadSFXBuffer(type: SFXType): Promise<AudioBuffer | null> {
  const cached = bufferCache.get(type);
  if (cached) return cached;

  const existing = loadingPromises.get(type);
  if (existing) return existing;

  const ctx = getAudioContext();
  if (!ctx) return null;

  const promise = (async () => {
    try {
      const response = await fetch(SFX_URLS[type]);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0) return null;
      const decoded = await decodeAudioDataCompat(ctx, arrayBuffer);
      bufferCache.set(type, decoded);
      return decoded;
    } catch {
      return null;
    } finally {
      loadingPromises.delete(type);
    }
  })();

  loadingPromises.set(type, promise);
  return promise;
}

export function preloadAllSFX(): void {
  (Object.keys(SFX_URLS) as SFXType[]).forEach((type) => {
    void loadSFXBuffer(type);
  });
}

/**
 * Unlocks/resumes Web Audio API inside a user gesture (critical for iOS Home Screen PWA
 * and recovering from iOS 'interrupted' state after switching back from Spotify).
 */
export function unlockAudio(): void {
  setAmbientAudioSession();
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state !== 'running') {
    ctx.resume().catch(() => {});
  }

  if (!unlockedOnce || ctx.state !== 'running') {
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      unlockedOnce = true;
    } catch {
      // Ignore silent unlock failure
    }
  }

  preloadAllSFX();
}

function playDecodedBuffer(ctx: AudioContext, buffer: AudioBuffer, volume: number): void {
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gainNode = ctx.createGain();
  gainNode.gain.value = Math.max(0, Math.min(1, volume));

  source.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start(0);
}

/**
 * Plays a quiz sound effect via Web Audio API so it works reliably in iOS standalone PWAs
 * and mixes cleanly over background music apps like Spotify.
 */
export function playSFX(type: SFXType, volume = 0.7): void {
  setAmbientAudioSession();
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state !== 'running') {
    ctx.resume().catch(() => {});
  }

  const cached = bufferCache.get(type);
  if (cached) {
    try {
      playDecodedBuffer(ctx, cached, volume);
    } catch {
      // Ignore playback error
    }
    return;
  }

  void loadSFXBuffer(type).then((buffer) => {
    if (!buffer) return;
    const activeCtx = getAudioContext();
    if (!activeCtx) return;
    if (activeCtx.state !== 'running') {
      activeCtx.resume().catch(() => {});
    }
    try {
      playDecodedBuffer(activeCtx, buffer, volume);
    } catch {
      // Ignore playback error
    }
  });
}

export function initGlobalAudioUnlock(): () => void {
  if (typeof window === 'undefined') return () => {};
  setAmbientAudioSession();

  if (globalListenersAttached) {
    return () => {};
  }
  globalListenersAttached = true;

  const handleGesture = () => {
    unlockAudio();
  };

  const handleVisibilityOrFocus = () => {
    if (document.visibilityState === 'visible') {
      setAmbientAudioSession();
      const ctx = getAudioContext();
      if (ctx && ctx.state !== 'running') {
        ctx.resume().catch(() => {});
      }
    }
  };

  document.addEventListener('touchstart', handleGesture, { passive: true });
  document.addEventListener('pointerdown', handleGesture, { passive: true });
  document.addEventListener('click', handleGesture, { passive: true });
  document.addEventListener('visibilitychange', handleVisibilityOrFocus);
  window.addEventListener('pageshow', handleVisibilityOrFocus);
  window.addEventListener('focus', handleVisibilityOrFocus);

  return () => {
    globalListenersAttached = false;
    document.removeEventListener('touchstart', handleGesture);
    document.removeEventListener('pointerdown', handleGesture);
    document.removeEventListener('click', handleGesture);
    document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    window.removeEventListener('pageshow', handleVisibilityOrFocus);
    window.removeEventListener('focus', handleVisibilityOrFocus);
  };
}
