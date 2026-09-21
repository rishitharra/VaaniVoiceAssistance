/**
 * Offline sanity test for alignment + classification (no model, no browser).
 * Simulates a reader who says TH as T and V as W, flaps T/D, reduces vowels,
 * skips one word, and has one random slip. Expect: TH and V -> practice,
 * the slip -> not practice, no false flags from normal American variants.
 */
import { PRESET_PARAGRAPH } from '../src/data/presetParagraph';
import { alignWords } from '../src/services/engine/align';
import { classifySounds } from '../src/services/engine/classify';
import type { RecognizedPhone } from '../src/services/engine/types';
import { isVowel, type Phone } from '../src/services/phonemes/inventory';
import { tokenizeText } from '../src/services/phonemes/lexicon';

const words = tokenizeText(PRESET_PARAGRAPH);
const rec: RecognizedPhone[] = [];
let t = 0;
const push = (phone: Phone, confidence = 0.9) => {
  rec.push({ phone, token: phone, start: t, end: t + 0.08, confidence });
  t += 0.08;
};

for (const w of words) {
  if (w.key === 'mountains') { t += 0.5; continue; } // skipped word
  const v = w.variants[0];
  v.forEach((p, i) => {
    let ph: Phone = p.phone;
    if (ph === 'TH') ph = 'T';                                   // target error 1
    if (ph === 'V') ph = 'W';                                    // target error 2
    if (w.key === 'water' && ph === 'T') ph = 'DX';              // normal flap
    if (w.key === 'better' && ph === 'T') ph = 'DX';             // normal flap
    if (isVowel(ph) && p.stress === 0 && ph === 'EH') ph = 'AH'; // normal reduction
    if (w.key === 'sandwiches' && ph === 'D') return;            // normal elision
    if (w.key === 'purple' && i === 0) ph = 'B';                 // one-off slip
    push(ph);
  });
  t += 0.1;
}

const results = alignWords(words, rec);
const sounds = classifySounds(results);

const byPhone = new Map(sounds.map((s) => [s.phone, s]));
const checks: [string, boolean][] = [
  ['TH flagged practice', byPhone.get('TH')?.status === 'practice'],
  ['V flagged practice', byPhone.get('V')?.status === 'practice'],
  ['P (one-off slip) not practice', byPhone.get('P')?.status !== 'practice'],
  ['T not flagged (flaps accepted)', byPhone.get('T')?.status === 'matched'],
  ['D not flagged (elision accepted)', byPhone.get('D')?.status === 'matched'],
  ['skipped word is unclear', results.find((r) => r.text === 'mountains')?.status === 'unclear'],
  ['only TH and V flagged', sounds.filter((s) => s.status === 'practice').map((s) => s.phone).sort().join() === 'TH,V'],
];

for (const s of sounds.filter((x) => x.status !== 'matched')) {
  console.log(`${s.status.padEnd(9)} ${s.phone.padEnd(3)} rate=${s.errorRate.toFixed(2)} words=${s.errorWords.join(',')}`);
}
let fail = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) fail++; }
process.exit(fail ? 1 : 0);
