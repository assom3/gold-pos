import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Coins,
  RefreshCw,
  Receipt,
  Scale,
  ScrollText,
  TrendingUp,
  Wallet,
  Warehouse,
  X,
} from 'lucide-react';
import { api, qs } from '../lib/api';
import type {
  AuditEntry,
  InventoryReport,
  Lookup,
  PriceUpdate,
  ProfitReport,
  SalesReport,
  Setting,
  User,
} from '../lib/types';
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, fmtWeight, timeAgo } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  SectionTitle,
  Select,
  Skeleton,
  StatCard,
  Tabs,
} from '../components/ui/primitives';
import { DataTable, Pagination, type Column } from '../components/ui/data-table';

type Tab = 'sales' | 'profit' | 'inventory' | 'prices' | 'audit';

export default function Reports() {
  const [tab, setTab] = useState<Tab>('sales');

  return (
    <div className="space-y-4">
      <PageHeader
        title="التقارير"
        subtitle="أرقام المحل الحقيقية من الفواتير والمخزون وسجل التعديلات — للمالك فقط."
      />

      <Card className="p-2">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'sales', label: 'المبيعات', icon: Receipt },
            { value: 'profit', label: 'الأرباح', icon: TrendingUp },
            { value: 'inventory', label: 'المخزون', icon: Warehouse },
            { value: 'prices', label: 'سجل الأسعار', icon: Coins },
            { value: 'audit', label: 'سجل التعديلات', icon: ScrollText },
          ]}
        />
      </Card>

      {tab === 'sales' ? <SalesReportTab /> : null}
      {tab === 'profit' ? <ProfitReportTab /> : null}
      {tab === 'inventory' ? <InventoryReportTab /> : null}
      {tab === 'prices' ? <PricesReportTab /> : null}
      {tab === 'audit' ? <AuditReportTab /> : null}
    </div>
  );
}

/* ═══════════════════════ بيانات مشتركة ═══════════════════════ */

function useMeta() {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Setting>('/settings'),
    staleTime: 5 * 60_000,
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users'),
    staleTime: 5 * 60_000,
  });

  const { data: paymentMethods } = useQuery({
    queryKey: ['lookups', 'PAYMENT_METHOD'],
    queryFn: () => api.get<Lookup[]>('/lookups?kind=PAYMENT_METHOD'),
    staleTime: 5 * 60_000,
  });

  const { data: karatLookups } = useQuery({
    queryKey: ['lookups', 'KARAT'],
    queryFn: () => api.get<Lookup[]>('/lookups?kind=KARAT'),
    staleTime: 5 * 60_000,
  });

  return {
    currency: settings?.currency ?? 'LYD',
    users: users ?? [],
    paymentMethods: paymentMethods ?? [],
    karats: (karatLookups ?? []).map((l) => Number(l.value)).filter((k) => Number.isInteger(k)),
  };
}

function useClientPage<T>(rows: T[], pageSize = 15) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safe = Math.min(page, pages);

  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);

  return {
    page: safe,
    pageSize,
    total: rows.length,
    rows: rows.slice((safe - 1) * pageSize, safe * pageSize),
    setPage,
  };
}

