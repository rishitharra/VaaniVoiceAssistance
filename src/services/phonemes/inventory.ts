/**
 * Canonical phone inventory shared by the recognizer output (IPA) and the
 * expected pronunciations (CMUdict ARPAbet).
 *
 * The default model (TIMIT 39-phone set) cannot tell AO from AA or ZH from SH,
 * so both sides are folded the same way. Coaching for those pairs is not
 * possible with this model; it is a model limit, not a bug.
 */

export const CANON = [
  'AA', 'AE', 'AH', 'AW', 'AY', 'B', 'CH', 'D', 'DH', 'DX', 'EH', 'ER', 'EY',
  'F', 'G', 'HH', 'IH', 'IY', 'JH', 'K', 'L', 'M', 'N', 'NG', 'OW', 'OY', 'P',
  'R', 'S', 'SH', 'T', 'TH', 'UH', 'UW', 'V', 'W', 'Y', 'Z',
] as const;
export type Phone = (typeof CANON)[number];

const FOLD: Record<string, Phone> = { AO: 'AA', ZH: 'SH' };

export const VOWELS = new Set<Phone>([
  'AA', 'AE', 'AH', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW',
]);
const STOPS = new Set<Phone>(['P', 'B', 'T', 'D', 'K', 'G', 'DX']);
const FRICATIVES = new Set<Phone>(['F', 'V', 'TH', 'DH', 'S', 'Z', 'SH', 'HH', 'CH', 'JH']);
const NASALS = new Set<Phone>(['M', 'N', 'NG']);
const APPROX = new Set<Phone>(['L', 'R', 'W', 'Y']);

export const isVowel = (p: Phone) => VOWELS.has(p);

/** Broad articulatory class; substitutions inside a class are cheaper to align. */
export function phoneClass(p: Phone): string {
  if (VOWELS.has(p)) return 'vowel';
  if (STOPS.has(p)) return 'stop';
  if (FRICATIVES.has(p)) return 'fric';
  if (NASALS.has(p)) return 'nasal';
  if (APPROX.has(p)) return 'approx';
  return 'other';
}

/** "AH0" -> { phone: 'AH', stress: 0 }; consonants get stress null. */
export function arpaToCanon(arpa: string): { phone: Phone; stress: number | null } {
  const m = arpa.match(/^([A-Z]+)(\d)?$/);
  if (!m) throw new Error(`Bad ARPAbet symbol: ${arpa}`);
  const base = m[1];
  const phone = (FOLD[base] ?? base) as Phone;
  if (!(CANON as readonly string[]).includes(phone)) throw new Error(`Unknown ARPAbet: ${arpa}`);
  return { phone, stress: m[2] !== undefined ? Number(m[2]) : null };
}

/**
 * IPA symbol -> canonical phone(s). Covers TIMIT-style output (default model)
 * and espeak-style output (onnx-community/wav2vec2-lv-60-espeak-cv-ft), so the
 * model can be swapped in config.ts without touching the aligner.
 */
const IPA: Record<string, Phone[]> = {
  // diphthongs / multi-char first (longest match wins)
  'aɪ': ['AY'], 'aʊ': ['AW'], 'eɪ': ['EY'], 'oʊ': ['OW'], 'əʊ': ['OW'], 'ɔɪ': ['OY'], 'oɪ': ['OY'],
  'tʃ': ['CH'], 'dʒ': ['JH'], 'ɜː': ['ER'], 'ɑː': ['AA'], 'ɔː': ['AA'], 'iː': ['IY'], 'uː': ['UW'],
  'oː': ['OW'], 'ɾ̃': ['DX'], 'ɚ': ['ER'], 'ɝ': ['ER'], 'ɜ˞': ['ER'],
  // single symbols
  'ʧ': ['CH'], 'ʤ': ['JH'],
  'ɑ': ['AA'], 'ɒ': ['AA'], 'ɔ': ['AA'], 'a': ['AA'],
  'æ': ['AE'], 'ʌ': ['AH'], 'ə': ['AH'], 'ɐ': ['AH'],
  'ɛ': ['EH'], 'e': ['EH'], 'ɜ': ['ER'],
  'ɪ': ['IH'], 'ᵻ': ['IH'], 'ɨ': ['IH'], 'i': ['IY'],
  'o': ['OW'], 'ʊ': ['UH'], 'u': ['UW'],
  'b': ['B'], 'd': ['D'], 'ð': ['DH'], 'ɾ': ['DX'], 'f': ['F'], 'ɡ': ['G'], 'g': ['G'],
  'h': ['HH'], 'k': ['K'], 'l': ['L'], 'ɫ': ['L'], 'm': ['M'], 'n': ['N'], 'ŋ': ['NG'],
  'p': ['P'], 'ɹ': ['R'], 'r': ['R'], 'ɻ': ['R'], 's': ['S'], 'ʃ': ['SH'], 'ʒ': ['SH'],
  't': ['T'], 'ʔ': ['T'], 'θ': ['TH'], 'v': ['V'], 'w': ['W'], 'j': ['Y'], 'z': ['Z'],
};
const IPA_KEYS = Object.keys(IPA).sort((a, b) => b.length - a.length);

