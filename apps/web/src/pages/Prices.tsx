import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  Calculator,
  CheckCircle2,
  Coins,
  ExternalLink,
  History,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { buildPriceTable, PricingError, TROY_OUNCE_GRAMS } from '@gold/pricing';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Lookup, Paged, PriceTableView, PriceUpdate, Setting } from '../lib/types';
import { fmtDateTime, fmtMoney, timeAgo } from '../lib/format';
import { useToast } from '../components/ui/toast';
import {
  Badge,
  Button,
  Card,
  Field,
  NumberInput,
  PageHeader,
  SectionTitle,
  Skeleton,
  Tabs,
} from '../components/ui/primitives';
import { DataTable, Pagination, type Column } from '../components/ui/data-table';

type HistoryFilter = 'ALL' | 'OUNCE' | 'FX';

export default function Prices() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { isOwner } = useAuth();

  const { data: view, isLoading } = useQuery({
    queryKey: ['prices', 'table'],
    queryFn: () => api.get<PriceTableView>('/prices/table'),
    // يتبع الفاصل الذي يضبطه الخادم — التحديث التلقائي يُشغَّل من هناك
    refetchInterval: (query) => {
      const data = query.state.data as PriceTableView | undefined;
      const ounceProvider = data?.providers?.ounce;
      if (!ounceProvider?.autoRefresh || ounceProvider.refreshMinutes <= 0) return false;
      return Math.max(60_000, ounceProvider.refreshMinutes * 60_000);
    },
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Setting>('/settings'),
    staleTime: 5 * 60_000,
  });

  const { data: karatLookups } = useQuery({
    queryKey: ['lookups', 'KARAT'],
    queryFn: () => api.get<Lookup[]>('/lookups?kind=KARAT'),
    staleTime: 5 * 60_000,
  });

  const karats = useMemo(() => {
    const list = (karatLookups ?? [])
      .map((l) => Number(l.value))
      .filter((k) => Number.isFinite(k) && k > 0);
    return list.length > 0 ? list : [18, 21, 24];
  }, [karatLookups]);

  const [ounce, setOunce] = useState<number | ''>('');
  const [fx, setFx] = useState<number | ''>('');
  const [initialized, setInitialized] = useState(false);

  const serverOunce = view?.current.ounce?.value ?? null;
  const serverFx = view?.current.fx?.value ?? null;
  const syncedOunce = useRef<number | null>(null);

  // عند التحديث التلقائي: نحدّث الحقل طالما المستخدم لم يكتب قيمة يدوية مختلفة.
  useEffect(() => {
    if (serverOunce === null) return;
    const previous = syncedOunce.current;
    syncedOunce.current = serverOunce;
    setOunce((current) => {
      if (current === '' || (previous !== null && Number(current) === previous)) return serverOunce;
      return current;
    });
  }, [serverOunce]);

  useEffect(() => {
    if (initialized) return;
    if (serverOunce !== null && serverFx !== null) {
      setOunce(serverOunce);
      setFx(serverFx);
      setInitialized(true);
    }
  }, [serverOunce, serverFx, initialized]);

  const preview = useMemo(() => {
    if (typeof ounce !== 'number' || typeof fx !== 'number' || ounce <= 0 || fx <= 0) return null;
    try {
      return buildPriceTable(ounce, fx, karats);
    } catch (err) {
      if (err instanceof PricingError) return null;
      return null;
    }
  }, [ounce, fx, karats]);

  const currency = settings?.currency ?? 'LYD';
  const current = view?.current;
  const provider = view?.providers?.ounce;
  const docsUrl = provider?.docsUrl ?? 'https://goldapi.dev/docs';
  const ounceChanged = typeof ounce === 'number' && ounce > 0 && ounce !== current?.ounce?.value;
  const fxChanged = typeof fx === 'number' && fx > 0 && fx !== current?.fx?.value;

  const invalidatePrices = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['prices'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['reports'] }),
    ]);
  };

  const saveOunce = useMutation({
    mutationFn: (value: number) => api.post<PriceUpdate>('/prices', { type: 'OUNCE', value }),
    onSuccess: async () => {
      toast.success('تم حفظ سعر الأونصة');
      await invalidatePrices();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'تعذر حفظ السعر'),
  });

  const fetchOunce = useMutation({
    mutationFn: () =>
      api.post<{ row: PriceUpdate; quote: { price: number; updatedAt: string | null } }>(
        '/prices/refresh-ounce',
        {},
      ),
    onSuccess: async ({ row, quote }) => {
      setOunce(row.value);
      setInitialized(true);
      toast.success(
        `تم جلب سعر الأونصة من goldapi.dev: $${fmtMoney(row.value)}${
          quote.updatedAt ? ` · تحديث المزوّد ${fmtDateTime(quote.updatedAt)}` : ''
        }`,
      );
      await invalidatePrices();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'تعذر جلب سعر الأونصة'),
  });

  const saveFx = useMutation({
    mutationFn: (value: number) => api.post<PriceUpdate>('/prices', { type: 'FX', value }),
    onSuccess: async () => {
      toast.success('تم حفظ سعر الصرف');
      await invalidatePrices();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'تعذر حفظ السعر'),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="أسعار الذهب"
        subtitle="أدخل سعر أونصة الذهب وسعر الصرف، والنظام يحسب سعر الغرام لكل عيار تلقائياً."
        actions={
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['prices'] })}
          >
            تحديث
          </Button>
        }
      />

      {current?.stale ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--warning)_30%,transparent)] bg-warningsoft px-3.5 py-2.5 text-xs text-text">
          <TriangleAlert className="size-4 text-warning" />
          <span className="font-semibold">تنبيه: الأسعار متقادمة</span>
          <span className="text-muted">
            آخر تحديث {timeAgo(current.ounce?.at)} — الحد المسموح {current.staleHours} ساعة.
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.25fr]">
        <Card>
          <SectionTitle
            title="تحديث الأسعار"
            description="اجلب سعر الأونصة مباشرة من goldapi.dev أو أدخله يدوياً. كل تحديث يُسجَّل باسم المستخدم ووقته."
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <a
                  href={docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted transition-colors hover:text-gold"
                >
                  توثيق goldapi.dev
                  <ExternalLink className="size-3" aria-hidden />
                </a>
                {provider?.configured && isOwner ? (
                  <Button
                    size="sm"
                    variant="soft"
                    icon={RefreshCw}
                    loading={fetchOunce.isPending}
                    onClick={() => fetchOunce.mutate()}
                  >
                    جلب من goldapi.dev
                  </Button>
                ) : provider?.configured ? (
                  <Badge tone="muted">سعر الأونصة يعدّله المالك</Badge>
                ) : (
                  <Badge tone="warning">API غير مهيأ</Badge>
                )}
              </div>
            }
          />

          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface2/50 px-3 py-2 text-[11px] leading-5 text-muted">
            <Badge tone={provider?.mode === 'api' ? 'success' : 'info'} dot>
              {provider?.mode === 'api' ? 'مصدر الأونصة: API مباشر' : 'مصدر الأونصة: يدوي'}
            </Badge>
            {provider?.autoRefresh ? (
              <Badge tone="gold" dot>
                تحديث تلقائي كل {provider.refreshMinutes} دقيقة
              </Badge>
            ) : null}
            {provider?.mode === 'api' && provider?.configured && !provider.autoRefresh ? (
              <Badge tone="muted">التحديث التلقائي معطّل</Badge>
            ) : null}
            <span>المفتاح يعمل من داخل الخادم فقط ولا يظهر في المتصفح.</span>
          </div>

          <div className="mt-4 space-y-4">
            <Field
              label="سعر أونصة الذهب (دولار)"
              hint={
                current?.ounce
                  ? `الحالي: $${fmtMoney(current.ounce.value)} · ${current.ounce.userName} · ${timeAgo(current.ounce.at)}`
                  : 'لم يُدخل سعر الأونصة بعد'
              }
            >
              <div className="flex gap-2">
                <NumberInput
                  value={ounce}
                  onChange={setOunce}
                  suffix="USD/oz"
                  placeholder="2000"
                  className="h-11"
                  disabled={!isOwner}
                />
                <Button
                  variant={ounceChanged && isOwner ? 'primary' : 'secondary'}
                  className="h-11 shrink-0"
                  disabled={!ounceChanged || !isOwner}
                  loading={saveOunce.isPending}
                  onClick={() => typeof ounce === 'number' && saveOunce.mutate(ounce)}
                >
                  حفظ
                </Button>
              </div>
            </Field>

            <Field
              label="سعر الصرف (العملة المحلية مقابل الدولار)"
              hint={
                current?.fx
                  ? `الحالي: ${fmtMoney(current.fx.value)} · ${current.fx.userName} · ${timeAgo(current.fx.at)}`
                  : 'لم يُدخل سعر الصرف بعد'
              }
            >
              <div className="flex gap-2">
                <NumberInput
                  value={fx}
                  onChange={setFx}
                  suffix={`${currency}/USD`}
                  placeholder="6.0"
                  className="h-11"
                />
                <Button
                  variant={fxChanged ? 'primary' : 'secondary'}
                  className="h-11 shrink-0"
                  disabled={!fxChanged}
                  loading={saveFx.isPending}
                  onClick={() => typeof fx === 'number' && saveFx.mutate(fx)}
                >
                  حفظ
                </Button>
              </div>
            </Field>

            <div className="rounded-xl border border-border bg-surface2/60 p-3">
              <p className="text-[11px] font-semibold text-muted">المعادلة المستعملة</p>
              <div className="mt-2 space-y-1.5 font-mono text-[11px] leading-5 text-text" dir="ltr">
                <p>
                  gram24 = (ounce × fx) ÷ <span className="text-gold">{TROY_OUNCE_GRAMS}</span>
                </p>
                <p>
                  gramK = gram24 × (K ÷ <span className="text-gold">24</span>)
                </p>
                <p className="text-muted">K = 18 → ×0.750 · 21 → ×0.875 · 24 → ×1.000</p>
              </div>
            </div>

            {!view?.ready ? (
              <div className="rounded-xl border border-[color-mix(in_oklab,var(--warning)_30%,transparent)] bg-warningsoft px-3 py-2.5 text-[12px] leading-5 text-text">
                أدخل السعرين معاً ليبدأ النظام بحساب أسعار الغرام والتقييم.
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: 'radial-gradient(36rem 16rem at 100% 0%, var(--gold-glow), transparent 65%)' }}
          />
          <div className="relative">
            <SectionTitle
              title="سعر الغرام لكل عيار"
              description={
                preview
                  ? `معاينة لحظية بسعر أونصة $${fmtMoney(ounce)} وصرف ${fmtMoney(fx)}`
                  : 'أدخل السعرين لعرض الجدول'
              }
              action={
                preview && (ounceChanged || fxChanged) ? (
                  <Badge tone="warning" dot>
                    معاينة غير محفوظة
                  </Badge>
                ) : (
                  <Badge tone="success" dot>
                    محفوظ
                  </Badge>
                )
              }
            />

            {isLoading ? (
              <div className="mt-4 space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : preview ? (
              <>
                <div className="mt-4 overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface2/60 text-[11px] text-muted">
                        <th className="px-3 py-2 text-start font-semibold">العيار</th>
                        <th className="px-3 py-2 text-start font-semibold">المعامل</th>
                        <th className="px-3 py-2 text-end font-semibold">سعر الغرام</th>
                        <th className="hidden px-3 py-2 text-end font-semibold sm:table-cell">قيمة 10 غ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row) => (
                        <tr key={row.karat} className="border-b border-border/70 last:border-0">
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center gap-2">
                              <span className="grid size-7 place-items-center rounded-lg bg-goldsoft text-[10px] font-bold text-gold">
                                {row.karat}K
                              </span>
                              <span className="text-[13px] font-medium text-text">عيار {row.karat}</span>
                            </span>
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-muted">{row.factor.toFixed(3)}</td>
                          <td className="px-3 py-3 text-end">
                            <span className="text-[15px] font-semibold tabular-nums text-text">
                              {fmtMoney(row.pricePerGram)}
                            </span>
                            <span className="ms-1 text-[10px] text-muted">{currency}</span>
                          </td>
                          <td className="hidden px-3 py-3 text-end text-xs tabular-nums text-muted sm:table-cell">
                            {fmtMoney(row.pricePerGram * 10)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-surface2/50">
                        <td colSpan={2} className="px-3 py-2.5 text-[12px] font-medium text-muted">
                          سعر غرام 24 (ذهب خالص)
                        </td>
                        <td className="px-3 py-2.5 text-end text-[13px] font-semibold tabular-nums text-gold">
                          {fmtMoney(preview.gramPrice24)}
                          <span className="ms-1 text-[10px] font-medium text-muted">{currency}</span>
                        </td>
                        <td className="hidden px-3 py-2.5 sm:table-cell" />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-surface2/40 px-3 py-2.5 text-[11px] leading-5 text-muted">
                  <Calculator className="mt-0.5 size-3.5 shrink-0 text-gold" />
                  <p>
                    التحويل يبدأ من الذهب الخالص: قيمة الأونصة بالعملة المحلية ÷ {TROY_OUNCE_GRAMS} = سعر غرام 24،
                    ثم يُضرب في معامل العيار. سعر الحجر والفصوص والربح تُضاف لاحقاً عند تسعير القطعة.
                  </p>
                </div>
              </>
            ) : (
              <div className="mt-4 grid place-items-center rounded-xl border border-dashed border-border px-4 py-12 text-center">
                <Coins className="size-8 text-muted/60" />
                <p className="mt-3 text-sm font-medium text-text">الجدول غير متاح</p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-muted">
                  أدخل سعر الأونصة وسعر الصرف لعرض أسعار الغرام لكل عيار.
                </p>
              </div>
            )}

            {preview && (ounceChanged || fxChanged) ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface2/50 px-3 py-2">
                <p className="text-[11px] leading-5 text-muted">
                  القيم المعروضة معاينة فقط. اضغط «حفظ» بجانب الحقل لتثبيت السعر.
                </p>
                {ounceChanged && typeof ounce === 'number' && isOwner ? (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={CheckCircle2}
                    loading={saveOunce.isPending}
                    onClick={() => saveOunce.mutate(ounce)}
                  >
                    حفظ الأونصة
                  </Button>
                ) : null}
                {fxChanged && typeof fx === 'number' ? (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={CheckCircle2}
                    loading={saveFx.isPending}
                    onClick={() => saveFx.mutate(fx)}
                  >
                    حفظ الصرف
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle
          title="كيف يتحوّل سعر الأونصة إلى سعر العيار؟"
          description="ثلاث خطوات واضحة، وكل خطوة قابلة للتحقق من الأرقام أعلاه."
        />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Step
            index="1"
            title="قيمة الأونصة محلياً"
            body="سعر الأونصة بالدولار × سعر الصرف"
            formula={
              <span dir="ltr">
                ${fmtMoney(ounce)} × {fmtMoney(fx)}
              </span>
            }
          />
          <Step
            index="2"
            title="سعر غرام 24"
            body={`القسمة على عدد غرامات أونصة تروي (${TROY_OUNCE_GRAMS})`}
            formula={
              <>
                {fmtMoney(preview?.gramPrice24)} {currency}/غ
              </>
            }
          />
          <Step
            index="3"
            title="سعر غرام العيار"
            body="ضرب سعر غرام 24 في (العيار ÷ 24)"
            formula={
              <span className="flex flex-wrap gap-x-3 gap-y-1" dir="ltr">
                {preview?.rows.map((r) => (
                  <span key={r.karat}>
                    {r.karat}K = {fmtMoney(r.pricePerGram)}
                  </span>
                ))}
              </span>
            }
          />
        </div>
      </Card>

      <PriceHistorySection currency={currency} />
    </div>
  );
}

function PriceHistorySection({ currency }: { currency: string }) {
  const [filter, setFilter] = useState<HistoryFilter>('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const { data, isLoading } = useQuery({
    queryKey: ['prices', 'history', filter, page],
    queryFn: () =>
      api.get<Paged<PriceUpdate>>(
        `/prices/history${qs({ page, pageSize, type: filter === 'ALL' ? undefined : filter })}`,
      ),
  });

  const columns: Array<Column<PriceUpdate>> = [
    {
      key: 'type',
      header: 'النوع',
      cell: (row) => (
        <Badge tone={row.type === 'OUNCE' ? 'gold' : 'info'}>{row.type === 'OUNCE' ? 'أونصة' : 'صرف'}</Badge>
      ),
    },
    {
      key: 'value',
      header: 'القيمة',
      align: 'end',
      cell: (row) => (
        <span className="font-semibold tabular-nums text-text">
          {fmtMoney(row.value)}
          <span className="ms-1 text-[10px] font-medium text-muted">
            {row.type === 'OUNCE' ? 'USD' : currency}
          </span>
        </span>
      ),
    },
    {
      key: 'source',
      header: 'المصدر',
      cell: (row) => (
        <span className="text-xs text-muted">{row.source === 'MANUAL' ? 'يدوي' : 'API'}</span>
      ),
    },
    {
      key: 'user',
      header: 'أدخله',
      cell: (row) => <span className="text-xs text-text">{row.user?.name ?? '—'}</span>,
    },
    {
      key: 'at',
      header: 'التاريخ',
      align: 'end',
      cell: (row) => <span className="text-xs tabular-nums text-muted">{fmtDateTime(row.createdAt)}</span>,
    },
  ];

  return (
    <Card className="p-0">
      <div className="px-5 pt-4">
        <SectionTitle
          title="سجل تحديث الأسعار"
          description="كل إدخال محفوظ ولا يمكن تعديله لاحقاً."
          action={<History className="size-4 text-muted" />}
        />
        <Tabs
          className="mt-3"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          items={[
            { value: 'ALL', label: 'الكل' },
            { value: 'OUNCE', label: 'الأونصة' },
            { value: 'FX', label: 'سعر الصرف' },
          ]}
        />
      </div>

      <div className="px-3 pb-3 pt-3 sm:px-5 sm:pb-5">
        <DataTable
          rows={data?.rows ?? []}
          columns={columns}
          rowKey={(row) => row.id}
          loading={isLoading}
          empty={
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <ArrowDown className="size-5 text-muted" />
              <p className="text-sm font-medium text-text">لا يوجد سجل بعد</p>
              <p className="text-xs text-muted">ستظهر هنا كل تحديثات الأسعار.</p>
            </div>
          }
          className="border-0 shadow-none"
          compact
        />
        {data ? (
          <Pagination page={page} pageSize={pageSize} total={data.total} onPage={setPage} className="mt-3" />
        ) : null}
      </div>
    </Card>
  );
}

function Step({
  index,
  title,
  body,
  formula,
}: {
  index: string;
  title: string;
  body: string;
  formula: ReactNode;
}) {
  return (
    <div className="relative rounded-xl border border-border bg-surface2/40 p-4">
      <div className="flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-full bg-goldsoft text-[11px] font-bold text-gold">
          {index}
        </span>
        <p className="text-[13px] font-semibold text-text">{title}</p>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-muted">{body}</p>
      <div className="mt-2.5 rounded-lg border border-border bg-surface px-2.5 py-2 text-[12px] font-semibold tabular-nums text-gold">
        {formula}
      </div>
    </div>
  );
}
