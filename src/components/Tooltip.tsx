import { useRef, useState, type ReactElement, type ReactNode } from 'react';

const DELAY = 900; // ms of hovering before the first tip shows
const WARM_DELAY = 120; // once a tip was just seen, the next one comes quickly
const WARM_WINDOW = 600;
const TIP_MAX_W = 240; // keep in sync with .tip max-width in styles.css
const MARGIN = 8; // minimum gap to the window edge
let lastHidden = 0;

interface Props {
  tip: ReactNode;
  children: ReactElement;
  side?: 'right' | 'bottom';
}

interface Pos {
  x: number;
  y: number;
  /** where the tip really is: 'left' when there was no room on the right */
  at: 'right' | 'left' | 'bottom' | 'top';
}

/**
 * Hover hint: waits ~0.9 s so it never flickers while the cursor is just passing/clicking.
 * The wrapper has `display: contents` (no box of its own), so the position is measured
 * on the wrapped element, and the tip is kept inside the window.
 */
export function Tooltip({ tip, children, side = 'right' }: Props) {
  const [pos, setPos] = useState<Pos | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const wrap = useRef<HTMLSpanElement>(null);

  const hide = () => {
    window.clearTimeout(timer.current);
    setPos((p) => {
      if (p) lastHidden = Date.now();
      return null;
    });
  };

  const start = () => {
    window.clearTimeout(timer.current);
    const warm = Date.now() - lastHidden < WARM_WINDOW;
    timer.current = window.setTimeout(() => {
      const target = wrap.current?.firstElementChild as HTMLElement | null;
      if (!target) return;
      const r = target.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return; // hidden / detached element
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (side === 'right') {
        const fitsRight = r.right + 10 + TIP_MAX_W + MARGIN <= vw;
        const y = Math.min(Math.max(r.top + r.height / 2, MARGIN + 20), vh - MARGIN - 20);
        setPos(fitsRight ? { x: r.right + 10, y, at: 'right' } : { x: r.left - 10, y, at: 'left' });
      } else {
        const x = Math.min(Math.max(r.left + r.width / 2, TIP_MAX_W / 2 + MARGIN), vw - TIP_MAX_W / 2 - MARGIN);
        const fitsBelow = r.bottom + 10 + 80 <= vh;
        setPos(fitsBelow ? { x, y: r.bottom + 10, at: 'bottom' } : { x, y: r.top - 10, at: 'top' });
      }
    }, warm ? WARM_DELAY : DELAY);
  };

  return (
    <span ref={wrap} className="tip-wrap" onMouseEnter={start} onMouseLeave={hide} onMouseDown={hide} onBlur={hide}>
      {children}
      {pos && (
        <span className={`tip tip-${pos.at}`} style={{ left: pos.x, top: pos.y }} role="tooltip">
          {tip}
        </span>
      )}
    </span>
  );
}
