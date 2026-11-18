import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Coins,
  Gem,
  RefreshCw,
  Scale,
  Search,
  TrendingUp,
  TriangleAlert,
  Warehouse,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { InventorySummary, ItemType, Setting } from '../lib/types';
import { fmtMoney, fmtNum, fmtWeight, TYPE_LABEL } from '../lib/format';
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
} from '../components/ui/primitives';
import { DataTable, Pagination, type Column } from '../components/ui/data-table';

type Row = InventorySummary['rows'][number];

export default function Inventory() {
  const navigate = useNavigate();
  const { isOwner } = useAuth();
  const [search, setSearch] = useState('');
  const [karat, setKarat] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Setting>('/settings'),
    staleTime: 5 * 60_000,
  });

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ['inventory', 'summary'],
    queryFn: () => api.get<InventorySummary>('/inventory/summary'),
    refetchInterval: 90_000,
  });

  const currency = settings?.currency ?? 'LYD';
  const showCost = isOwner || settings?.showCostToSeller === true;
  const rows = data?.rows ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (karat && String(row.karat) !== karat) return false;
      if (!term) return true;
      return row.code.toLowerCase().includes(term) || row.name.toLowerCase().includes(term);
    });
  }, [rows, search, karat]);

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const columns: Array<Column<Row>> = [
    {
      key: 'item',
      header: 'الصنف',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-text">{row.name}</p>
          <p className="flex items-center gap-2 text-[10px] text-muted">
            <span className="font-mono text-gold">{row.code}</span>
            <span>{TYPE_LABEL[row.type as ItemType] ?? row.type}</span>
          </p>
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
          <p className="text-[12px] font-medium tabular-nums text-text">{fmtWeight(row.totalWeight)} غ</p>
          <p className="text-[10px] tabular-nums text-muted">صافي {fmtWeight(row.netGoldWeight)} غ</p>
        </div>
      ),
    },
    {
      key: 'value',
      header: 'القيمة الحالية',
      align: 'end',
      cell: (row) => (
        <span className="text-[13px] font-semibold tabular-nums text-text">
          {fmtMoney(row.value)}
          <span className="ms-1 text-[9px] font-normal text-muted">{currency}</span>
        </span>
      ),
    },
    ...(showCost
      ? [
          {
            key: 'cost',
            header: 'التكلفة',
            align: 'end' as const,
            hideOnMobile: true,
            cell: (row: Row) => (
              <span className="text-[11px] tabular-nums text-muted">{fmtMoney(row.cost)}</span>
            ),
          },
          {
            key: 'margin',
            header: 'الهامش',
            align: 'end' as const,
            hideOnMobile: true,
            cell: (row: Row) => (
              <span
                className={
                  'text-[12px] font-semibold tabular-nums ' + (row.margin < 0 ? 'text-danger' : 'text-success')
                }
              >
                {row.margin >= 0 ? '+' : ''}
                {fmtMoney(row.margin)}
              </span>
            ),
          },
        ]
      : []),
  ];

  const topKarat = data && data.byKarat.length > 0
    ? [...data.byKarat].sort((a, b) => b.value - a.value)[0]
    : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title="المخزون والتقييم"
        subtitle="قيمة القطع المتاحة الآن بأسعار الذهب اللحظية، موزّعة حسب العيار."
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} loading={isFetching} onClick={() => void refetch()}>
              تحديث
            </Button>
            <Button variant="primary" icon={Warehouse} onClick={() => navigate('/items')}>
              إدارة الذهب
            </Button>
          </>
        }
      />

      {isError ? (
        <Card className="border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-dangersoft text-sm text-danger">
          تعذر تحميل المخزون: {error instanceof Error ? error.message : 'خطأ غير معروف'}
        </Card>
      ) : null}

      {!isLoading && data && !data.ready ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[color-mix(in_oklab,var(--warning)_32%,transparent)] bg-warningsoft px-3.5 py-3 text-xs text-text">
          <TriangleAlert className="size-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">التقييم غير متاح بعد</p>
            <p className="mt-0.5 text-muted">
              أدخل سعر الأونصة وسعر الصرف ليُحسب سعر الغرام لكل عيار وتظهر قيمة المخزون.
            </p>
          </div>
          <Link to="/prices" className="font-semibold text-gold hover:underline">
            إدخال الأسعار
          </Link>
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[104px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="قيمة المخزون الحالية"
            value={
              <>
                {fmtMoney(data?.totals.value)} <span className="text-xs font-medium text-muted">{currency}</span>
              </>
            }
            hint={`${fmtNum(data?.totals.items)} صنف متاح · ${fmtNum(data?.totals.units)} قطعة`}
            icon={Coins}
            tone="gold"
          />
          <StatCard
            label="وزن الذهب الصافي"
            value={`${fmtWeight(data?.totals.goldWeight)} غ`}
            hint={`إجمالي الوزن ${fmtWeight(data?.totals.totalWeight)} غ`}
            icon={Scale}
            tone="info"
          />
          <StatCard
            label="عدد القطع المتاحة"
            value={fmtNum(data?.totals.units)}
            hint={`موزّعة على ${fmtNum(data?.byKarat.length)} عيار`}
            icon={Gem}
            tone="success"
          />
          {showCost ? (
            <StatCard
              label="الهامش التقديري"
              value={
                <>
                  {data?.totals.margin !== undefined && data.totals.margin >= 0 ? '+' : ''}
                  {fmtMoney(data?.totals.margin)}{' '}
                  <span className="text-xs font-medium text-muted">{currency}</span>
                </>
              }
              hint={`التكلفة ${fmtMoney(data?.totals.cost)} ${currency}`}
              icon={TrendingUp}
              tone={(data?.totals.margin ?? 0) < 0 ? 'danger' : 'warning'}
            />
          ) : (
            <StatCard
              label="أعلى عيار بالقيمة"
              value={topKarat ? `${topKarat.karat}K` : '—'}
              hint={
                topKarat
                  ? `${fmtMoney(topKarat.value)} ${currency}`
                  : 'لا بيانات'
              }
              icon={TrendingUp}
              tone="success"
            />
          )}
        </div>
      )}

      {/* حسب العيار */}
      <Card>
        <SectionTitle
          title="التوزيع حسب العيار"
          description="كل عيار بقيمته ووزنه الذهبي الصافي — الأساس الفعلي للاحتساب."
          action={
            data ? (
              <Badge tone="muted">
                {data.basis === 'NET_GOLD'
                  ? 'ذهب صافي'
                  : data.basis === 'TOTAL'
                    ? 'وزن إجمالي'
                    : data.basis === 'MINUS_STONE'
                      ? 'خصم الحجر'
                      : 'خصم الفصوص'}
              </Badge>
            ) : null
          }
        />
        {isLoading ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (data?.byKarat.length ?? 0) === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted">
            لا توجد قطع متاحة في المخزون حالياً.
          </p>
        ) : (
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {(data?.byKarat ?? []).map((group) => {
              const share = data && data.totals.value > 0 ? (group.value / data.totals.value) * 100 : 0;
              return (
                <div key={group.karat} className="rounded-xl border border-border bg-surface2/40 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2">
                      <span className="grid size-7 place-items-center rounded-lg bg-goldsoft text-[10px] font-bold text-gold">
                        {group.karat}K
                      </span>
                      <span className="text-[12px] font-medium text-text">عيار {group.karat}</span>
                    </span>
                    <span className="text-[10px] text-muted">{fmtNum(group.count)} صنف</span>
                  </div>
                  <p className="mt-2.5 text-lg font-semibold tracking-tight tabular-nums text-text">
                    {fmtMoney(group.value)} <span className="text-[10px] font-medium text-muted">{currency}</span>
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface3">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--gold-hover)] to-[var(--gold)]"
                      style={{ width: `${Math.min(100, Math.max(2, share))}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
                    <span>
                      صافي {fmtWeight(group.goldWeight)} غ · {fmtNum(group.pieces)} قطعة
                    </span>
                    <span className="tabular-nums">{share.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* الأصناف */}
      <Card className="p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="ابحث بالكود أو الاسم…"
              className="ps-9"
              aria-label="بحث في المخزون"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:text-text"
                aria-label="مسح البحث"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
          <Select
            value={karat}
            onChange={(e) => {
              setKarat(e.target.value);
              setPage(1);
            }}
            aria-label="فلترة بالعيار"
            className="sm:w-[150px]"
          >
            <option value="">كل العيارات</option>
            {(data?.byKarat ?? []).map((g) => (
              <option key={g.karat} value={g.karat}>
                عيار {g.karat}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <DataTable
        rows={pageRows}
        columns={columns}
        rowKey={(row) => row.id}
        loading={isLoading}
        onRowClick={(row) => navigate(`/items/${row.id}`)}
        empty={
          <EmptyState
            icon={Warehouse}
            title={search || karat ? 'لا نتائج مطابقة' : 'المخزون فارغ'}
            description={
              search || karat
                ? 'جرّب تعديل البحث أو اختيار عيار آخر.'
                : 'أضف قطع ذهب ليبدأ حساب قيمة المخزون.'
            }
          />
        }
        footer={
          filtered.length > 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-2.5 text-[12px] font-medium text-muted">
                إجمالي النتائج ({fmtNum(filtered.length)} صنف)
              </td>
              <td className="px-4 py-2.5 text-end text-[12px] font-semibold tabular-nums text-text">
                {fmtWeight(filtered.reduce((s, r) => s + r.totalWeight, 0))} غ
              </td>
              <td className="px-4 py-2.5 text-end text-[13px] font-bold tabular-nums text-gold">
                {fmtMoney(filtered.reduce((s, r) => s + r.value, 0))}
              </td>
              {showCost ? (
                <>
                  <td className="hidden px-4 py-2.5 text-end text-[11px] tabular-nums text-muted sm:table-cell">
                    {fmtMoney(filtered.reduce((s, r) => s + r.cost, 0))}
                  </td>
                  <td className="hidden px-4 py-2.5 text-end text-[11px] font-semibold tabular-nums text-success sm:table-cell">
                    {fmtMoney(filtered.reduce((s, r) => s + r.margin, 0))}
                  </td>
                </>
              ) : null}
            </tr>
          ) : undefined
        }
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={filtered.length}
        onPage={setPage}
        className="px-1"
      />

      <p className="hidden px-1 text-[11px] leading-5 text-muted sm:block">
        التقييم يعتمد على سعر غرام العيار × وزن أساس الاحتساب، ويُعاد حسابه تلقائياً عند تحديث أسعار الذهب.
        {showCost ? ' التكلفة والهامش تقديريان بحسب تكلفة الشراء المسجّلة.' : ''}
      </p>
    </div>
  );
}
