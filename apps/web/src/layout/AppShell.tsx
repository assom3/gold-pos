import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  ClipboardCheck,
  Coins,
  Gem,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  ShoppingCart,
  Sun,
  TriangleAlert,
  UserRound,
  Users,
  Warehouse,
  X,
  KeyRound,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { RAW_GOLD_PRICE_NOTE } from '../lib/copy';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { api } from '../lib/api';
import { fmtMoney, timeAgo } from '../lib/format';
import type { CurrentPrices, PriceTableView, Setting } from '../lib/types';
import { Badge, Button, Field, Input, Spinner } from '../components/ui/primitives';
import { Modal } from '../components/ui/overlay';
import { useToast } from '../components/ui/toast';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  ownerOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'الرئيسية', icon: LayoutDashboard, end: true },
  { to: '/prices', label: 'أسعار الذهب', icon: Coins },
  { to: '/items', label: 'الذهب', icon: Gem },
  { to: '/sales', label: 'المبيعات', icon: ShoppingCart },
  { to: '/inventory', label: 'المخزون والتقييم', icon: Warehouse },
  { to: '/stocktake', label: 'الجرد', icon: ClipboardCheck },
  { to: '/reports', label: 'التقارير', icon: BarChart3, ownerOnly: true },
  { to: '/settings', label: 'الإعدادات', icon: Settings, ownerOnly: true },
  { to: '/users', label: 'المستخدمون', icon: Users, ownerOnly: true },
];

