import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { contrastHint } from '../services/coaching';
import { REVIEW_PAD_SEC } from '../config';
import type { AnalysisResult } from '../services/acousticEngine';
import { playRange, stopPlayback, type Playback } from '../services/audio/pcm';
import type { SoundReport, WordResult } from '../services/engine/types';
import { PHONE_INFO, type Phone } from '../services/phonemes/inventory';
import { tokenizeText } from '../services/phonemes/lexicon';
import type { Review, SessionRecord, Settings } from '../services/profile';
import { basicVoiceAvailable, naturalVoice, speakBasic } from '../services/ttsService';
import { Modal } from './Modal';

interface Props {
  result: AnalysisResult;
  settings: Settings;
  onDone: (reviews: SessionRecord['reviews']) => void;
}

/** One card per flagged sound: your clip vs. the reference, then Agree / Disagree. */
export function ReviewModal({ result, settings, onDone }: Props) {
  const flagged = useMemo(() => result.sounds.filter((s) => s.status === 'practice'), [result]);
  const [i, setI] = useState(0);
  const [reviews, setReviews] = useState<SessionRecord['reviews']>({});
  const sound = flagged[i];

  function decide(v: Review | null) {
    stopPlayback();
    window.speechSynthesis?.cancel();
    const next = v ? { ...reviews, [sound.phone]: v } : reviews;
    setReviews(next);
    if (i + 1 >= flagged.length) onDone(next);
    else setI(i + 1);
  }

  if (!sound) return null;
  const info = PHONE_INFO[sound.phone];
  return (
    <Modal title={`Sound ${i + 1} of ${flagged.length}: /${info.ipa}/ as in “${info.example}”`} wide>
      <SoundReview key={sound.phone} result={result} sound={sound} settings={settings} />
      <p className="mt-6 text-ink-soft">Does your clip sound different from the reference on this sound?</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={() => decide('agree')} className="rounded-lg bg-accent px-6 py-3 text-lg font-bold text-on-accent hover:brightness-110">
          ✅ Agree
        </button>
        <button onClick={() => decide('disagree')} className="rounded-lg border-2 border-ink px-6 py-3 text-lg font-bold hover:bg-ink hover:text-paper">
          ❌ Disagree — false positive
        </button>
        <button onClick={() => decide(null)} className="px-3 py-2 text-ink-soft underline underline-offset-4 hover:text-ink">
          Skip
        </button>
      </div>
      <p className="mt-3 text-sm text-ink-soft">Disagree removes this flag, and it won't shape your practice. Skip decides nothing.</p>
    </Modal>
  );
}