function startOfMonth(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function rangeQuery(from: string, to: string) {
  return {
    from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
  };
}

/* ═══════════════════════ تقرير المبيعات ═══════════════════════ */

function SalesReportTab() {
  const navigate = useNavigate();
  const { currency, users, paymentMethods, karats } = useMeta();
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [sellerId, setSellerId] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [karat, setKarat] = useState('');

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ['reports', 'sales', from, to, sellerId, paymentMethodId, karat],
    queryFn: () =>
      api.get<SalesReport>(
        `/reports/sales${qs({
          ...rangeQuery(from, to),
          sellerId: sellerId || undefined,
          paymentMethodId: paymentMethodId || undefined,
          karat: karat || undefined,
        })}`,
      ),
  });

  const table = useClientPage(data?.rows ?? []);

  const bySeller = useMemo(
    () => [...(data?.bySeller ?? [])].sort((a, b) => b.total - a.total),
    [data],
  );
  const byPayment = useMemo(
    () => [...(data?.byPayment ?? [])].sort((a, b) => b.total - a.total),
    [data],
  );
  const byKarat = useMemo(
    () => [...(data?.byKarat ?? [])].sort((a, b) => a.karat - b.karat),
    [data],
  );

  const columns: Array<Column<SalesReport['rows'][number]>> = [
    {
      key: 'invoice',
      header: 'الفاتورة',
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-mono text-[12px] font-semibold text-gold">{row.invoiceNo}</p>
          <p className="text-[10px] text-muted">{fmtDate(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'العميل',
      cell: (row) => (
        <span className="text-[12px] text-text">{row.customerName ?? '—'}</span>
      ),
    },
    {
      key: 'seller',
      header: 'البائع',
      hideOnMobile: true,
      cell: (row) => <span className="text-[12px] text-muted">{row.seller?.name ?? '—'}</span>,
    },
    {
      key: 'payment',
      header: 'الدفع',
      hideOnMobile: true,
      cell: (row) => <span className="text-[12px] text-muted">{row.paymentMethod?.value ?? '—'}</span>,
    },
    {
      key: 'items',
      header: 'القطع',
      align: 'center',
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-[12px] tabular-nums text-muted">
          {fmtNum(row.items.reduce((s, l) => s + l.quantity, 0))}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'الإجمالي',
      align: 'end',
      cell: (row) => (
        <span className="text-[13px] font-semibold tabular-nums text-text">
          {fmtMoney(row.total)} <span className="text-[9px] font-normal text-muted">{currency}</span>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <RangeInputs from={from} to={to} onFrom={setFrom} onTo={setTo} />
          <div>
            <FilterLabel>البائع</FilterLabel>
            <Select value={sellerId} onChange={(e) => setSellerId(e.target.value)} placeholder="كل البائعين">
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FilterLabel>طريقة الدفع</FilterLabel>
            <Select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              placeholder="الكل"
            >
              {paymentMethods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.value}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FilterLabel>العيار</FilterLabel>
            <Select value={karat} onChange={(e) => setKarat(e.target.value)} placeholder="الكل">
              {karats.map((k) => (
                <option key={k} value={k}>
                  عيار {k}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={!from && !to && !sellerId && !paymentMethodId && !karat}
              onClick={() => {
                setFrom('');
                setTo('');
                setSellerId('');
                setPaymentMethodId('');
                setKarat('');
              }}
            >
              <X className="size-3.5" />
              مسح الفلاتر
            </Button>
          </div>
        </div>
      </Card>

      {isError ? <ErrorCard text={`تعذر تحميل تقرير المبيعات: ${errorMessage(error)}`} /> : null}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[104px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="عدد الفواتير المكتملة"
            value={fmtNum(data?.count)}
            hint={`${fmtNum(byKarat.reduce((s, k) => s + k.count, 0))} قطعة مباعة`}
            icon={Receipt}
            tone="info"
          />
          <StatCard
            label="إجمالي المبيعات"
            value={
              <>
                {fmtMoney(data?.total)} <span className="text-xs font-medium text-muted">{currency}</span>
              </>
            }
            hint="بدون الفواتير الملغاة"
            icon={Wallet}
            tone="gold"
          />
          <StatCard
            label="متوسط الفاتورة"
            value={
              <>
                {fmtMoney(data?.average)} <span className="text-xs font-medium text-muted">{currency}</span>
              </>
            }
            hint={from || to ? `${from || 'البداية'} ← ${to || 'اليوم'}` : 'كل الفترات'}
            icon={TrendingUp}
            tone="success"
          />
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <SectionTitle title="المبيعات حسب البائع" description="من أنجز كل مبلغ في الفترة المحددة." />
          <div className="mt-3 space-y-2">
            {bySeller.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-muted">لا مبيعات في هذه الفترة.</p>
            ) : (
              bySeller.map((row) => (
                <DistributionRow
                  key={row.id}
                  label={row.name}
                  meta={`${fmtNum(row.count)} فاتورة`}
                  value={`${fmtMoney(row.total)} ${currency}`}
                  share={data && data.total > 0 ? (row.total / data.total) * 100 : 0}
                />
              ))
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle title="المبيعات حسب طريقة الدفع" description="توزيع الإيراد على وسائل القبض." />
          <div className="mt-3 space-y-2">
            {byPayment.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-muted">لا مبيعات في هذه الفترة.</p>
            ) : (
              byPayment.map((row) => (
                <DistributionRow
                  key={row.name}
                  label={row.name}
                  meta={`${fmtNum(row.count)} فاتورة`}
                  value={`${fmtMoney(row.total)} ${currency}`}
                  share={data && data.total > 0 ? (row.total / data.total) * 100 : 0}
                />
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="p-0">
        <div className="border-b border-border px-4 py-3">
          <SectionTitle title="المبيعات حسب العيار" description="الكمية والوزن والقيمة لكل عيار." />
        </div>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface2/50 text-[11px] text-muted">
                <th className="px-4 py-2 text-start font-semibold">العيار</th>
                <th className="px-3 py-2 text-center font-semibold">عدد القطع</th>
                <th className="px-3 py-2 text-end font-semibold">الوزن المباع</th>
                <th className="px-4 py-2 text-end font-semibold">القيمة</th>
              </tr>
            </thead>
            <tbody>
              {byKarat.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[12px] text-muted">
                    لا بيانات للعيارات في هذه الفترة.
                  </td>
                </tr>
              ) : (
                byKarat.map((row) => (
                  <tr key={row.karat} className="border-b border-border/70 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="inline-flex rounded-md bg-goldsoft px-1.5 py-0.5 text-[10px] font-bold text-gold">
                        {row.karat}K
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-[12px] tabular-nums text-text">{fmtNum(row.count)}</td>
                    <td className="px-3 py-2.5 text-end text-[12px] tabular-nums text-muted">
                      {fmtWeight(row.weight)} غ
                    </td>
                    <td className="px-4 py-2.5 text-end text-[12px] font-semibold tabular-nums text-text">
                      {fmtMoney(row.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <SectionTitle title="فواتير الفترة" description="اضغط على أي فاتورة لعرض تفاصيلها." />
          <Button variant="ghost" size="sm" icon={RefreshCw} loading={isFetching} onClick={() => void refetch()}>
            تحديث
          </Button>
        </div>
        <DataTable
          rows={table.rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={(row) => navigate(`/sales/${row.id}`)}
          className="rounded-none border-0 shadow-none"
          empty={
            <EmptyState
              icon={Receipt}
              title="لا فواتير في هذه الفترة"
              description="غيّر نطاق التاريخ أو الفلاتر لعرض مبيعات أخرى."
            />
          }
        />
        <div className="border-t border-border px-4 py-3">
          <Pagination
            page={table.page}
            pageSize={table.pageSize}
            total={table.total}
            onPage={table.setPage}
          />
        </div>
      </Card>
    </div>
  );
}

/* ═══════════════════════ تقرير الأرباح ═══════════════════════ */

function ProfitReportTab() {
  const { currency } = useMeta();
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ['reports', 'profit', from, to],
    queryFn: () => api.get<ProfitReport>(`/reports/profit${qs(rangeQuery(from, to))}`),
  });

  const table = useClientPage(data?.rows ?? []);

  const columns: Array<Column<ProfitReport['rows'][number]>> = [
    {
      key: 'invoice',
      header: 'الفاتورة',
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-mono text-[12px] font-semibold text-gold">{row.invoiceNo}</p>
          <p className="text-[10px] text-muted">{fmtDate(row.date)}</p>
        </div>
      ),
    },
    {
      key: 'item',
      header: 'الصنف',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-text">{row.name}</p>
          <p className="font-mono text-[10px] text-muted">{row.code}</p>
        </div>
      ),
    },
    {
      key: 'karat',
      header: 'العيار',
      align: 'center',
      hideOnMobile: true,
      cell: (row) => <span className="text-[11px] tabular-nums text-muted">{row.karat}K</span>,
    },
    {
      key: 'quantity',
      header: 'الكمية',
      align: 'center',
      hideOnMobile: true,
      cell: (row) => <span className="text-[12px] tabular-nums text-text">{row.quantity}</span>,
    },
    {
      key: 'revenue',
      header: 'البيع',
      align: 'end',
      cell: (row) => (
        <span className="text-[12px] tabular-nums text-text">{fmtMoney(row.revenue)}</span>
      ),
    },
    {
      key: 'cost',
      header: 'التكلفة',
      align: 'end',
      hideOnMobile: true,
      cell: (row) => <span className="text-[11px] tabular-nums text-muted">{fmtMoney(row.cost)}</span>,
    },
    {
      key: 'profit',
      header: 'الربح',
      align: 'end',
      cell: (row) => (
        <span
          className={'text-[12px] font-semibold tabular-nums ' + (row.profit < 0 ? 'text-danger' : 'text-success')}
        >
          {row.profit >= 0 ? '+' : ''}
          {fmtMoney(row.profit)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <RangeInputs from={from} to={to} onFrom={setFrom} onTo={setTo} />
          <div className="flex items-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              disabled={!from && !to}
              onClick={() => {
                setFrom('');
                setTo('');
              }}
            >
              <X className="size-3.5" />
              مسح
            </Button>
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={isFetching} onClick={() => void refetch()}>
              تحديث
            </Button>
          </div>
        </div>
      </Card>

      {isError ? <ErrorCard text={`تعذر تحميل تقرير الأرباح: ${errorMessage(error)}`} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px] rounded-2xl" />)
        ) : (
          <>
            <StatCard
              label="إجمالي البيع"
              value={
                <>
                  {fmtMoney(data?.revenue)} <span className="text-xs font-medium text-muted">{currency}</span>
                </>
              }
              hint="قبل خصم التكلفة"
              icon={Wallet}
              tone="info"
            />
            <StatCard
              label="إجمالي التكلفة"
              value={
                <>
                  {fmtMoney(data?.cost)} <span className="text-xs font-medium text-muted">{currency}</span>
                </>
              }
              hint="تكلفة الشراء المسجّلة للأصناف المباعة"
              icon={Scale}
              tone="muted"
            />
            <StatCard
              label="الربح الإجمالي"
              value={
                <>
                  {(data?.profit ?? 0) >= 0 ? '+' : ''}
                  {fmtMoney(data?.profit)} <span className="text-xs font-medium text-muted">{currency}</span>
                </>
              }
              hint={`${fmtNum(data?.rows.length)} سطر بيع`}
              icon={TrendingUp}
              tone={(data?.profit ?? 0) < 0 ? 'danger' : 'success'}
            />
            <StatCard
              label="هامش الربح"
              value={`${fmtMoney(data?.marginPercent)}%`}
              hint="الربح ÷ إجمالي البيع"
              icon={TrendingUp}
              tone={(data?.marginPercent ?? 0) < 0 ? 'danger' : 'gold'}
            />
          </>
        )}
      </div>

      <Card className="p-0">
        <div className="border-b border-border px-4 py-3">
          <SectionTitle
            title="تفصيل الأرباح حسب القطعة"
            description="الربح = سعر البيع الفعلي − تكلفة الشراء المسجّلة × الكمية."
          />
        </div>
        <DataTable
          rows={table.rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={isLoading}
          compact
          className="rounded-none border-0 shadow-none"
          empty={
            <EmptyState
              icon={TrendingUp}
              title="لا مبيعات في هذه الفترة"
              description="اختر فترة أخرى لعرض أرباح القطع المباعة."
            />
          }
        />
        <div className="border-t border-border px-4 py-3">
          <Pagination page={table.page} pageSize={table.pageSize} total={table.total} onPage={table.setPage} />
        </div>
      </Card>

      <p className="px-1 text-[11px] leading-5 text-muted">
        الأرباح محسوبة على أساس تكلفة الشراء المخزّنة مع كل صنف. إذا لم تُسجَّل تكلفة شراء، سيظهر الربح مساوياً لسعر البيع.
      </p>
    </div>
  );
}

/* ═══════════════════════ تقرير المخزون ═══════════════════════ */

function InventoryReportTab() {
  const { currency } = useMeta();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ['reports', 'inventory'],
    queryFn: () => api.get<InventoryReport>('/reports/inventory'),
  });

  const table = useClientPage(data?.rows ?? [], 20);

  const columns: Array<Column<InventoryReport['rows'][number]>> = [
    {
      key: 'item',
      header: 'الصنف',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-text">{row.name}</p>
          <p className="font-mono text-[10px] text-gold">{row.code}</p>
        </div>
      ),
    },
    {
      key: 'karat',
      header: 'العيار',
      align: 'center',
      cell: (row) => (
        <span className="inline-flex rounded-md bg-goldsoft px-1.5 py-0.5 text-[10px] font-bold text-gold">
          {row.karat}K
        </span>
      ),
    },
    {
      key: 'quantity',
      header: 'الكمية',
      align: 'center',
      hideOnMobile: true,
      cell: (row) => <span className="text-[12px] tabular-nums text-text">{row.quantity}</span>,
    },
    {
      key: 'weight',
      header: 'الوزن',
      align: 'end',
      cell: (row) => (
        <div className="text-end">
          <p className="text-[12px] tabular-nums text-text">{fmtWeight(row.totalWeight)} غ</p>
          <p className="text-[10px] tabular-nums text-muted">صافي {fmtWeight(row.netGoldWeight)} غ</p>
        </div>
      ),
    },
    {
      key: 'value',
      header: 'القيمة',
      align: 'end',
      cell: (row) => (
        <span className="text-[12px] font-semibold tabular-nums text-text">{fmtMoney(row.value)}</span>
      ),
    },
    {
      key: 'cost',
      header: 'التكلفة',
      align: 'end',
      hideOnMobile: true,
      cell: (row) => <span className="text-[11px] tabular-nums text-muted">{fmtMoney(row.cost)}</span>,
    },
    {
      key: 'margin',
      header: 'الهامش',
      align: 'end',
      cell: (row) => (
        <span className={'text-[12px] font-semibold tabular-nums ' + (row.margin < 0 ? 'text-danger' : 'text-success')}>
          {row.margin >= 0 ? '+' : ''}
          {fmtMoney(row.margin)}
        </span>
      ),
    },
  ];

  const margin = (data?.totalValue ?? 0) - (data?.totalCost ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted">
          تقييم لحظي بأسعار الذهب الحالية · {fmtNum(data?.count)} صنف متاح
        </p>
        <Button
          variant="secondary"
          size="sm"
          icon={RefreshCw}
          loading={isFetching}
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ['reports', 'inventory'] });
            void refetch();
          }}
        >
          إعادة التقييم
        </Button>
      </div>

      {!isLoading && data && !data.ready ? (
        <Card className="border-[color-mix(in_oklab,var(--warning)_32%,transparent)] bg-warningsoft text-xs leading-5">
          أسعار الذهب غير جاهزة، لذلك القيم تظهر صفراً. أدخل سعر الأونصة وسعر الصرف من صفحة «أسعار الذهب» ثم أعد التقييم.
        </Card>
      ) : null}

      {isError ? <ErrorCard text={`تعذر تحميل تقرير المخزون: ${errorMessage(error)}`} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px] rounded-2xl" />)
        ) : (
          <>
            <StatCard
              label="قيمة المخزون"
              value={
                <>
                  {fmtMoney(data?.totalValue)} <span className="text-xs font-medium text-muted">{currency}</span>
                </>
              }
              hint="بأسعار اللحظة"
              icon={Coins}
              tone="gold"
            />
            <StatCard
              label="تكلفة المخزون"
              value={
                <>
                  {fmtMoney(data?.totalCost)} <span className="text-xs font-medium text-muted">{currency}</span>
                </>
              }
              hint="إجمالي تكلفة الشراء"
              icon={Wallet}
              tone="muted"
            />
            <StatCard
              label="الهامش التقديري"
              value={
                <>
                  {margin >= 0 ? '+' : ''}
                  {fmtMoney(margin)} <span className="text-xs font-medium text-muted">{currency}</span>
                </>
              }
              hint="القيمة الحالية − التكلفة"
              icon={TrendingUp}
              tone={margin < 0 ? 'danger' : 'success'}
            />
            <StatCard
              label="عدد الأصناف"
              value={fmtNum(data?.count)}
              hint={`${fmtNum(data?.rows.reduce((s, r) => s + r.quantity, 0))} قطعة متاحة`}
              icon={Warehouse}
              tone="info"
            />
          </>
        )}
      </div>

      <Card className="p-0">
        <div className="border-b border-border px-4 py-3">
          <SectionTitle title="تفصيل تقييم المخزون" description="اضغط على الصنف لفتح بطاقته." />
        </div>
        <DataTable
          rows={table.rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={(row) => navigate(`/items/${row.id}`)}
          className="rounded-none border-0 shadow-none"
          empty={<EmptyState icon={Warehouse} title="المخزون فارغ" description="لا توجد أصناف متاحة حالياً." />}
        />
        <div className="border-t border-border px-4 py-3">
          <Pagination page={table.page} pageSize={table.pageSize} total={table.total} onPage={table.setPage} />
        </div>
      </Card>
    </div>
  );
}

/* ═══════════════════════ سجل الأسعار ═══════════════════════ */

function PricesReportTab() {
  const { currency } = useMeta();
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ['reports', 'prices', from, to],
    queryFn: () => api.get<PriceUpdate[]>(`/reports/prices${qs(rangeQuery(from, to))}`),
  });

  const table = useClientPage(data ?? [], 20);
  const latestOunce = (data ?? []).find((row) => row.type === 'OUNCE');
  const latestFx = (data ?? []).find((row) => row.type === 'FX');

  const columns: Array<Column<PriceUpdate>> = [
    {
      key: 'type',
      header: 'النوع',
      cell: (row) => (
        <Badge tone={row.type === 'OUNCE' ? 'gold' : 'info'}>
          {row.type === 'OUNCE' ? 'أونصة' : 'صرف'}
        </Badge>
      ),
    },
    {
      key: 'value',
      header: 'القيمة',
      align: 'end',
      cell: (row) => (
        <span className="text-[13px] font-semibold tabular-nums text-text">
          {row.type === 'OUNCE' ? `$${fmtMoney(row.value)}` : fmtMoney(row.value)}
          {row.type === 'FX' ? <span className="ms-1 text-[9px] font-normal text-muted">{currency}</span> : null}
        </span>
      ),
    },
    {
      key: 'source',
      header: 'المصدر',
      align: 'center',
      hideOnMobile: true,
      cell: (row) => (
        <Badge tone={row.source === 'MANUAL' ? 'muted' : 'success'}>
          {row.source === 'MANUAL' ? 'يدوي' : 'تلقائي'}
        </Badge>
      ),
    },
    {
      key: 'user',
      header: 'المستخدم',
      hideOnMobile: true,
      cell: (row) => <span className="text-[12px] text-muted">{row.user?.name ?? `#${row.userId}`}</span>,
    },
    {
      key: 'at',
      header: 'التاريخ',
      align: 'end',
      cell: (row) => (
        <div className="text-end">
          <p className="text-[12px] tabular-nums text-text">{fmtDateTime(row.createdAt)}</p>
          <p className="text-[10px] text-muted">{timeAgo(row.createdAt)}</p>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <RangeInputs from={from} to={to} onFrom={setFrom} onTo={setTo} />
          <div className="flex items-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              disabled={!from && !to}
              onClick={() => {
                setFrom('');
                setTo('');
              }}
            >
              <X className="size-3.5" />
              مسح
            </Button>
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={isFetching} onClick={() => void refetch()}>
              تحديث
            </Button>
          </div>
        </div>
      </Card>

      {isError ? <ErrorCard text={`تعذر تحميل سجل الأسعار: ${errorMessage(error)}`} /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="عدد التحديثات"
          value={fmtNum(data?.length)}
          hint="في الفترة المحددة (حتى 500 سجل)"
          icon={Coins}
          tone="info"
        />
        <StatCard
          label="آخر سعر أونصة"
          value={latestOunce ? `$${fmtMoney(latestOunce.value)}` : '—'}
          hint={latestOunce ? timeAgo(latestOunce.createdAt) : 'لا يوجد في الفترة'}
          icon={Coins}
          tone="gold"
        />
        <StatCard
          label="آخر سعر صرف"
          value={latestFx ? `${fmtMoney(latestFx.value)} ${currency}` : '—'}
          hint={latestFx ? timeAgo(latestFx.createdAt) : 'لا يوجد في الفترة'}
          icon={Wallet}
          tone="success"
        />
      </div>

      <Card className="p-0">
        <div className="border-b border-border px-4 py-3">
          <SectionTitle
            title="سجل تحديثات الأسعار"
            description="كل تغيير في سعر الأونصة أو الصرف يُحفظ باسم المستخدم ووقت الإدخال."
          />
        </div>
        <DataTable
          rows={table.rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={isLoading}
          className="rounded-none border-0 shadow-none"
          empty={
            <EmptyState
              icon={Coins}
              title="لا تحديثات في هذه الفترة"
              description="جرّب توسيع نطاق التاريخ أو أدخل أسعاراً جديدة."
            />
          }
        />
        <div className="border-t border-border px-4 py-3">
          <Pagination page={table.page} pageSize={table.pageSize} total={table.total} onPage={table.setPage} />
        </div>
      </Card>
    </div>
  );
}

/* ═══════════════════════ سجل التعديلات ═══════════════════════ */

const ACTION_LABEL: Record<string, string> = {
  CREATE_ITEM: 'إضافة صنف',
  UPDATE_ITEM: 'تعديل صنف',
  DELETE_ITEM: 'حذف صنف',
  CREATE_SALE: 'بيع جديد',
  CANCEL_SALE: 'إلغاء فاتورة',
  OPEN_STOCKTAKE: 'فتح جرد',
  CLOSE_STOCKTAKE: 'إغلاق جرد',
  UPDATE_SETTINGS: 'تعديل الإعدادات',
  CREATE_USER: 'إضافة مستخدم',
  UPDATE_USER: 'تعديل مستخدم',
  RESET_PASSWORD: 'تغيير كلمة مرور',
  CREATE_LOOKUP: 'إضافة قيمة',
  UPDATE_LOOKUP: 'تعديل قيمة',
  DELETE_LOOKUP: 'حذف قيمة',
  DEACTIVATE_LOOKUP: 'إخفاء قيمة',
  UPDATE_PRICES: 'تحديث الأسعار',
  LOGIN: 'تسجيل دخول',
  LOGOUT: 'تسجيل خروج',
};

const ENTITY_LABEL: Record<string, string> = {
  item: 'صنف',
  sale: 'فاتورة',
  user: 'مستخدم',
  lookup: 'قائمة',
  settings: 'إعدادات',
  stocktake: 'جرد',
  price: 'سعر',
};

const ENTITIES = ['item', 'sale', 'user', 'lookup', 'settings', 'stocktake', 'price'] as const;

function AuditReportTab() {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [entity, setEntity] = useState('');
  const [take, setTake] = useState(100);

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ['reports', 'audit', from, to, entity, take],
    queryFn: () =>
      api.get<AuditEntry[]>(
        `/reports/audit${qs({ ...rangeQuery(from, to), entity: entity || undefined, take })}`,
      ),
  });

  const table = useClientPage(data ?? [], 25);

  const columns: Array<Column<AuditEntry>> = [
    {
      key: 'action',
      header: 'العملية',
      cell: (row) => (
        <Badge tone={row.action.startsWith('DELETE') || row.action.startsWith('CANCEL') ? 'danger' : 'muted'}>
          {ACTION_LABEL[row.action] ?? row.action}
        </Badge>
      ),
    },
    {
      key: 'entity',
      header: 'السجل',
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-[12px] text-muted">
          {ENTITY_LABEL[row.entity] ?? row.entity}
          {row.entityId ? <span className="ms-1 font-mono text-[10px]">#{row.entityId}</span> : null}
        </span>
      ),
    },
    {
      key: 'user',
      header: 'المستخدم',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-[12px] text-text">{row.user?.name ?? 'النظام'}</p>
          {row.user ? (
            <p className="text-[10px] text-muted">{row.user.role === 'OWNER' ? 'مالك' : 'بائع'}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'details',
      header: 'التفاصيل',
      hideOnMobile: true,
      cell: (row) => <AuditDetails entry={row} />,
    },
    {
      key: 'at',
      header: 'التاريخ',
      align: 'end',
      cell: (row) => (
        <div className="text-end">
          <p className="text-[12px] tabular-nums text-text">{fmtDateTime(row.createdAt)}</p>
          <p className="text-[10px] text-muted">{timeAgo(row.createdAt)}</p>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <RangeInputs from={from} to={to} onFrom={setFrom} onTo={setTo} />
          <div>
            <FilterLabel>نوع السجل</FilterLabel>
            <Select value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="الكل">
              {ENTITIES.map((value) => (
                <option key={value} value={value}>
                  {ENTITY_LABEL[value]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FilterLabel>عدد السجلات</FilterLabel>
            <Select value={String(take)} onChange={(e) => setTake(Number(e.target.value))}>
              {[50, 100, 200, 500].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              disabled={!from && !to && !entity}
              onClick={() => {
                setFrom('');
                setTo('');
                setEntity('');
              }}
            >
              <X className="size-3.5" />
              مسح
            </Button>
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={isFetching} onClick={() => void refetch()}>
              تحديث
            </Button>
          </div>
        </div>
      </Card>

      {isError ? <ErrorCard text={`تعذر تحميل سجل التعديلات: ${errorMessage(error)}`} /> : null}

      <Card className="p-0">
        <div className="border-b border-border px-4 py-3">
          <SectionTitle
            title="سجل التعديلات"
            description="عمليات الإضافة والتعديل والإلغاء المسجّلة تلقائياً، الأحدث أولاً."
            action={<Badge tone="muted">{fmtNum(data?.length)} سجل</Badge>}
          />
        </div>
        <DataTable
          rows={table.rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={isLoading}
          compact
          className="rounded-none border-0 shadow-none"
          empty={
            <EmptyState
              icon={ScrollText}
              title="لا سجلات في هذه الفترة"
              description="غيّر نطاق التاريخ أو نوع السجل لعرض عمليات أخرى."
            />
          }
        />
        <div className="border-t border-border px-4 py-3">
          <Pagination page={table.page} pageSize={table.pageSize} total={table.total} onPage={table.setPage} />
        </div>
      </Card>
    </div>
  );
}

function AuditDetails({ entry }: { entry: AuditEntry }) {
  const hasOld = entry.oldValue !== null && entry.oldValue !== undefined;
  const hasNew = entry.newValue !== null && entry.newValue !== undefined;
  if (!hasOld && !hasNew) return <span className="text-[11px] text-muted">—</span>;

  return (
    <details className="group max-w-[280px]">
      <summary className="cursor-pointer select-none text-[11px] font-medium text-gold hover:underline">
        عرض التغيير
      </summary>
      <div className="mt-1.5 space-y-1 rounded-lg bg-surface2/60 p-2 text-[10px] leading-4">
        {hasOld ? (
          <div>
            <p className="font-semibold text-danger">قبل</p>
            <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-muted scroll-thin">
              {JSON.stringify(entry.oldValue, null, 1)}
            </pre>
          </div>
        ) : null}
        {hasNew ? (
          <div>
            <p className="font-semibold text-success">بعد</p>
            <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-muted scroll-thin">
              {JSON.stringify(entry.newValue, null, 1)}
            </pre>
          </div>
        ) : null}
      </div>
    </details>
  );
}

/* ═══════════════════════ عناصر مساعدة ═══════════════════════ */

function FilterLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-[11px] font-medium text-muted">{children}</label>;
}

function RangeInputs({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
}) {
  return (
    <>
      <div>
        <FilterLabel>من تاريخ</FilterLabel>
        <Input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className="ltr-nums" />
      </div>
      <div>
        <FilterLabel>إلى تاريخ</FilterLabel>
        <Input type="date" value={to} onChange={(e) => onTo(e.target.value)} className="ltr-nums" />
      </div>
    </>
  );
}

function DistributionRow({
  label,
  meta,
  value,
  share,
}: {
  label: string;
  meta: string;
  value: string;
  share: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface2/35 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-text">{label}</p>
          <p className="text-[10px] text-muted">{meta}</p>
        </div>
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-text">{value}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface3">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--gold-hover)] to-[var(--gold)]"
            style={{ width: `${Math.min(100, Math.max(1, share))}%` }}
          />
        </div>
        <span className="w-10 text-end text-[10px] tabular-nums text-muted">{share.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function ErrorCard({ text }: { text: string }) {
  return (
    <Card className="border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-dangersoft text-sm text-danger">
      {text}
    </Card>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'خطأ غير معروف';
}
