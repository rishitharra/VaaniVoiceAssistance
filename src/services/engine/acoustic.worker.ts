/// <reference lib="webworker" />
import { AutoModelForCTC, AutoProcessor, AutoTokenizer, Tensor } from '@huggingface/transformers';
import { ENGINE, PHONEME_MODEL, PHONEME_MODEL_ALT } from '../../config';
import { useLocalOrt } from '../ortPaths';
import { blankFrames, buildClassMap, concatFrames, decodeCtc, framesFromLogits, sliceFrames, type FrameStream, type Vocab } from './ctc';
import type { RecognizedPhone } from './types';

export type ModelKey = 'primary' | 'alt';

export type WorkerIn =
  | { type: 'load'; which: ModelKey }
  | { type: 'analyze'; id: number; audio: Float32Array; useAlt: boolean };

export type WorkerOut =
  | { type: 'download'; which: ModelKey; loaded: number; total: number }
  | { type: 'ready'; which: ModelKey }
  | { type: 'error'; message: string; id?: number; which?: ModelKey }
  | { type: 'analyze-progress'; id: number; done: number; total: number }
  | { type: 'result'; id: number; phones: RecognizedPhone[]; posteriors: Float32Array; frames: number; altPosteriors?: Float32Array };

useLocalOrt(); // model files: HF CDN once, then browser cache

const post = (m: WorkerOut, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer);

interface Loaded { processor: any | null; model: any; vocab: Vocab; classMap: Int16Array }
const loaded: Record<ModelKey, Loaded | null> = { primary: null, alt: null };
const loading: Record<ModelKey, Promise<void> | null> = { primary: null, alt: null };

function buildVocab(tokenizer: any, V: number): Vocab {
  const id2token: string[] = new Array(V).fill('');
  const mv = tokenizer?.model?.vocab;
  if (Array.isArray(mv)) mv.forEach((t: string, i: number) => { if (i < V && t != null) id2token[i] = t; });
  for (const at of tokenizer?.added_tokens ?? []) if (at.id < V) id2token[at.id] = at.content;

  let blankId = tokenizer?.pad_token_id;
  if (typeof blankId !== 'number') {
    blankId = id2token.findIndex((t) => t === '<pad>' || t === '[PAD]');
    if (blankId < 0) blankId = 0;
  }
  const IGNORE = new Set(['|', ' ', '<s>', '</s>', '<unk>', '[UNK]', '<pad>', '[PAD]']);
  const ignoreIds = new Set<number>();
  id2token.forEach((t, i) => { if (i !== blankId && IGNORE.has(t)) ignoreIds.add(i); });
  return { id2token, blankId, ignoreIds };
}

/**
 * Older CTC repos ship vocab.json instead of tokenizer.json, which
 * AutoTokenizer can't read. Fetch the vocabulary ourselves and cache it so it
 * still works offline.
 */
async function vocabFromJson(id: string, V: number): Promise<Vocab> {
  const url = `https://huggingface.co/${id}/resolve/main/vocab.json`;
  let res: Response | undefined;
  try {
    const cache = await caches.open('transformers-cache');
    res = await cache.match(url);
    if (!res) {
      const fetched = await fetch(url);
      if (!fetched.ok) throw new Error(`vocab.json: ${fetched.status}`);
      await cache.put(url, fetched.clone());
      res = fetched;
    }
  } catch {
    res = await fetch(url);
  }
  if (!res?.ok) throw new Error('Could not load this model\'s vocabulary.');
  const map: Record<string, number> = await res.json();
  const id2token: string[] = new Array(V).fill('');
  for (const [token, i] of Object.entries(map)) if (i < V) id2token[i] = token;
  const pad = map['<pad>'] ?? map['[PAD]'] ?? 0;
  const IGNORE = new Set(['|', ' ', '<s>', '</s>', '<unk>', '[UNK]', '<pad>', '[PAD]']);
  const ignoreIds = new Set<number>();
  id2token.forEach((t, i) => { if (i !== pad && IGNORE.has(t)) ignoreIds.add(i); });
  return { id2token, blankId: pad, ignoreIds };
}

