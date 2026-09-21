import { useEffect, useRef, useState, type ReactNode } from 'react';
import { acousticEngine, type AnalysisResult, type AnalyzeOptions } from '../services/acousticEngine';
import { blobTo16kMono, recordingQuality, rms, stopPlayback } from '../services/audio/pcm';
import { Recorder } from '../services/audio/recorder';
import { LiveMeter } from './LiveMeter';

type Phase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'recording'; startedAt: number }
  | { kind: 'analyzing'; done: number; total: number }
  | { kind: 'error'; message: string };

interface Props {
  text: string;
  onResult: (r: AnalysisResult) => void;
  /** Extra analysis options (second model, per-speaker calibration) */
  analyzeOptions?: Omit<AnalyzeOptions, 'onProgress'>;
  heading?: string;
  /** Extra content above the paragraph (e.g. target sounds) */
  header?: ReactNode;
  /** Lets the parent hide controls such as "New set" while recording */
  onBusyChange?: (busy: boolean) => void;
}

export function RecorderView({ text, onResult, analyzeOptions, heading = 'Read this aloud', header, onBusyChange }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [now, setNow] = useState(Date.now());
  const recorder = useRef<Recorder | null>(null);
  const generation = useRef(0);
  const starting = useRef(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [micNote, setMicNote] = useState('');
  const checking = useRef(false);
  const refreshDevices = async () => {
    try { setDevices((await navigator.mediaDevices?.enumerateDevices() ?? []).filter(d => d.kind === 'audioinput')); } catch { /* permission may be needed */ }
  };
  useEffect(() => {
    void refreshDevices();
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices);
  }, []);

  // Timer while recording
  useEffect(() => {
    if (phase.kind !== 'recording') return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [phase.kind]);

  useEffect(() => () => { generation.current++; recorder.current?.cancel(); }, []);
  useEffect(() => onBusyChange?.(phase.kind === 'starting' || phase.kind === 'recording' || phase.kind === 'analyzing'), [phase.kind, onBusyChange]);

  async function start(test = false) {
    if (starting.current) return;
    starting.current = true;
    const id = ++generation.current;
    checking.current = test;
    setMicNote('');
    setPhase({kind: 'starting'});
    stopPlayback(); window.speechSynthesis?.cancel();
    try {
      recorder.current = new Recorder();
      await recorder.current.start(deviceId, e => {
        generation.current++;
        setPhase({kind: 'error', message: e.message});
      });
      if (id !== generation.current) return;
      void refreshDevices();
      setNow(Date.now());
      setPhase({ kind: 'recording', startedAt: Date.now() });
    } catch (e) {
      if (id !== generation.current) return;
      const denied = e instanceof DOMException && e.name === 'NotAllowedError';
      setPhase({
        kind: 'error',
        message: denied
          ? 'Microphone access is blocked. Allow it in your browser’s site settings, then start again.'
          : `The microphone couldn't start: ${(e as Error).message}`,
      });
    } finally { starting.current = false; }
  }

  async function stop() {
    if (!recorder.current) return;
    const id = generation.current;
    setPhase({kind: 'analyzing', done: 0, total: 1});
    try {
      const blob = await recorder.current.stop();
      setPhase({ kind: 'analyzing', done: 0, total: 1 });
      const pcm = await blobTo16kMono(blob);
      if (id !== generation.current) return;
      if (checking.current) {
        const q = recordingQuality(pcm);
        setMicNote(rms(pcm) < 0.003 ? 'Too quiet. Check the selected microphone and move closer.' : q.clippedRatio > 0.001 ? 'The mic is overloaded. Move back or lower its input level.' : 'Audio was captured. Read at a normal pace in a quiet room. This check does not assess pronunciation.');
        setPhase({kind: 'idle'}); return;
      }
      const result = await acousticEngine.analyze(pcm, text, {
        ...analyzeOptions,
        onProgress: (done, total) => { if (id === generation.current) setPhase({ kind: 'analyzing', done, total }); },
      });
      if (id === generation.current) onResult(result);
    } catch (e) {
      if (id === generation.current) setPhase({ kind: 'error', message: (e as Error).message });
    }
  }

  useEffect(() => {
    if (phase.kind !== 'recording') return;
    const timer = setTimeout(() => void stop(), checking.current ? 6000 : 180000);
    return () => clearTimeout(timer);
  }, [phase.kind]);

  const secs = phase.kind === 'recording' ? Math.floor((now - phase.startedAt) / 1000) : 0;

  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <h2 className="text-2xl font-bold">{heading}</h2>
      <p className="mt-2 text-ink-soft">
        Read at your normal pace. Press Start when you're ready and Stop when you finish.
        A quiet room and a mic about a hand's width away give the clearest results.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label>Microphone <select aria-label="Microphone" value={deviceId} disabled={phase.kind === 'starting' || phase.kind === 'recording' || phase.kind === 'analyzing'} onChange={e => setDeviceId(e.target.value)} className="rounded border border-line bg-surface p-2">
          <option value="">System default</option>
          {devices.filter(d => d.deviceId).map((d,i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i+1}`}</option>)}
        </select></label>
        {(phase.kind === 'idle' || phase.kind === 'error') && <button onClick={() => void start(true)} className="rounded border border-line p-2">Check mic for 6 seconds</button>}
      </div>
      {micNote && <p role="status" className="mt-3">{micNote}</p>}
      {header}
      <p className="mt-8 text-[1.35rem] leading-[1.75] max-w-[62ch]">{text}</p>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        {(phase.kind === 'idle' || phase.kind === 'error') && (
          <button
            onClick={() => void start()}
            className="rounded-lg bg-accent px-6 py-3 text-lg font-bold text-on-accent hover:brightness-110"
          >
            Start recording
          </button>
        )}
        {phase.kind === 'starting' && <p role="status">Waiting for microphone permission…</p>}
        {(phase.kind === 'starting' || phase.kind === 'recording') && <button className="rounded border border-line px-4 py-3" onClick={() => { generation.current++; recorder.current?.cancel(); setPhase({kind: 'idle'}); }}>Cancel</button>}
        {phase.kind === 'recording' && (
          <>
            <button
              onClick={stop}
              className="rounded-lg bg-ink px-6 py-3 text-lg font-bold text-paper hover:brightness-125"
            >
              Stop recording
            </button>
            <span className="flex items-center gap-2 tabular-nums text-ink-soft" aria-live="off">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-practice" aria-hidden />
              {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
            </span>
          </>
        )}
        {phase.kind === 'recording' && recorder.current && <LiveMeter recorder={recorder.current} />}
        {phase.kind === 'analyzing' && (
          <p role="status" className="text-ink-soft">
            Listening back on your device… {phase.total > 1 && `part ${phase.done} of ${phase.total}`}
          </p>
        )}
      </div>

      {phase.kind === 'error' && (
        <p role="alert" className="mt-6 rounded-lg border border-practice/40 bg-practice/10 px-4 py-3">
          {phase.message}
        </p>
      )}
    </section>
  );
}
