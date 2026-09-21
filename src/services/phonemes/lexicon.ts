import lexiconJson from '../../data/lexicon.json';
import { arpaToCanon, type Phone } from './inventory';

const LEXICON = lexiconJson as Record<string, string[]>;

export interface ExpectedPhone {
  phone: Phone;
  stress: number | null;
}

export interface TextWord {
  index: number;
  /** Surface form as written, e.g. "June," -> "June" */
  text: string;
  /** Lowercased lookup key */
  key: string;
  /** Character range in the source text, for highlighting */
  charStart: number;
  charEnd: number;
  /** One or more CMUdict pronunciations (first = primary) */
  variants: ExpectedPhone[][];
  isFunctionWord: boolean;
}

/** Short words that are normally reduced in connected speech. */
export const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'as', 'for',
  'from', 'with', 'by', 'is', 'was', 'were', 'are', 'be', 'been', 'it', 'its',
  'that', 'this', 'than', 'then', 'them', 'they', 'their', 'there', 'he', 'him',
  'his', 'her', 'she', 'we', 'us', 'our', 'you', 'your', 'i', 'my', 'me', 'can',
  'could', 'would', 'should', 'will', 'do', 'does', 'did', 'have', 'has', 'had',
  'some', 'so', 'if', 'not', 'up', 'into',
]);

/** Folding (AO->AA etc.) can make CMUdict variants identical; keep one. */
function dedupe(vs: ExpectedPhone[][]): ExpectedPhone[][] {
  const seen = new Set<string>();
  return vs.filter((v) => {
    const k = v.map((p) => p.phone + (p.stress ?? '')).join(' ');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const WORD_RE = /[A-Za-z]+(?:'[A-Za-z]+)?/g; // must mirror scripts/build-lexicon.mjs

export function tokenizeText(text: string): TextWord[] {
  const words: TextWord[] = [];
  for (const m of text.matchAll(WORD_RE)) {
    const key = m[0].toLowerCase();
    const prons = LEXICON[key];
    if (!prons) {
      throw new Error(`"${m[0]}" is not in lexicon.json. Run npm run build:lexicon.`);
    }
    words.push({
      index: words.length,
      text: m[0],
      key,
      charStart: m.index!,
      charEnd: m.index! + m[0].length,
      variants: dedupe(prons.map((p) => p.split(' ').map(arpaToCanon))),
      isFunctionWord: FUNCTION_WORDS.has(key),
    });
  }
  return words;
}
