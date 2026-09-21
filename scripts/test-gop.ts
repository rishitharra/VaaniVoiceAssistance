/**
 * GOP test on synthetic CTC posteriors (no model/browser needed).
 * Speaker A: says TH as T and V as W. Expect exactly TH and V flagged.
 * Speaker B: reads correctly, with some recognizer noise. Expect nothing flagged.
 */
import { PRESET_PARAGRAPH } from '../src/data/presetParagraph';
import { alignWords } from '../src/services/engine/align';
import { classifySounds } from '../src/services/engine/classify';
import { BLANK_CLASS, NUM_CLASSES } from '../src/services/engine/ctc';
import { decidePhones } from '../src/services/engine/decide';
import { computeGop } from '../src/services/engine/gop';
import type { RecognizedPhone } from '../src/services/engine/types';
import { CANON, type Phone } from '../src/services/phonemes/inventory';
import { tokenizeText } from '../src/services/phonemes/lexicon';

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** `weak` = sounds the model is unsure about even when they're said correctly. */
function simulate(sub: (p: Phone, word: string) => Phone | null, noise: number, weak: Partial<Record<Phone, Phone>> = {}) {
  const words = tokenizeText(PRESET_PARAGRAPH);
  const frames: number[][] = [];
  const rec: RecognizedPhone[] = [];
  const row = (cls: number, p: number) => {
    const r = new Array(NUM_CLASSES).fill(Math.log((1 - p) / (NUM_CLASSES - 1)));
    r[cls] = Math.log(p);
    return r;
  };
  const blank = () => frames.push(row(BLANK_CLASS, 0.9));
  for (const w of words) {
    for (const e of w.variants[0]) {
      const said = sub(e.phone, w.key);
      if (said === null) continue;
      const cls = CANON.indexOf(said);
      const p = 0.8;
      if (rand() < noise) { // recognizer confusion: a wrong sound wins weakly
        const r = frames.length;
        const wrong = Math.floor(rand() * CANON.length);
        const f = row(wrong, 0.45);
        f[cls] = Math.log(0.35);
        frames.push(f);
        rec.push({ phone: CANON[wrong], token: '', start: r * 0.02, end: (r + 2) * 0.02, confidence: 0.45 });
        blank(); blank();
        continue;
      }
      const rival = weak[said];
      if (rival) {
        // Correct, but the model splits its belief with a similar sound.
        const f = row(cls, 0.4);
        f[CANON.indexOf(rival)] = Math.log(0.38);
        rec.push({ phone: rival, token: '', start: frames.length * 0.02, end: (frames.length + 2) * 0.02, confidence: 0.4 });
        frames.push(f); blank(); blank();
        continue;
      }
      rec.push({ phone: CANON[cls], token: '', start: frames.length * 0.02, end: (frames.length + 2) * 0.02, confidence: p });
      frames.push(row(cls, p)); blank(); blank();
    }
    blank(); blank(); blank();
  }
  const data = new Float32Array(frames.length * NUM_CLASSES);
  frames.forEach((r, t) => data.set(r, t * NUM_CLASSES));
  const results = alignWords(words, rec);
  const post = { data, frames: frames.length };
  decidePhones({ words: results, textWords: words, primary: computeGop(results, words, post) });
  return classifySounds(results).filter((s) => s.status === 'practice').map((s) => s.phone).sort();
}

const checks: [string, boolean][] = [];
const a = simulate((p) => (p === 'TH' ? 'T' : p === 'V' ? 'W' : p), 0.05);
console.log('Speaker A flagged:', a.join(', '));
checks.push(['A: TH and V flagged', a.includes('TH') && a.includes('V')]);
checks.push(['A: nothing else flagged', a.length === 2]);
const b = simulate((p) => p, 0.08);
console.log('Speaker B flagged:', b.join(', ') || '(none)');
checks.push(['B: no false positives', b.length === 0]);
const c = simulate((p) => p, 0.05, { TH: 'T', DH: 'D', R: 'W' });
console.log('Speaker C flagged:', c.join(', ') || '(none)');
checks.push(['C: correct speech, model unsure -> no flags', c.length === 0]);

let fail = 0;
for (const [n, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) fail++; }
process.exit(fail ? 1 : 0);
