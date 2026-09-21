import { useEffect, useRef, useState } from 'react';
import { PHONE_INFO, type Phone } from '../services/phonemes/inventory';
import { dayStreak, IMPROVED_AFTER, type Profile, type SessionRecord, type Settings, type WeakSound } from '../services/profile';
import type { Theme } from '../services/theme';
import { pronounce } from '../services/ttsService';

export interface ControlsProps {
  theme: Theme;
  onToggleTheme: () => void;
  onTutorial: () => void;
  onSettings: () => void;
}

/** Theme, tutorial and settings buttons (sidebar on desktop, top bar on mobile). */
export function Controls({ theme, onToggleTheme, onTutorial, onSettings }: ControlsProps) {
  const btn = 'grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-lg hover:border-accent hover:text-accent';
  return (
    <div className="flex items-center gap-2">
      <button onClick={onToggleTheme} className={btn} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title="Light / dark">
        {theme === 'dark' ? '☀' : '☾'}
      </button>
      <button onClick={onTutorial} className={btn} aria-label="How Vaani works" title="Tutorial">ⓘ</button>
      <button onClick={onSettings} className={btn} aria-label="Settings" title="Settings">⚙</button>
    </div>
  );
}

interface Props {
  profile: Profile | null;
  sessions: SessionRecord[];
  settings: Settings;
}

/** Progress panel: stats and the sounds being practiced, each with a listen button. */
export function ProgressPanel({ profile, sessions, settings }: Props) {
  const all = profile ? (Object.values(profile.weakSounds) as WeakSound[]) : [];
  const active = all.filter((w) => w.status === 'active').sort((a, b) => b.confirmations - a.confirmations);
  const improved = all.filter((w) => w.status === 'improved');
  const streak = dayStreak(sessions);
  const [playing, setPlaying] = useState<Phone | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);

  async function toggle(w: WeakSound) {
    stopRef.current?.();
    stopRef.current = null;
    if (playing === w.phone) { setPlaying(null); return; }
    setPlaying(w.phone);
    const words = [PHONE_INFO[w.phone].example, ...(w.words ?? [])];
    const text = [...new Set(words.map((x) => x.toLowerCase()))].join(', ') + '.';
    const useNatural = settings.voice === 'natural' && !!settings.naturalVoiceReady;
    try {
      stopRef.current = await pronounce(text, useNatural, () => setPlaying((p) => (p === w.phone ? null : p)));
    } catch {
      setPlaying(null);
    }
  }

  const stats = [
    { label: 'Sessions', value: profile?.sessionCount ?? 0, color: 'text-accent' },
    { label: 'Day streak', value: streak, color: 'text-sun', icon: streak > 0 ? '🔥' : '' },
    { label: 'Practicing', value: active.length, color: 'text-practice' },
    { label: 'Improved', value: improved.length, color: 'text-matched' },
  ];

  return (
    <div>
      <h2 className="text-lg font-bold">Your progress</h2>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-paper p-3">
            <dt className="text-xs text-ink-soft">{s.label}</dt>
            <dd className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}{s.icon && <span className="ml-1 text-lg">{s.icon}</span>}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-7 text-lg font-bold">Sounds to work on</h2>
      {active.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">
          {profile?.sessionCount ? 'None right now. Nice work.' : 'Sounds you confirm in a review appear here.'}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {active.map((w) => {
            const info = PHONE_INFO[w.phone];
            const on = playing === w.phone;
            return (
              <li key={w.phone} className="flex items-center gap-3 rounded-xl border border-line border-l-4 border-l-practice bg-paper p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold">/{info.ipa}/</span>
                    <span className="truncate text-sm text-ink-soft">{info.example}{w.words?.length ? `, ${w.words.join(', ')}` : ''}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5" aria-label={`Matched in ${w.cleanStreak} of ${IMPROVED_AFTER} sessions needed`}>
                    {Array.from({ length: IMPROVED_AFTER }, (_, i) => (
                      <span key={i} className={`h-1.5 w-6 rounded-full ${i < w.cleanStreak ? 'bg-matched' : 'bg-line'}`} />
                    ))}
                    <span className="ml-1 text-xs text-ink-soft">{w.cleanStreak}/{IMPROVED_AFTER} clean</span>
                  </div>
                </div>
                <button
                  onClick={() => toggle(w)}
                  aria-pressed={on}
                  aria-label={`${on ? 'Stop' : 'Hear'} /${info.ipa}/ pronounced`}
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border text-lg ${on ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface hover:border-accent'}`}
                >
                  {on ? '■' : '🔊'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {improved.length > 0 && (
        <>
          <h2 className="mt-7 text-lg font-bold">Improved</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {improved.map((w) => (
              <li key={w.phone} className="rounded-full bg-matched/15 px-3 py-1 text-sm">
                <span className="text-matched">✓</span> /{PHONE_INFO[w.phone].ipa}/ {PHONE_INFO[w.phone].example}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
