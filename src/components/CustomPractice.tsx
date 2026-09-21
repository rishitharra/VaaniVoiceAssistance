import { useCallback, useState } from 'react';
import type { AnalysisResult, AnalyzeOptions } from '../services/acousticEngine';
import { PHONE_INFO } from '../services/phonemes/inventory';
import type { PracticeSet } from '../services/sentenceSelector';
import { RecorderView } from './RecorderView';

interface Props {
  set: PracticeSet;
  onNewSet: () => void;
  onResult: (r: AnalysisResult) => void;
  analyzeOptions?: Omit<AnalyzeOptions, 'onProgress'>;
}

/** Recording screen for a generated practice set, with its target sounds and a reshuffle. */
export function CustomPractice({ set, onNewSet, onResult, analyzeOptions }: Props) {
  const [busy, setBusy] = useState(false);
  const onBusyChange = useCallback((b: boolean) => setBusy(b), []);

  const header = (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      {set.targets.length ? (
        <>
          <span className="text-ink-soft">Built for:</span>
          {set.targets.map((p) => (
            <span key={p} className="rounded-full border border-practice/50 bg-practice/10 px-3 py-1">
              <b>/{PHONE_INFO[p].ipa}/</b> <span className="text-ink-soft">{PHONE_INFO[p].example}</span>
            </span>
          ))}
        </>
      ) : (
        <span className="text-ink-soft">A general set, since no sounds are confirmed yet.</span>
      )}
      {!busy && (
        <button onClick={onNewSet} className="ml-auto rounded-md px-3 py-1.5 font-bold text-accent hover:bg-accent/10">
          ↻ New set
        </button>
      )}
    </div>
  );

  return (
    <RecorderView
      key={set.sentenceIds.join('-')}
      text={set.text}
      heading="Practice set"
      header={header}
      onResult={onResult}
      analyzeOptions={analyzeOptions}
      onBusyChange={onBusyChange}
    />
  );
}