export function AppShell() {
  const { user, logout, isOwner } = useAuth();
  const { theme, toggle } = useTheme();
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setDrawer(false);
  }, [location.pathname]);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Setting>('/settings'),
    staleTime: 5 * 60_000,
  });

  const { data: priceView } = useQuery({
    queryKey: ['prices', 'table'],
    queryFn: () => api.get<PriceTableView>('/prices/table'),
    refetchInterval: 60_000,
  });

  const items = NAV.filter((item) => !item.ownerOnly || isOwner);

  return (
    <div className="min-h-screen">
      {/* السايدبار */}
      {drawer ? (
        <button
          type="button"
          aria-label="إغلاق القائمة"
          onClick={() => setDrawer(false)}
          className="fixed inset-0 z-40 bg-[#0b0c10]/50 backdrop-blur-[2px] lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          'no-print fixed inset-y-0 start-0 z-50 flex w-[268px] flex-col border-e border-border bg-surface transition-transform duration-300',
          'lg:translate-x-0',
          drawer ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-border px-4">
          <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-[#e8cf8a] via-[#c9a227] to-[#8a6e14] shadow-[0_6px_16px_-8px_var(--gold-glow)]">
            <span className="font-bold text-[15px] text-[#2a2005]">Au</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold leading-tight text-text">{settings?.shopName ?? 'محل الذهب'}</p>
            <p className="text-[11px] text-muted">نظام تسعير ومخزون الذهب</p>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawer(false)} aria-label="إغلاق">
            <X className="size-4" />
          </Button>
        </div>

        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto scroll-thin p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors',
                  isActive
                    ? 'bg-goldsoft text-gold'
                    : 'text-muted hover:bg-surface2 hover:text-text',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <span className="absolute inset-y-2 -start-3 w-1 rounded-e-full bg-gold" aria-hidden />
                  ) : null}
                  <item.icon className="size-[18px] shrink-0" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-2 border-t border-border p-3">
          <div className="rounded-xl border border-border bg-surface2/60 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">آخر تحديث للسعر</p>
            <p className="mt-0.5 text-xs font-medium text-text">
              {priceView?.current.ounce ? timeAgo(priceView.current.ounce.at) : 'لم يُدخل بعد'}
            </p>
          </div>
          <p className="px-1 text-[10px] leading-4 text-muted">الإصدار 0.2.1 · جميع الحقوق محفوظة</p>
        </div>
      </aside>

      {/* المحتوى */}
      <div className="lg:ps-[268px]">
        <header className="no-print sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
          <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-5">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setDrawer(true)}
              aria-label="فتح القائمة"
            >
              <Menu className="size-5" />
            </Button>

            <div className="hidden min-w-0 items-center gap-2 md:flex">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-gold" />
              </span>
              <span className="text-xs font-medium text-muted">السوق الآن</span>
            </div>

            <PricePills view={priceView} />

            <div className="ms-auto flex items-center gap-1.5">
              {priceView?.current.stale ? (
                <Badge tone="warning" dot className="hidden sm:inline-flex">
                  السعر متقادم
                </Badge>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggle}
                aria-label={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
                title={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
              >
                {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
              </Button>
              <UserMenu onLogout={async () => { await logout(); navigate('/login', { replace: true }); }} />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-3 py-5 sm:px-5 sm:py-6 lg:px-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/* ══════════════ شريط الأسعار ══════════════ */

function PricePills({ view }: { view: PriceTableView | undefined }) {
  const current: CurrentPrices | undefined = view?.current;
  const row21 = view?.table?.rows.find((r) => r.karat === 21);

  const pills: Array<{ label: string; value: string; accent?: boolean }> = [
    { label: 'أونصة', value: current?.ounce ? `$${fmtMoney(current.ounce.value)}` : '—' },
    { label: 'صرف', value: current?.fx ? fmtMoney(current.fx.value) : '—' },
    { label: 'غرام 21', value: row21 ? fmtMoney(row21.pricePerGram) : '—', accent: true },
  ];

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto scroll-thin">
      {pills.map((pill) => (
        <div
          key={pill.label}
          className={cn(
            'flex shrink-0 items-baseline gap-1.5 rounded-lg border px-2 py-1 sm:px-2.5',
            pill.accent ? 'border-[color-mix(in_oklab,var(--gold)_30%,transparent)] bg-goldsoft/70' : 'border-border bg-surface',
          )}
          title={`${pill.label}: ${pill.value}${pill.label === 'صرف' ? '' : ` · ${RAW_GOLD_PRICE_NOTE}`}`}
        >
          <span className="text-[10px] font-medium text-muted">{pill.label}</span>
          <span className={cn('text-xs font-semibold tabular-nums', pill.accent ? 'text-gold' : 'text-text')}>
            {pill.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ══════════════ قائمة المستخدم ══════════════ */

function UserMenu({ onLogout }: { onLogout: () => Promise<void> }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl p-1 transition-colors hover:bg-surface2"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid size-8 place-items-center rounded-lg bg-goldsoft text-xs font-bold text-gold">
          {user.name.trim().charAt(0) || 'م'}
        </span>
        <span className="hidden text-start sm:block">
          <span className="block max-w-[120px] truncate text-xs font-semibold leading-4 text-text">{user.name}</span>
          <span className="block text-[10px] leading-3 text-muted">{user.role === 'OWNER' ? 'مالك' : 'بائع'}</span>
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="animate-in absolute end-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-[var(--shadow-m)]"
        >
          <div className="border-b border-border px-2.5 pb-2 pt-1">
            <p className="truncate text-[13px] font-semibold text-text">{user.name}</p>
            <p className="truncate text-[11px] text-muted">@{user.username}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setPwdOpen(true);
            }}
            className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-text transition-colors hover:bg-surface2"
          >
            <KeyRound className="size-4 text-muted" />
            تغيير كلمة المرور
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void onLogout()}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-danger transition-colors hover:bg-dangersoft"
          >
            <LogOut className="size-4" />
            تسجيل الخروج
          </button>
        </div>
      ) : null}

      <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </div>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setError(null);
    }
  }, [open]);

  async function submit() {
    setError(null);
    if (next.length < 8) {
      setError('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    if (next !== confirm) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      toast.success('تم تغيير كلمة المرور بنجاح');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تغيير كلمة المرور');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تغيير كلمة المرور"
      description="اختر كلمة مرور قوية لا تقل عن 8 أحرف."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={saving}>
            حفظ
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="كلمة المرور الحالية" required>
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="كلمة المرور الجديدة" required>
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="تأكيد كلمة المرور" required error={error ?? undefined}>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
        </Field>
        {saving ? (
          <div className="flex items-center gap-2 text-xs text-muted">
            <Spinner className="size-4" /> جارٍ الحفظ…
          </div>
        ) : null}
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <UserRound className="size-3.5" /> سيتم إنهاء الجلسات الأخرى تلقائياً بعد التغيير.
        </p>
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <TriangleAlert className="size-3.5" />
          لا تشارك كلمة المرور مع أي شخص.
        </p>
      </div>
    </Modal>
  );
}
