import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Receipt, Search, ShoppingCart, X } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Paged, Sale, SaleStatus, Setting, User } from '../lib/types';
import { fmtDateTime, fmtMoney, fmtNum, timeAgo } from '../lib/format';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Tabs } from '../components/ui/primitives';
import { DataTable, Pagination, type Column } from '../components/ui/data-table';

type StatusFilter = 'ALL' | SaleStatus;

export default function Sales() {
  const navigate = useNavigate();
  const { isOwner } = useAuth();

  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Setting>('/settings'),
    staleTime: 5 * 60_000,
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users'),
    enabled: isOwner,
    staleTime: 5 * 60_000,
  });

  const currency = settings?.currency ?? 'LYD';

  const filters = useMemo(
    () => ({
      status: status === 'ALL' ? undefined : status,
      from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      sellerId: sellerId || undefined,
    }),
    [status, from, to, sellerId],
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['sales', { ...filters, page }],
    queryFn: () =>
      api.get<Paged<Sale>>(
        `/sales${qs({
          page,
          pageSize,
          status: filters.status,
          from: filters.from,
          to: filters.to,
          sellerId: filters.sellerId,
        })}`,
      ),
  });

  useEffect(() => {
    setPage(1);
  }, [status, from, to, sellerId]);

  const hasFilters = status !== 'ALL' || Boolean(from) || Boolean(to) || Boolean(sellerId);

  const columns = useMemo<Array<Column<Sale>>>(
    () => [
      {
        key: 'invoice',
        header: 'الفاتورة',
        cell: (row) => (
          <div className="min-w-0">
            <p className="font-mono text-[12px] font-semibold text-gold">{row.invoiceNo}</p>
            <p className="text-[10px] text-muted">{timeAgo(row.createdAt)}</p>
          </div>
        ),
      },
      {
        key: 'customer',
        header: 'العميل',
        cell: (row) =>
          row.customerName ? (
            <div className="min-w-0">
              <p className="truncate text-[13px] text-text">{row.customerName}</p>
              {row.customerPhone ? <p className="text-[10px] text-muted" dir="ltr">{row.customerPhone}</p> : null}
            </div>
          ) : (
            <span className="text-[12px] text-muted">—</span>
          ),
      },
      {
        key: 'items',
        header: 'الأصناف',
        hideOnMobile: true,
        cell: (row) => (
          <div className="min-w-0">
            <p className="text-[12px] text-text">{fmtNum(row.items.length)} صنف</p>
            <p className="truncate text-[10px] text-muted">
              {row.items.map((l) => l.item.code).join('، ')}
            </p>
          </div>
        ),
      },
      {
        key: 'seller',
        header: 'البائع',
        hideOnMobile: true,
        cell: (row) => <span className="text-[12px] text-text">{row.seller.name}</span>,
      },
      {
        key: 'payment',
        header: 'الدفع',
        hideOnMobile: true,
        cell: (row) => (
          <span className="text-[12px] text-muted">{row.paymentMethod?.value ?? 'غير محدد'}</span>
        ),
      },
      {
        key: 'total',
        header: 'الإجمالي',
        align: 'end',
        cell: (row) => (
          <span className="text-[13px] font-semibold tabular-nums text-text">
            {fmtMoney(row.total)}
            <span className="ms-1 text-[9px] font-normal text-muted">{currency}</span>
          </span>
        ),
      },
      {
        key: 'status',
        header: 'الحالة',
        align: 'center',
        cell: (row) => (
          <Badge tone={row.status === 'COMPLETED' ? 'success' : 'danger'} dot>
            {row.status === 'COMPLETED' ? 'مكتملة' : 'ملغاة'}
          </Badge>
        ),
      },
      {
        key: 'date',
        header: 'التاريخ',
        align: 'end',
        hideOnMobile: true,
        cell: (row) => <span className="text-[11px] tabular-nums text-muted">{fmtDateTime(row.createdAt)}</span>,
      },
    ],
    [currency],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="المبيعات"
        subtitle="كل فواتير المحل، مع إمكانية التصفية بالتاريخ والحالة والبائع."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => navigate('/sales/new')}>
            بيع جديد
          </Button>
        }
      />

      <Card className="p-3">
        <Tabs
          value={status}
          onChange={setStatus}
          items={[
            { value: 'ALL', label: 'كل الفواتير' },
            { value: 'COMPLETED', label: 'مكتملة' },
            { value: 'CANCELLED', label: 'ملغاة' },
          ]}
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted">من تاريخ</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ltr-nums" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted">إلى تاريخ</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ltr-nums" />
          </div>
          {isOwner ? (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted">البائع</label>
              <Select value={sellerId} onChange={(e) => setSellerId(e.target.value)} placeholder="كل البائعين">
                {(users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={!hasFilters}
              onClick={() => {
                setStatus('ALL');
                setFrom('');
                setTo('');
                setSellerId('');
              }}
            >
              <X className="size-3.5" />
              مسح الفلاتر
            </Button>
          </div>
        </div>
      </Card>

      {isError ? (
        <Card className="border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-dangersoft text-sm text-danger">
          تعذر تحميل المبيعات: {error instanceof Error ? error.message : 'خطأ غير معروف'}
        </Card>
      ) : null}

      <DataTable
        rows={data?.rows ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        loading={isLoading}
        onRowClick={(row) => navigate(`/sales/${row.id}`)}
        empty={
          <EmptyState
            icon={Receipt}
            title={hasFilters ? 'لا فواتير مطابقة' : 'لا مبيعات بعد'}
            description={
              hasFilters
                ? 'غيّر نطاق التاريخ أو الحالة لعرض فواتير أخرى.'
                : 'ابدأ أول عملية بيع من زر «بيع جديد» أعلى الصفحة.'
            }
            action={
              !hasFilters ? (
                <Button variant="primary" icon={ShoppingCart} onClick={() => navigate('/sales/new')}>
                  بيع جديد
                </Button>
              ) : undefined
            }
          />
        }
      />

      <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPage={setPage} />

      <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted">
        <Search className="size-3.5" />
        اضغط على أي فاتورة لعرض تفاصيلها أو طباعتها. إلغاء الفاتورة متاح للمالك فقط.
      </p>

      {data && data.rows.length > 0 ? (
        <p className="px-1 text-[11px] text-muted">
          الصفحة الحالية: {fmtNum(data.rows.length)} فاتورة من أصل {fmtNum(data.total)} —{' '}
          <Link to="/reports" className="font-semibold text-gold hover:underline">
            تقارير المبيعات
          </Link>{' '}
          متاحة للمالك.
        </p>
      ) : null}
    </div>
  );
}
