/**
 * Turns GOP scores into verdicts.
 *
 * A score on its own is not comparable across speakers, microphones or sounds:
 * the model is simply harsher on some sounds than others. So a sound counts as
 * an error only when every enabled rule agrees:
 *   1. absolute   - the alternative beats the expected sound by a clear margin
 *                   (per-sound leniency from PHONE_MARGIN),
 *   2. session    - the score is an outlier within this reading,
 *   3. history    - the score is an outlier against the speaker's own history,
 *   4. decoded    - the free decoding also judged it wrong,
 *   5. cross-check- the optional second model flags it too.
 * Rules 2-5 switch off automatically when there isn't enough data.
 */
import { expItemsForWord, isBoundaryAmbiguous } from './align';
import { GOP, PHONE_MARGIN, SCORING } from '../../config';
import type { Phone } from '../phonemes/inventory';
import type { TextWord } from '../phonemes/lexicon';
import type { PhoneScore } from './gop';
import type { WordResult } from './types';

/** Running per-sound score statistics for one speaker (Welford). */
export interface PhoneStat { n: number; mean: number; m2: number }
export type PhoneStats = Partial<Record<Phone, PhoneStat>>;

export function sd(s: PhoneStat): number {
  return s.n > 1 ? Math.sqrt(s.m2 / (s.n - 1)) : 0;
}

export function updateStats(stats: PhoneStats, scores: { phone: Phone; gop: number }[]): PhoneStats {
  const out: PhoneStats = { ...stats };
  for (const { phone, gop } of scores) {
    if (!Number.isFinite(gop)) continue;
    const s = out[phone] ?? { n: 0, mean: 0, m2: 0 };
    const n = s.n + 1;
    const d = gop - s.mean;
    const mean = s.mean + d / n;
    out[phone] = { n, mean, m2: s.m2 + d * (gop - mean) };
  }
  return out;
}

function medianMad(values: number[]): { median: number; mad: number } {
  const v = [...values].sort((a, b) => a - b);
  const med = v[v.length >> 1];
  const dev = v.map((x) => Math.abs(x - med)).sort((a, b) => a - b);
  return { median: med, mad: dev[dev.length >> 1] * 1.4826 }; // scaled to a standard deviation
}

export interface DecideInput {
  words: WordResult[];
  textWords: TextWord[];
  primary: PhoneScore[][];
  alt?: PhoneScore[][];
  history?: PhoneStats;
}

/** Applies verdicts to `words` and returns the scores used (for calibration and diagnostics). */
export function decidePhones({ words, textWords, primary, alt, history }: DecideInput): { phone: Phone; gop: number }[] {
  const scores: { phone: Phone; gop: number }[] = [];
  words.forEach((w, wi) =>
    w.phones.forEach((p, i) => {
      const g = primary[wi]?.[i]?.gop;
      if (Number.isFinite(g)) scores.push({ phone: p.expected, gop: g });
    }),
  );

  const useSession = SCORING.sessionRelative && scores.length >= SCORING.sessionMinPhones;
  const { median, mad } = useSession ? medianMad(scores.map((s) => s.gop)) : { median: 0, mad: 0 };
  const sessionFloor = median - SCORING.sessionK * Math.max(mad, 0.25);

  words.forEach((w, wi) => {
    const rows = primary[wi];
    if (!rows) return;
    const context = expItemsForWord(w, textWords[wi]?.isFunctionWord ?? false);
    if (context.length) context[context.length - 1].nextWordPhone = words[wi + 1]?.phones[0]?.expected;
    w.phones.forEach((r, i) => {
      r.decoded = { status: r.status, observed: r.observed };
      const { gop, alt: altPhone } = rows[i] ?? { gop: NaN, alt: null };
      if (w.status === 'unclear' || w.timingEstimated ||
          (isBoundaryAmbiguous(context[i]) && (r.observed === null || r.status !== 'ok'))) {
        r.status = 'uncertain';
        r.reason = 'low-confidence';
        return;
      }
      const altScore = alt?.[wi]?.[i];
      r.gop = Number.isFinite(gop) ? gop : undefined;
      r.gopAlt = altScore && Number.isFinite(altScore.gop) ? altScore.gop : undefined;

      if (!Number.isFinite(gop)) {
        // Not scorable (word unclear or mistimed): leave the decoded verdict,
        // but never let it stand as a hard error on its own.
        if (r.status === 'error') { r.status = 'uncertain'; r.reason = 'low-confidence'; }
        return;
      }

      const margin = GOP.errorMargin + (PHONE_MARGIN[r.expected] ?? 0);
      const hit = [gop <= -margin];
      if (useSession) hit.push(gop <= sessionFloor);
      const h = history?.[r.expected];
      if (SCORING.historyRelative && h && h.n >= SCORING.historyMinCount && sd(h) > 0) {
        hit.push(gop <= h.mean - SCORING.historyK * sd(h));
      }
      if (SCORING.requireDecodedAgreement) hit.push(r.decoded.status === 'error');
      if (altScore) hit.push(Number.isFinite(altScore.gop) && altScore.gop <= -margin);

      if (hit.every(Boolean)) {
        r.status = 'error';
        r.reason = altPhone ? 'substituted' : 'deleted';
        r.observed = altPhone;
      } else if (gop >= GOP.okMargin && (!alt || !!altScore && Number.isFinite(altScore.gop) && altScore.gop >= GOP.okMargin)) {
        r.status = 'ok';
        r.reason = 'match';
        r.observed = r.expected;
      } else {
        r.status = 'uncertain';
        r.reason = 'low-confidence';
        r.observed = altPhone;
      }
    });
    if (w.status !== 'unclear') w.status = w.phones.some((p) => p.status === 'error') ? 'has-error' : 'ok';
  });

  // Only usable, assessed evidence contributes to future calibration.
  return words.filter(w => w.status !== 'unclear').flatMap(w => w.phones
    .filter(p => p.status !== 'uncertain' && Number.isFinite(p.gop))
    .map(p => ({phone:p.expected, gop:p.gop!})));
}
