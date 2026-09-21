import { useEffect, useRef, useState } from 'react';
import { PHONEME_MODEL_ALT, TTS_MODEL } from '../config';
import { acousticEngine } from '../services/acousticEngine';
import type { Settings } from '../services/profile';
import { storage } from '../services/storageService';
import { basicVoiceAvailable, naturalVoice } from '../services/ttsService';
import { Modal } from './Modal';

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => void;
  onDataChanged: () => void;
}

const mb = (b: number) => (b / 1024 / 1024).toFixed(0);

export function SettingsModal({ settings, onSettings, onDataChanged, onClose }: Props & { onClose: () => void }) {
  const [dl, setDl] = useState<{ loaded: number; total: number; what: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [usage, setUsage] = useState<number | null>(null);
  useEffect(() => { void storage.usageBytes().then(setUsage); }, [msg, dl]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function chooseNatural() {
    if (settings.naturalVoiceReady) return onSettings({ ...settings, voice: 'natural' });
    setMsg(null);
    setDl({ loaded: 0, total: 0, what: 'voice' });
    try {
      await naturalVoice.load((loaded, total) => setDl({ loaded, total, what: 'voice' }));
      onSettings({ ...settings, voice: 'natural', naturalVoiceReady: true });
    } catch (e) {
      setMsg(`The natural voice didn't finish downloading: ${(e as Error).message}. Check your connection and try again.`);
    } finally {
      setDl(null);
    }
  }

  async function toggleCrossCheck(on: boolean) {
    if (!on) return onSettings({ ...settings, crossCheck: false });
    if (settings.altModelReady) return onSettings({ ...settings, crossCheck: true });
    setMsg(null);
    setDl({ loaded: 0, total: 0, what: 'model' });
    try {
      await acousticEngine.load('alt', (loaded, total) => setDl({ loaded, total, what: 'model' }));
      onSettings({ ...settings, crossCheck: true, altModelReady: true });
    } catch (e) {
      setMsg(`The second model didn't load: ${(e as Error).message}`);
    } finally {
      setDl(null);
    }
  }

  async function exportFile() {
    const blob = new Blob([await storage.exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vaani-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importFile(f: File) {
    try {
      await storage.importAll(await f.text());
      setMsg('Progress imported.');
      onDataChanged();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function clearDownloads() {
    if (!confirm('Delete the downloaded model files? Vaani will download them again next time you open it. Your progress is kept.')) return;
    await storage.clearDownloads();
    onSettings({ ...settings, voice: 'basic', naturalVoiceReady: false, crossCheck: false, altModelReady: false });
    setMsg('Downloads deleted. Reload the page to finish freeing the space.');
  }

  async function reset() {
    if (!confirm('Delete all progress and recordings saved on this device?')) return;
    await storage.resetAll();
    setMsg('Progress deleted.');
    onDataChanged();
  }

  const pct = dl && dl.total ? Math.min(100, (dl.loaded / dl.total) * 100) : 0;

  return (
    <Modal title="Settings" onClose={onClose}>
      <fieldset>
        <legend className="font-bold">Reference voice</legend>
        <p className="mt-1 text-sm text-ink-soft">Used for the reference clip when you review a sound.</p>
        <div className="mt-3 space-y-2">
          <label className="flex items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-accent">
            <input
              type="radio"
              name="voice"
              className="mt-1"
              checked={settings.voice === 'basic'}
              onChange={() => onSettings({ ...settings, voice: 'basic' })}
              disabled={!!dl || !basicVoiceAvailable()}
            />
            <span>
              <span className="font-bold">Basic</span> — your browser's built-in voice. No download; sounds robotic.
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-accent">
            <input type="radio" name="voice" className="mt-1" checked={settings.voice === 'natural'} onChange={chooseNatural} disabled={!!dl} />
            <span>
              <span className="font-bold">Natural</span> — a human-sounding American voice.{' '}
              {settings.naturalVoiceReady ? 'Downloaded.' : `One-time download, about ${TTS_MODEL.approxDownloadMB} MB.`}
            </span>
          </label>
        </div>
      </fieldset>
      {dl && (
          <div className="mt-3" role="status">
            <div className="h-2 rounded-full bg-line overflow-hidden">
              <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-sm text-ink-soft tabular-nums">
              Downloading the {dl.what === 'voice' ? 'natural voice' : 'second model'}:{' '}
              {dl.total ? `${mb(dl.loaded)} of ${mb(dl.total)} MB` : 'starting…'}
            </p>
          </div>
      )}

      <fieldset className="mt-8">
        <legend className="font-bold">Accuracy</legend>
        <p className="mt-1 text-sm text-ink-soft">
          Vaani already calibrates flags against your own readings. A second opinion cuts false flags further.
        </p>
        <label className="mt-3 flex items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-accent">
          <input
            type="checkbox"
            className="mt-1"
            checked={!!settings.crossCheck}
            onChange={(e) => void toggleCrossCheck(e.target.checked)}
            disabled={!!dl}
          />
          <span>
            <span className="font-bold">Cross-check with a second model</span> — a sound is flagged only when both models agree.{' '}
            {settings.altModelReady
              ? 'Downloaded. Analysis takes about twice as long.'
              : `One-time download, about ${PHONEME_MODEL_ALT.approxDownloadMB} MB. Analysis then takes about twice as long.`}
          </span>
        </label>
      </fieldset>

      <h3 className="mt-8 font-bold">Downloaded files</h3>
      <p className="mt-1 text-sm text-ink-soft">
        Models stay on this device so Vaani works offline. They are not deleted when you close the tab.
        {usage !== null && ` This site is currently using about ${(usage / 1024 / 1024).toFixed(0)} MB.`}
      </p>
      <button onClick={clearDownloads} disabled={!!dl} className="mt-3 rounded-lg border-2 border-line px-4 py-2 font-bold hover:bg-line disabled:opacity-60">
        Delete downloaded models
      </button>

      <h3 className="mt-8 font-bold">Your progress</h3>
      <p className="mt-1 text-sm text-ink-soft">Saved only in this browser. Export a save file to move it to another device.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={exportFile} className="rounded-lg border-2 border-accent px-4 py-2 font-bold text-accent hover:bg-accent hover:text-on-accent">
          Export save file
        </button>
        <button onClick={() => fileRef.current?.click()} className="rounded-lg border-2 border-line px-4 py-2 font-bold hover:bg-line">
          Import save file
        </button>
        <button onClick={reset} className="rounded-lg px-4 py-2 font-bold text-practice hover:bg-practice/10">
          Delete progress
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }}
        />
      </div>
      {msg && <p role="status" className="mt-4 text-sm">{msg}</p>}
    </Modal>
  );
}
