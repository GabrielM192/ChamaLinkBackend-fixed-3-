import { useCountUp } from '../lib/useCountUp';

// A currency amount that counts up from 0 when it first renders - see
// useCountUp for why. `.figure` (defined in index.css) gives it
// tabular, monospaced numerals so a column of these never jitters in
// width as the digits animate.
export function Figure({ value, className = '' }: { value: number; className?: string }) {
  const animated = useCountUp(value);
  return (
    <span className={`figure ${className}`}>
      TSH {Math.round(animated).toLocaleString('en-US')}
    </span>
  );
}
