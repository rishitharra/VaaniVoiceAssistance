import { CLASSIFY } from '../../config';
import { isVowel, phoneClass, type Phone } from '../phonemes/inventory';
import type { ExpectedPhone, TextWord } from '../phonemes/lexicon';
import type { PhoneResult, RecognizedPhone, WordResult } from './types';

export interface ExpItem extends ExpectedPhone {
  wordIndex: number;
  pos: number;
  isLast: boolean;
  prev: Phone | null;
  isFunction: boolean;
  nextWordPhone?: Phone | null;
}

type Op =
  | { kind: 'diag'; e: number; r: number }
  | { kind: 'del'; e: number }
  | { kind: 'ins'; r: number };

/** Vowels that are routinely reduced to schwa/ɪ when unstressed. */
const REDUCIBLE = new Set<Phone>(['AH', 'IH', 'EH', 'UH', 'UW', 'IY', 'OW']);

/**
 * Normal General American realizations that must NOT count as errors.
 * Returns true if hearing `r` for expected `e` is acceptable.
 */
export function isAcceptedVariant(e: ExpItem, r: Phone): boolean {
  if (r === e.phone) return true;
  // Flapping: "water", "better", "pointed"
  if ((e.phone === 'T' || e.phone === 'D') && r === 'DX') return true;
  // Glottal/flap confusion between T and D in the middle of words
  if (e.phone === 'T' && r === 'D' && !e.isLast && e.pos > 0) return true;
  // Unstressed vowel reduction: "Joseph", "island", "usually"
  if (isVowel(e.phone) && e.stress === 0 && REDUCIBLE.has(e.phone) && (r === 'AH' || r === 'IH')) return true;
  // Function words reduce freely: "to" -> tə, "and" -> ən
  if (e.isFunction && isVowel(e.phone) && isVowel(r)) return true;
  return false;
}

/** Deletions that are normal in connected speech. */
export function isAcceptedDeletion(e: ExpItem): boolean {
  // A shared closure can hide the first of two adjacent stops ("would be").
  // This is ambiguity, not evidence of correctness; decide.ts keeps it uncertain.
  if (isBoundaryAmbiguous(e)) return true;
  // Cluster reduction at word end: "last June", "found", "and"
  if ((e.phone === 'T' || e.phone === 'D') && e.isLast && e.prev && !isVowel(e.prev)) return true;
  // h-dropping in function words: "him", "her", "have"
  if (e.phone === 'HH' && e.isFunction) return true;
  // Schwa elision / syllabic consonants: "family", "button"
  if (e.phone === 'AH' && e.stress === 0) return true;
  return false;
}

export function isBoundaryAmbiguous(e: ExpItem): boolean {
  return e.isLast && !!e.nextWordPhone &&
    (['T', 'D'].includes(e.phone) && ['P', 'B', 'K', 'G', 'T', 'D', 'M', 'N'].includes(e.nextWordPhone)
      || e.phone === e.nextWordPhone && !isVowel(e.phone));
}

function subCost(e: ExpItem, r: Phone): number {
  if (isAcceptedVariant(e, r)) return 0;
  const ce = phoneClass(e.phone);
  const cr = phoneClass(r);
  if (ce === cr) return 0.6;
  if (ce === 'vowel' || cr === 'vowel') return 2.0; // prefer del+ins over vowel<->consonant
  return 1.0;
}
const delCost = (e: ExpItem) => (isAcceptedDeletion(e) ? 0.35 : 1.0);
const INS_COST = 0.9;

/** Needleman-Wunsch global alignment. */
function alignSeq(E: ExpItem[], R: RecognizedPhone[]): { cost: number; ops: Op[] } {
  const n = E.length;
  const m = R.length;
  const W = m + 1;
  const D = new Float64Array((n + 1) * W);
  const B = new Uint8Array((n + 1) * W); // 0 diag, 1 del (up), 2 ins (left)
  for (let i = 1; i <= n; i++) { D[i * W] = D[(i - 1) * W] + delCost(E[i - 1]); B[i * W] = 1; }
  for (let j = 1; j <= m; j++) { D[j] = D[j - 1] + INS_COST; B[j] = 2; }
  for (let i = 1; i <= n; i++) {
    const e = E[i - 1];
    const dc = delCost(e);
    for (let j = 1; j <= m; j++) {
      const diag = D[(i - 1) * W + j - 1] + subCost(e, R[j - 1].phone);
      const up = D[(i - 1) * W + j] + dc;
      const left = D[i * W + j - 1] + INS_COST;
      let best = diag;
      let b = 0;
      if (up < best) { best = up; b = 1; }
      if (left < best) { best = left; b = 2; }
      D[i * W + j] = best;
      B[i * W + j] = b;
    }
  }
  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const b = B[i * W + j];
    if (i > 0 && j > 0 && b === 0) { ops.push({ kind: 'diag', e: i - 1, r: j - 1 }); i--; j--; }
    else if (i > 0 && (b === 1 || j === 0)) { ops.push({ kind: 'del', e: i - 1 }); i--; }
    else { ops.push({ kind: 'ins', r: j - 1 }); j--; }
  }
  ops.reverse();
  return { cost: D[n * W + m], ops };
}

function expand(words: TextWord[], choice: number[]): ExpItem[] {
  const out: ExpItem[] = [];
  for (const w of words) {
    const v = w.variants[choice[w.index]];
    v.forEach((p, pos) =>
      out.push({
        ...p,
        wordIndex: w.index,
        pos,
        isLast: pos === v.length - 1,
        prev: pos > 0 ? v[pos - 1].phone : null,
        isFunction: w.isFunctionWord,
        nextWordPhone: words[w.index + 1]?.variants[choice[w.index + 1]]?.[0]?.phone,
      }),
    );
  }
  return out;
}

