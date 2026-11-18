import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gem, PackagePlus, Pencil, Search, Trash2, X } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDebounced } from '../lib/use-debounced';
import type { Item, Lookup, Paged, Setting } from '../lib/types';
import { STATUS_LABEL, TYPE_LABEL, fmtMoney, fmtWeight } from '../lib/format';
import { useToast } from '../components/ui/toast';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
} from '../components/ui/primitives';
import { DataTable, Pagination, type Column } from '../components/ui/data-table';
import { ConfirmDialog } from '../components/ui/overlay';

export default function Items() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { isOwner } = useAuth();

  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [karat, setKarat] = useState('');
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<Item | null>(null);
  const pageSize = 20;

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

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['items', { q, status, type, karat, page }],
    queryFn: () =>
      api.get<Paged<Item>>(
        `/items${qs({
          q,
          status: status || undefined,
          type: type || undefined,
          karat: karat || undefined,
          page,
          pageSize,
        })}`,
      ),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/items/${id}`),
    onSuccess: async () => {
      toast.success('تم حذف الصنف');
      setToDelete(null);
      await queryClient.invalidateQueries({ queryKey: ['items'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'تعذر حذف الصنف'),
  });

  const canAdd = isOwner || settings?.sellerCanAddItems !== false;
  const showCost = isOwner || settings?.showCostToSeller === true;

  const hasFilters = Boolean(q || status || type || karat);

  const columns = useMemo<Array<Column<Item>>>(
    () => [
      {
        key: 'code',
        header: 'الكود',
        cell: (row) => (
          <span className="font-mono text-[12px] font-semibold text-gold">{row.code}</span>
        ),
      },
      {
        key: 'name',
        header: 'الصنف',
        cell: (row) => (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-text">{row.name}</p>
            <p className="truncate text-[11px] text-muted">
              {TYPE_LABEL[row.type]} · {row.category?.value ?? 'بدون تصنيف'}
              {row.size ? ` · مقاس ${row.size}` : ''}
            </p>
          </div>
        ),
      },
      {
        key: 'karat',
        header: 'العيار',
        hideOnMobile: false,
        cell: (row) => (
          <span className="inline-flex items-center rounded-md bg-goldsoft px-2 py-0.5 text-[11px] font-bold text-gold">
            {row.karat}K
          </span>
        ),
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
        key: 'quantity',
        header: 'الكمية',
        align: 'center',
        hideOnMobile: true,
        cell: (row) => <span className="tabular-nums text-[13px] text-text">{row.quantity}</span>,
      },
      ...(showCost
        ? [
            {
              key: 'cost',
              header: 'التكلفة',
              align: 'end' as const,
              hideOnMobile: true,
              cell: (row: Item) => (
                <span className="text-[12px] tabular-nums text-muted">{fmtMoney(row.purchaseCostDinar)}</span>
              ),
            },
          ]
        : []),
      {
        key: 'status',
        header: 'الحالة',
        align: 'center',
        cell: (row) => (
          <Badge tone={row.status === 'AVAILABLE' ? 'success' : 'muted'} dot>
            {STATUS_LABEL[row.status]}
          </Badge>
        ),
      },
      {
        key: 'actions',
        header: '',
        align: 'end',
        cell: (row) => (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={isOwner && row.status === 'AVAILABLE' ? 'تعديل' : 'عرض'}
              title={isOwner && row.status === 'AVAILABLE' ? 'تعديل' : 'عرض'}
              onClick={() => navigate(`/items/${row.id}`)}
            >
              <Pencil className="size-3.5" />
            </Button>
            {isOwner ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="حذف"
                className="text-danger hover:bg-dangersoft"
                onClick={() => setToDelete(row)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [isOwner, navigate, showCost],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="الذهب"
        subtitle="كل القطع والأطقم المسجّلة، بأوزانها وعياراتها وحالتها."
        actions={
          canAdd ? (
            <Button variant="primary" icon={PackagePlus} onClick={() => navigate('/items/new')}>
              إضافة قطعة ذهب
            </Button>
          ) : null
        }
      />

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
              placeholder="ابحث بالكود، الاسم، أو الوصف…"
              className="ps-9"
              aria-label="بحث"
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

          <div className="grid grid-cols-3 gap-2 sm:w-auto">
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
              aria-label="النوع"
              className="sm:w-[130px]"
            >
              <option value="">كل الأنواع</option>
              <option value="PIECE">قطعة</option>
              <option value="SET">طقم</option>
            </Select>
            <Select
              value={karat}
              onChange={(e) => {
                setKarat(e.target.value);
                setPage(1);
              }}
              aria-label="العيار"
              className="sm:w-[120px]"
            >
              <option value="">كل العيارات</option>
              {(karatLookups ?? []).map((k) => (
                <option key={k.id} value={k.value}>
                  عيار {k.value}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              aria-label="الحالة"
              className="sm:w-[130px]"
            >
              <option value="">كل الحالات</option>
              <option value="AVAILABLE">موجود</option>
              <option value="SOLD">مباع</option>
            </Select>
          </div>
        </div>
        {hasFilters ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-muted">نتائج مفلترة</span>
            <button
              type="button"
              className="text-[11px] font-semibold text-gold hover:underline"
              onClick={() => {
                setSearch('');
                setType('');
                setKarat('');
                setStatus('');
                setPage(1);
              }}
            >
              مسح الفلاتر
            </button>
          </div>
        ) : null}
      </Card>

      {isError ? (
        <Card className="border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-dangersoft text-sm text-danger">
          تعذر تحميل الأصناف: {error instanceof Error ? error.message : 'خطأ غير معروف'}
        </Card>
      ) : null}

      <DataTable
        rows={data?.rows ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        loading={isLoading}
        onRowClick={(row) => navigate(`/items/${row.id}`)}
        empty={
          <EmptyState
            icon={Gem}
            title={hasFilters ? 'لا نتائج مطابقة' : 'لا توجد قطع ذهب بعد'}
            description={
              hasFilters
                ? 'جرّب تعديل البحث أو مسح الفلاتر.'
                : 'أضف أول قطعة أو طقم ليبدأ تسجيل المخزون والمبيعات.'
            }
            action={
              !hasFilters && canAdd ? (
                <Button variant="primary" icon={PackagePlus} onClick={() => navigate('/items/new')}>
                  إضافة قطعة ذهب
                </Button>
              ) : undefined
            }
          />
        }
      />

      <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPage={setPage} />

      <ConfirmDialog
        open={toDelete !== null}
        title="حذف الصنف؟"
        description={
          toDelete
            ? `سيتم حذف «${toDelete.name}» (${toDelete.code}) نهائياً. لا يمكن التراجع.`
            : undefined
        }
        confirmLabel="حذف"
        loading={remove.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      >
        <p className="text-xs leading-5 text-muted">
          لا يمكن حذف صنف مرتبط بعمليات بيع. في هذه الحالة يبقى في السجل التاريخي.
        </p>
      </ConfirmDialog>
    </div>
  );
}
