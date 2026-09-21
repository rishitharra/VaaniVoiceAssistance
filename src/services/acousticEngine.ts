import { ENGINE, PHONEME_MODEL } from '../config';
import { recordingQuality, rms } from './audio/pcm';
import type { ModelKey, WorkerIn, WorkerOut } from './engine/acoustic.worker';
import { alignWords } from './engine/align';
import { classifySounds } from './engine/classify';
import { decidePhones, type PhoneStats } from './engine/decide';
import { computeGop, type Posteriors } from './engine/gop';
import type { AnalysisResult, RecognizedPhone } from './engine/types';
import { tokenizeText } from './phonemes/lexicon';

export type { AnalysisResult } from './engine/types';

type DownloadCb = (loaded: number, total: number) => void;
interface Recognized { phones: RecognizedPhone[]; post: Posteriors; altPost?: Posteriors }

export interface AnalyzeOptions {
  /** Also run the second model and require both to agree before flagging */
  useAlt?: boolean;
  /** The speaker's per-sound score history, for calibration */
  history?: PhoneStats;
  onProgress?: (done: number, total: number) => void;
}

class AcousticEngine {
  private worker: Worker | null = null;
  private ready: Partial<Record<ModelKey, Promise<void> | null>> = {};
  private nextId = 1;
  private pending = new Map<number, {
    resolve: (r: Recognized) => void;
    reject: (e: Error) => void;
    onProgress?: (done: number, total: number) => void;
  }>();
  private downloadCb: Partial<Record<ModelKey, DownloadCb>> = {};

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./engine/acoustic.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === 'download') this.downloadCb[m.which]?.(m.loaded, m.total);
      else if (m.type === 'analyze-progress') this.pending.get(m.id)?.onProgress?.(m.done, m.total);
      else if (m.type === 'result') {
        this.pending.get(m.id)?.resolve({
          phones: m.phones,
          post: { data: m.posteriors, frames: m.frames },
          altPost: m.altPosteriors ? { data: m.altPosteriors, frames: m.frames } : undefined,
        });
        this.pending.delete(m.id);
      } else if (m.type === 'error' && m.id !== undefined) {
        this.pending.get(m.id)?.reject(new Error(m.message));
        this.pending.delete(m.id);
      }
    };
    w.addEventListener('error', () => {
      for (const request of this.pending.values()) request.reject(new Error('The speech engine stopped. Retry the recording; closing other tabs may help.'));
      this.pending.clear(); this.ready = {}; this.worker = null; w.terminate();
    });
    this.worker = w;
    return w;
  }

  /** Download (first run) or load from cache. Safe to call repeatedly. */
  load(which: ModelKey = 'primary', onDownload?: DownloadCb): Promise<void> {
    if (onDownload) this.downloadCb[which] = onDownload;
    const existing = this.ready[which];
    if (existing) return existing;
    const w = this.getWorker();
    const p = new Promise<void>((resolve, reject) => {
      const handler = (e: MessageEvent<WorkerOut>) => {
        const m = e.data;
        if (m.type === 'ready' && m.which === which) { w.removeEventListener('message', handler); resolve(); }
        if (m.type === 'error' && m.which === which) {
          w.removeEventListener('message', handler);
          this.ready[which] = null; // allow retry
          reject(new Error(m.message));
        }
      };
      w.addEventListener('error', () => reject(new Error('Speech model could not start. Please retry.')), { once: true });
      w.addEventListener('message', handler);
      w.postMessage({ type: 'load', which } satisfies WorkerIn);
    });
    this.ready[which] = p;
    return p;
  }

  private recognize(audio: Float32Array, useAlt: boolean, onProgress?: (d: number, t: number) => void): Promise<Recognized> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      // Copy so the caller keeps its buffer (we store it in the result).
      const copy = audio.slice();
      this.getWorker().postMessage({ type: 'analyze', id, audio: copy, useAlt } satisfies WorkerIn, [copy.buffer]);
    });
  }

  /** Word timings for clean audio of known text (used to sync the reference voice). */
  async timeWords(audio16k: Float32Array, text: string) {
    await this.load();
    return alignWords(tokenizeText(text), (await this.recognize(audio16k, false)).phones);
  }

  /** Full pipeline: 16 kHz PCM + the text that was read -> per-word and per-sound results. */
  async analyze(audio: Float32Array, text: string, opts: AnalyzeOptions = {}): Promise<AnalysisResult> {
    if (!audio.length || audio.some(x => !Number.isFinite(x))) throw new Error('Invalid recording. Please record again.');
    const durationSec = audio.length / ENGINE.sampleRate;
    if (durationSec < ENGINE.minDurationSec) throw new Error('Recording too short. Read the whole paragraph, then stop.');
    if (rms(audio) < 0.003) throw new Error('No speech detected. Check that the right microphone is selected.');

    await this.load();
    const useAlt = !!opts.useAlt;
    if (useAlt) await this.load('alt');

    const words = tokenizeText(text);
    const { phones: recognized, post, altPost } = await this.recognize(audio, useAlt, opts.onProgress);
    if (recognized.length < words.length * 0.3) {
      throw new Error('Too little speech was recognized to judge this reading. Try again closer to the mic.');
    }

    // 1) free decoding + alignment locates each word and catches skipped words,
    // 2) GOP scores every sound against its alternatives (optionally twice),
    // 3) the rules in decide.ts turn scores into verdicts.
    const wordResults = alignWords(words, recognized);
    const primary = computeGop(wordResults, words, post);
    const alt = altPost ? computeGop(wordResults, words, altPost) : undefined;
    const scores = decidePhones({ words: wordResults, textWords: words, primary, alt, history: opts.history });

    return {
      text,
      words: wordResults,
      sounds: classifySounds(wordResults),
      scores,
      recognized,
      audio,
      sampleRate: ENGINE.sampleRate,
      durationSec,
      quality: recordingQuality(audio),
      modelId: useAlt ? `${PHONEME_MODEL.id} + second model` : PHONEME_MODEL.id,
      createdAt: Date.now(),
    };
  }
}

export const acousticEngine = new AcousticEngine();
