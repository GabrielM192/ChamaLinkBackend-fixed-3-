import { useEffect, useRef, useState } from 'react';

// Animates a number from 0 up to `value` over `durationMs` when it
// first appears (and again whenever `value` itself changes - e.g.
// switching between members). Deliberately short (under a second) and
// eased out rather than linear: fast at the start, settling gently at
// the end, so it reads as "the real number arriving" rather than a
// gimmick you notice on every reload.
export function useCountUp(value: number, durationMs = 700): number {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const startValue = 0;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // easeOutCubic - quick at first, settles near the end.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(startValue + (value - startValue) * eased);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, durationMs]);

  return display;
}
