import { CANON, ipaToCanon, MERGEABLE_IPA } from '../phonemes/inventory';

/** Number of phone classes in the posterior matrix: canonical phones + blank (last). */
export const NUM_CLASSES = CANON.length + 1;
export const BLANK_CLASS = CANON.length;
import type { RecognizedPhone } from './types';

/** Per-frame argmax id, its probability, and log-posteriors per phone class. */
export interface FrameStream {
  ids: Int32Array;
  probs: Float32Array;
  /** [T * NUM_CLASSES] log P(class | frame); blank class last */
  cls: Float32Array;
}

/**
 * Vocab id -> phone class (0..CANON.length-1), BLANK_CLASS for blank/delimiters,
 * -1 for tokens to drop (e.g. <unk>, multi-phone tokens).
 */
export function buildClassMap(vocab: Vocab): Int16Array {
  const map = new Int16Array(vocab.id2token.length).fill(-1);
  vocab.id2token.forEach((tok, id) => {
    if (id === vocab.blankId || vocab.ignoreIds.has(id)) { map[id] = BLANK_CLASS; return; }
    // Multi-sound tokens (some espeak vocabularies) count as their first sound,
    // so their probability mass isn't lost from the posteriors.
    const ph = ipaToCanon(tok);
    if (ph.length >= 1) map[id] = CANON.indexOf(ph[0]);
  });
  return map;
}

const NEG = -1e4;

/** logits: flat [T * V] row-major. */
export function framesFromLogits(logits: Float32Array, T: number, V: number, classMap: Int16Array): FrameStream {
  const ids = new Int32Array(T);
  const probs = new Float32Array(T);
  const cls = new Float32Array(T * NUM_CLASSES);
  const acc = new Float64Array(NUM_CLASSES);
  for (let t = 0; t < T; t++) {
    const off = t * V;
    let best = 0;
    let max = -Infinity;
    for (let v = 0; v < V; v++) {
      const x = logits[off + v];
      if (x > max) { max = x; best = v; }
    }
    let sum = 0;
    acc.fill(0);
    for (let v = 0; v < V; v++) {
      const e = Math.exp(logits[off + v] - max);
      sum += e;
      const c = classMap[v];
      if (c >= 0) acc[c] += e;
    }
    ids[t] = best;
    probs[t] = 1 / sum;
    const logSum = Math.log(sum);
    for (let c = 0; c < NUM_CLASSES; c++) cls[t * NUM_CLASSES + c] = acc[c] > 0 ? Math.log(acc[c]) - logSum : NEG;
  }
  return { ids, probs, cls };
}

/** Frames of pure blank, used to pad chunks that came back short. */
export function blankFrames(n: number, blankId: number): FrameStream {
  const cls = new Float32Array(n * NUM_CLASSES).fill(NEG);
  for (let t = 0; t < n; t++) cls[t * NUM_CLASSES + BLANK_CLASS] = 0;
  return { ids: new Int32Array(n).fill(blankId), probs: new Float32Array(n).fill(1), cls };
}

export interface Vocab {
  id2token: string[];
  /** CTC blank */
  blankId: number;
  /** Ids to ignore entirely: word delimiter, <s>, </s>, <unk> ... */
  ignoreIds: Set<number>;
}

interface RawToken { text: string; startFrame: number; endFrame: number; conf: number }

/**
 * Collapse repeats, drop blanks -> timed phone list.
 * `frameSec` converts frame index to seconds.
 */
export function decodeCtc(frames: FrameStream, vocab: Vocab, frameSec: number): RecognizedPhone[] {
  const raw: RawToken[] = [];
  let prev = -1;
  for (let t = 0; t < frames.ids.length; t++) {
    const id = frames.ids[t];
    const p = frames.probs[t];
    if (id === vocab.blankId || vocab.ignoreIds.has(id)) {
      prev = id;
      continue;
    }
    if (id === prev && raw.length) {
      const last = raw[raw.length - 1];
      last.endFrame = t;
      last.conf = Math.max(last.conf, p);
    } else {
      raw.push({ text: vocab.id2token[id] ?? '', startFrame: t, endFrame: t, conf: p });
    }
    prev = id;
  }

  // Merge diphthongs/affricates split across two adjacent tokens (e.g. "a" + "ɪ").
  const merged: RawToken[] = [];
  for (const tok of raw) {
    const last = merged[merged.length - 1];
    if (last && tok.startFrame - last.endFrame <= 2 && MERGEABLE_IPA.has(last.text + tok.text)) {
      last.text += tok.text;
      last.endFrame = tok.endFrame;
      last.conf = Math.min(last.conf, tok.conf);
    } else {
      merged.push({ ...tok });
    }
  }

  const out: RecognizedPhone[] = [];
  merged.forEach((tok, i) => {
    const phones = ipaToCanon(tok.text);
    if (!phones.length) return;
    const start = tok.startFrame * frameSec;
    // CTC spikes are narrow; extend to the next token (capped) for usable spans.
    const nextStart = merged[i + 1]?.startFrame ?? tok.endFrame + 8;
    const endFrame = Math.min(nextStart, tok.endFrame + 12);
    const end = Math.max(endFrame, tok.endFrame + 1) * frameSec;
    const step = (end - start) / phones.length;
    phones.forEach((phone, k) =>
      out.push({
        phone,
        token: tok.text,
        start: start + k * step,
        end: start + (k + 1) * step,
        confidence: tok.conf,
      }),
    );
  });
  return out;
}

/** Frames [a, b) of a stream. */
export function sliceFrames(f: FrameStream, a: number, b: number): FrameStream {
  return { ids: f.ids.slice(a, b), probs: f.probs.slice(a, b), cls: f.cls.slice(a * NUM_CLASSES, b * NUM_CLASSES) };
}

/** Concatenate frame streams from consecutive chunks. */
export function concatFrames(parts: FrameStream[]): FrameStream {
  const n = parts.reduce((a, p) => a + p.ids.length, 0);
  const ids = new Int32Array(n);
  const probs = new Float32Array(n);
  const cls = new Float32Array(n * NUM_CLASSES);
  let o = 0;
  for (const p of parts) {
    ids.set(p.ids, o);
    probs.set(p.probs, o);
    cls.set(p.cls, o * NUM_CLASSES);
    o += p.ids.length;
  }
  return { ids, probs, cls };
}
