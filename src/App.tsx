import { isClearReading } from './services/engine/evidence';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CustomPractice } from './components/CustomPractice';
import { HomeScreen } from './components/HomeScreen';
import { ModelGate } from './components/ModelGate';
import { PronunciationCoach } from './components/PronunciationCoach';
import { RecorderView } from './components/RecorderView';
import { ResultsPreview } from './components/ResultsPreview';
import { ReviewModal } from './components/ReviewModal';
import { Celebration, type CelebrationData } from './components/Celebration';
import { Modal } from './components/Modal';
import { SettingsModal } from './components/SettingsModal';
import { Controls, ProgressPanel } from './components/Sidebar';
import { TutorialModal } from './components/TutorialModal';
import { WelcomeScreen } from './components/WelcomeScreen';
import { PRESET_PARAGRAPH } from './data/presetParagraph';
import type { AnalysisResult } from './services/acousticEngine';
import type { Phone } from './services/phonemes/inventory';
import {
  activeTargets, applySession, newProfile, toSessionRecord,
  type Profile, type SessionRecord, type Settings,
} from './services/profile';
import { buildPracticeSet, type PracticeSet } from './services/sentenceSelector';
import { celebrationFor } from './services/rewards';
import { storage } from './services/storageService';
import { useTheme } from './services/theme';
import { naturalVoice } from './services/ttsService';

type Draft =
  | { kind: 'preset'; text: string }
  | { kind: 'custom'; text: string; set: PracticeSet };

type Screen =
  | { name: 'loading' }
  | { name: 'welcome' }
  | { name: 'home'; notice?: string }
  | { name: 'record'; draft: Draft }
  | { name: 'results'; draft: Draft; result: AnalysisResult; reviewing: boolean }
  | { name: 'coach'; sounds: { phone: Phone; words: string[] }[] };

export default function App() {
  return (
    <ModelGate>
      <Vaani />
    </ModelGate>
  );
}

const hasFlags = (r: AnalysisResult) => r.sounds.some((s) => s.status === 'practice');

