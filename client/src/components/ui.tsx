import { forwardRef, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { useAutosize } from '../lib/useAutosize';

type Variant = 'primary' | 'dark' | 'soft' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-blue text-white hover:brightness-110 shadow-[0_8px_20px_-10px_rgba(39,71,216,0.8)]',
  dark: 'bg-ink text-white hover:brightness-125',
  soft: 'bg-blue-soft text-blue hover:brightness-95',
  ghost: 'bg-transparent text-ink hover:bg-ink/5',
  danger: 'bg-transparent text-bad border border-line hover:bg-bad/5',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'lg' | 'sm';
  loading?: boolean;
  icon?: ReactNode;
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, full, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  const sizes = { sm: 'h-10 px-3.5 text-sm rounded-xl', md: 'h-12 px-5 text-[15px] rounded-2xl', lg: 'h-14 px-6 text-base rounded-2xl' };
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-bold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${sizes[size]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

const inputCls =
  'w-full rounded-2xl border border-line bg-white px-4 text-ink placeholder:text-muted/60 focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15 transition';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, hint, error, id, className = '', ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={className}>
      <label htmlFor={fid} className="mb-1.5 block text-sm font-bold">
        {label}
      </label>
      <input ref={ref} id={fid} aria-invalid={Boolean(error)} className={`${inputCls} h-12 ${error ? 'border-bad' : ''}`} {...rest} />
      {error ? <p className="mt-1.5 text-sm text-bad">{error}</p> : hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
});

interface AreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export function Area({ label, id, className = '', rows = 2, ...rest }: AreaProps) {
  const auto = useId();
  const fid = id ?? auto;
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutosize(ref, rest.value, rows);
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={fid} className="mb-1.5 block text-sm font-bold">
        {label}
      </label>
      <textarea ref={ref} id={fid} rows={rows} className={`${inputCls} resize-none overflow-hidden py-3 leading-6`} {...rest} />
    </div>
  );
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-card border border-line bg-card ${className}`}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-1">
      <h2 className="text-lg font-extrabold">{children}</h2>
      {action}
    </div>
  );
}

/** The WeekDeck mark: two stacked slides. */
export function Logo({ size = 32, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="16" fill="#0E1A2B" />
        <rect x="14" y="20" width="30" height="22" rx="4" fill="#2747D8" />
        <rect x="20" y="14" width="30" height="22" rx="4" fill="#FFB020" />
      </svg>
      {withText && <span className="text-lg font-extrabold tracking-tight">WeekDeck</span>}
    </span>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-16 text-muted">
      <Loader2 className="size-7 animate-spin text-blue" aria-hidden />
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}
