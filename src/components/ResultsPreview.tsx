import { isClearReading } from '../services/engine/evidence';
import type { ReactNode } from 'react';
import type { AnalysisResult } from '../services/acousticEngine';
import { Diagnostics } from './Diagnostics';
import { playRange } from '../services/audio/pcm';
import type { SoundStatus, WordStatus } from '../services/engine/types';
import { PHONE_INFO } from '../services/phonemes/inventory';

/**
 * Results of one reading: the paragraph marked up by word, the per-sound
 * verdicts, and the entry point to the Agree / Disagree review.
 */
const WORD_STYLE: Record<WordStatus, string> = {
  ok: 'decoration-transparent',
  'has-error': 'decoration-practice',
  unclear: 'decoration-uncertain decoration-dotted',
};

const SOUND_LABEL: Record<SoundStatus, { text: string; dot: string }> = {
  matched: { text: 'Matched reference', dot: 'bg-matched' },
  practice: { text: 'Practice this sound', dot: 'bg-practice' },
  uncertain: { text: 'Uncertain', dot: 'bg-uncertain' },
};

interface Props {
  result: AnalysisResult;
  onReview: () => void;
  onRetry: () => void;
  reviewed: boolean;
}

export function ResultsPreview({ result, onReview, onRetry, reviewed }: Props) {
  const flagged = result.sounds.filter((s) => s.status === 'practice').length;
  const { text, words, sounds, audio } = result;

  // Rebuild the paragraph with each word wrapped, keeping original punctuation.
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const w of words) {
    parts.push(text.slice(cursor, w.charStart));
    const errs = w.phones.filter((p) => p.status === 'error');
    parts.push(
      <button
        key={w.index}
        onClick={() => playRange(audio, result.sampleRate, w.start - 0.15, w.end + 0.15)}
        title={
          errs.length
            ? errs.map((p) => `${PHONE_INFO[p.expected].ipa} heard as ${p.observed ? PHONE_INFO[p.observed].ipa : 'nothing'}`).join(', ')
            : w.status === 'unclear' ? 'Not clear enough to judge' : 'Play this word'
        }
        className={`underline decoration-[3px] underline-offset-[6px] hover:bg-line/70 rounded-sm ${WORD_STYLE[w.status]}`}
      >
        {text.slice(w.charStart, w.charEnd)}
      </button>,
    );
    cursor = w.charEnd;
  }
  parts.push(text.slice(cursor));

  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <h2 className="text-2xl font-bold">What Vaani heard</h2>
      <p className="mt-2 text-ink-soft">
        Tap any word to hear your recording of it. Amber underlines mark words with a sound to check;
        dotted grey means the word wasn't clear enough to judge.
      </p>

      {flagged === 0 && <p role="status" className="mt-6 rounded-lg border border-line p-4">
        {isClearReading(result) ? 'No mistakes detected in the sounds we could assess. Save this reading to unlock random practice.' : 'No repeated mistakes were flagged, but some sounds are uncertain. Try another recording before treating this as a clear reading.'}
      </p>}
      <QualityTips result={result} />
      <p className="mt-8 text-[1.35rem] leading-[1.9] max-w-[62ch]">{parts}</p>

      <h3 className="mt-12 text-xl font-bold">Sounds</h3>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {sounds.map((s) => {
          const info = PHONE_INFO[s.phone];
          const label = SOUND_LABEL[s.status];
          return (
            <li key={s.phone} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
              <span className="w-14 text-xl font-bold">/{info.ipa}/</span>
              <span className="w-20 text-ink-soft">as in {info.example}</span>
              <span className="flex items-center gap-2 w-48">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${label.dot}`} aria-hidden />
                {label.text}
              </span>
              {s.errorWords.length > 0 && (
                <span className="text-sm text-ink-soft">in: {s.errorWords.join(', ')}</span>
              )}
            </li>
          );
        })}
      </ul>

      <details className="mt-8 text-sm text-ink-soft">
        <summary className="cursor-pointer font-bold">Diagnostics (for tuning)</summary>
        <div className="mt-3"><Diagnostics result={result} /></div>
        <p className="mt-3 break-words leading-relaxed">
          Recognizer output: {result.recognized.map((r) => r.token).join(' ')}
        </p>
        <p className="mt-2">Model: {result.modelId}</p>
      </details>

      <div className="mt-10 flex flex-wrap gap-3">
        {flagged > 0 && !reviewed && (
          <button onClick={onReview} className="rounded-lg bg-accent px-6 py-3 text-lg font-bold text-on-accent hover:brightness-110">
            Review {flagged} flagged sound{flagged === 1 ? '' : 's'}
          </button>
        )}
        {flagged === 0 && (
          <button onClick={onReview} className="rounded-lg bg-accent px-6 py-3 text-lg font-bold text-on-accent hover:brightness-110">
            Save and continue
          </button>
        )}
        <button
          onClick={onRetry}
          className="rounded-lg border-2 border-accent px-5 py-2.5 font-bold text-accent hover:bg-accent hover:text-on-accent"
        >
          Record again
        </button>
      </div>
    </section>
  );
}

/** Recording-quality hints when noise or clipping likely hurt the analysis. */
function QualityTips({ result }: { result: AnalysisResult }) {
  const tips: string[] = [];
  const { snrDb, clippedRatio } = result.quality;
  const uncertain = result.sounds.filter((s) => s.status === 'uncertain').length / Math.max(1, result.sounds.length);
  if (snrDb < 15 || uncertain > 0.3) tips.push('Some sounds were hard to judge; noise, blending, or model uncertainty may be responsible. A quieter room or a headset will help.');
  if (clippedRatio > 0.001) tips.push('Your mic was overloaded in places. Move back a little or speak a bit softer.');
  if (!tips.length) return null;
  return (
    <div role="note" className="mt-6 rounded-xl border border-practice/40 bg-practice/10 px-4 py-3">
      {tips.map((t) => <p key={t}>{t}</p>)}
    </div>
  );
}
