import { ENGINE } from '../../config';

/** Decode any recorded blob and resample to 16 kHz mono Float32 PCM. */
export async function blobTo16kMono(blob: Blob): Promise<Float32Array> {
  const bytes = await blob.arrayBuffer();
  const tmp = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await tmp.decodeAudioData(bytes);
  } finally {
    tmp.close();
  }
  return renderMono(decoded, ENGINE.sampleRate, 80);
}

/** Resample mono PCM (e.g. 24 kHz TTS output -> 16 kHz for the recognizer). */
export async function resample(pcm: Float32Array, fromSr: number, toSr: number): Promise<Float32Array> {
  if (fromSr === toSr) return pcm;
  const src = new OfflineAudioContext(1, pcm.length, fromSr).createBuffer(1, pcm.length, fromSr);
  src.copyToChannel(new Float32Array(pcm), 0);
  return renderMono(src, toSr);
}

/** Render to mono at `sr`; optional high-pass removes rumble, hum and mic pops. */
async function renderMono(buf: AudioBuffer, sr: number, highPassHz = 0): Promise<Float32Array> {
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * sr)), sr);
  const node = off.createBufferSource();
  node.buffer = buf;
  if (highPassHz > 0) {
    const hp = off.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = highPassHz;
    node.connect(hp).connect(off.destination);
  } else {
    node.connect(off.destination); // multichannel is down-mixed to mono
  }
  node.start();
  const out = await off.startRendering();
  return out.getChannelData(0).slice();
}

/** RMS of the whole signal; used to reject silent recordings. */
export function rms(pcm: Float32Array): number {
  let s = 0;
  for (let i = 0; i < pcm.length; i++) s += pcm[i] * pcm[i];
  return Math.sqrt(s / Math.max(1, pcm.length));
}

/** Rough recording quality: speech-vs-noise ratio from 20 ms frame levels, and clipping. */
export function recordingQuality(pcm: Float32Array, sr = ENGINE.sampleRate) {
  const hop = Math.round(sr * 0.02);
  const levels: number[] = [];
  let clipped = 0;
  for (let i = 0; i + hop <= pcm.length; i += hop) {
    let s = 0;
    for (let j = i; j < i + hop; j++) {
      s += pcm[j] * pcm[j];
      if (Math.abs(pcm[j]) > 0.985) clipped++;
    }
    levels.push(Math.sqrt(s / hop) + 1e-6);
  }
  levels.sort((a, b) => a - b);
  const q = (p: number) => levels[Math.min(levels.length - 1, Math.floor(p * levels.length))] ?? 1e-6;
  return { snrDb: 20 * Math.log10(q(0.9) / q(0.1)), clippedRatio: clipped / Math.max(1, pcm.length) };
}

export interface Playback {
  stop: () => void;
  /** Position in the source recording, in seconds */
  position: () => number;
}

let ctx: AudioContext | null = null;
let current: { src: AudioBufferSourceNode; onEnd?: () => void } | null = null;

/** Stops whatever clip is playing (also used when speech synthesis starts). */
export function stopPlayback() {
  if (!current) return;
  const c = current;
  current = null;
  try { c.src.stop(); } catch { /* already stopped */ }
  c.onEnd?.();
}

/** Play [start, end] seconds of PCM. Only one clip plays at a time. */
export function playRange(pcm: Float32Array, sampleRate: number, start: number, end: number, onEnd?: () => void): Playback {
  ctx ??= new AudioContext();
  void ctx.resume();
  stopPlayback();
  const a = Math.max(0, Math.floor(start * sampleRate));
  const b = Math.min(pcm.length, Math.ceil(end * sampleRate));
  const buf = ctx.createBuffer(1, Math.max(1, b - a), sampleRate);
  buf.copyToChannel(pcm.slice(a, b), 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  const entry = { src, onEnd };
  src.onended = () => {
    if (current === entry) { current = null; onEnd?.(); }
  };
  const t0 = ctx.currentTime;
  src.start();
  current = entry;
  const clipStart = a / sampleRate;
  return {
    stop: () => { if (current === entry) stopPlayback(); },
    position: () => clipStart + (ctx!.currentTime - t0),
  };
}
