import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  wide?: boolean;
}

/** Accessible dialog: focuses itself, Esc closes (when closable), page behind is inert-looking. */
export function Modal({ title, onClose, children, wide }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && onClose) onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-6"
      onMouseDown={(e) => { if (onClose && e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[92dvh] overflow-y-auto bg-paper rounded-t-2xl sm:rounded-2xl shadow-xl outline-none`}
      >
        <div className="sticky top-0 flex items-center justify-between gap-4 bg-paper px-6 pt-5 pb-3 border-b border-line">
          <h2 className="text-xl font-bold">{title}</h2>
          {onClose && (
            <button onClick={onClose} className="rounded-md px-2 py-1 text-ink-soft hover:bg-line" aria-label="Close">
              ✕
            </button>
          )}
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
