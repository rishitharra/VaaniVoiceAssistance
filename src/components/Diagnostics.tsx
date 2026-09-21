import { useState } from 'react';
import { GOP, PHONE_MARGIN } from '../config';
import type { AnalysisResult } from '../services/acousticEngine';
import { PHONE_INFO } from '../services/phonemes/inventory';

/**
 * Every sound's score, for tuning. gop = how much the expected sound beat the
 * best alternative; negative means an alternative was more likely.
 */
export function Diagnostics({ result }: { result: AnalysisResult }) {
  const [copied, setCopied] = useState(false);
  const gops = result.scores.map((s) => s.gop).sort((a, b) => a - b);
  const med = gops[gops.length >> 1] ?? 0;
  const rows = result.words.flatMap((w) =>
    w.phones.map((p, i) => ({ word: w.text, index: `${w.index}.${i}`, p, wordStatus: w.status })),
  );

  async function copy() {
    const data = rows.map((r) => ({
      word: r.word,
      expected: r.p.expected,
      status: r.p.status,
      reason: r.p.reason,
      observed: r.p.observed,
      gop: r.p.gop,
      gopAlt: r.p.gopAlt,
      decoded: r.p.decoded,
    }));
    await navigator.clipboard.writeText(JSON.stringify({ text: result.text, quality: result.quality, median: med, rows: data }, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <p className="mb-3">
        {result.scores.length} sounds scored, median gop {med.toFixed(2)}, {result.durationSec.toFixed(1)} s audio,
        SNR {result.quality.snrDb.toFixed(0)} dB. Error needs gop ≤ −(errorMargin + per-sound margin) and every other enabled rule to agree.
      </p>
      <button onClick={copy} className="mb-3 rounded-md border border-line px-3 py-1.5 font-bold hover:border-accent">
        {copied ? 'Copied' : 'Copy diagnostics JSON'}
      </button>
      <div className="max-h-80 overflow-auto rounded-lg border border-line">
        <table className="w-full text-left text-xs tabular-nums">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line">
              {['word', 'sound', 'verdict', 'gop', 'gop 2', 'threshold', 'heard', 'decoded'].map((h) => (
                <th key={h} className="px-2 py-1 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const thr = -(GOP.errorMargin + (PHONE_MARGIN[r.p.expected] ?? 0));
              const color = r.p.status === 'error' ? 'text-practice' : r.p.status === 'uncertain' ? 'text-uncertain' : '';
              return (
                <tr key={r.index} className="border-b border-line/60">
                  <td className="px-2 py-1">{r.word}</td>
                  <td className="px-2 py-1">/{PHONE_INFO[r.p.expected].ipa}/</td>
                  <td className={`px-2 py-1 ${color}`}>{r.p.status}</td>
                  <td className="px-2 py-1">{r.p.gop?.toFixed(2) ?? '—'}</td>
                  <td className="px-2 py-1">{r.p.gopAlt?.toFixed(2) ?? '—'}</td>
                  <td className="px-2 py-1">{thr.toFixed(2)}</td>
                  <td className="px-2 py-1">{r.p.observed ? `/${PHONE_INFO[r.p.observed].ipa}/` : r.p.status === 'error' ? 'nothing' : '—'}</td>
                  <td className="px-2 py-1">{r.p.decoded?.status ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
