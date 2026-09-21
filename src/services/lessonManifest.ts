/**
 * Demonstration clip per sound, shown in the Learn/coaching step.
 *
 * Put each file in public/clips/ named after its key in lowercase
 * (TH -> clips/th.mp4). Paths below omit the public/ prefix.
 * A sound with no entry falls back to text coaching from services/coaching.ts.
 *
 * start/end are seconds inside the file; omit both to play the whole clip.
 * Record permission for every source in CLIP_PERMISSIONS.md.
 */
import type { Phone } from './phonemes/inventory';

export interface Clip {
  /** Path under public/, e.g. 'clips/th.mp4' */
  src: string;
  /** Optional WebVTT captions, e.g. 'clips/th.en.vtt' */
  captions?: string;
  start?: number;
  end?: number;
  credit: { creator: string; title: string; url: string };
  /** Optional one-line cue shown under the clip (overrides ARTICULATION text) */
  tip?: string;
}

/** Credit for the phonics clips. */
const SOURCE = {
  creator: 'RRFTS',
  title: '44 Phonemes',
  url: 'https://www.youtube.com/watch?v=wBuA589kfMg',
};

/** Credit for clips your team made yourselves (e.g. DX). */
const TEAM = {
  creator: 'Pronunciation Studio',
  title: '/dʒ/',
  url: 'https://www.youtube.com/shorts/QEEu2VPc6Is',
};

export const LESSONS: Partial<Record<Phone, Clip>> = {
  // /θ/ as in "thick"
  TH: { src: 'clips/th.mp4', credit: SOURCE },
  // /ð/ as in "the"
  DH: { src: 'clips/dh.mp4', credit: SOURCE },
  // /s/ as in "sun"
  S: { src: 'clips/s.mp4', credit: SOURCE },
  // /z/ as in "noisy"
  Z: { src: 'clips/z.mp4', credit: SOURCE },
  // /f/ as in "food"
  F: { src: 'clips/f.mp4', credit: SOURCE },
  // /v/ as in "voice"
  V: { src: 'clips/v.mp4', credit: SOURCE },
  // /ʃ/ as in "shell"
  SH: { src: 'clips/sh.mp4', credit: SOURCE },
  // /tʃ/ as in "cheese"
  CH: { src: 'clips/ch.mp4', credit: SOURCE },
  // /dʒ/ as in "June"
  JH: { src: 'clips/jh.mp4', credit: SOURCE },
  // /h/ as in "half"
  HH: { src: 'clips/hh.mp4', credit: SOURCE },
  // /p/ as in "pocket"
  P: { src: 'clips/p.mp4', credit: SOURCE },
  // /b/ as in "boat"
  B: { src: 'clips/b.mp4', credit: SOURCE },
  // /t/ as in "time"
  T: { src: 'clips/t.mp4', credit: SOURCE },
  // /d/ as in "do"
  D: { src: 'clips/d.mp4', credit: SOURCE },
  // /ɾ/ as in "water"
  DX: { src: 'clips/dx.mp4', credit: TEAM },
  // /k/ as in "book"
  K: { src: 'clips/k.mp4', credit: SOURCE },
  // /ɡ/ as in "good"
  G: { src: 'clips/g.mp4', credit: SOURCE },
  // /m/ as in "map"
  M: { src: 'clips/m.mp4', credit: SOURCE },
  // /n/ as in "north"
  N: { src: 'clips/n.mp4', credit: SOURCE },
  // /ŋ/ as in "sing"
  NG: { src: 'clips/ng.mp4', credit: SOURCE },
  // /ɹ/ as in "read"
  R: { src: 'clips/r.mp4', credit: SOURCE },
  // /l/ as in "last"
  L: { src: 'clips/l.mp4', credit: SOURCE },
  // /w/ as in "warm"
  W: { src: 'clips/w.mp4', credit: SOURCE },
  // /j/ as in "yellow"
  Y: { src: 'clips/y.mp4', credit: SOURCE },
  // /i/ as in "beach"
  IY: { src: 'clips/iy.mp4', credit: SOURCE },
  // /ɪ/ as in "sit"
  IH: { src: 'clips/ih.mp4', credit: SOURCE },
  // /ɛ/ as in "bed"
  EH: { src: 'clips/eh.mp4', credit: SOURCE },
  // /æ/ as in "cat"
  AE: { src: 'clips/ae.mp4', credit: SOURCE },
  // /ɑ/ as in "father"
  AA: { src: 'clips/aa.mp4', credit: SOURCE },
  // /ʌ/ as in "cup"
  AH: { src: 'clips/ah.mp4', credit: SOURCE },
  // /ʊ/ as in "book"
  UH: { src: 'clips/uh.mp4', credit: SOURCE },
  // /u/ as in "food"
  UW: { src: 'clips/uw.mp4', credit: SOURCE },
  // /ɝ/ as in "bird"
  ER: { src: 'clips/er.mp4', credit: SOURCE },
  // /eɪ/ as in "bay"
  EY: { src: 'clips/ey.mp4', credit: SOURCE },
  // /aɪ/ as in "my"
  AY: { src: 'clips/ay.mp4', credit: SOURCE },
  // /oʊ/ as in "boat"
  OW: { src: 'clips/ow.mp4', credit: SOURCE },
  // /aʊ/ as in "town"
  AW: { src: 'clips/aw.mp4', credit: SOURCE },
  // /ɔɪ/ as in "boy"
  OY: { src: 'clips/oy.mp4', credit: SOURCE },
};

/**
 * URL for a clip file. Accepts either a path ('clips/th.mp4') or a whole Clip
 * entry, so it works with either calling style in the player code.
 */
export function clipUrl(target: string | Clip | undefined | null): string {
  const path = typeof target === 'string' ? target : target?.src ?? '';
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}