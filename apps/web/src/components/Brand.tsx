import { cn } from '../lib/cn';

export function GoldMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-10', className)} aria-hidden>
      <defs>
        <linearGradient id="gold-mark-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0dda2" />
          <stop offset="0.45" stopColor="#c9a227" />
          <stop offset="1" stopColor="#8a6e14" />
        </linearGradient>
      </defs>
      <path
        d="M32 3.5 55.5 17v30L32 60.5 8.5 47V17z"
        fill="url(#gold-mark-grad)"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="1.2"
      />
      <path d="M32 14.5 46.5 23v18L32 49.5 17.5 41V23z" fill="#12141a" opacity="0.88" />
      <path d="M32 22 40 27v10l-8 5-8-5V27z" fill="url(#gold-mark-grad)" />
    </svg>
  );
}

export function Splash({ label = 'جارٍ التحميل…' }: { label?: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-bg">
      <div className="flex flex-col items-center gap-4">
        <GoldMark className="size-14 animate-pulse" />
        <p className="text-sm font-medium text-muted">{label}</p>
      </div>
    </div>
  );
}
