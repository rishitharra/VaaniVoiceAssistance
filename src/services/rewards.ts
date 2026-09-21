import { isClearReading } from './engine/evidence';
import type { CelebrationData } from '../components/Celebration';
import type { AnalysisResult } from './engine/types';
import { PHONE_INFO } from './phonemes/inventory';
import { dayStreak, type Profile, type SessionRecord, type WeakSound } from './profile';

/** Picks at most one celebration for a finished session, most meaningful first. */
export function celebrationFor(
  before: Profile,
  after: Profile,
  result: AnalysisResult,
  kind: SessionRecord['kind'],
  sessionsAfter: SessionRecord[],
): CelebrationData | null {
  const ipa = (w: WeakSound) => `/${PHONE_INFO[w.phone].ipa}/`;

  // 1. A practiced sound just crossed into "improved".
  const nowImproved = (Object.values(after.weakSounds) as WeakSound[]).filter(
    (w) => w.status === 'improved' && before.weakSounds[w.phone]?.status === 'active',
  );
  if (nowImproved.length) {
    return {
      size: 'big',
      title: `${nowImproved.map(ipa).join(' and ')} ${nowImproved.length > 1 ? 'are' : 'is'} matching!`,
      body: 'Two sessions in a row. Moved to Improved.',
    };
  }

  // 2. Streak milestones.
  const streak = dayStreak(sessionsAfter);
  if (streak !== dayStreak(sessionsAfter.slice(0, -1)) && [3, 7, 14, 30].includes(streak)) {
    return { size: 'big', title: `${streak}-day streak 🔥`, body: 'Showing up is what makes sounds stick.' };
  }

  // 3. A target matched this time (one more to go).
  const progressed = (Object.values(after.weakSounds) as WeakSound[]).filter(
    (w) => w.status === 'active' && w.cleanStreak > (before.weakSounds[w.phone]?.cleanStreak ?? 0),
  );
  if (kind === 'custom' && progressed.length) {
    return { size: 'small', title: `${progressed.map(ipa).join(', ')} matched this time`, body: 'Match once more to mark it improved.' };
  }

  // 4. First reading, or a clean one.
  if (before.sessionCount === 0) return { size: 'small', title: 'First reading done', body: 'Your practice plan starts here.' };
  if (isClearReading(result)) return { size: 'small', title: 'Clean reading', body: 'Nothing was flagged.' };
  return null;
}
