import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CircleAlert, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../../lib/cn';

type Tone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLES: Record<Tone, { box: string; icon: ReactNode }> = {
  success: {
    box: 'border-[color-mix(in_oklab,var(--success)_35%,transparent)] bg-successsoft text-success',
    icon: <CheckCircle2 className="size-4.5 shrink-0" aria-hidden />,
  },
  error: {
    box: 'border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-dangersoft text-danger',
    icon: <CircleAlert className="size-4.5 shrink-0" aria-hidden />,
  },
  info: {
    box: 'border-[color-mix(in_oklab,var(--info)_35%,transparent)] bg-infosoft text-info',
    icon: <Info className="size-4.5 shrink-0" aria-hidden />,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: Tone, message: string) => {
      counter.current += 1;
      const id = counter.current;
      setItems((list) => [...list.slice(-4), { id, tone, message }]);
      window.setTimeout(() => remove(id), tone === 'error' ? 6000 : 4000);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[130] flex flex-col gap-2 sm:inset-x-auto sm:start-6 sm:bottom-6 sm:w-[380px]"
        aria-live="polite"
        role="status"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'animate-in pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-[var(--shadow-m)] backdrop-blur',
              TONE_STYLES[t.tone].box,
            )}
          >
            {TONE_STYLES[t.tone].icon}
            <p className="flex-1 text-[13px] font-medium leading-5">{t.message}</p>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="rounded-md p-0.5 opacity-70 transition-opacity hover:opacity-100"
              aria-label="إغلاق التنبيه"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