function SoundReview({ result, sound, settings }: { result: AnalysisResult; sound: SoundReport; settings: Settings }) {
  const errorWords = useMemo(() => {
    const seen = new Set<number>();
    return sound.occurrences.filter((o) => o.status === 'error' && !seen.has(o.wordIndex) && seen.add(o.wordIndex));
  }, [sound]);
  const [wordIndex, setWordIndex] = useState(errorWords[0]?.wordIndex ?? 0);
  const clip = useMemo(() => clipAround(result, wordIndex), [result, wordIndex]);
  const word = result.words[wordIndex];

  return (
    <div>
      {errorWords.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Flagged words">
          <span className="text-sm text-ink-soft">Flagged in:</span>
          {errorWords.map((o) => (
            <button
              key={o.wordIndex}
              onClick={() => { stopPlayback(); window.speechSynthesis?.cancel(); setWordIndex(o.wordIndex); }}
              aria-pressed={o.wordIndex === wordIndex}
              className="rounded-full border border-line px-3 py-1 aria-pressed:border-practice aria-pressed:bg-practice/15"
            >
              {o.word}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <UserClipCard key={`u${wordIndex}`} result={result} clip={clip} errorIndex={wordIndex} />
        <ReferenceCard key={`r${wordIndex}`} text={clip.text} settings={settings} />
      </div>
      <p className="mt-4 text-sm">
        In “<b>{word.text}</b>”, {describe(word, sound.phone)}
      </p>
    </div>
  );
}

function describe(word: WordResult, phone: Phone): string {
  const p = word.phones.find((x) => x.expected === phone && x.status === 'error');
  const want = `/${PHONE_INFO[phone].ipa}/`;
  if (!p) return `${want} differed from the reference.`;
  return contrastHint(word.text, phone, p.observed);
}

interface Clip { start: number; end: number; words: WordResult[]; text: string; textStart: number }

/** The flagged word plus REVIEW_PAD_SEC of recording on each side. */
function clipAround(r: AnalysisResult, wordIndex: number): Clip {
  const w = r.words[wordIndex];
  const start = Math.max(0, w.start - REVIEW_PAD_SEC);
  const end = Math.min(r.durationSec, w.end + REVIEW_PAD_SEC);
  let words = r.words.filter((x) => x.end > start && x.start < end);
  if (!words.includes(w)) words = [w];
  const textStart = words[0].charStart;
  return { start, end, words, text: r.text.slice(textStart, words[words.length - 1].charEnd), textStart };
}

/** requestAnimationFrame loop while `active` */
function useFrame(active: boolean, tick: () => void) {
  const ref = useRef(tick);
  ref.current = tick;
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = () => { ref.current(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}

function PlayButton({ playing, busy, onClick, label }: { playing: boolean; busy?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="rounded-lg bg-ink px-4 py-2 font-bold text-paper hover:brightness-125 disabled:opacity-60"
    >
      {busy ? 'Preparing…' : playing ? 'Stop' : label}
    </button>
  );
}

/** Your recording; context words turn green as they play, the flagged word amber. */
function UserClipCard({ result, clip, errorIndex }: { result: AnalysisResult; clip: Clip; errorIndex: number }) {
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(-1);
  const pb = useRef<Playback | null>(null);
  useFrame(playing, () => pb.current && setPos(pb.current.position()));
  useEffect(() => () => pb.current?.stop(), []);

  function toggle() {
    if (playing) return pb.current?.stop();
    setPos(clip.start);
    setPlaying(true);
    pb.current = playRange(result.audio, result.sampleRate, clip.start, clip.end, () => {
      setPlaying(false);
      setPos(Infinity);
    });
  }

  const parts: ReactNode[] = [];
  let cursor = clip.textStart;
  for (const w of clip.words) {
    parts.push(result.text.slice(cursor, w.charStart));
    const on = pos >= w.start;
    const isError = w.index === errorIndex;
    parts.push(
      <span
        key={w.index}
        className={`rounded px-0.5 transition-colors ${on ? (isError ? 'bg-practice/30 underline decoration-practice decoration-2 underline-offset-4' : 'bg-matched/20') : isError ? 'underline decoration-dotted decoration-practice underline-offset-4' : ''}`}
      >
        {result.text.slice(w.charStart, w.charEnd)}
      </span>,
    );
    cursor = w.charEnd;
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold">Your clip</h3>
        <PlayButton playing={playing} onClick={toggle} label="▶ Play" />
      </div>
      <p className="mt-3 text-lg leading-relaxed">{parts}</p>
    </section>
  );
}

/** The same phrase from the reference voice, highlighted in one color as it's spoken. */
function ReferenceCard({ text, settings }: { text: string; settings: Settings }) {
  const words = useMemo(() => tokenizeText(text), [text]);
  const natural = settings.voice === 'natural' && !!settings.naturalVoiceReady;
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lit, setLit] = useState(-1); // index of last highlighted word
  const pb = useRef<Playback | null>(null);
  const times = useRef<number[] | null>(null);
  const stopSpeech = useRef<(() => void) | null>(null);

  // Start preparing the natural voice as soon as the card appears.
  useEffect(() => {
    if (natural) naturalVoice.synth(text).catch(() => {});
    return () => { pb.current?.stop(); stopSpeech.current?.(); };
  }, [natural, text]);

  useFrame(playing && natural, () => {
    if (!pb.current || !times.current) return;
    const t = pb.current.position();
    let k = -1;
    times.current.forEach((s, j) => { if (t >= s) k = j; });
    setLit(k);
  });

  async function toggle() {
    if (playing) {
      pb.current?.stop();
      stopSpeech.current?.();
      setPlaying(false);
      return;
    }
    setError(null);
    setLit(-1);
    if (natural) {
      try {
        setBusy(true);
        const s = await naturalVoice.synth(text);
        times.current = s.words.map((w) => w.start);
        setBusy(false);
        setPlaying(true);
        pb.current = playRange(s.pcm, s.sampleRate, 0, s.pcm.length / s.sampleRate, () => {
          setPlaying(false);
          setLit(words.length);
        });
      } catch (e) {
        setBusy(false);
        setError(`The natural voice couldn't play: ${(e as Error).message}`);
      }
      return;
    }
    if (!basicVoiceAvailable()) {
      setError('This browser has no built-in voice. Choose the natural voice in Settings.');
      return;
    }
    stopPlayback();
    setPlaying(true);
    let sawBoundary = false;
    stopSpeech.current = speakBasic(
      text,
      (ci) => {
        sawBoundary = true;
        let k = -1;
        words.forEach((w, j) => { if (w.charStart <= ci) k = j; });
        setLit(k);
      },
      () => { setPlaying(false); setLit(words.length); },
    );
    // Voices without word events: highlight the whole phrase while speaking.
    setTimeout(() => { if (!sawBoundary) setLit(words.length); }, 400);
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  words.forEach((w, j) => {
    parts.push(text.slice(cursor, w.charStart));
    parts.push(
      <span key={j} className={`rounded px-0.5 transition-colors ${j <= lit ? 'bg-accent/20' : ''}`}>
        {text.slice(w.charStart, w.charEnd)}
      </span>,
    );
    cursor = w.charEnd;
  });
  parts.push(text.slice(cursor));

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold">Reference</h3>
        <PlayButton playing={playing} busy={busy} onClick={toggle} label="▶ Play" />
      </div>
      <p className="mt-3 text-lg leading-relaxed">{parts}</p>
      <p className="mt-2 text-xs text-ink-soft">{natural ? 'Natural voice' : 'Browser voice'}, General American accent</p>
      {error && <p role="alert" className="mt-2 text-sm text-practice">{error}</p>}
    </section>
  );
}
