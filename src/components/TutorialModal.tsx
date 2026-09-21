import { TUTORIAL_VIDEO_SRC } from '../config';
import { Modal } from './Modal';

export function TutorialModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How Vaani works" onClose={onClose}>
      {TUTORIAL_VIDEO_SRC ? (
        <video src={`${import.meta.env.BASE_URL}${TUTORIAL_VIDEO_SRC}`} controls playsInline className="mb-6 w-full rounded-xl bg-black" />
      ) : (
        <div className="mb-6 grid aspect-video place-items-center rounded-xl border-2 border-dashed border-line bg-surface text-center text-ink-soft">
          <div>
            <div className="text-3xl" aria-hidden>▶</div>
            <p className="mt-2">Video walkthrough coming soon</p>
          </div>
        </div>
      )}
      <ol className="space-y-3 leading-relaxed">
        <li><b className="text-accent">Read.</b> Read the paragraph aloud. Recording starts only when you press Start.</li>
        <li><b className="text-accent">Listen back.</b> Vaani checks each sound against General American English, on your device.</li>
        <li><b className="text-accent">Review.</b> For each sound flagged <span className="font-bold text-practice">Practice this sound</span>, compare your clip with the reference and choose Agree or Disagree. Disagreeing dismisses this session’s flag; future recordings are assessed independently.</li>
        <li><b className="text-accent">Learn.</b> Watch the short clip for each sound you agreed with. Repeat it as often as you like.</li>
        <li><b className="text-accent">Practice.</b> Vaani builds new sentences packed with your sounds. A sound is marked improved after it matches in two sessions in a row.</li>
      </ol>
      <h3 className="mt-6 font-bold">What the colors mean</h3>
      <ul className="mt-2 space-y-1">
        <li><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-matched" />Matched reference</li>
        <li><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-practice" />Practice this sound: it differed in 2 or more words</li>
        <li><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-uncertain" />Uncertain: not enough clear evidence either way</li>
      </ul>
      <p className="mt-6 text-sm text-ink-soft">
        For the clearest results, read in a quiet room with the mic about a hand's width away. A headset helps.
        There are no scores, and your recordings never leave this device.
      </p>
    </Modal>
  );
}
