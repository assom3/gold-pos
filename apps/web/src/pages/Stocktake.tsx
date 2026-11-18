import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Lock,
  Plus,
  RefreshCw,
  Scale,
  TriangleAlert,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/toast';
import type { Stocktake, StocktakeType } from '../lib/types';
import { fmtDateTime, fmtNum, STOCKTAKE_TYPE_LABEL, timeAgo } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  SectionTitle,
  Select,
  Skeleton,
  StatCard,
  Textarea,
} from '../components/ui/primitives';
import { Modal } from '../components/ui/overlay';
import { DataTable, type Column } from '../components/ui/data-table';

const TYPES: StocktakeType[] = ['QUARTERLY', 'SEMIANNUAL', 'ANNUAL'];

export default function Stocktake() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { isOwner } = useAuth();

  const [openModal, setOpenModal] = useState(false);
  const [type, setType] = useState<StocktakeType>('QUARTERLY');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ['stocktakes'],
    queryFn: () => api.get<Stocktake[]>('/stocktakes'),
  });

  const rows = data ?? [];
  const currentOpen = rows.find((r) => r.status === 'OPEN') ?? null;
  const closed = rows.filter((r) => r.status === 'CLOSED');
  const lastClosed = closed[0] ?? null;

  const stats = useMemo(() => {
    const totalLines = rows.reduce((sum, r) => sum + (r._count?.lines ?? 0), 0);
    return { totalLines };
  }, [rows]);

  const openStocktake = useMutation({
    mutationFn: () => api.post<Stocktake>('/stocktakes', { type, notes: notes.trim() || null }),
    onSuccess: async (created) => {
      toast.success('تم فتح جرد جديد وأخذ لقطة للأصناف المتاحة');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stocktakes'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      setOpenModal(false);
      setNotes('');
      setFormError(null);
      navigate(`/stocktake/${created.id}`);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'تعذر فتح الجرد';
      setFormError(message);
      toast.error(message);
    },
  });

  function startOpen() {
    setFormError(null);
    setType(currentOpen?.type ?? 'QUARTERLY');
    setNotes('');
    setOpenModal(true);
  }

  const columns: Array<Column<Stocktake>> = [
    {
      key: 'type',
      header: 'نوع الجرد',
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-goldsoft text-gold">
            <ClipboardList className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-text">{STOCKTAKE_TYPE_LABEL[row.type] ?? row.type}</p>
            <p className="font-mono text-[10px] text-muted">#{String(row.id).padStart(4, '0')}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      align: 'center',
      cell: (row) => (
        <Badge tone={row.status === 'OPEN' ? 'warning' : 'success'} dot>
          {row.status === 'OPEN' ? 'مفتوح' : 'مغلق'}
        </Badge>
      ),
    },
    {
      key: 'lines',
      header: 'الأصناف',
      align: 'center',
      cell: (row) => (
        <span className="text-[12px] tabular-nums text-text">{fmtNum(row._count?.lines)}</span>
      ),
    },
    {
      key: 'opened',
      header: 'فُتح',
      hideOnMobile: true,
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-[12px] tabular-nums text-text">{fmtDateTime(row.openedAt)}</p>
          <p className="text-[10px] text-muted">
            بواسطة {row.openedBy?.name ?? '—'} · {timeAgo(row.openedAt)}
          </p>
        </div>
      ),
    },
    {
      key: 'closed',
      header: 'أُغلق',
      hideOnMobile: true,
      cell: (row) =>
        row.status === 'CLOSED' ? (
          <div className="min-w-0">
            <p className="text-[12px] tabular-nums text-text">{fmtDateTime(row.closedAt)}</p>
            <p className="text-[10px] text-muted">بواسطة {row.closedBy?.name ?? '—'}</p>
          </div>
        ) : (
          <span className="text-[12px] text-muted">قيد العمل</span>
        ),
    },
    {
      key: 'notes',
      header: 'ملاحظات',
      hideOnMobile: true,
      cell: (row) =>
        row.notes ? (
          <p className="max-w-[220px] truncate text-[12px] text-muted" title={row.notes}>
            {row.notes}
          </p>
        ) : (
          <span className="text-[12px] text-muted">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="الجرد"
        subtitle="لقطة دورية للأصناف المتاحة وأوزانها، مع تسجيل الوزن المعدود وحساب الفروقات."
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} loading={isFetching} onClick={() => void refetch()}>
              تحديث
            </Button>
            {isOwner ? (
              <Button variant="primary" icon={Plus} onClick={startOpen}>
                فتح جرد جديد
              </Button>
            ) : null}
          </>
        }
      />

      {currentOpen ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[color-mix(in_oklab,var(--warning)_32%,transparent)] bg-warningsoft px-3.5 py-3 text-xs text-text">
          <Clock className="size-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">يوجد جرد مفتوح الآن</p>
            <p className="mt-0.5 text-muted">
              {STOCKTAKE_TYPE_LABEL[currentOpen.type]} · فُتح {timeAgo(currentOpen.openedAt)} بواسطة{' '}
              {currentOpen.openedBy?.name ?? '—'}. يجب إغلاقه قبل فتح جرد جديد.
            </p>
          </div>
          <Button size="sm" variant="soft" onClick={() => navigate(`/stocktake/${currentOpen.id}`)}>
            متابعة الجرد
          </Button>
        </div>
      ) : null}

      {isError ? (
        <Card className="border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-dangersoft text-sm text-danger">
          تعذر تحميل الجرد: {error instanceof Error ? error.message : 'خطأ غير معروف'}
        </Card>
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
            label="الجرد الحالي"
            value={currentOpen ? STOCKTAKE_TYPE_LABEL[currentOpen.type] : 'لا يوجد'}
            hint={
              currentOpen
                ? `${fmtNum(currentOpen._count?.lines)} صنف · ${timeAgo(currentOpen.openedAt)}`
                : 'افتح جرداً لبدء العدّ'
            }
            icon={currentOpen ? Clock : CalendarCheck}
            tone={currentOpen ? 'warning' : 'muted'}
          />
          <StatCard
            label="جردات منجزة"
            value={fmtNum(closed.length)}
            hint="محفوظة كسجل تاريخي غير قابل للتعديل"
            icon={Lock}
            tone="success"
          />
          <StatCard
            label="آخر جرد مغلق"
            value={lastClosed ? STOCKTAKE_TYPE_LABEL[lastClosed.type] : '—'}
            hint={lastClosed ? fmtDateTime(lastClosed.closedAt) : 'لا يوجد بعد'}
            icon={CalendarCheck}
            tone="gold"
          />
          <StatCard
            label="إجمالي الأسطر المسجّلة"
            value={fmtNum(stats.totalLines)}
            hint={`موزّعة على ${fmtNum(rows.length)} جرد`}
            icon={Scale}
            tone="info"
          />
        </div>
      )}

      <Card className="p-0">
        <div className="border-b border-border px-4 py-3">
          <SectionTitle
            title="سجل الجردات"
            description="اضغط على أي جرد لعرض الأصناف وتسجيل الأوزان المعدودة."
            action={<Badge tone="muted">{fmtNum(rows.length)} جرد</Badge>}
          />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={(row) => navigate(`/stocktake/${row.id}`)}
          className="rounded-none border-0 shadow-none"
          empty={
            <EmptyState
              icon={ClipboardCheck}
              title="لا جردات بعد"
              description={
                isOwner
                  ? 'افتح أول جرد دوري لأخذ لقطة أوزان الأصناف المتاحة والبدء بالعدّ.'
                  : 'لم يفتح المالك أي جرد بعد. سيظهر هنا عند بدئه.'
              }
              action={
                isOwner ? (
                  <Button variant="primary" icon={Plus} onClick={startOpen}>
                    فتح جرد جديد
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </Card>

      <p className="hidden px-1 text-[11px] leading-5 text-muted sm:block">
        يتم أخذ لقطة للوزن المتوقع وقيمة كل صنف عند فتح الجرد. تعديل الأوزان المعدودة متاح ما دام الجرد مفتوحاً (BR-14)،
        وبعد الإغلاق يصبح السجل نهائياً.
      </p>

      <Modal
        open={openModal}
        onClose={() => {
          if (!openStocktake.isPending) setOpenModal(false);
        }}
        title="فتح جرد جديد"
        description="ستُسجَّل لقطة أوزان وقيم جميع الأصناف المتاحة الآن."
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={openStocktake.isPending}
              onClick={() => setOpenModal(false)}
            >
              إلغاء
            </Button>
            <Button
              variant="primary"
              icon={ClipboardCheck}
              loading={openStocktake.isPending}
              onClick={() => openStocktake.mutate()}
            >
              فتح الجرد
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          {formError ? (
            <div className="flex items-start gap-2 rounded-xl border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-dangersoft px-3 py-2.5 text-xs font-medium text-danger">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {formError}
            </div>
          ) : null}

          <Field label="نوع الجرد" required hint="يُستعمل للتصنيف في السجل والتقارير.">
            <Select value={type} onChange={(e) => setType(e.target.value as StocktakeType)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {STOCKTAKE_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="ملاحظات (اختياري)" hint="مثال: جرد نهاية الربع الأول بمساعدة البائع.">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي تفاصيل عن هذا الجرد"
              maxLength={2000}
            />
          </Field>

          <p className="rounded-xl bg-surface2/60 px-3 py-2.5 text-[11px] leading-5 text-muted">
            سيتم تسجيل كل صنف «متاح» بسطر مستقل مع وزنه المتوقع وقيمته الحالية. إذا كانت أسعار الذهب غير جاهزة، ستُسجَّل
            القيم صفراً وتظل الأوزان صحيحة.
          </p>
        </div>
      </Modal>
    </div>
  );
}