async function load(which: ModelKey) {
  const spec = which === 'primary' ? PHONEME_MODEL : PHONEME_MODEL_ALT;
  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (p: any) => {
    if (p.status !== 'progress' || !p.file) return;
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
    let l = 0;
    let t = 0;
    for (const f of files.values()) { l += f.loaded; t += f.total; }
    post({ type: 'download', which, loaded: l, total: t });
  };

  // Repos differ in which quantized file they ship; try the small ones in turn.
  const dtypes = [spec.dtype, 'int8', 'uint8'].filter((d, i, a) => a.indexOf(d) === i) as any[];
  let model: any = null;
  let lastErr: unknown = null;
  for (const dtype of dtypes) {
    try {
      model = await AutoModelForCTC.from_pretrained(spec.id, { dtype, device: spec.device, progress_callback });
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!model) {
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw new Error(
      /locate file/i.test(msg)
        ? 'This model has no small (quantized) version to download. Pick a different model id in src/config.ts.'
        : msg,
    );
  }

  const V = model.config?.vocab_size;
  let vocab: Vocab;
  try {
    const tokenizer = await AutoTokenizer.from_pretrained(spec.id, { progress_callback });
    vocab = buildVocab(tokenizer, V ?? (tokenizer as any).model.vocab.length);
  } catch {
    vocab = await vocabFromJson(spec.id, V ?? 512);
  }

  // Without a processor we normalize the waveform ourselves (what wav2vec2 does).
  let processor: any = null;
  try {
    processor = await AutoProcessor.from_pretrained(spec.id, { progress_callback });
  } catch {
    processor = null;
  }

  loaded[which] = { processor, model, vocab, classMap: buildClassMap(vocab) };
}

/** Zero-mean, unit-variance waveform, as the wav2vec2 feature extractor does. */
function manualInputs(m: Loaded, audio: Float32Array) {
  let sum = 0;
  for (const x of audio) sum += x;
  const mean = sum / audio.length;
  let varr = 0;
  for (const x of audio) varr += (x - mean) * (x - mean);
  varr /= audio.length;
  const scale = 1 / Math.sqrt(varr + 1e-7);
  const data = new Float32Array(audio.length);
  for (let i = 0; i < audio.length; i++) data[i] = (audio[i] - mean) * scale;

  const inputs: Record<string, Tensor> = { input_values: new Tensor('float32', data, [1, data.length]) };
  const names: string[] = m.model.sessions?.model?.inputNames ?? [];
  if (names.includes('attention_mask')) {
    inputs.attention_mask = new Tensor('int64', new BigInt64Array(data.length).fill(1n), [1, data.length]);
  }
  return inputs;
}

async function inferChunk(m: Loaded, audio: Float32Array): Promise<FrameStream> {
  const inputs = m.processor ? await m.processor(audio) : manualInputs(m, audio);
  const { logits } = await m.model(inputs);
  const [, T, V] = logits.dims as number[];
  return framesFromLogits(logits.data as Float32Array, T, V, m.classMap);
}

async function analyze(id: number, audio: Float32Array, useAlt: boolean) {
  const sr = ENGINE.sampleRate;
  const f = ENGINE.frameSec;
  const dur = audio.length / sr;
  const nChunks = Math.max(1, Math.ceil(dur / ENGINE.chunkSec));
  const keys: ModelKey[] = useAlt && loaded.alt ? ['primary', 'alt'] : ['primary'];
  const parts: Record<ModelKey, FrameStream[]> = { primary: [], alt: [] };

  for (let k = 0; k < nChunks; k++) {
    const keepStart = k * ENGINE.chunkSec;
    const keepEnd = Math.min(dur, (k + 1) * ENGINE.chunkSec);
    const winStart = Math.max(0, keepStart - ENGINE.chunkContextSec);
    const winEnd = Math.min(dur, keepEnd + ENGINE.chunkContextSec);
    const slice = audio.subarray(Math.floor(winStart * sr), Math.ceil(winEnd * sr));
    const need = Math.round(keepEnd / f) - Math.round(keepStart / f);
    const off = Math.round((keepStart - winStart) / f);

    for (const key of keys) {
      const fr = await inferChunk(loaded[key]!, slice);
      // Pad with blanks if the model returned fewer frames than the time span implies.
      const avail = Math.max(0, Math.min(need, fr.ids.length - off));
      parts[key].push(sliceFrames(fr, off, off + avail));
      if (avail < need) parts[key].push(blankFrames(need - avail, loaded[key]!.vocab.blankId));
    }
    post({ type: 'analyze-progress', id, done: k + 1, total: nChunks });
  }

  const stream = concatFrames(parts.primary);
  const altStream = keys.length > 1 ? concatFrames(parts.alt) : null;
  return { phones: decodeCtc(stream, loaded.primary!.vocab, f), stream, altStream };
}

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      loading[msg.which] ??= load(msg.which);
      await loading[msg.which];
      post({ type: 'ready', which: msg.which });
    } else {
      if (!loading.primary) throw new Error('Model not loaded');
      await loading.primary;
      const { phones, stream, altStream } = await analyze(msg.id, msg.audio, msg.useAlt);
      const transfer: Transferable[] = [stream.cls.buffer];
      if (altStream) transfer.push(altStream.cls.buffer);
      post(
        { type: 'result', id: msg.id, phones, posteriors: stream.cls, frames: stream.ids.length, altPosteriors: altStream?.cls },
        transfer,
      );
    }
  } catch (err) {
    if (msg.type === 'load') loading[msg.which] = null;
    post({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      id: msg.type === 'analyze' ? msg.id : undefined,
      which: msg.type === 'load' ? msg.which : undefined,
    });
  }
};
