import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, UserRound, ArrowLeft } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { GoldMark } from '../components/Brand';
import { Button, Field, Input } from '../components/ui/primitives';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول');
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      {/* لوحة النموذج */}
      <div className="flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-center gap-3">
            <GoldMark className="size-11" />
            <div>
              <p className="text-sm font-bold tracking-tight text-text">ذهب</p>
              <p className="text-[11px] text-muted">نظام تسعير ومخزون الذهب</p>
            </div>
          </div>

          <h1 className="mt-10 text-[26px] font-semibold leading-tight tracking-tight text-text">
            أهلاً بعودتك
          </h1>
          <p className="mt-1.5 text-[13px] leading-6 text-muted">
            سجّل الدخول للوصول إلى الأسعار اللحظية، المخزون، والمبيعات.
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <Field label="اسم المستخدم" required htmlFor="username">
              <div className="relative">
                <UserRound className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="ps-9"
                  placeholder="admin"
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>
            </Field>

            <Field label="كلمة المرور" required htmlFor="password">
              <div className="relative">
                <Lock className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <Input
                  id="password"
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="ps-9 pe-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted transition-colors hover:text-text"
                  aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>

            {error ? (
              <div className="rounded-xl border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-dangersoft px-3 py-2.5 text-[13px] font-medium text-danger">
                {error}
              </div>
            ) : null}

            <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
              {loading ? 'جارٍ الدخول…' : 'تسجيل الدخول'}
              {!loading ? <ArrowLeft className="size-4" /> : null}
            </Button>
          </form>

          <details className="mt-8 rounded-xl border border-border bg-surface2/50 px-3.5 py-2.5 text-[12px] text-muted">
            <summary className="cursor-pointer select-none font-medium text-text">بيانات الدخول الأولية</summary>
            <div className="mt-2 space-y-1">
              <p>
                المالك: <span className="font-mono text-text">admin</span> /{' '}
                <span className="font-mono text-text">Admin@2026</span>
              </p>
              <p>
                البائع: <span className="font-mono text-text">seller</span> /{' '}
                <span className="font-mono text-text">Seller@2026</span>
              </p>
              <p className="pt-1 text-[11px]">يُنصح بتغييرها من قائمة المستخدم بعد أول دخول.</p>
            </div>
          </details>
        </div>
      </div>

      {/* اللوحة الذهبية */}
      <div className="relative hidden overflow-hidden bg-[#101216] lg:block">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(60rem 40rem at 80% 0%, rgba(201,162,39,0.30), transparent 60%), radial-gradient(50rem 35rem at 0% 100%, rgba(201,162,39,0.18), transparent 55%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-[#d8c48a]">
            <span className="size-1.5 rounded-full bg-[#d8b44e]" />
            تحويل دقيق من الأونصة إلى العيار
          </div>

          <div>
            <p className="max-w-md text-[32px] font-semibold leading-[1.35] text-[#f4efe2]">
              كل غرام محسوب
              <span className="text-[#e0bd63]"> بعيارة الصحيح</span>، من سعر الأونصة إلى الفاتورة.
            </p>
            <p className="mt-4 max-w-sm text-[13px] leading-7 text-[#9aa1ae]">
              سعر غرام 24 = (سعر الأونصة × سعر الصرف) ÷ 31.1035، ثم يُضرب في معامل العيار 18/24 أو 21/24 أو 24/24.
            </p>

            <div className="mt-9 space-y-2.5">
              {[
                { karat: 24, factor: '1.000' },
                { karat: 21, factor: '0.875' },
                { karat: 18, factor: '0.750' },
              ].map((row) => (
                <div
                  key={row.karat}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-8 place-items-center rounded-lg bg-[#c9a227]/15 text-[11px] font-bold text-[#e0bd63]">
                      {row.karat}K
                    </span>
                    <span className="text-[13px] text-[#e9e5d9]">سعر الغرام عيار {row.karat}</span>
                  </div>
                  <span className="font-mono text-xs text-[#9aa1ae]">
                    × {row.factor} <span className="text-[#6b707a]">من 24</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] leading-5 text-[#6b707a]">
            المحرك معتمد على أوزان دقيقة وحساب عشري، ويُخزّن سعر الصرف مع كل عملية شراء.
          </p>
        </div>
      </div>
    </div>
  );
}
