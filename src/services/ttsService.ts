/**
 * Reference voice.
 *  natural: Kokoro-82M in a worker (optional ~90 MB download, runs offline after)
 *  basic:   the browser's built-in speech synthesis (no download, sounds robotic)
 */
import { BASIC_VOICE_RATE, ENGINE } from '../config';
import { acousticEngine } from './acousticEngine';
import { resample } from './audio/pcm';
import type { WordResult } from './engine/types';
import type { TtsIn, TtsOut } from './tts/tts.worker';

export interface SynthResult { pcm: Float32Array; sampleRate: number; words: WordResult[] }

class NaturalVoice {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: { audio: Float32Array; sampleRate: number }) => void; reject: (e: Error) => void }>();
  private cache = new Map<string, Promise<SynthResult>>();
  private audioCache = new Map<string, Promise<{ audio: Float32Array; sampleRate: number }>>();
  private onDownload: ((l: number, t: number) => void) | null = null;

  private getWorker() {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./tts/tts.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<TtsOut>) => {
      const m = e.data;
      if (m.type === 'download') this.onDownload?.(m.loaded, m.total);
      else if (m.type === 'audio') { this.pending.get(m.id)?.resolve(m); this.pending.delete(m.id); }
      else if (m.type === 'error' && m.id !== undefined) { this.pending.get(m.id)?.reject(new Error(m.message)); this.pending.delete(m.id); }
    };
    w.addEventListener('error', () => {
      for (const request of this.pending.values()) request.reject(new Error('The reference voice stopped. Please retry.'));
      this.pending.clear(); this.ready = null; this.worker = null; this.cache.clear(); this.audioCache.clear(); w.terminate();
    });
    return (this.worker = w);
  }

  load(onDownload?: (loaded: number, total: number) => void): Promise<void> {
    if (onDownload) this.onDownload = onDownload;
    if (this.ready) return this.ready;
    const w = this.getWorker();
    this.ready = new Promise((resolve, reject) => {
      const h = (e: MessageEvent<TtsOut>) => {
        if (e.data.type === 'ready') { w.removeEventListener('message', h); resolve(); }
        if (e.data.type === 'error' && e.data.id === undefined) {
          w.removeEventListener('message', h);
          this.ready = null;
          reject(new Error(e.data.message));
        }
      };
      w.addEventListener('error', () => reject(new Error('The reference voice could not start.')), { once: true });
      w.addEventListener('message', h);
      w.postMessage({ type: 'load' } satisfies TtsIn);
    });
    return this.ready;
  }

  /** Synthesize text (no word timing). */
  audio(text: string): Promise<{ audio: Float32Array; sampleRate: number }> {
    let p = this.audioCache.get(text);
    if (!p) {
      p = this.load().then(() => new Promise((resolve, reject) => {
        const id = this.nextId++;
        this.pending.set(id, { resolve, reject });
        this.getWorker().postMessage({ type: 'speak', id, text } satisfies TtsIn);
      }));
      p.catch(() => this.audioCache.delete(text));
      this.audioCache.set(text, p);
    }
    return p;
  }

  /** Synthesize text and time each word (via the phoneme engine) for highlighting. */
  synth(text: string): Promise<SynthResult> {
    let p = this.cache.get(text);
    if (!p) {
      p = (async () => {
        const { audio, sampleRate } = await this.audio(text);
        const words = await acousticEngine.timeWords(await resample(audio, sampleRate, ENGINE.sampleRate), text);
        return { pcm: audio, sampleRate, words };
      })();
      p.catch(() => this.cache.delete(text));
      this.cache.set(text, p);
    }
    return p;
  }
}

export const naturalVoice = new NaturalVoice();

/** Built-in speech synthesis, preferring an on-device American English voice. */
export function speakBasic(text: string, onWord: (charIndex: number) => void, onEnd: () => void): () => void {
  const synth = window.speechSynthesis;
  if (!synth) { onEnd(); return () => {}; }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices().filter((v) => v.lang.replace('_', '-').startsWith('en-US'));
  u.voice = voices.find((v) => v.localService) ?? voices[0] ?? null;
  u.lang = 'en-US';
  u.rate = BASIC_VOICE_RATE;
  u.onboundary = (e) => { if (e.name === 'word' || e.name === undefined) onWord(e.charIndex); };
  u.onend = onEnd;
  u.onerror = onEnd;
  synth.speak(u);
  return () => synth.cancel();
}

export const basicVoiceAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Say a word or short phrase in the chosen reference voice. Returns a stop function. */
export async function pronounce(text: string, useNatural: boolean, onEnd: () => void): Promise<() => void> {
  if (useNatural) {
    const { audio, sampleRate } = await naturalVoice.audio(text);
    const { playRange } = await import('./audio/pcm');
    const pb = playRange(audio, sampleRate, 0, audio.length / sampleRate, onEnd);
    return pb.stop;
  }
  return speakBasic(text, () => {}, onEnd);
}
