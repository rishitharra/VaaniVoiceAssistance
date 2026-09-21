/**
 * Goodness of Pronunciation (GOP) scoring on CTC posteriors.
 *
 * For every expected sound in a word, compare:
 *   ok  = best log-likelihood of the word with that sound pronounced acceptably
 *         (the dictionary sound or a normal American variant),
 *   bad = best log-likelihood with it replaced by any other sound, or dropped.
 * gop = ok - bad. This asks the model directly "was it this sound or another
 * one?", which is far more reliable than decoding free text and diffing it.
 */
import { ENGINE, GOP } from '../../config';
import { CANON, type Phone } from '../phonemes/inventory';
import type { TextWord } from '../phonemes/lexicon';
import { expItemsForWord, isAcceptedDeletion, isAcceptedVariant } from './align';
import { BLANK_CLASS, NUM_CLASSES } from './ctc';
import type { WordResult } from './types';

export interface Posteriors {
  /** [frames * NUM_CLASSES] log posteriors, blank class last */
  data: Float32Array;
  frames: number;
}

const NEG_INF = -Infinity;
function lse(a: number, b: number): number {
  if (a === NEG_INF) return b;
  if (b === NEG_INF) return a;
  return a > b ? a + Math.log1p(Math.exp(b - a)) : b + Math.log1p(Math.exp(a - b));
}

/**
 * CTC forward log-likelihood of `labels` over frames [t0, t1).
 * optPre / optSuf: the first / last label is neighbouring context that may be absent.
 */
export function ctcLogLik(post: Posteriors, t0: number, t1: number, labels: number[], optPre: boolean, optSuf: boolean): number {
  const P = post.data;
  const L = labels.length;
  if (t1 <= t0) return NEG_INF;
  if (L === 0) {
    let s = 0;
    for (let t = t0; t < t1; t++) s += P[t * NUM_CLASSES + BLANK_CLASS];
    return s;
  }
  const S = 2 * L + 1;
  let prev = new Float64Array(S).fill(NEG_INF);
  let cur = new Float64Array(S);
  const emit = (t: number, s: number) => P[t * NUM_CLASSES + (s & 1 ? labels[(s - 1) >> 1] : BLANK_CLASS)];

  prev[0] = emit(t0, 0);
  prev[1] = emit(t0, 1);
  if (optPre && L > 1) { prev[2] = emit(t0, 2); prev[3] = emit(t0, 3); }

  for (let t = t0 + 1; t < t1; t++) {
    for (let s = 0; s < S; s++) {
      let a = prev[s];
      if (s > 0) a = lse(a, prev[s - 1]);
      if (s > 1 && s & 1 && labels[(s - 1) >> 1] !== labels[(s - 3) >> 1]) a = lse(a, prev[s - 2]);
      cur[s] = a === NEG_INF ? NEG_INF : a + emit(t, s);
    }
    [prev, cur] = [cur, prev];
  }
  let end = lse(prev[S - 1], prev[S - 2]);
  if (optSuf && L > 1) end = lse(end, lse(prev[S - 3], prev[S - 4]));
  return end;
}

export interface PhoneScore { gop: number; alt: Phone | null }

/** GOP score for every sound of every clearly-read word. NaN where not scorable. */
export function computeGop(words: WordResult[], textWords: TextWord[], post: Posteriors): PhoneScore[][] {
  const out: PhoneScore[][] = words.map((w) => w.phones.map(() => ({ gop: NaN, alt: null })));
  const f = ENGINE.frameSec;
  const C = CANON.length;
  const idx = (p: string) => CANON.indexOf(p as (typeof CANON)[number]);

  words.forEach((w, wi) => {
    if (w.status === 'unclear' || w.timingEstimated || !w.phones.length) return;
    const items = expItemsForWord(w, textWords[wi]?.isFunctionWord ?? false);
    if (items.length) items[items.length - 1].nextWordPhone = words[wi + 1]?.phones[0]?.expected;
    const prevW = words[wi - 1];
    const nextW = words[wi + 1];
    const pre = prevW && prevW.status !== 'unclear' && prevW.phones.length ? idx(prevW.phones[prevW.phones.length - 1].expected) : -1;
    const suf = nextW && nextW.status !== 'unclear' && nextW.phones.length ? idx(nextW.phones[0].expected) : -1;

    const t0 = Math.max(0, Math.floor((w.start - GOP.windowPadSec) / f));
    const t1 = Math.min(post.frames, Math.ceil((w.end + GOP.windowPadSec) / f));
    const core = items.map((it) => idx(it.phone));
    const base = [...(pre >= 0 ? [pre] : []), ...core, ...(suf >= 0 ? [suf] : [])];
    const off = pre >= 0 ? 1 : 0;
    const ll = (seq: number[]) => ctcLogLik(post, t0, t1, seq, pre >= 0, suf >= 0);

    items.forEach((it, i) => {
      let ok = NEG_INF;
      let bad = NEG_INF;
      let badPhone: Phone | null = null;
      const seq = base.slice();
      for (let q = 0; q < C; q++) {
        seq[off + i] = q;
        const v = ll(seq);
        if (CANON[q] === it.phone || isAcceptedVariant(it, CANON[q])) ok = Math.max(ok, v);
        else if (v > bad) { bad = v; badPhone = CANON[q]; }
      }
      const del = ll([...base.slice(0, off + i), ...base.slice(off + i + 1)]);
      if (isAcceptedDeletion(it)) ok = Math.max(ok, del);
      else if (del > bad) { bad = del; badPhone = null; }

      const gop = ok - bad;
      out[wi][i] = { gop: Number.isFinite(gop) ? gop : NaN, alt: badPhone };
    });
  });
  return out;
}
