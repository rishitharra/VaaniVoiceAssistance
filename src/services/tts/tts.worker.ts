/// <reference lib="webworker" />
import { KokoroTTS } from 'kokoro-js';
import { TTS_MODEL } from '../../config';
import { useLocalOrt } from '../ortPaths';

export type TtsIn = { type: 'load' } | { type: 'speak'; id: number; text: string };
export type TtsOut =
  | { type: 'download'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'error'; message: string; id?: number }
  | { type: 'audio'; id: number; audio: Float32Array; sampleRate: number };

useLocalOrt();
const post = (m: TtsOut, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer);

let tts: KokoroTTS | null = null;
let loading: Promise<void> | null = null;

async function load() {
  const files = new Map<string, { loaded: number; total: number }>();
  tts = await KokoroTTS.from_pretrained(TTS_MODEL.id, {
    dtype: TTS_MODEL.dtype,
    device: TTS_MODEL.device,
    progress_callback: (p: any) => {
      if (p.status !== 'progress' || !p.file) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) { loaded += f.loaded; total += f.total; }
      post({ type: 'download', loaded, total });
    },
  });
  // Fetches and caches the voice file too, so the voice works offline afterwards.
  await tts.generate('Ready.', { voice: TTS_MODEL.voice, speed: TTS_MODEL.speed });
}

self.onmessage = async (e: MessageEvent<TtsIn>) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      loading ??= load();
      await loading;
      post({ type: 'ready' });
    } else {
      if (!loading) throw new Error('Voice not loaded');
      await loading;
      const out = await tts!.generate(m.text, { voice: TTS_MODEL.voice, speed: TTS_MODEL.speed });
      const audio = out.audio as Float32Array;
      post({ type: 'audio', id: m.id, audio, sampleRate: out.sampling_rate }, [audio.buffer]);
    }
  } catch (err) {
    if (m.type === 'load') loading = null;
    post({ type: 'error', message: err instanceof Error ? err.message : String(err), id: m.type === 'speak' ? m.id : undefined });
  }
};
