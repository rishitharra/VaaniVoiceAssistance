/**
 * Phoneme recognizer. Default: English TIMIT-trained wav2vec2 XLS-R (Apache-2.0),
 * ONNX export for Transformers.js, ~355 MB int8. American read-speech training
 * data, which matches the General American baseline.
 *
 * Alternative (multilingual espeak IPA, larger, better with some accents):
 *   'onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX'
 * The IPA normalizer handles both output inventories.
 */
export const PHONEME_MODEL = {
  id: 'robg/speako-phoneme-recognizer',
  dtype: 'q8' as const,
  device: 'wasm' as const,
  approxDownloadMB: 360,
};

/**
 * Optional second opinion (Settings > Accuracy). A different checkpoint and
 * training set, so its mistakes differ from the primary model's; a sound is only
 * flagged when both models agree.
 */
export const PHONEME_MODEL_ALT = {
  id: 'onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX',
  dtype: 'q8' as const,
  device: 'wasm' as const,
  approxDownloadMB: 380,
};

export const ENGINE = {
  sampleRate: 16000,
  /** wav2vec2 emits one frame per 320 samples = 20 ms */
  frameSec: 0.02,
  /** Long recordings are split so memory stays bounded in the browser */
  chunkSec: 14,
  /** Extra context on each side of a chunk, discarded after inference */
  chunkContextSec: 1,
  /** Minimum speech needed before we analyze */
  minDurationSec: 3,
};

export const CLASSIFY = {
  /** Spec rule: a sound must go wrong in >= this many different words */
  minErrorWords: 2,
  /** ...and in at least this share of its checked occurrences */
  minErrorRate: 0.25,
  /** Substitutions heard with lower confidence count as uncertain */
  minSubstitutionConfidence: 0.5,
  /** A word where this share of sounds went missing/wrong is treated as unclear
   *  (skipped, misread, or noise) and excluded from sound judgments */
  unclearWordRatio: 0.6,
};

/** Optional natural reference voice (Settings > Voice). Apache-2.0. */
export const TTS_MODEL = {
  id: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  dtype: 'q8' as const,
  device: 'wasm' as const,
  voice: 'af_heart' as const, // American English
  /** Slightly under 1 for a calmer read */
  speed: 0.9,
  approxDownloadMB: 90,
};

/**
 * How a GOP score turns into a verdict. Every enabled rule must agree before a
 * sound is called an error, which trades a little sensitivity for far fewer
 * false positives. Turn rules off here if Vaani starts missing real errors.
 */
export const SCORING = {
  /** The free decoding must also have judged the sound wrong */
  requireDecodedAgreement: true,
  /** Compare each sound with this reading's own score distribution */
  sessionRelative: true,
  /** How many standard deviations below this reading's median counts as an outlier */
  sessionK: 2,
  /** Minimum scored sounds before the session rule is used */
  sessionMinPhones: 60,
  /** Compare with the speaker's own history for that sound */
  historyRelative: true,
  historyK: 2,
  /** Minimum past occurrences before the history rule is used */
  historyMinCount: 25,
};

/**
 * Extra leniency per sound, in log units, for sounds the model scores harshly
 * even when they're correct. Raise a value to flag that sound less often.
 */
export const PHONE_MARGIN: Record<string, number> = {
  TH: 1.2, DH: 1.2, // dental fricatives: weak and short, often mistaken for stops
  R: 0.8, ER: 0.8, L: 0.6, // liquids blend into neighbours
  AH: 0.8, IH: 0.6, EH: 0.6, AE: 0.6, UH: 0.6, // vowel quality varies a lot per speaker
  Z: 0.5, V: 0.5, DX: 0.5, HH: 0.5,
};

/** Tutorial video in public/ (leave empty to show the text walkthrough only). */
export const TUTORIAL_VIDEO_SRC = 'tutorial/overview.mp4';

/** Seconds of context around a flagged word in the review clip (spec: 2 s each side) */
export const REVIEW_PAD_SEC = 2;

/**
 * Goodness-of-pronunciation scoring. For each expected sound, the model's
 * likelihood of an acceptable pronunciation is compared with the best
 * alternative (another sound, or nothing). Margins are natural-log units.
 */
export const GOP = {
  /** At or above: counts as matched */
  okMargin: 0,
  /** At or below minus this: counts as an error. Between: uncertain. Raise to flag less. */
  errorMargin: 1.5,
  /** Audio kept around each word when scoring it */
  windowPadSec: 0.12,
};

/** Rate for the browser's built-in voice (1 = normal). */
export const BASIC_VOICE_RATE = 0.85;
