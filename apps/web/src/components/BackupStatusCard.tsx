import { Link } from 'react-router-dom';
import { ArrowLeft, DatabaseBackup, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { BackupSummary } from '../lib/types';
import { fmtBytes, fmtDateTime, fmtInterval, timeAgo } from '../lib/format';
import { useRunBackup } from '../lib/backup';
import { Badge, Button, Card, SectionTitle } from './ui/primitives';

const HEALTH: Record<BackupSummary['health'], { tone: 'success' | 'warning' | 'danger' | 'muted'; label: string }> = {
  ok: { tone: 'success', label: 'سليم' },
  warning: { tone: 'warning', label: 'يحتاج انتباه' },
  none: { tone: 'danger', label: 'لا توجد نسخة' },
  off: { tone: 'muted', label: 'الجدولة متوقفة' },
};

/** بطاقة حالة النسخ الاحتياطي في الرئيسية (للمالك) */
export function BackupStatusCard({ summary }: { summary: BackupSummary }) {
  const run = useRunBackup();
  const health = HEALTH[summary.health];
  const Icon = summary.health === 'ok' ? ShieldCheck : ShieldAlert;
  const busy = run.isPending || summary.running;

  return (
    <Card>
      <SectionTitle
        title="النسخ الاحتياطي"
        action={
          <Badge tone={health.tone} dot>
            {health.label}
          </Badge>
        }
      />

      <div className="mt-3 flex items-start gap-3 rounded-xl border border-border bg-surface2/50 p-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-goldsoft text-gold">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 text-[12px] leading-5">
          {summary.lastOkAt ? (
            <>
              <p className="font-semibold text-text">
                آخر نسخة ناجحة {timeAgo(summary.lastOkAt)}
                {summary.lastOkSizeBytes ? ` · ${fmtBytes(summary.lastOkSizeBytes)}` : ''}
              </p>
              <p className="text-muted">{fmtDateTime(summary.lastOkAt)}</p>
            </>
          ) : (
            <p className="font-semibold text-danger">لم تُنشأ أي نسخة احتياطية بعد.</p>
          )}
          <p className="mt-1 text-muted">
            {summary.enabled
              ? `${fmtInterval(summary.intervalHours)} · التالية ${summary.nextRunAt ? fmtDateTime(summary.nextRunAt) : '—'}`
              : 'الجدولة التلقائية معطّلة.'}
          </p>
          {summary.lastFailedAt ? (
            <p className="mt-1 font-medium text-danger">فشلت محاولة {timeAgo(summary.lastFailedAt)} — راجع صفحة النسخ.</p>
          ) : null}
          {!summary.schedulerActive ? (
            <p className="mt-1 text-warning">الجدولة معطّلة من إعدادات الخادم (BACKUP_SCHEDULER=off).</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" icon={DatabaseBackup} loading={busy} onClick={() => run.mutate()}>
          نسخ احتياطي الآن
        </Button>
        <Link
          to="/backups"
          className="ms-auto inline-flex items-center gap-1 text-xs font-semibold text-gold hover:underline"
        >
          إدارة النسخ
          <ArrowLeft className="size-3.5" />
        </Link>
      </div>
    </Card>
  );
}
