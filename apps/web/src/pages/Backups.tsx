import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  Clock,
  DatabaseBackup,
  Download,
  FolderOpen,
  HardDrive,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { api } from '../lib/api';
import { downloadBackup, useRunBackup } from '../lib/backup';
import { fmtBytes, fmtDateTime, fmtInterval, fmtNum, timeAgo } from '../lib/format';
import type { BackupOverview, BackupRunRow, BackupSettings } from '../lib/types';
import { useToast } from '../components/ui/toast';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  NumberInput,
  PageHeader,
  SectionTitle,
  Select,
  Skeleton,
  StatCard,
  Switch,
} from '../components/ui/primitives';
import { DataTable, Pagination, type Column } from '../components/ui/data-table';
import { ConfirmDialog } from '../components/ui/overlay';

const INTERVALS = [6, 12, 24, 48, 168] as const;

export default function Backups() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['backups'],
    queryFn: () => api.get<BackupOverview>('/backups'),
    // أثناء تنفيذ نسخة نتابع الحالة بسرعة، وإلا تحديث هادئ كل دقيقة
    refetchInterval: (query) => (query.state.data?.summary.running ? 3_000 : 60_000),
  });

  const [draft, setDraft] = useState<BackupSettings | null>(null);
  const initialized = useRef(false);
  const [toDelete, setToDelete] = useState<BackupRunRow | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    setDraft(data.settings);
  }, [data]);

  const dirty = Boolean(draft && data && JSON.stringify(draft) !== JSON.stringify(data.settings));

  const run = useRunBackup();

  const save = useMutation({
    mutationFn: (payload: BackupSettings) => api.patch<BackupOverview>('/backups/settings', payload),
    onSuccess: async (overview) => {
      toast.success('تم حفظ إعدادات النسخ الاحتياطي');
      setDraft(overview.settings);
      queryClient.setQueryData(['backups'], overview);
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'تعذر حفظ الإعدادات'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del<BackupOverview>(`/backups/${id}`),
    onSuccess: async (overview) => {
      toast.success('تم حذف النسخة');
      setToDelete(null);
      queryClient.setQueryData(['backups'], overview);
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'تعذر حذف النسخة');
      setToDelete(null);
    },
  });

  const download = useMutation({
    mutationFn: (row: BackupRunRow) => downloadBackup(row.id, row.fileName ?? `backup-${row.id}.sql.gz`),
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'تعذر تنزيل النسخة'),
  });

  const runs = data?.runs ?? [];
  const pagedRuns = useMemo(() => runs.slice((page - 1) * pageSize, page * pageSize), [runs, page]);

  const columns = useMemo<Array<Column<BackupRunRow>>>(
    () => [
      {
        key: 'date',
        header: 'التاريخ',
        cell: (row) => (
          <div className="min-w-0">
            <p className="text-[12px] font-medium tabular-nums text-text">{fmtDateTime(row.startedAt)}</p>
            <p className="text-[10px] text-muted">{timeAgo(row.startedAt)}</p>
          </div>
        ),
      },
      {
        key: 'trigger',
        header: 'النوع',
        hideOnMobile: true,
        cell: (row) => (
          <span className="text-[12px] text-muted">{row.trigger === 'MANUAL' ? 'يدوية' : 'مجدولة'}</span>
        ),
      },
      {
        key: 'status',
        header: 'الحالة',
        align: 'center',
        cell: (row) => (
          <div className="flex flex-col items-center gap-1">
            <Badge
              tone={row.status === 'OK' ? 'success' : row.status === 'FAILED' ? 'danger' : 'warning'}
              dot
            >
              {row.status === 'OK' ? 'ناجحة' : row.status === 'FAILED' ? 'فاشلة' : 'قيد التنفيذ'}
            </Badge>
            {row.status === 'OK' && !row.fileExists ? (
              <span className="text-[10px] text-danger">الملف غير موجود</span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'size',
        header: 'الحجم',
        align: 'end',
        hideOnMobile: true,
        cell: (row) => <span className="text-[12px] tabular-nums text-muted">{fmtBytes(row.sizeBytes)}</span>,
      },
      {
        key: 'file',
        header: 'الملف / التفاصيل',
        hideOnMobile: true,
        cell: (row) =>
          row.status === 'FAILED' ? (
            <span className="line-clamp-2 max-w-[320px] text-[11px] leading-4 text-danger" title={row.error ?? ''}>
              {row.error ?? 'فشل غير معروف'}
            </span>
          ) : (
            <div className="min-w-0 max-w-[280px]">
              <p className="truncate font-mono text-[11px] text-muted" dir="ltr">
                {row.fileName ?? '—'}
              </p>
              {row.error ? <p className="text-[10px] leading-4 text-warning">{row.error}</p> : null}
            </div>
          ),
      },
      {
        key: 'actions',
        header: '',
        align: 'end',
        cell: (row) => (
          <div className="flex items-center justify-end gap-1">
            {row.status === 'OK' && row.fileExists ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="تنزيل النسخة"
                title="تنزيل النسخة"
                loading={download.isPending && download.variables?.id === row.id}
                onClick={() => download.mutate(row)}
              >
                <Download className="size-3.5" />
              </Button>
            ) : null}
            {row.status !== 'RUNNING' ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="حذف"
                title="حذف"
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
    [download],
  );

  if (isLoading || !draft) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-11 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[104px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-[320px] rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-dangersoft text-sm text-danger">
        تعذر تحميل النسخ الاحتياطي: {error instanceof Error ? error.message : 'خطأ غير معروف'}
      </Card>
    );
  }

  const { summary, storage } = data;
  const busy = run.isPending || summary.running;
  const retentionOk = typeof draft.retentionCount === 'number' && draft.retentionCount >= 3 && draft.retentionCount <= 90;

  return (
    <div className="space-y-4">
      <PageHeader
        title="النسخ الاحتياطي"
        subtitle="نسخ تلقائي مجدول لقاعدة البيانات، مع نسخ يدوي فوري وتنزيل وحذف النسخ القديمة."
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} loading={isFetching} onClick={() => void refetch()}>
              تحديث
            </Button>
            <Button variant="primary" icon={DatabaseBackup} loading={busy} onClick={() => run.mutate()}>
              نسخ احتياطي الآن
            </Button>
          </>
        }
      />

      {summary.health === 'none' || summary.health === 'warning' ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--warning)_32%,transparent)] bg-warningsoft px-3.5 py-2.5 text-xs text-text">
          <ShieldAlert className="size-4 shrink-0 text-warning" />
          <span className="font-semibold">
            {summary.health === 'none' ? 'لا توجد أي نسخة احتياطية ناجحة.' : 'النسخ الاحتياطي يحتاج انتباهك.'}
          </span>
          <span className="text-muted">
            {summary.lastFailedAt
              ? `فشلت آخر محاولة ${timeAgo(summary.lastFailedAt)} — راجع السبب في السجل أدناه.`
              : 'اضغط «نسخ احتياطي الآن» وتأكد أن الجدولة مفعّلة.'}
          </span>
        </div>
      ) : null}

      {!storage.mysqldump ? (
        <div className="rounded-xl border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-dangersoft px-3.5 py-2.5 text-xs text-danger">
          لم يُعثر على أداة mysqldump. اضبط <span dir="ltr">BACKUP_MYSQLDUMP_PATH</span> في إعدادات الخادم.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="آخر نسخة ناجحة"
          value={summary.lastOkAt ? timeAgo(summary.lastOkAt) : 'لا يوجد'}
          hint={summary.lastOkAt ? fmtDateTime(summary.lastOkAt) : 'لم تُنشأ نسخة بعد'}
          icon={summary.health === 'ok' ? ShieldCheck : ShieldAlert}
          tone={summary.health === 'ok' ? 'success' : summary.health === 'off' ? 'muted' : 'warning'}
        />
        <StatCard
          label="النسخة التالية"
          value={summary.enabled && summary.nextRunAt ? timeAgoFuture(summary.nextRunAt) : 'متوقفة'}
          hint={summary.enabled && summary.nextRunAt ? fmtDateTime(summary.nextRunAt) : 'فعّل الجدولة التلقائية'}
          icon={CalendarClock}
          tone={summary.enabled ? 'gold' : 'muted'}
        />
        <StatCard
          label="النسخ المحفوظة"
          value={fmtNum(storage.count)}
          hint={`الحجم الكلي ${fmtBytes(storage.totalSizeBytes)}`}
          icon={HardDrive}
          tone="info"
        />
        <StatCard
          label="الجدولة"
          value={summary.enabled ? fmtInterval(data.settings.intervalHours) : 'معطّلة'}
          hint={
            summary.schedulerActive
              ? data.settings.intervalHours >= 24
                ? `عند الساعة ${data.settings.timeOfDay}`
                : 'بفاصل ثابت بين النسخ'
              : 'المجدول متوقف من إعدادات الخادم'
          }
          icon={Clock}
          tone={summary.enabled && summary.schedulerActive ? 'gold' : 'muted'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Card>
          <SectionTitle
            title="الجدولة التلقائية"
            description="تعمل ما دام الخادم شغّالاً. إذا كان متوقفاً وقت الموعد تُنفَّذ النسخة فور تشغيله."
            action={
              <Button
                variant="primary"
                size="sm"
                icon={Save}
                loading={save.isPending}
                disabled={!dirty || !retentionOk}
                onClick={() => save.mutate(draft)}
              >
                حفظ
              </Button>
            }
          />
          <div className="mt-4 space-y-4">
            <Switch
              checked={draft.enabled}
              onChange={(v) => setDraft({ ...draft, enabled: v })}
              label="تفعيل النسخ الاحتياطي التلقائي"
              description="يُنصح بإبقائه مفعّلاً دائماً."
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="تكرار النسخ">
                <Select
                  value={String(draft.intervalHours)}
                  onChange={(e) => setDraft({ ...draft, intervalHours: Number(e.target.value) })}
                  disabled={!draft.enabled}
                >
                  {INTERVALS.map((h) => (
                    <option key={h} value={h}>
                      {fmtInterval(h)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="وقت النسخ اليومي"
                hint={draft.intervalHours < 24 ? 'غير مستعمل مع الفواصل القصيرة' : 'بتوقيت الخادم'}
              >
                <Input
                  type="time"
                  value={draft.timeOfDay}
                  onChange={(e) => setDraft({ ...draft, timeOfDay: e.target.value })}
                  disabled={!draft.enabled || draft.intervalHours < 24}
                  className="ltr-nums"
                />
              </Field>
              <Field
                label="عدد النسخ المحفوظة"
                hint="الأقدم تُحذف تلقائياً (3 إلى 90)"
                error={retentionOk ? undefined : 'أدخل رقماً بين 3 و 90'}
              >
                <NumberInput
                  value={draft.retentionCount}
                  onChange={(v) => setDraft({ ...draft, retentionCount: v === '' ? 0 : Math.round(v) })}
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle title="مكان الحفظ" action={<FolderOpen className="size-4 text-muted" />} />
          <div className="mt-3 space-y-3 text-[12px]">
            <div>
              <p className="text-[11px] font-semibold text-muted">المجلد المحلي</p>
              <p className="mt-0.5 break-all font-mono text-[11px] text-text" dir="ltr">
                {storage.dir}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted">نسخة إضافية (قرص خارجي / سحابة)</p>
              {storage.copyDir ? (
                <p className="mt-0.5 break-all font-mono text-[11px] text-text" dir="ltr">
                  {storage.copyDir}
                </p>
              ) : (
                <p className="mt-0.5 text-[11px] leading-5 text-muted">
                  غير مفعّلة. لحماية أقوى من تعطّل الجهاز، اضبط <span dir="ltr">BACKUP_COPY_DIR</span> في ملف{' '}
                  <span dir="ltr">apps/api/.env</span> على مجلد قرص خارجي أو مجلد مزامنة سحابية، وأعد تشغيل الخادم.
                </p>
              )}
            </div>
            <p className="rounded-lg bg-surface2/60 px-2.5 py-2 text-[11px] leading-5 text-muted">
              النسخة تحتوي كل بيانات المحل بما فيها المستخدمون، فاحفظها في مكان آمن ولا تشاركها.
            </p>
          </div>
        </Card>
      </div>

      <Card className="p-0">
        <div className="border-b border-border px-4 py-3">
          <SectionTitle title="سجل النسخ" description="كل محاولة نسخ، ناجحة أو فاشلة، مع إمكانية التنزيل والحذف." />
        </div>
        <DataTable
          rows={pagedRuns}
          columns={columns}
          rowKey={(row) => row.id}
          className="rounded-none border-0 shadow-none"
          empty={
            <EmptyState
              icon={DatabaseBackup}
              title="لا نسخ بعد"
              description="اضغط «نسخ احتياطي الآن» لإنشاء أول نسخة، أو انتظر موعد الجدولة."
            />
          }
        />
        <div className="border-t border-border px-4 py-3">
          <Pagination page={page} pageSize={pageSize} total={runs.length} onPage={setPage} />
        </div>
      </Card>

      <Card>
        <details>
          <summary className="cursor-pointer text-[13px] font-semibold text-text">كيف أستعيد نسخة احتياطية؟</summary>
          <ol className="mt-3 list-decimal space-y-1.5 ps-5 text-[12px] leading-6 text-muted">
            <li>نزّل ملف النسخة (<span dir="ltr">.sql.gz</span>) من الجدول أعلاه وانسخه إلى جهاز آمن.</li>
            <li>أوقف الخادم والواجهة، وأبقِ MySQL شغّالاً.</li>
            <li>
              من مجلد المشروع شغّل:{' '}
              <span className="rounded bg-surface2 px-1.5 py-0.5 font-mono text-[11px] text-text" dir="ltr">
                npm.cmd run db:restore -- backups\gold_pos-YYYYMMDD-HHMMSS.sql.gz --yes
              </span>
            </li>
            <li>شغّل الخادم من جديد. الاستعادة تستبدل كل بيانات القاعدة الحالية بمحتوى النسخة، لذا يُنشئ الأمر نسخة أمان قبلها تلقائياً.</li>
          </ol>
        </details>
      </Card>

      <ConfirmDialog
        open={toDelete !== null}
        title="حذف سجل النسخة؟"
        description={
          toDelete?.status === 'OK'
            ? 'سيُحذف ملف النسخة من القرص نهائياً ولا يمكن التراجع.'
            : 'سيُحذف سجل المحاولة من القائمة.'
        }
        confirmLabel="حذف"
        loading={remove.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </div>
  );
}

/** «بعد 3 ساعة» للمواعيد القادمة */
function timeAgoFuture(value: string): string {
  const diff = new Date(value).getTime() - Date.now();
  if (Number.isNaN(diff)) return '—';
  if (diff <= 60_000) return 'الآن';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `بعد ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `بعد ${hours} ساعة`;
  return `بعد ${Math.floor(hours / 24)} يوم`;
}