/** Diphthongs a model might emit as two tokens; merged when adjacent. */
export const MERGEABLE_IPA = new Set(['aɪ', 'aʊ', 'eɪ', 'oʊ', 'ɔɪ', 'tʃ', 'dʒ']);

/** Convert one recognizer token string to canonical phones (may be empty). */
export function ipaToCanon(token: string): Phone[] {
  const s = token.normalize('NFC').replace(/[ˈˌ\u0329\u030d.]/g, '');
  const out: Phone[] = [];
  let i = 0;
  while (i < s.length) {
    const key = IPA_KEYS.find((k) => s.startsWith(k, i));
    if (key) {
      out.push(...IPA[key]);
      i += key.length;
    } else {
      // length marks, tie bars, unknown symbols: skip
      i += 1;
    }
  }
  return out;
}

/** Display info for UI: IPA symbol plus an example word. */
export const PHONE_INFO: Record<Phone, { ipa: string; example: string }> = {
  AA: { ipa: 'ɑ', example: 'father' }, AE: { ipa: 'æ', example: 'cat' },
  AH: { ipa: 'ʌ/ə', example: 'cup' }, AW: { ipa: 'aʊ', example: 'town' },
  AY: { ipa: 'aɪ', example: 'my' }, B: { ipa: 'b', example: 'boat' },
  CH: { ipa: 'tʃ', example: 'cheese' }, D: { ipa: 'd', example: 'do' },
  DH: { ipa: 'ð', example: 'the' }, DX: { ipa: 'ɾ', example: 'water' },
  EH: { ipa: 'ɛ', example: 'bed' }, ER: { ipa: 'ɝ', example: 'bird' },
  EY: { ipa: 'eɪ', example: 'bay' }, F: { ipa: 'f', example: 'food' },
  G: { ipa: 'ɡ', example: 'good' }, HH: { ipa: 'h', example: 'half' },
  IH: { ipa: 'ɪ', example: 'sit' }, IY: { ipa: 'i', example: 'beach' },
  JH: { ipa: 'dʒ', example: 'June' }, K: { ipa: 'k', example: 'book' },
  L: { ipa: 'l', example: 'last' }, M: { ipa: 'm', example: 'map' },
  N: { ipa: 'n', example: 'north' }, NG: { ipa: 'ŋ', example: 'sing' },
  OW: { ipa: 'oʊ', example: 'boat' }, OY: { ipa: 'ɔɪ', example: 'boy' },
  P: { ipa: 'p', example: 'pocket' }, R: { ipa: 'ɹ', example: 'read' },
  S: { ipa: 's', example: 'sun' }, SH: { ipa: 'ʃ', example: 'shell' },
  T: { ipa: 't', example: 'time' }, TH: { ipa: 'θ', example: 'thick' },
  UH: { ipa: 'ʊ', example: 'book' }, UW: { ipa: 'u', example: 'food' },
  V: { ipa: 'v', example: 'voice' }, W: { ipa: 'w', example: 'warm' },
  Y: { ipa: 'j', example: 'yellow' }, Z: { ipa: 'z', example: 'noisy' },
};
