import type { Phone } from '../phonemes/inventory';

/** One phone the recognizer heard, with timing in seconds. */
export interface RecognizedPhone {
  phone: Phone;
  /** Raw model token, e.g. "ʤ" */
  token: string;
  start: number;
  end: number;
  /** Peak softmax probability of the token (0-1) */
  confidence: number;
}

export type PhoneStatus = 'ok' | 'error' | 'uncertain';

export interface PhoneResult {
  expected: Phone;
  stress: number | null;
  /** What was heard; null = deleted (not heard at all) */
  observed: Phone | null;
  status: PhoneStatus;
  /** Why it got this status, for debugging and for the review UI */
  reason: 'match' | 'accepted-variant' | 'substituted' | 'deleted' | 'low-confidence' | 'word-unclear';
  start: number | null;
  end: number | null;
  /** Goodness of pronunciation: log-likelihood margin of acceptable vs best other sound */
  gop?: number;
  /** Same score from the optional second model */
  gopAlt?: number;
  /** What the free decoding thought, before GOP scoring */
  decoded?: { status: PhoneStatus; observed: Phone | null };
}

export type WordStatus = 'ok' | 'has-error' | 'unclear';

export interface WordResult {
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
  /** Seconds in the recording; interpolated if nothing was aligned to it */
  start: number;
  end: number;
  timingEstimated: boolean;
  status: WordStatus;
  phones: PhoneResult[];
  /** Extra sounds heard inside this word (e.g. added vowels) */
  insertions: Phone[];
}

/** 🟢 matched | 🟡 practice | ⚪ uncertain */
export type SoundStatus = 'matched' | 'practice' | 'uncertain';

export interface SoundOccurrence {
  wordIndex: number;
  word: string;
  status: PhoneStatus;
  observed: Phone | null;
}

export interface SoundReport {
  phone: Phone;
  status: SoundStatus;
  occurrences: SoundOccurrence[];
  /** Distinct words (by spelling) where this sound was an error */
  errorWords: string[];
  errorRate: number;
}

export interface AnalysisResult {
  /** Every scored sound, for calibration and the diagnostics view */
  scores: { phone: Phone; gop: number }[];
  text: string;
  words: WordResult[];
  sounds: SoundReport[];
  recognized: RecognizedPhone[];
  /** 16 kHz mono PCM of the full recording, kept for clip playback */
  audio: Float32Array;
  sampleRate: number;
  durationSec: number;
  quality: RecordingQuality;
  modelId: string;
  createdAt: number;
}

export interface RecordingQuality {
  /** Speech level vs. background noise, dB */
  snrDb: number;
  /** Share of samples at the clipping limit */
  clippedRatio: number;
}