function Vaani() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings>({ voice: 'basic' });
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [theme, toggleTheme] = useTheme();
  const [dialog, setDialog] = useState<'tutorial' | 'settings' | 'progress' | null>(null);
  const saving = useRef(false);
  const [storageError, setStorageError] = useState('');
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  const clearCelebration = useCallback(() => setCelebration(null), []);

  const loadSaved = useCallback(async () => {
    const [p, s, list] = await Promise.all([storage.getProfile(), storage.getSettings(), storage.listSessions()]);
    setProfile(p ?? null);
    setSettings(s);
    setSessions(list);
    // Warm the natural voice from its cached files in the background.
    if (s.voice === 'natural' && s.naturalVoiceReady) naturalVoice.load().catch(() => {});
    return p ?? null;
  }, []);

  useEffect(() => {
    loadSaved().then(() => setScreen({ name: 'welcome' })).catch(() => { setStorageError('Local storage could not open. Allow site storage and reload Vaani.'); setScreen({name:'welcome'}); });
  }, [loadSaved]);

  const updateSettings = (s: Settings) => {
    setSettings(s);
    void storage.saveSettings(s).catch(() => setStorageError('Settings could not be saved. Check available browser storage.'));
  };

  const onDataChanged = async () => {
    const p = await loadSaved();
    setScreen(p ? { name: 'home' } : { name: 'welcome' });
  };

  async function startNew() {
    await storage.resetAll();
    const p = newProfile();
    await storage.saveProfile(p);
    setProfile(p);
    setSessions([]);
    setScreen({ name: 'record', draft: { kind: 'preset', text: PRESET_PARAGRAPH } });
  }

  function startPractice(random = false) {
    if (!profile) return;
    const set = buildPracticeSet(random ? [] : activeTargets(profile), profile.recentSentenceIds);
    setScreen({ name: 'record', draft: { kind: 'custom', text: set.text, set } });
  }

  const analyzeOptions = {
    useAlt: !!settings.crossCheck && !!settings.altModelReady,
    history: profile?.gopStats,
  };

  const showResults = (draft: Draft) => (result: AnalysisResult) =>
    setScreen({ name: 'results', draft, result, reviewing: hasFlags(result) });

  async function finishSession(draft: Draft, result: AnalysisResult, reviews: SessionRecord['reviews']) {
    if (!profile || saving.current) return;
    saving.current = true;
    setStorageError('');
    try {
    const targets = draft.kind === 'custom' ? draft.set.targets : [];
    const ids = draft.kind === 'custom' ? draft.set.sentenceIds : [];
    const record = toSessionRecord(result, draft.kind, targets, ids, reviews);
    const next = applySession(profile, result, reviews, ids);
    await storage.saveCompletedSession(record, next);
    try { await storage.saveAudio(record.id, result.audio); } catch { setStorageError('Progress was saved, but this recording could not be stored. Free some browser storage.'); }
    setProfile(next);
    const list = [...sessions, record];
    setSessions(list);
    setCelebration(celebrationFor(profile, next, result, draft.kind, list));

    const confirmed = result.sounds
      .filter((s) => s.status === 'practice' && reviews[s.phone] === 'agree')
      .map((s) => ({ phone: s.phone, words: s.errorWords }));
    if (confirmed.length) setScreen({ name: 'coach', sounds: confirmed });
    else setScreen({
      name: 'home',
      notice: hasFlags(result) ? 'Saved. No sounds were confirmed this time.' : isClearReading(result) ? 'No mistakes detected in the sounds we could assess. Random practice is unlocked!' : 'Saved. Some sounds were uncertain; record again for a clearer check.',
    });
    } catch { setStorageError('Could not save this reading. Free some browser storage, then try Save again.'); }
    finally { saving.current = false; }
  }

  const canGoHome = !!profile && screen.name !== 'loading' && screen.name !== 'welcome';
  const controls = (
    <Controls
      theme={theme}
      onToggleTheme={toggleTheme}
      onTutorial={() => setDialog('tutorial')}
      onSettings={() => setDialog('settings')}
    />
  );
  const panel = <ProgressPanel profile={profile} sessions={sessions} settings={settings} />;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0">
        <header className="flex items-center justify-between gap-3 px-6 pt-5" style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}>
          <button
            onClick={() => canGoHome && setScreen({ name: 'home' })}
            className="text-2xl font-bold tracking-tight text-accent disabled:cursor-default"
            disabled={!canGoHome}
          >
            Vaani
          </button>
          {/* Mobile: controls + progress drawer live in the top bar */}
          <div className="flex items-center gap-2 lg:hidden">
            {profile && (
              <button onClick={() => setDialog('progress')} className="h-10 rounded-full border border-line bg-surface px-4 font-bold hover:border-accent">
                Progress
              </button>
            )}
            {controls}
          </div>
        </header>

        <main className="pb-24">
        {storageError && <p role="alert" className="mx-auto max-w-2xl p-6 text-practice">{storageError}</p>}
        {screen.name === 'welcome' && (
          <WelcomeScreen hasProfile={!!profile} onNew={startNew} onReturning={() => setScreen({ name: 'home' })} />
        )}

        {screen.name === 'home' && profile && (
          <HomeScreen
            profile={profile}
            notice={screen.notice}
            onPractice={() => startPractice()}
            onRandom={() => startPractice(true)}
            onReadingCheck={() => setScreen({ name: 'record', draft: { kind: 'preset', text: PRESET_PARAGRAPH } })}
          />
        )}

        {screen.name === 'record' && screen.draft.kind === 'preset' && (
          <RecorderView
            text={screen.draft.text}
            heading="Reading check"
            analyzeOptions={analyzeOptions}
            onResult={showResults(screen.draft)}
          />
        )}

        {screen.name === 'record' && screen.draft.kind === 'custom' && (
          <CustomPractice
            set={screen.draft.set}
            analyzeOptions={analyzeOptions}
            onResult={showResults(screen.draft)}
            onNewSet={() => {
              if (!profile || screen.draft.kind !== 'custom') return;
              const avoid = [...screen.draft.set.sentenceIds, ...profile.recentSentenceIds];
              const set = buildPracticeSet(screen.draft.set.targets, avoid);
              setScreen({ name: 'record', draft: { kind: 'custom', text: set.text, set } });
            }}
          />
        )}

        {screen.name === 'results' && (
          <>
            <ResultsPreview
              result={screen.result}
              reviewed={false}
              onReview={() => {
                if (hasFlags(screen.result)) setScreen({ ...screen, reviewing: true });
                else void finishSession(screen.draft, screen.result, {});
              }}
              onRetry={() => setScreen({ name: 'record', draft: screen.draft })}
            />
            {screen.reviewing && (
              <ReviewModal
                result={screen.result}
                settings={settings}
                onDone={(reviews) => void finishSession(screen.draft, screen.result, reviews)}
              />
            )}
          </>
        )}

        {screen.name === 'coach' && (
          <PronunciationCoach sounds={screen.sounds} onPractice={() => startPractice()} onHome={() => setScreen({ name: 'home' })} />
        )}
        </main>
      </div>

      <aside className="hidden lg:block sticky top-0 h-dvh overflow-y-auto border-l border-line bg-surface px-5 py-5" aria-label="Progress and settings">
        <div className="flex justify-end">{controls}</div>
        <div className="mt-6">{panel}</div>
      </aside>

      {dialog === 'tutorial' && <TutorialModal onClose={() => setDialog(null)} />}
      {dialog === 'settings' && (
        <SettingsModal settings={settings} onSettings={updateSettings} onDataChanged={onDataChanged} onClose={() => setDialog(null)} />
      )}
      {dialog === 'progress' && <Modal title="Your progress" onClose={() => setDialog(null)}>{panel}</Modal>}
      {celebration && <Celebration data={celebration} onDone={clearCelebration} />}
    </div>
  );
}
