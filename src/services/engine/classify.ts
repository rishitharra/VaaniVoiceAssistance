import { CLASSIFY } from '../../config';
import type { Phone } from '../phonemes/inventory';
import type { SoundOccurrence, SoundReport, SoundStatus, WordResult } from './types';

/**
 * Per-sound verdicts.
 *  practice  : wrong in >= minErrorWords distinct words AND >= minErrorRate of checked occurrences
 *  uncertain : too little clean evidence, or some errors that don't meet the recurrence rule
 *  matched   : otherwise
 */
export function classifySounds(words: WordResult[]): SoundReport[] {
  const byPhone = new Map<Phone, SoundOccurrence[]>();
  for (const w of words) {
    for (const p of w.phones) {
      if (!byPhone.has(p.expected)) byPhone.set(p.expected, []);
      byPhone.get(p.expected)!.push({
        wordIndex: w.index, word: w.text, status: p.status, observed: p.observed,
      });
    }
  }

  const reports: SoundReport[] = [];
  for (const [phone, occ] of byPhone) {
    const checked = occ.filter((o) => o.status !== 'uncertain');
    const errors = checked.filter((o) => o.status === 'error');
    const errorWords = [...new Set(errors.map((o) => o.word.toLowerCase()))];
    const errorRate = checked.length ? errors.length / checked.length : 0;

    let status: SoundStatus;
    if (errorWords.length >= CLASSIFY.minErrorWords && errorRate >= CLASSIFY.minErrorRate) status = 'practice';
    else if (checked.length < 2 || checked.length / occ.length < 0.7 || errorWords.length > 0) status = 'uncertain';
    else status = 'matched';

    reports.push({ phone, status, occurrences: occ, errorWords, errorRate });
  }

  const rank: Record<SoundStatus, number> = { practice: 0, uncertain: 1, matched: 2 };
  return reports.sort((a, b) => rank[a.status] - rank[b.status] || b.errorRate - a.errorRate);
}
