/**
 * Builds a custom practice paragraph without an LLM: picks Harvard Sentences
 * (pre-analysed with CMUdict at build time) that give the most coverage of the
 * user's confirmed weak sounds.
 */
import bankJson from '../data/sentenceBank.json';
import type { Phone } from './phonemes/inventory';
import { isVowel } from './phonemes/inventory';
import { FUNCTION_WORDS } from './phonemes/lexicon';

interface BankEntry { id: number; t: string; p: Partial<Record<Phone, string[]>> }
const BANK = bankJson as BankEntry[];

export const SELECT = {
  /** Distinct words per target sound (recurrence rule needs >= 2; 3 gives margin) */
  wordsPerTarget: 3,
  minSentences: 5,
  maxSentences: 7,
};

export interface PracticeSet { text: string; sentenceIds: number[]; targets: Phone[]; coverage: Partial<Record<Phone, string[]>> }

/** Words that count as evidence for a sound. Function words don't count for
 *  vowels because their vowels are normally reduced. */
function usefulWords(e: BankEntry, phone: Phone): string[] {
  const ws = e.p[phone] ?? [];
  return isVowel(phone) ? ws.filter((w) => !FUNCTION_WORDS.has(w)) : ws;
}

export function buildPracticeSet(targets: Phone[], recentIds: number[] = [], rand: () => number = Math.random): PracticeSet {
  const recent = new Set(recentIds);
  const pool = BANK.filter((e) => !recent.has(e.id));
  const source = pool.length >= SELECT.maxSentences ? pool : BANK;
  const chosen: BankEntry[] = [];
  const covered = new Map<Phone, Set<string>>(targets.map((t) => [t, new Set()]));

  const need = (t: Phone) => Math.max(0, SELECT.wordsPerTarget - covered.get(t)!.size);
  const done = () => targets.every((t) => need(t) === 0);

  while (chosen.length < SELECT.maxSentences && !(done() && chosen.length >= SELECT.minSentences)) {
    let best: BankEntry | null = null;
    let bestScore = -1;
    for (const e of source) {
      if (chosen.includes(e)) continue;
      let score = 0;
      for (const t of targets) {
        const fresh = usefulWords(e, t).filter((w) => !covered.get(t)!.has(w)).length;
        score += Math.min(fresh, need(t)) * 10 + Math.min(fresh, 2); // unmet need first, extra reps second
      }
      score += rand(); // tie-break so sets vary
      if (score > bestScore) { bestScore = score; best = e; }
    }
    if (!best) break;
    chosen.push(best);
    for (const t of targets) usefulWords(best, t).forEach((w) => covered.get(t)!.add(w));
  }

  return {
    text: chosen.map((e) => e.t).join(' '),
    sentenceIds: chosen.map((e) => e.id),
    targets,
    coverage: Object.fromEntries([...covered].map(([k, v]) => [k, [...v]])),
  };
}
