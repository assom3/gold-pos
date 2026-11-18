import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { ChevronDown, Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

/* ═══════════════════════════ زر ═══════════════════════════ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-br from-[var(--gold-hover)] to-[var(--gold)] text-[#1b1505] shadow-[0_1px_0_rgba(255,255,255,0.35)_inset,0_8px_20px_-10px_var(--gold-glow)] hover:brightness-[1.06] active:brightness-95',
  secondary:
    'bg-surface text-text border border-borderstrong shadow-[var(--shadow-s)] hover:bg-surface2 active:bg-surface3',
  ghost: 'text-muted hover:text-text hover:bg-surface2',
  danger: 'bg-danger text-white hover:brightness-110 active:brightness-95',
  soft: 'bg-goldsoft text-gold hover:brightness-[1.03] active:brightness-95',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
};

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon: Icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium transition-all duration-150 select-none',
        'disabled:pointer-events-none disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon className="size-4" aria-hidden />
      ) : null}
      {children}
    </button>
  );
}

/* ═══════════════════════════ حقول ═══════════════════════════ */

const CONTROL =
  'w-full rounded-xl border border-border bg-surface text-sm text-text placeholder:text-muted/70 transition-colors ' +
  'hover:border-borderstrong focus:border-gold focus:outline-none focus:ring-[3px] focus:ring-[var(--gold-glow)] ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cn(CONTROL, 'h-10 px-3', className)} {...rest} />;
}

export function Textarea({ className, rows = 3, ...rest }: ComponentProps<'textarea'>) {
  return <textarea rows={rows} className={cn(CONTROL, 'resize-y px-3 py-2 leading-6', className)} {...rest} />;
}

export interface SelectProps extends ComponentProps<'select'> {
  placeholder?: string;
}

export function Select({ className, children, placeholder, ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select
        className={cn(CONTROL, 'h-10 appearance-none pe-3 ps-9', className)}
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
    </div>
  );
}

export interface NumberInputProps extends Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> {
  value: number | '';
  onChange: (value: number | '') => void;
  suffix?: string;
  allowNegative?: boolean;
}

/** حقل رقمي كيحافظ على النص أثناء الكتابة (ما كيقفزش المؤشر) */
export function NumberInput({
  value,
  onChange,
  suffix,
  className,
  allowNegative = false,
  ...rest
}: NumberInputProps) {
  const [text, setText] = useState(value === '' ? '' : String(value));
  const last = useRef<number | ''>(value);

  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value === '' ? '' : String(value));
    }
  }, [value]);

  return (
    <div className="relative" dir="ltr">
      <input
        inputMode="decimal"
        autoComplete="off"
        dir="ltr"
        value={text}
        onChange={(e) => {
          const pattern = allowNegative ? /[^\d.-]/g : /[^\d.]/g;
          let next = e.target.value.replace(pattern, '');
          if (allowNegative && next.indexOf('-') > 0) next = next.replace(/-/g, '');
          next = next.replace(/(\..*)\./g, '$1');
          setText(next);
          if (next === '' || next === '.' || next === '-') {
            onChange('');
            return;
          }
          const parsed = Number(next);
          if (Number.isFinite(parsed)) {
            last.current = parsed;
            onChange(parsed);
          }
        }}
        className={cn(CONTROL, 'h-10 px-3 text-start tabular-nums', suffix && 'pe-16', className)}
        {...rest}
      />
      {suffix ? (
        <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, required, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="flex items-center gap-1 text-[13px] font-medium text-text">
          {label}
          {required ? <span className="text-danger">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 select-none',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors',
          checked ? 'border-transparent bg-gold' : 'border-borderstrong bg-surface3',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-all duration-200',
            checked ? 'start-0.5' : 'start-[calc(100%-1.375rem)]',
          )}
        />
      </button>
      {label || description ? (
        <span className="min-w-0">
          {label ? <span className="block text-sm font-medium text-text">{label}</span> : null}
          {description ? <span className="block text-xs leading-5 text-muted">{description}</span> : null}
        </span>
      ) : null}
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn('flex cursor-pointer items-start gap-2.5 text-sm', disabled && 'cursor-not-allowed opacity-60')}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-borderstrong accent-[var(--gold)]"
      />
      <span className="leading-5 text-text">{label}</span>
    </label>
  );
}

/* ═══════════════════════════ بطاقات وشارات ═══════════════════════════ */

export function Card({ className, children, ...rest }: ComponentProps<'div'>) {
  return (
    <div className={cn('card p-5', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-text">{title}</h2>
        {description ? <p className="mt-0.5 text-xs leading-5 text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export type BadgeTone = 'gold' | 'success' | 'danger' | 'warning' | 'muted' | 'info';

const BADGE_TONES: Record<BadgeTone, string> = {
  gold: 'bg-goldsoft text-gold border-[color-mix(in_oklab,var(--gold)_28%,transparent)]',
  success: 'bg-successsoft text-success border-[color-mix(in_oklab,var(--success)_28%,transparent)]',
  danger: 'bg-dangersoft text-danger border-[color-mix(in_oklab,var(--danger)_28%,transparent)]',
  warning: 'bg-warningsoft text-warning border-[color-mix(in_oklab,var(--warning)_28%,transparent)]',
  muted: 'bg-surface2 text-muted border-border',
  info: 'bg-infosoft text-info border-[color-mix(in_oklab,var(--info)_28%,transparent)]',
};

export function Badge({
  tone = 'muted',
  children,
  className,
  dot = false,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'gold',
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <div className={cn('card relative overflow-hidden p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted">{label}</p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-text">{value}</p>
          {hint ? <p className="mt-1 text-[11px] leading-4 text-muted">{hint}</p> : null}
        </div>
        {Icon ? (
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-xl border',
              BADGE_TONES[tone],
            )}
          >
            <Icon className="size-4.5" aria-hidden />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ═══════════════════════════ حالات ═══════════════════════════ */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} />;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {Icon ? (
        <span className="mb-4 grid size-14 place-items-center rounded-2xl border border-border bg-surface2 text-muted">
          <Icon className="size-6" aria-hidden />
        </span>
      ) : null}
      <p className="text-sm font-semibold text-text">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs leading-5 text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-gold', className)} aria-label="جارٍ التحميل" />;
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="size-9 rounded-xl" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-24 sm:block" />
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════ ترويسة صفحة / تبويبات ═══════════════════════════ */

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-text">{title}</h1>
        {subtitle ? <p className="mt-1 text-[13px] leading-5 text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  items: Array<{ value: T; label: ReactNode; icon?: LucideIcon; badge?: ReactNode }>;
  className?: string;
}) {
  return (
    <div className={cn('-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1 scroll-thin', className)}>
      {items.map((item) => {
        const active = item.value === value;
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 px-3.5 pb-2.5 pt-2 text-[13px] font-medium transition-colors',
              active ? 'text-gold' : 'text-muted hover:text-text',
            )}
          >
            {Icon ? <Icon className="size-4" aria-hidden /> : null}
            {item.label}
            {item.badge ? <span className="text-[11px] text-muted">{item.badge}</span> : null}
            {active ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-border', className)} />;
}
