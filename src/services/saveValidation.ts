import { CANON } from './phonemes/inventory';
/** Validate before replacing any existing local data. Accept v4.2 optional fields. */
export function validateSave(data: any): void {
  const fail = () => { throw new Error('Invalid Vaani save file. Existing progress has not been changed.'); };
  const obj = (v: any) => v && typeof v === 'object' && !Array.isArray(v);
  const num = (v: any) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const phone = (v: any) => CANON.includes(v);
  const p = data?.profile;
  if (data?.app !== 'vaani' || data.version !== 1 || !obj(p) || typeof p.id !== 'string' ||
      !num(p.createdAt) || !num(p.updatedAt) || !Number.isInteger(p.sessionCount) || p.sessionCount < 0 ||
      !Array.isArray(p.recentSentenceIds) || !p.recentSentenceIds.every(Number.isInteger) || !obj(p.weakSounds) ||
      p.randomPracticeUnlocked !== undefined && typeof p.randomPracticeUnlocked !== 'boolean') fail();
  for (const [key,w] of Object.entries(p.weakSounds) as [string,any][]) {
    if (!phone(key) || !obj(w) || w.phone !== key || !['active','improved'].includes(w.status) ||
        !num(w.confirmations) || !num(w.cleanStreak) || !num(w.firstConfirmedAt) || !num(w.lastConfirmedAt) ||
        w.words !== undefined && (!Array.isArray(w.words) || !w.words.every((x:any)=>typeof x==='string'))) fail();
  }
  if (p.gopStats !== undefined) {
    if (!obj(p.gopStats)) fail();
    for (const [key,v] of Object.entries(p.gopStats) as [string,any][]) {
      if (!phone(key) || !obj(v) || !num(v.n) || !Number.isFinite(v.mean) || !num(v.m2)) fail();
    }
  }
  if (data.settings !== undefined) {
    if (!obj(data.settings) || !['basic','natural'].includes(data.settings.voice)) fail();
    for (const key of ['naturalVoiceReady','crossCheck','altModelReady']) {
      if (data.settings[key] !== undefined && typeof data.settings[key] !== 'boolean') fail();
    }
  }
  if (!Array.isArray(data.sessions)) fail();
  const ids = new Set();
  for (const s of data.sessions) {
    if (!obj(s) || typeof s.id !== 'string' || ids.has(s.id) || !num(s.createdAt) || !num(s.durationSec) ||
        !['preset','custom'].includes(s.kind) || typeof s.text !== 'string' || !Array.isArray(s.targets) || !s.targets.every(phone) ||
        !Array.isArray(s.sentenceIds) || !s.sentenceIds.every(Number.isInteger) || !Array.isArray(s.sounds) || !Array.isArray(s.words) || !obj(s.reviews)) fail();
    ids.add(s.id);
    for (const sound of s.sounds) {
      if (!obj(sound) || !phone(sound.phone) || !['matched','practice','uncertain'].includes(sound.status) || !Array.isArray(sound.errorWords) || !sound.errorWords.every((x:any)=>typeof x==='string') || !num(sound.errorRate) || sound.errorRate > 1) fail();
    }
    for (const [key,value] of Object.entries(s.reviews)) if (!phone(key) || !['agree','disagree'].includes(value as string)) fail();
  }
}
