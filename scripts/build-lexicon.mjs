// Builds src/data/lexicon.json from CMUdict for every word Vaani's texts use.
// Usage: npm run build:lexicon   (downloads CMUdict once into scripts/.cache)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(root, 'scripts', '.cache');
const dictPath = path.join(cacheDir, 'cmudict.dict');
const DICT_URL = 'https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict';

async function loadDict() {
  if (!fs.existsSync(dictPath)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    const res = await fetch(DICT_URL);
    if (!res.ok) throw new Error(`CMUdict download failed: ${res.status}`);
    fs.writeFileSync(dictPath, await res.text());
  }
  const dict = new Map();
  for (const line of fs.readFileSync(dictPath, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith(';;;')) continue;
    const clean = line.split('#')[0].trim();
    const [head, ...phones] = clean.split(/\s+/);
    const word = head.replace(/\(\d+\)$/, '').toLowerCase();
    if (!dict.has(word)) dict.set(word, []);
    dict.get(word).push(phones.join(' '));
  }
  return dict;
}

// Text sources to cover.
function loadTexts() {
  const src = fs.readFileSync(path.join(root, 'src/data/presetParagraph.ts'), 'utf8');
  return { preset: src.match(/PRESET_PARAGRAPH = `([\s\S]*?)`/)[1] };
}

// Harvard Sentences (IEEE 1969 phonetically balanced lists).
function loadBank() {
  return (fs.readFileSync(path.join(root, 'scripts/data/harvard-sentences.txt'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'scripts/data/targeted-sentences.txt'), 'utf8'))
    .split('\n').map((l) => l.trim()).filter(Boolean);
}

// Must mirror tokenizeWords() in src/services/phonemes/lexicon.ts
const tokenize = (text) => text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
const FOLD = { AO: 'AA', ZH: 'SH' }; // mirrors src/services/phonemes/inventory.ts

const dict = await loadDict();
const texts = loadTexts();
const lexicon = {};
const missing = new Set();
for (const text of Object.values(texts)) {
  for (const w of tokenize(text)) {
    const prons = dict.get(w);
    if (!prons) missing.add(w);
    else lexicon[w] = prons;
  }
}
if (missing.size) {
  console.error('Words missing from CMUdict:', [...missing].join(', '));
  process.exit(1);
}

// Sentence bank: keep sentences whose every word is in CMUdict, and record,
// per sound, which distinct words carry it (primary pronunciation, folded).
const bank = [];
let dropped = 0;
loadBank().forEach((text, id) => {
  const words = tokenize(text);
  if (!words.length || words.some((w) => !dict.has(w))) { dropped++; return; }
  const p = {};
  for (const w of new Set(words)) {
    lexicon[w] = dict.get(w);
    for (const ph of dict.get(w)[0].split(' ')) {
      const base = ph.replace(/\d/, '');
      const c = FOLD[base] ?? base;
      (p[c] ??= []).includes(w) || p[c].push(w);
    }
  }
  bank.push({ id, t: text, p });
});
fs.writeFileSync(path.join(root, 'src/data/sentenceBank.json'), JSON.stringify(bank));
console.log(`Sentence bank: ${bank.length} sentences (${dropped} dropped for unknown words)`);
// Exact one-phone contrasts from the full dictionary for every practice word.
// Keep stress-free raw ARPAbet distinctions (no AO/AA or ZH/SH folding here).
const strip = p => p.split(' ').map(x => x.replace(/\d/g, ''));
const index = new Map();
for (const [word, prons] of dict) {
  if (!/^[a-z]+$/.test(word)) continue;
  for (const pron of prons) {
    const key = strip(pron).join(' ');
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(word);
  }
}
const contrasts = {};
const phones = [...new Set([...dict.values()].flat().flatMap(strip))];
for (const [word, prons] of Object.entries(lexicon)) {
  const entries = [];
  for (const pron of prons) {
    const seq = strip(pron);
    seq.forEach((expected, pos) => {
      for (const observed of phones) {
        if (observed === expected || (FOLD[observed] ?? observed) === (FOLD[expected] ?? expected)) continue;
        const other = seq.slice(); other[pos] = observed;
        const candidates = (index.get(other.join(' ')) ?? []).filter(x => x !== word);
        candidates.sort((a,b) => Number(!lexicon[a])-Number(!lexicon[b]) || a.length-b.length || a.localeCompare(b));
        for (const alternative of candidates.slice(0, 3)) entries.push({expected:FOLD[expected] ?? expected, observed:FOLD[observed] ?? observed, alternative});
      }
    });
  }
  if (entries.length) contrasts[word] = entries;
}
fs.writeFileSync(path.join(root, 'src/data/contrasts.json'), JSON.stringify(contrasts));
fs.writeFileSync(path.join(root, 'src/data/lexicon.json'), JSON.stringify(lexicon));
console.log(`Wrote ${Object.keys(lexicon).length} words to src/data/lexicon.json`);

// Coverage report for the preset paragraph (primary pronunciations, folded).
const cover = new Map();
for (const w of new Set(tokenize(texts.preset))) {
  for (const p of lexicon[w][0].split(' ')) {
    const base = p.replace(/\d/, '');
    const c = FOLD[base] ?? base;
    if (!cover.has(c)) cover.set(c, new Set());
    cover.get(c).add(w);
  }
}
const ALL = 'AA AE AH AW AY B CH D DH EH ER EY F G HH IH IY JH K L M N NG OW OY P R S SH T TH UH UW V W Y Z'.split(' ');
const weak = ALL.filter((p) => (cover.get(p)?.size ?? 0) < 3)
  .map((p) => `${p}(${[...(cover.get(p) ?? [])].join(',')})`);
console.log(weak.length ? `Sounds in <3 distinct words: ${weak.join('  ')}` : 'Every sound appears in >=3 distinct words.');
