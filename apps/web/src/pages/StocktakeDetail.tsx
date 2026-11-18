import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Lock,
  RefreshCw,
  Scale,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/toast';
import type { Setting, Stocktake, StocktakeDifferences, StocktakeLine } from '../lib/types';
import { fmtDateTime, fmtMoney, fmtNum, fmtWeight, STOCKTAKE_TYPE_LABEL, timeAgo } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  NumberInput,
  PageHeader,
  SectionTitle,
  Skeleton,
  StatCard,
  Tabs,
  Textarea,
} from '../components/ui/primitives';
import { Modal } from '../components/ui/overlay';

type ViewFilter = 'ALL' | 'UNCOUNTED' | 'DIFF';

interface LineDraft {
  counted: number | '';
  present: boolean;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export default function StocktakeDetail() {
  const { id } = useParams<{ id: string }>();
  const stocktakeId = id ? Number(id) : null;
  const valid = stocktakeId !== null && Number.isInteger(stocktakeId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { isOwner } = useAuth();

  const [drafts, setDrafts] = useState<Record<number, LineDraft>>({});
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewFilter>('ALL');
  const [savingLines, setSavingLines] = useState<number[]>([]);
  const [closeOpen, setCloseOpen] = useState(false);
  const initRef = useRef<number | null>(null);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Setting>('/settings'),
    staleTime: 5 * 60_000,
  });

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ['stocktakes', stocktakeId],
    queryFn: () => api.get<Stocktake>(`/stocktakes/${stocktakeId}`),
    enabled: valid,
  });

  const { data: differences } = useQuery({
    queryKey: ['stocktakes', stocktakeId, 'differences'],
    queryFn: () => api.get<StocktakeDifferences>(`/stocktakes/${stocktakeId}/differences`),
    // تقرير الفروقات في الخادم للمالك فقط؛ البائع يرى ملخصاً محسوباً من أسطر الجرد نفسها
    enabled: valid && isOwner,
  });

  useEffect(() => {
    if (!data) return;
    if (initRef.current === data.id) return;
    initRef.current = data.id;
    const next: Record<number, LineDraft> = {};
    for (const line of data.lines ?? []) {
      next[line.id] = {
        counted: line.countedWeight === null || line.countedWeight === undefined ? '' : Number(line.countedWeight),
        present: line.present,
      };
    }
    setDrafts(next);
  }, [data]);

  const patchLine = useMutation({
    mutationFn: ({ lineId, patch }: { lineId: number; patch: Record<string, unknown> }) =>
      api.patch<StocktakeLine>(`/stocktakes/${stocktakeId}/lines/${lineId}`, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['stocktakes', stocktakeId, 'differences'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'تعذر حفظ الوزن المعدود');
    },
    onSettled: (_data, _err, vars) => {
      setSavingLines((list) => list.filter((value) => value !== vars.lineId));
    },
  });

  const closeStocktake = useMutation({
    mutationFn: () => api.post(`/stocktakes/${stocktakeId}/close`),
    onSuccess: async () => {
      toast.success('تم إغلاق الجرد وتسجيله نهائياً');
      setCloseOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stocktakes'] }),
        queryClient.invalidateQueries({ queryKey: ['stocktakes', stocktakeId] }),
        queryClient.invalidateQueries({ queryKey: ['stocktakes', stocktakeId, 'differences'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'تعذر إغلاق الجرد');
    },
  });

  const lines = data?.lines ?? [];
  const closed = data?.status === 'CLOSED';
  const currency = settings?.currency ?? 'LYD';

  const draftFor = (line: StocktakeLine): LineDraft =>
    drafts[line.id] ?? {
      counted: line.countedWeight === null || line.countedWeight === undefined ? '' : Number(line.countedWeight),
      present: line.present,
    };

  function lineDiff(line: StocktakeLine): number | null {
    const draft = draftFor(line);
    if (!draft.present) return -Number(line.expectedWeight);
    if (draft.counted === '') return null;
    return round3(Number(draft.counted) - Number(line.expectedWeight));
  }

  const summary = useMemo(() => {
    let counted = 0;
    let missing = 0;
    let diffLines = 0;
    let netDiff = 0;
    let snapshotValue = 0;

    for (const line of lines) {
      const draft = draftFor(line);
      snapshotValue += Number(line.valueAtOpen) || 0;
      if (!draft.present) {
        missing += 1;
        diffLines += 1;
        netDiff += -Number(line.expectedWeight);
        continue;
      }
      if (draft.counted === '') continue;
      counted += 1;
      const diff = round3(Number(draft.counted) - Number(line.expectedWeight));
      netDiff += diff;
      if (Math.abs(diff) >= 0.001) diffLines += 1;
    }

    return {
      counted,
      missing,
      diffLines,
      netDiff: round3(netDiff),
      snapshotValue: Math.round(snapshotValue * 100) / 100,
    };
  }, [lines, drafts]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return lines.filter((line) => {
      const draft = draftFor(line);
      if (view === 'UNCOUNTED' && !(draft.present && draft.counted === '')) return false;
      if (view === 'DIFF') {
        const diff = lineDiff(line);
        const isDiff = !draft.present || (diff !== null && Math.abs(diff) >= 0.001);
        if (!isDiff) return false;
      }
      if (!term) return true;
      const name = line.item?.name ?? '';
      return line.itemCode.toLowerCase().includes(term) || name.toLowerCase().includes(term);
    });
  }, [lines, drafts, search, view]);

  function setDraft(lineId: number, patch: Partial<LineDraft>) {
    setDrafts((prev) => {
      const base =
        prev[lineId] ??
        (() => {
          const line = lines.find((l) => l.id === lineId);
          return {
            counted:
              line && line.countedWeight !== null && line.countedWeight !== undefined ? Number(line.countedWeight) : '',
            present: line ? line.present : true,
          };
        })();
      return { ...prev, [lineId]: { ...base, ...patch } };
    });
  }

  function saveCounted(line: StocktakeLine, value: number | '') {
    if (closed) return;
    const current = draftFor(line).counted;
    const serverValue =
      line.countedWeight === null || line.countedWeight === undefined ? '' : Number(line.countedWeight);
    if (value === serverValue || (value !== '' && Number(value) === Number(serverValue))) {
      if (current === value) return;
    }
    setSavingLines((list) => (list.includes(line.id) ? list : [...list, line.id]));
    patchLine.mutate({
      lineId: line.id,
      patch: { countedWeight: value === '' ? null : Number(value) },
    });
  }

  function togglePresent(line: StocktakeLine, present: boolean) {
    if (closed) return;
    setDraft(line.id, { present, counted: present ? '' : 0 });
    setSavingLines((list) => (list.includes(line.id) ? list : [...list, line.id]));
    patchLine.mutate({
      lineId: line.id,
      patch: { present, countedWeight: present ? null : 0 },
    });
  }

  if (!valid) {
    return (
      <Card className="mx-auto mt-10 max-w-md text-center">
        <p className="text-sm font-semibold text-text">رقم جرد غير صالح</p>
        <Button variant="primary" className="mt-3" onClick={() => navigate('/stocktake')}>
          عودة للجرد
        </Button>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-11 w-72" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[104px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-[420px] rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="mx-auto mt-10 max-w-md text-center">
        <TriangleAlert className="mx-auto size-8 text-warning" />
        <p className="mt-3 text-sm font-semibold text-text">تعذر تحميل الجرد</p>
        <p className="mt-1 text-xs text-muted">
          {error instanceof Error ? error.message : 'قد يكون الجرد محذوفاً أو الرابط غير صحيح.'}
        </p>
        <Button variant="primary" className="mt-4" onClick={() => navigate('/stocktake')}>
          عودة للجرد
        </Button>
      </Card>
    );
  }

  const progress = lines.length > 0 ? Math.round((summary.counted / lines.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`جرد ${STOCKTAKE_TYPE_LABEL[data.type] ?? data.type}`}
        subtitle={`فُتح ${fmtDateTime(data.openedAt)} بواسطة ${data.openedBy?.name ?? '—'} · ${fmtNum(
          lines.length,
        )} صنف`}
        actions={
          <>
            <Button variant="secondary" icon={ArrowRight} onClick={() => navigate('/stocktake')}>
              رجوع
            </Button>
            <Button variant="secondary" icon={RefreshCw} loading={isFetching} onClick={() => void refetch()}>
              تحديث
            </Button>
            {isOwner && !closed ? (
              <Button variant="primary" icon={Lock} onClick={() => setCloseOpen(true)}>
                إغلاق الجرد
              </Button>
            ) : null}
          </>
        }
      />

      {closed ? (
        <div className="flex items-start gap-2 rounded-xl border border-[color-mix(in_oklab,var(--success)_32%,transparent)] bg-successsoft px-3.5 py-2.5 text-xs leading-5 text-text">
          <Lock className="mt-0.5 size-4 shrink-0 text-success" />
          <div>
            <p className="font-semibold text-success">هذا الجرد مغلق ونهائي</p>
            <p className="mt-0.5 text-muted">
              أُغلق {fmtDateTime(data.closedAt)} بواسطة {data.closedBy?.name ?? '—'} · لا يمكن تعديل الأوزان المعدودة
              بعد الإغلاق (BR-14).
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[color-mix(in_oklab,var(--warning)_32%,transparent)] bg-warningsoft px-3.5 py-2.5 text-xs text-text">
          <ClipboardCheck className="size-4 shrink-0 text-warning" />
          <p className="min-w-0 flex-1">
            الجرد مفتوح — سجّل الوزن المعدود لكل قطعة، وأزل علامة «موجود» عن أي قطعة غير موجودة فعلياً.
          </p>
          <span className="font-semibold tabular-nums text-gold">{summary.counted} / {fmtNum(lines.length)}</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="نسبة الإنجاز"
          value={`${progress}%`}
          hint={`${fmtNum(summary.counted)} معدود من ${fmtNum(lines.length)}`}
          icon={CheckCircle2}
          tone={progress === 100 ? 'success' : 'gold'}
        />
        <StatCard
          label="قطع غير موجودة"
          value={fmtNum(summary.missing)}
          hint="معلّمة كغير موجودة في هذا الجرد"
          icon={TriangleAlert}
          tone={summary.missing > 0 ? 'danger' : 'muted'}
        />
        <StatCard
          label="فروقات الوزن"
          value={`${summary.netDiff > 0 ? '+' : ''}${fmtWeight(summary.netDiff)} غ`}
          hint={`${fmtNum(summary.diffLines)} سطر يحتاج مراجعة`}
          icon={Scale}
          tone={Math.abs(summary.netDiff) >= 0.001 || summary.missing > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="قيمة اللقطة عند الفتح"
          value={
            <>
              {fmtMoney(summary.snapshotValue)} <span className="text-xs font-medium text-muted">{currency}</span>
            </>
          }
          hint="محفوظة كما كانت لحظة فتح الجرد"
          icon={ClipboardList}
          tone="info"
        />
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-surface3">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--gold-hover)] to-[var(--gold)] transition-all"
          style={{ width: `${Math.max(2, progress)}%` }}
        />
      </div>

      {/* الأصناف */}
      <Card className="p-0">
        <div className="space-y-3 border-b border-border p-3">
          <Tabs
            value={view}
            onChange={setView}
            items={[
              { value: 'ALL', label: 'كل الأصناف', badge: fmtNum(lines.length) },
              { value: 'UNCOUNTED', label: 'غير معدودة', badge: fmtNum(lines.filter((l) => draftFor(l).present && draftFor(l).counted === '').length) },
              { value: 'DIFF', label: 'فروقات', badge: fmtNum(summary.diffLines) },
            ]}
          />
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالكود أو الاسم…"
              className="ps-9 pe-9"
              aria-label="بحث في أصناف الجرد"
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
        </div>

        {lines.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="لا أصناف في هذا الجرد"
            description="لم تكن هناك أصناف متاحة لحظة فتح الجرد. أغلق هذا الجرد وافتح آخر بعد إضافة قطع ذهب."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="لا نتائج مطابقة"
            description="جرّب بحثاً آخر أو اختر «كل الأصناف» لعرض الجميع."
          />
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1fr)_92px_140px_116px_96px] gap-2 border-b border-border bg-surface2/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted sm:grid">
              <span>الصنف</span>
              <span className="text-center">الوزن المتوقع</span>
              <span className="text-center">الوزن المعدود</span>
              <span className="text-center">الفرق</span>
              <span className="text-center">موجود</span>
            </div>
            <ul className="divide-y divide-border">
              {filtered.map((line) => (
                <LineRow
                  key={line.id}
                  line={line}
                  draft={draftFor(line)}
                  diff={lineDiff(line)}
                  closed={closed}
                  saving={savingLines.includes(line.id)}
                  onChangeCounted={(value) => setDraft(line.id, { counted: value })}
                  onBlurCounted={(value) => saveCounted(line, value)}
                  onTogglePresent={(present) => togglePresent(line, present)}
                />
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* الفروقات */}
      <Card>
        <SectionTitle
          title="تقرير الفروقات"
          description="ملخص ما ينقص أو يزيد مقارنة بلقطة الفتح، بما في ذلك الأصناف غير المسجّلة في الجرد."
          action={
            <Badge
              tone={
                summary.missing > 0 || summary.diffLines > 0 || (differences?.counts.notRegistered ?? 0) > 0
                  ? 'warning'
                  : 'success'
              }
              dot
            >
              {summary.missing + summary.diffLines + (differences?.counts.notRegistered ?? 0) === 0
                ? 'لا فروقات'
                : 'توجد فروقات'}
            </Badge>
          }
        />

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <DiffBlock
            title="قطع غير موجودة"
            count={differences?.missing.length ?? summary.missing}
            tone="danger"
            emptyText="كل القطع المسجّلة موجودة."
          >
            {(differences?.missing ?? lines.filter((l) => !draftFor(l).present)).map((line) => (
              <DiffRow
                key={line.id}
                code={line.itemCode}
                name={line.item?.name}
                value={`متوقع ${fmtWeight(line.expectedWeight)} غ`}
              />
            ))}
          </DiffBlock>

          <DiffBlock
            title="أوزان مختلفة"
            count={differences?.weightDiffs.length ?? summary.diffLines}
            tone="warning"
            emptyText="لا فروقات في الأوزان."
          >
            {(
              differences?.weightDiffs ??
              lines
                .filter((l) => {
                  const diff = lineDiff(l);
                  return draftFor(l).present && diff !== null && Math.abs(diff) >= 0.001;
                })
                .map((l) => ({ ...l, weightDiff: lineDiff(l) }))
            ).map((line) => (
              <DiffRow
                key={line.id}
                code={line.itemCode}
                name={line.item?.name}
                value={`${
                  Number(line.weightDiff ?? 0) > 0 ? '+' : ''
                }${fmtWeight(line.weightDiff)} غ`}
                danger={Number(line.weightDiff ?? 0) < 0}
              />
            ))}
          </DiffBlock>

          <DiffBlock
            title="أصناف غير مسجّلة بالجرد"
            count={differences?.notRegistered.length ?? 0}
            tone="info"
            emptyText="لا أصناف جديدة خارج الجرد."
          >
            {(differences?.notRegistered ?? []).map((item) => (
              <DiffRow
                key={item.id}
                code={item.code}
                name={item.name}
                value={`${fmtWeight(item.totalWeight)} غ · عيار ${item.karat}`}
              />
            ))}
          </DiffBlock>
        </div>

        {data.notes ? (
          <div className="mt-4 rounded-xl border border-border bg-surface2/50 px-3.5 py-2.5">
            <p className="text-[11px] font-semibold text-muted">ملاحظات الجرد</p>
            <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-5 text-text">{data.notes}</p>
          </div>
        ) : null}
      </Card>

      {data.closedAt ? (
        <p className="px-1 text-[11px] text-muted">
          أُغلق {timeAgo(data.closedAt)} · {fmtDateTime(data.closedAt)}
        </p>
      ) : null}

      <Modal
        open={closeOpen}
        onClose={() => {
          if (!closeStocktake.isPending) setCloseOpen(false);
        }}
        title="إغلاق الجرد نهائياً؟"
        description="بعد الإغلاق لا يمكن تعديل الأوزان المعدودة أو حالة الوجود."
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={closeStocktake.isPending} onClick={() => setCloseOpen(false)}>
              رجوع
            </Button>
            <Button variant="primary" icon={Lock} loading={closeStocktake.isPending} onClick={() => closeStocktake.mutate()}>
              تأكيد الإغلاق
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniStat label="معدود" value={fmtNum(summary.counted)} />
            <MiniStat label="غير موجود" value={fmtNum(summary.missing)} />
            <MiniStat
              label="صافي الفرق"
              value={`${summary.netDiff > 0 ? '+' : ''}${fmtWeight(summary.netDiff)} غ`}
            />
          </div>
          {summary.counted < lines.length ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-warningsoft px-2.5 py-2 text-[11px] leading-4 text-text">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
              ما زال {fmtNum(lines.length - summary.counted)} صنفاً بدون وزن معدود. يمكنك الإغلاق الآن، لكن الأفضل إكمال
              العدّ أولاً.
            </p>
          ) : (
            <p className="flex items-start gap-1.5 rounded-lg bg-successsoft px-2.5 py-2 text-[11px] leading-4 text-text">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
              تم عدّ جميع الأصناف. راجع تقرير الفروقات قبل الإغلاق النهائي.
            </p>
          )}
          {data.notes ? (
            <Textarea value={data.notes} readOnly rows={2} className="opacity-80" aria-label="ملاحظات الجرد" />
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

/* ═══════════════════ سطر الجرد ═══════════════════ */

function LineRow({
  line,
  draft,
  diff,
  closed,
  saving,
  onChangeCounted,
  onBlurCounted,
  onTogglePresent,
}: {
  line: StocktakeLine;
  draft: LineDraft;
  diff: number | null;
  closed: boolean;
  saving: boolean;
  onChangeCounted: (value: number | '') => void;
  onBlurCounted: (value: number | '') => void;
  onTogglePresent: (present: boolean) => void;
}) {
  const name = line.item?.name ?? 'صنف محذوف';
  const karat = line.item?.karat;

  return (
    <li className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_92px_140px_116px_96px] sm:items-center sm:gap-2">
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-text">
          <span className="truncate">{name}</span>
          {karat ? (
            <span className="inline-flex shrink-0 rounded-md bg-goldsoft px-1.5 py-0.5 text-[10px] font-bold text-gold">
              {karat}K
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
          <span className="font-mono text-gold">{line.itemCode}</span>
          {saving ? <span className="text-gold">جارٍ الحفظ…</span> : null}
        </p>
      </div>

      <div className="text-start sm:text-center">
        <p className="text-[10px] text-muted sm:hidden">متوقع</p>
        <p className="text-[12px] font-medium tabular-nums text-muted">{fmtWeight(line.expectedWeight)} غ</p>
      </div>

      <div>
        <p className="mb-1 text-[10px] text-muted sm:hidden">المعدود</p>
        <NumberInput
          value={draft.counted}
          onChange={onChangeCounted}
          onBlur={() => onBlurCounted(draft.counted)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          disabled={closed || !draft.present}
          placeholder={fmtWeight(line.expectedWeight)}
          suffix="غ"
          className="h-9 text-[12px]"
          aria-label={`الوزن المعدود ${line.itemCode}`}
        />
      </div>

      <div className="flex items-center justify-start sm:justify-center">
        <p className="me-2 text-[10px] text-muted sm:hidden">الفرق</p>
        {diff === null ? (
          <span className="text-[11px] text-muted">—</span>
        ) : Math.abs(diff) < 0.001 ? (
          <Badge tone="success">مطابق</Badge>
        ) : (
          <Badge tone={diff < 0 ? 'danger' : 'warning'}>
            {diff > 0 ? '+' : ''}
            {fmtWeight(diff)} غ
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-start ps-0 sm:justify-center">
        <Checkbox
          checked={draft.present}
          onChange={onTogglePresent}
          disabled={closed}
          label={<span className="text-[12px]">{draft.present ? 'موجود' : 'غير موجود'}</span>}
        />
      </div>
    </li>
  );
}

/* ═══════════════════ الفروقات ═══════════════════ */

function DiffBlock({
  title,
  count,
  tone,
  emptyText,
  children,
}: {
  title: string;
  count: number;
  tone: 'danger' | 'warning' | 'info';
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface2/35 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-text">{title}</p>
        <Badge tone={count > 0 ? tone : 'success'}>{fmtNum(count)}</Badge>
      </div>
      <div className="mt-2 space-y-1.5">
        {count === 0 ? (
          <p className="flex items-center gap-1.5 py-2 text-[11px] text-muted">
            <CheckCircle2 className="size-3.5 text-success" /> {emptyText}
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function DiffRow({
  code,
  name,
  value,
  danger,
}: {
  code: string;
  name?: string | null;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-surface px-2.5 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-text">{name ?? code}</p>
        <p className="font-mono text-[9px] text-gold">{code}</p>
      </div>
      <span className={'shrink-0 text-[11px] font-semibold tabular-nums ' + (danger ? 'text-danger' : 'text-muted')}>
        {value}
      </span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface2/50 px-2 py-2">
      <p className="text-[10px] text-muted">{label}</p>
      <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-text">{value}</p>
    </div>
  );
}
