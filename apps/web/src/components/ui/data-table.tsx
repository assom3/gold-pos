import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button, EmptyState, LoadingBlock } from './primitives';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  align?: 'start' | 'end' | 'center';
  hideOnMobile?: boolean;
  /** إظهار الترويسة في بطاقة الموبايل (افتراضي: نعم) */
  labelOnMobile?: boolean;
}

const ALIGN: Record<'start' | 'end' | 'center', string> = {
  start: 'text-start',
  end: 'text-end',
  center: 'text-center',
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading,
  empty,
  onRowClick,
  footer,
  className,
  compact = false,
}: {
  rows: T[];
  columns: Array<Column<T>>;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  footer?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  if (loading) {
    return (
      <div className={cn('card overflow-hidden', className)}>
        <LoadingBlock rows={5} />
      </div>
    );
  }

  if (rows.length === 0) {
    return <div className={cn('card overflow-hidden', className)}>{empty ?? <EmptyState title="لا توجد بيانات" />}</div>;
  }

  return (
    <div className={cn('card overflow-hidden', className)}>
      {/* جدول لسطح المكتب */}
      <div className="hidden overflow-x-auto scroll-thin sm:block">
        <table className="w-full min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface2/60">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-2.5 text-start text-[11px] font-semibold uppercase tracking-wide text-muted',
                    ALIGN[col.align ?? 'start'],
                    col.headerClassName,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-border/70 last:border-0 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-surface2/70',
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      compact ? 'px-4 py-2' : 'px-4 py-3',
                      'align-middle text-text',
                      ALIGN[col.align ?? 'start'],
                      col.className,
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer ? <tfoot className="border-t border-border bg-surface2/50">{footer}</tfoot> : null}
        </table>
      </div>

      {/* بطاقات للموبايل */}
      <ul className="divide-y divide-border sm:hidden">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn('space-y-1.5 px-4 py-3', onRowClick && 'cursor-pointer active:bg-surface2')}
          >
            {columns
              .filter((c) => !c.hideOnMobile)
              .map((col) => (
                <div key={col.key} className="flex items-start justify-between gap-3 text-[13px]">
                  {col.labelOnMobile === false ? null : (
                    <span className="shrink-0 pt-px text-[11px] font-medium text-muted">{col.header}</span>
                  )}
                  <span className={cn('min-w-0 text-end', col.labelOnMobile === false && 'w-full text-start')}>
                    {col.cell(row)}
                  </span>
                </div>
              ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-xs text-muted">
        عرض <span className="font-medium text-text tabular-nums">{(page - 1) * pageSize + 1}</span>–
        <span className="font-medium text-text tabular-nums">{Math.min(page * pageSize, total)}</span> من{' '}
        <span className="font-medium text-text tabular-nums">{total}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="الصفحة السابقة"
        >
          <ChevronRight className="size-4" />
          السابق
        </Button>
        <span className="px-2 text-xs font-medium tabular-nums text-muted">
          {page} / {pages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label="الصفحة التالية"
        >
          التالي
          <ChevronLeft className="size-4" />
        </Button>
      </div>
    </div>
  );
}
