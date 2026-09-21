import type { AnalysisResult } from './types';
/** Conservative product gate, not a validated clinical accuracy threshold. */
export function isClearReading(r: AnalysisResult): boolean {
  const phones = r.words.flatMap(w => w.phones);
  return r.words.length >= 5 && phones.length >= 15 &&
    r.words.every(w => w.status !== 'unclear' && !w.timingEstimated) &&
    !phones.some(p => p.status === 'error') &&
    phones.filter(p => p.status === 'ok' && Number.isFinite(p.gop)).length / phones.length >= 0.8 &&
    r.sounds.length > 0 && !r.sounds.some(s => s.status === 'practice') &&
    Number.isFinite(r.quality.snrDb) && r.quality.snrDb >= 10 && r.quality.clippedRatio <= 0.001;
}