/** Pass 1 with primary pronunciations; pass 2 after picking the best CMUdict
 *  variant per word ("the" as ðə vs ði, "read" as riːd vs rɛd). */
function chooseVariants(words: TextWord[], rec: RecognizedPhone[]): number[] {
  const choice = words.map(() => 0);
  const E = expand(words, choice);
  const { ops } = alignSeq(E, rec);
  const span = new Map<number, [number, number]>();
  for (const op of ops) {
    if (op.kind !== 'diag') continue;
    const w = E[op.e].wordIndex;
    const s = span.get(w);
    span.set(w, s ? [Math.min(s[0], op.r), Math.max(s[1], op.r)] : [op.r, op.r]);
  }
  for (const w of words) {
    if (w.variants.length < 2) continue;
    const s = span.get(w.index);
    if (!s) continue;
    const slice = rec.slice(s[0], s[1] + 1);
    let best = 0;
    let bestCost = Infinity;
    w.variants.forEach((_, vi) => {
      const c = alignSeq(expand([{ ...w, index: 0 }], [vi]), slice).cost;
      if (c < bestCost - 1e-9) { bestCost = c; best = vi; }
    });
    choice[w.index] = best;
  }
  return choice;
}

export function alignWords(words: TextWord[], rec: RecognizedPhone[]): WordResult[] {
  if (!words.length) return [];
  const choice = chooseVariants(words, rec);
  const E = expand(words, choice);
  const { ops } = alignSeq(E, rec);

  const phoneRes: PhoneResult[] = new Array(E.length);
  const insertions: Phone[][] = words.map(() => []);
  let lastWord = 0;

  for (const op of ops) {
    if (op.kind === 'ins') {
      insertions[lastWord].push(rec[op.r].phone);
      continue;
    }
    const e = E[op.e];
    lastWord = e.wordIndex;
    if (op.kind === 'del') {
      const ok = isAcceptedDeletion(e);
      phoneRes[op.e] = {
        expected: e.phone, stress: e.stress, observed: null,
        status: ok ? 'ok' : 'error', reason: ok ? 'accepted-variant' : 'deleted',
        start: null, end: null,
      };
    } else {
      const r = rec[op.r];
      const exact = r.phone === e.phone;
      const accepted = isAcceptedVariant(e, r.phone);
      const lowConf = !accepted && r.confidence < CLASSIFY.minSubstitutionConfidence;
      phoneRes[op.e] = {
        expected: e.phone, stress: e.stress, observed: r.phone,
        status: accepted ? 'ok' : lowConf ? 'uncertain' : 'error',
        reason: exact ? 'match' : accepted ? 'accepted-variant' : lowConf ? 'low-confidence' : 'substituted',
        start: r.start, end: r.end,
      };
    }
  }

  // Assemble words
  const results: WordResult[] = [];
  let k = 0;
  for (const w of words) {
    const n = w.variants[choice[w.index]].length;
    const phones = phoneRes.slice(k, k + n);
    k += n;
    const timed = phones.filter((p) => p.start !== null);
    const bad = phones.filter((p) => p.reason === 'deleted' || p.reason === 'substituted' || p.reason === 'low-confidence').length;
    const heard = phones.filter((p) => p.observed !== null).length;
    const unclear = heard === 0 || (n >= 2 && bad / n >= CLASSIFY.unclearWordRatio);
    if (unclear) {
      // Skipped, misread or noisy word: no evidence either way for its sounds.
      for (const p of phones) {
        p.status = 'uncertain';
        p.reason = 'word-unclear';
      }
    }
    results.push({
      index: w.index, text: w.text, charStart: w.charStart, charEnd: w.charEnd,
      start: timed.length ? timed[0].start! : NaN,
      end: timed.length ? timed[timed.length - 1].end! : NaN,
      timingEstimated: !timed.length,
      status: unclear ? 'unclear' : phones.some((p) => p.status === 'error') ? 'has-error' : 'ok',
      phones,
      insertions: insertions[w.index],
    });
  }
  interpolateTimes(results, rec.length ? rec[rec.length - 1].end : 0);
  return results;
}

/** Give un-timed words a span between their timed neighbours. */
function interpolateTimes(ws: WordResult[], total: number) {
  for (let i = 0; i < ws.length; i++) {
    if (!ws[i].timingEstimated) continue;
    let j = i;
    while (j < ws.length && ws[j].timingEstimated) j++;
    const from = i > 0 ? ws[i - 1].end : 0;
    const to = j < ws.length ? ws[j].start : Math.max(from, total);
    const step = (to - from) / (j - i);
    for (let q = i; q < j; q++) {
      ws[q].start = from + (q - i) * step;
      ws[q].end = from + (q - i + 1) * step;
    }
    i = j - 1;
  }
}

/** Rebuild the tolerance context for one aligned word (used by GOP scoring). */
export function expItemsForWord(w: WordResult, isFunction: boolean): ExpItem[] {
  return w.phones.map((p, pos) => ({
    phone: p.expected,
    stress: p.stress,
    wordIndex: w.index,
    pos,
    isLast: pos === w.phones.length - 1,
    prev: pos > 0 ? w.phones[pos - 1].expected : null,
    isFunction,
  }));
}
