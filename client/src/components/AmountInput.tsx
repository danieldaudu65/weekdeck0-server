import { useEffect, useState } from 'react';
import { formatAmount, parseAmount } from '../lib/money';

/** Money box: accepts 500000, 500,000, 500k, 1.2m. Shows commas once you leave it. */
export function AmountInput({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  const [text, setText] = useState(formatAmount(value));
  const [focused, setFocused] = useState(false);
  const [bad, setBad] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatAmount(value));
  }, [value, focused]);

  return (
    <input
      aria-label={label}
      inputMode="decimal"
      autoComplete="off"
      value={text}
      placeholder="–"
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const n = parseAmount(text);
        if (Number.isNaN(n)) {
          setBad(true);
          return;
        }
        setBad(false);
        setText(formatAmount(n));
      }}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseAmount(e.target.value);
        if (Number.isNaN(n)) setBad(true);
        else {
          setBad(false);
          onChange(n);
        }
      }}
      className={`figures h-11 w-full min-w-0 rounded-xl border bg-white px-1.5 text-center font-semibold text-ink placeholder:text-muted/40 focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15 ${bad ? 'border-bad' : 'border-line'}`}
    />
  );
}
