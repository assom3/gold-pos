import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calculator,
  ClipboardCheck,
  Coins,
  Gem,
  Plus,
  RefreshCw,
  Scale,
  ShoppingCart,
  TrendingUp,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import { RAW_GOLD_PRICE_NOTE } from '../lib/copy';
import { useAuth } from '../lib/auth';
import type { DashboardData } from '../lib/types';
import { fmtMoney, fmtNum, fmtWeight, timeAgo } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SectionTitle,
  Skeleton,
  StatCard,
} from '../components/ui/primitives';

export default function Dashboard() {
  const { user, isOwner } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
    refetchInterval: 60_000,
  });

  const currency = data?.currency ?? 'LYD';

  return (
    <div className="space-y-5">
      <PageHeader
        title={`مرحباً، ${user?.name ?? ''}`}
        subtitle="نظرة سريعة على أسعار الذهب اليوم، حركة المبيعات، وحالة المخزون."
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} onClick={() => void refetch()} loading={isFetching}>
              تحديث
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => navigate('/sales/new')}>
              بيع جديد
            </Button>
          </>
        }
      />

      {isError ? (
        <Card className="border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-dangersoft">
          <p className="text-sm font-medium text-danger">
            تعذر تحميل لوحة المعلومات: {error instanceof Error ? error.message : 'خطأ غير معروف'}
          </p>
        </Card>
      ) : null}

      {!isLoading && data && !data.prices.ready ? (
        <Card className="border-[color-mix(in_oklab,var(--warning)_35%,transparent)] bg-warningsoft">
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/10 text-warning">
              <TriangleAlert className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text">لم يتم إدخال أسعار الذهب بعد</p>
              <p className="mt-0.5 text-xs leading-5 text-muted">
                أدخل سعر الأونصة وسعر الصرف لتتمكن من حساب أسعار الغرام والتقييم اللحظي للمخزون.
              </p>
            </div>
            <Button variant="primary" onClick={() => navigate('/prices')}>
              إدخال الأسعار
            </Button>
          </div>
        </Card>
      ) : null}

      {!isLoading && data?.prices.stale ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--warning)_30%,transparent)] bg-warningsoft/70 px-3.5 py-2.5 text-xs text-text">
          <TriangleAlert className="size-4 text-warning" />
          <span className="font-medium">الأسعار متقادمة</span>
          <span className="text-muted">
            آخر تحديث {data.prices.ageHours ? `${data.prices.ageHours} ساعة` : '—'} مضت (الحد{' '}
            {data.prices.staleHours} ساعة).
          </span>
          <Link to="/prices" className="ms-auto font-semibold text-gold hover:underline">
            تحديث الآن
          </Link>
        </div>
      ) : null}

      <Card className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background: 'radial-gradient(40rem 18rem at 100% 0%, var(--gold-glow), transparent 65%)',
          }}
        />
        <div className="relative">
          <SectionTitle
            title="أسعار الغرام اليوم"
            description="سعر الأونصة يُحوَّل إلى غرام 24 ثم إلى العيارات 18 و 21 و 24."
            action={
              <div className="flex items-center gap-2">
                {data?.prices.ounce ? (
                  <Badge tone="muted">آخر تحديث {timeAgo(data.prices.ounce.at)}</Badge>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => navigate('/prices')}>
                  التفاصيل
                  <ArrowLeft className="size-3.5" />
                </Button>
              </div>
            }
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {isLoading
              ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)
              : data?.table?.rows.map((row) => (
                  <div key={row.karat} className="rounded-xl border border-border bg-surface2/50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-xs font-semibold text-muted">
                        <span className="grid size-7 place-items-center rounded-lg bg-goldsoft text-[10px] font-bold text-gold">
                          {row.karat}K
                        </span>
                        عيار {row.karat}
                      </span>
                      <span className="font-mono text-[10px] text-muted">×{row.factor.toFixed(3)}</span>
                    </div>
                    <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-text">
                      {fmtMoney(row.pricePerGram)}
                      <span className="ms-1.5 text-[11px] font-medium text-muted">{currency}/غ</span>
                    </p>
                  </div>
                ))}
          </div>

          <p className="mt-3 border-t border-border/70 pt-2.5 text-[10px] leading-4 text-muted">
            {RAW_GOLD_PRICE_NOTE}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-muted">
            <span>
              الأونصة:{' '}
              <span className="font-semibold tabular-nums text-text">
                {data?.prices.ounce ? `$${fmtMoney(data.prices.ounce.value)}` : '—'}
              </span>
            </span>
            <span>
              سعر الصرف:{' '}
              <span className="font-semibold tabular-nums text-text">
                {data?.prices.fx ? fmtMoney(data.prices.fx.value) : '—'}
              </span>
            </span>
            <span>
              أونصة تروي = <span className="font-semibold text-text">31.1035</span> غرام
            </span>
            {data?.prices.ounce ? <span>أدخلها: {data.prices.ounce.userName}</span> : null}
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="مبيعات اليوم"
          value={
            <>
              {fmtMoney(data?.today.total)} <span className="text-xs font-medium text-muted">{currency}</span>
            </>
          }
          hint={`${fmtNum(data?.today.count)} فاتورة اليوم`}
          icon={ShoppingCart}
          tone="success"
        />
        <StatCard
          label="مبيعات الشهر"
          value={
            <>
              {fmtMoney(data?.month.total)} <span className="text-xs font-medium text-muted">{currency}</span>
            </>
          }
          hint={`${fmtNum(data?.month.count)} فاتورة هذا الشهر`}
          icon={TrendingUp}
          tone="gold"
        />
        <StatCard
          label="قطع متاحة"
          value={fmtNum(data?.inventory.units)}
          hint={`${fmtNum(data?.inventory.items)} صنف · ${fmtWeight(data?.inventory.totalWeight)} غ إجمالي`}
          icon={Gem}
          tone="info"
        />
        <StatCard
          label="وزن الذهب الصافي"
          value={`${fmtWeight(data?.inventory.goldWeight)} غ`}
          hint={`${fmtNum(data?.inventory.soldItems)} صنف مباع`}
          icon={Scale}
          tone="warning"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <SectionTitle title="آخر المبيعات" description="أحدث الفواتير المسجّلة في المحل" />
            <Link
              to="/sales"
              className="inline-flex items-center gap-1 text-xs font-semibold text-gold hover:underline"
            >
              الكل
              <ArrowLeft className="size-3.5" />
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : data && data.recentSales.length > 0 ? (
            <ul className="divide-y divide-border">
              {data.recentSales.map((sale) => (
                <li key={sale.id}>
                  <Link
                    to={`/sales/${sale.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface2/60"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface2 text-muted">
                      <Wallet className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-text">{sale.invoiceNo}</p>
                      <p className="truncate text-[11px] text-muted">
                        {sale.seller.name} · {timeAgo(sale.createdAt)} · {sale.items.length} صنف
                      </p>
                    </div>
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums text-text">
                      {fmtMoney(sale.total)}
                      <span className="ms-1 text-[10px] font-medium text-muted">{currency}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={ShoppingCart}
              title="لا مبيعات بعد"
              description="ابدأ أول فاتورة بيع من صفحة المبيعات."
              action={
                <Button variant="primary" icon={Plus} onClick={() => navigate('/sales/new')}>
                  بيع جديد
                </Button>
              }
            />
          )}
        </Card>

        <div className="space-y-3">
          <Card>
            <SectionTitle title="إجراءات سريعة" />
            <div className="mt-3 grid gap-2">
              <QuickAction
                to="/sales/new"
                icon={ShoppingCart}
                label="تسجيل بيع جديد"
                desc="بحث بالكود وإصدار فاتورة"
              />
              <QuickAction to="/items/new" icon={Plus} label="إضافة قطعة ذهب" desc="قطعة مفردة أو طقم بمكوناته" />
              <QuickAction to="/prices" icon={Calculator} label="تحديث أسعار الذهب" desc="الأونصة وسعر الصرف" />
              <QuickAction to="/inventory" icon={Coins} label="تقييم المخزون" desc="القيمة اللحظية حسب العيار" />
            </div>
          </Card>

          <Card>
            <SectionTitle
              title="آخر جرد"
              action={
                <Link to="/stocktake" className="text-xs font-semibold text-gold hover:underline">
                  الجرد
                </Link>
              }
            />
            {data?.lastStocktake ? (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-surface2/50 p-3">
                <span className="grid size-9 place-items-center rounded-xl bg-goldsoft text-gold">
                  <ClipboardCheck className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/stocktake/${data.lastStocktake.id}`}
                    className="text-[13px] font-semibold text-text hover:text-gold"
                  >
                    جرد #{data.lastStocktake.id}
                  </Link>
                  <p className="text-[11px] text-muted">{timeAgo(data.lastStocktake.openedAt)}</p>
                </div>
                <Badge tone={data.lastStocktake.status === 'OPEN' ? 'warning' : 'success'} dot>
                  {data.lastStocktake.status === 'OPEN' ? 'مفتوح' : 'مغلق'}
                </Badge>
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
                لم يُسجَّل أي جرد بعد.
              </p>
            )}
          </Card>

          {isOwner ? (
            <Card className="bg-gradient-to-br from-[var(--gold)]/10 to-transparent">
              <p className="text-xs font-semibold text-gold">للمالك</p>
              <p className="mt-1 text-[13px] leading-6 text-text">
                تقارير الأرباح وسجل التعديلات متاحة من صفحة التقارير.
              </p>
              <Link
                to="/reports"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-gold hover:underline"
              >
                فتح التقارير
                <ArrowLeft className="size-3.5" />
              </Link>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
  desc,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition-colors hover:border-[color-mix(in_oklab,var(--gold)_35%,transparent)] hover:bg-surface2/60"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface2 text-muted transition-colors group-hover:bg-goldsoft group-hover:text-gold">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-text">{label}</span>
        <span className="block truncate text-[11px] text-muted">{desc}</span>
      </span>
      <ArrowLeft className="size-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}
