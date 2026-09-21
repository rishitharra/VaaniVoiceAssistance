import { buildPracticeSet } from '../src/services/sentenceSelector';
import { tokenizeText } from '../src/services/phonemes/lexicon';
for (const targets of [['TH', 'V'], ['R', 'L', 'IY'], ['OY'], []] as any[]) {
  const s = buildPracticeSet(targets);
  tokenizeText(s.text); // throws if any word lacks a pronunciation
  console.log(`\n[${targets.join(',') || 'general'}] ${s.sentenceIds.length} sentences`);
  console.log(s.text);
  console.log(JSON.stringify(s.coverage));
}
