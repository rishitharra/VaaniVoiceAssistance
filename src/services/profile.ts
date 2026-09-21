import { isClearReading } from './engine/evidence';
import { updateStats, type PhoneStats } from './engine/decide';
import type { AnalysisResult, SoundStatus } from './engine/types';
import type { Phone } from './phonemes/inventory';

export type VoiceChoice = 'basic' | 'natural';
export interface Settings {
  voice: VoiceChoice;
  naturalVoiceReady?: boolean;
  /** Run the second model and require both to agree before flagging */
  crossCheck?: boolean;
  altModelReady?: boolean;
}

export type Review = 'agree' | 'disagree';

export interface WeakSound {
  phone: Phone;
  /** active = targeted in practice; improved = matched in 2 later sessions */
  status: 'active' | 'improved';
  confirmations: number;
  cleanStreak: number;
  firstConfirmedAt: number;
  lastConfirmedAt: number;
  /** Words it was last flagged in (for the pronunciation button) */
  words?: string[];
}

export interface Profile {
  id: string;
  createdAt: number;
  updatedAt: number;
  weakSounds: Partial<Record<Phone, WeakSound>>;
  /** Sentence-bank ids used recently, so practice sets vary */
  recentSentenceIds: number[];
  sessionCount: number;
  randomPracticeUnlocked?: boolean;
  /** Per-sound score history for this speaker, used to calibrate flagging */
  gopStats?: PhoneStats;
}

export interface SessionRecord {
  id: string;
  createdAt: number;
  kind: 'preset' | 'custom';
  text: string;
  targets: Phone[];
  sentenceIds: number[];
  durationSec: number;
  sounds: { phone: Phone; status: SoundStatus; errorWords: string[]; errorRate: number }[];
  words: AnalysisResult['words'];
  reviews: Partial<Record<Phone, Review>>;
}

/** Sessions in a row a sound must match before it stops being targeted */
export const IMPROVED_AFTER = 2;

export function newProfile(): Profile {
  const now = Date.now();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now, weakSounds: {}, recentSentenceIds: [], sessionCount: 0, gopStats: {} };
}

export function activeTargets(p: Profile): Phone[] {
  return (Object.values(p.weakSounds) as WeakSound[])
    .filter((w) => w.status === 'active')
    .sort((a, b) => b.confirmations - a.confirmations)
    .map((w) => w.phone);
}

/**
 * Fold one reviewed session into the profile.
 * - Agree on a flagged sound: it becomes (or stays) a target.
 * - Disagree: dismissed; nothing is recorded, so it never shapes lessons.
 * - A target that comes back Matched builds a streak; after IMPROVED_AFTER it's marked improved.
 */
export function applySession(p: Profile, r: AnalysisResult, reviews: SessionRecord['reviews'], sentenceIds: number[]): Profile {
  const now = Date.now();
  const weak = { ...p.weakSounds };

  for (const s of r.sounds) {
    const w = weak[s.phone];
    if (s.status === 'practice' && reviews[s.phone] === 'agree') {
      weak[s.phone] = {
        phone: s.phone,
        status: 'active',
        confirmations: (w?.confirmations ?? 0) + 1,
        cleanStreak: 0,
        firstConfirmedAt: w?.firstConfirmedAt ?? now,
        lastConfirmedAt: now,
        words: s.errorWords.slice(0, 3),
      };
    } else if (w && w.status === 'active' && s.status === 'matched') {
      const cleanStreak = w.cleanStreak + 1;
      weak[s.phone] = { ...w, cleanStreak, status: cleanStreak >= IMPROVED_AFTER ? 'improved' : 'active' };
    } else if (w?.status === 'active') {
      weak[s.phone] = { ...w, cleanStreak: 0 };
    }
  }

  return {
    ...p,
    weakSounds: weak,
    randomPracticeUnlocked: !!p.randomPracticeUnlocked || isClearReading(r),
    gopStats: updateStats(p.gopStats ?? {}, r.scores.filter(s => reviews[s.phone] !== 'disagree' && r.quality.clippedRatio <= 0.001)),
    sessionCount: p.sessionCount + 1,
    recentSentenceIds: [...sentenceIds, ...p.recentSentenceIds].slice(0, 60),
    updatedAt: now,
  };
}

export function toSessionRecord(
  r: AnalysisResult,
  kind: SessionRecord['kind'],
  targets: Phone[],
  sentenceIds: number[],
  reviews: SessionRecord['reviews'],
): SessionRecord {
  return {
    id: crypto.randomUUID(),
    createdAt: r.createdAt,
    kind,
    text: r.text,
    targets,
    sentenceIds,
    durationSec: r.durationSec,
    sounds: r.sounds.map(({ phone, status, errorWords, errorRate }) => ({ phone, status, errorWords, errorRate })),
    words: r.words,
    reviews,
  };
}

/** Days in a row (ending today or yesterday) with at least one session. */
export function dayStreak(sessions: { createdAt: number }[]): number {
  const days = new Set(sessions.map((s) => new Date(s.createdAt).toDateString()));
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
