import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calculator,
  Code2,
  Coins,
  Info,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Scale,
  ShieldCheck,
  Store,
  Tag,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/ui/toast';
import type {
  CodeMode,
  FixedBasis,
  Lookup,
  LookupGroups,
  LookupKind,
  PriceSource,
  ProfitMode,
  Setting,
} from '../lib/types';
import { BASIS_LABEL, FIXED_BASIS_LABEL, fmtMoney, fmtNum, PROFIT_MODE_LABEL } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  NumberInput,
  PageHeader,
  SectionTitle,
  Select,
  Skeleton,
  Switch,
  Tabs,
} from '../components/ui/primitives';
import { ConfirmDialog, Modal } from '../components/ui/overlay';

type RoundingStep = 0 | 5 | 10;

interface SettingsDraft {
  shopName: string;
  currency: string;
  codeMode: CodeMode;
  defaultKarat: number;
  deductStone: boolean;
  deductInlays: boolean;
  profitMode: ProfitMode;
  profitValue: number | '';
  fixedBasis: FixedBasis;
  fxSource: PriceSource;
  roundingStep: RoundingStep;
  priceStaleHours: number | '';
  showCostToSeller: boolean;
  sellerCanAddItems: boolean;
}

const KIND_LABEL: Record<LookupKind, string> = {
  CATEGORY: 'التصنيفات',
  SUPPLIER: 'الموردون',
  MANUFACTURER: 'المصانع',
  COUNTRY: 'بلاد المنشأ',
  PAYMENT_METHOD: 'طرق الدفع',
  KARAT: 'العيارات',
};

const KIND_HINT: Record<LookupKind, string> = {
  CATEGORY: 'خواتم، أساور، سلاسل… والطقم يُضاف تلقائياً',
  SUPPLIER: 'أسماء الموردين الذين تشتري منهم',
  MANUFACTURER: 'أسماء المصانع أو العلامات التي تختار منها عند إضافة قطعة',
  COUNTRY: 'بلد منشأ القطعة',
  PAYMENT_METHOD: 'نقدي، بطاقة، تحويل…',
  KARAT: 'أرقام بين 1 و 24',
};

const KINDS: LookupKind[] = ['CATEGORY', 'SUPPLIER', 'MANUFACTURER', 'COUNTRY', 'PAYMENT_METHOD', 'KARAT'];

function toDraft(setting: Setting): SettingsDraft {
  return {
    shopName: setting.shopName,
    currency: setting.currency,
    codeMode: setting.codeMode,
    defaultKarat: setting.defaultKarat,
    deductStone: setting.deductStone,
    deductInlays: setting.deductInlays,
    profitMode: setting.profitMode,
    profitValue: setting.profitValue,
    fixedBasis: setting.fixedBasis ?? 'PIECE',
    fxSource: setting.fxSource,
    roundingStep: (setting.roundingStep === 5 || setting.roundingStep === 10 ? setting.roundingStep : 0) as RoundingStep,
    priceStaleHours: setting.priceStaleHours,
    showCostToSeller: setting.showCostToSeller,
    sellerCanAddItems: setting.sellerCanAddItems,
  };
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Setting>('/settings'),
  });

  const { data: lookups } = useQuery({
    queryKey: ['lookups', 'grouped', 'all'],
    queryFn: () => api.get<LookupGroups>('/lookups?activeOnly=false'),
  });

  const { data: karatLookup } = useQuery({
    queryKey: ['lookups', 'KARAT'],
    queryFn: () => api.get<Lookup[]>('/lookups?kind=KARAT'),
    staleTime: 5 * 60_000,
  });

  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    setDraft(toDraft(data));
  }, [data]);

  const saved = useMemo(() => (data ? toDraft(data) : null), [data]);
  const dirty = Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved));

  const karats = useMemo(() => {
    const list = (karatLookup ?? [])
      .map((l) => Number(l.value))
      .filter((k) => Number.isInteger(k) && k > 0 && k <= 24);
    return list.length > 0 ? list : [18, 21, 24];
  }, [karatLookup]);

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch<Setting>('/settings', payload),
    onSuccess: async (updated) => {
      toast.success('تم حفظ إعدادات المحل');
      setFormError(null);
      setDraft(toDraft(updated));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings'] }),
        queryClient.invalidateQueries({ queryKey: ['prices'] }),
        queryClient.invalidateQueries({ queryKey: ['items'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'تعذر حفظ الإعدادات';
      setFormError(message);
      toast.error(message);
    },
  });

  function update<K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function submit() {
    if (!draft || save.isPending) return;

    const profitValue = Number(draft.profitValue) || 0;
    const staleHours = Math.round(Number(draft.priceStaleHours) || 0);

    if (!draft.shopName.trim()) {
      setFormError('اسم المحل مطلوب');
      return;
    }
    if (!draft.currency.trim()) {
      setFormError('العملة مطلوبة');
      return;
    }
    if (profitValue < 0) {
      setFormError('قيمة الربح لا يمكن أن تكون سالبة');
      return;
    }
    if (draft.profitMode === 'PERCENT' && profitValue > 100) {
      setFormError('نسبة الربح لا يمكن أن تتجاوز 100%');
      return;
    }
    if (staleHours < 1 || staleHours > 168) {
      setFormError('مدة اعتبار السعر متقادماً يجب أن تكون بين 1 و 168 ساعة');
      return;
    }

    setFormError(null);
    save.mutate({
      shopName: draft.shopName.trim(),
      currency: draft.currency.trim().toUpperCase(),
      codeMode: draft.codeMode,
      defaultKarat: draft.defaultKarat,
      deductStone: draft.deductStone,
      deductInlays: draft.deductInlays,
      profitMode: draft.profitMode,
      profitValue,
      fixedBasis: draft.fixedBasis,
      fxSource: draft.fxSource,
      roundingStep: draft.roundingStep,
      priceStaleHours: staleHours,
      showCostToSeller: draft.showCostToSeller,
      sellerCanAddItems: draft.sellerCanAddItems,
    });
  }

  if (isLoading || !draft) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-11 w-64" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Skeleton className="h-[640px] rounded-2xl" />
          <Skeleton className="h-[420px] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-dangersoft text-sm text-danger">
        تعذر تحميل الإعدادات: {error instanceof Error ? error.message : 'خطأ غير معروف'}
      </Card>
    );
  }

  const basis = draft.deductStone
    ? draft.deductInlays
      ? 'NET_GOLD'
      : 'MINUS_STONE'
    : draft.deductInlays
      ? 'MINUS_INLAYS'
      : 'TOTAL';

  const profitSuffix = draft.profitMode === 'PERCENT' ? '%' : draft.currency;
  const profitDisabled = draft.profitMode === 'MANUAL';

  return (
    <div className="space-y-4">
      <PageHeader
        title="إعدادات المحل"
        subtitle="هوية المحل، قواعد الاحتساب، الربح، والأسعار — التغييرات تسري على كل الشاشات مباشرة."
        actions={
          <>
            <Button
              variant="secondary"
              icon={RotateCcw}
              disabled={!dirty || save.isPending}
              onClick={() => {
                if (saved) setDraft(saved);
                setFormError(null);
              }}
            >
              تراجع
            </Button>
            <Button variant="primary" icon={Save} loading={save.isPending} disabled={!dirty} onClick={submit}>
              حفظ الإعدادات
            </Button>
          </>
        }
      />

      {dirty ? (
        <div className="flex items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--gold)_32%,transparent)] bg-goldsoft/60 px-3.5 py-2.5 text-xs text-text">
          <Info className="size-4 shrink-0 text-gold" />
          لديك تغييرات غير محفوظة. لن تُطبَّق على التسعير حتى تضغط «حفظ الإعدادات».
        </div>
      ) : null}

      {formError ? (
        <div className="flex items-start gap-2 rounded-xl border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-dangersoft px-3.5 py-2.5 text-[13px] font-medium text-danger">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {formError}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          {/* هوية المحل */}
          <Card>
            <SectionTitle
              title="هوية المحل"
              description="تظهر في الشريط الجانبي وفواتير البيع المطبوعة."
              action={<Store className="size-4 text-muted" />}
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="اسم المحل" required className="sm:col-span-2">
                <Input
                  value={draft.shopName}
                  onChange={(e) => update('shopName', e.target.value)}
                  placeholder="اسم المحل التجاري"
                  maxLength={160}
                />
              </Field>
              <Field label="رمز العملة" required hint="مثال: LYD، USD، SAR — يظهر بجانب كل مبلغ.">
                <Input
                  value={draft.currency}
                  onChange={(e) => update('currency', e.target.value)}
                  className="ltr-nums text-start uppercase"
                  maxLength={8}
                />
              </Field>
              <Field label="العيار الافتراضي" hint="يُختار تلقائياً عند إضافة صنف جديد.">
                <Select value={String(draft.defaultKarat)} onChange={(e) => update('defaultKarat', Number(e.target.value))}>
                  {karats.map((k) => (
                    <option key={k} value={k}>
                      عيار {k}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          {/* الأكواد */}
          <Card>
            <SectionTitle
              title="أكواد القطع"
              description="اختر توليد الأكواد تلقائياً أو إدخالها يدوياً عند إضافة كل قطعة."
              action={<Code2 className="size-4 text-muted" />}
            />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {(['AUTO', 'MANUAL'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => update('codeMode', mode)}
                  className={
                    'rounded-xl border px-3.5 py-3 text-start transition-all ' +
                    (draft.codeMode === mode
                      ? 'border-[color-mix(in_oklab,var(--gold)_45%,transparent)] bg-goldsoft text-gold shadow-[0_6px_18px_-12px_var(--gold-glow)]'
                      : 'border-border bg-surface text-muted hover:border-borderstrong hover:bg-surface2/60')
                  }
                >
                  <span className="block text-[13px] font-semibold">
                    {mode === 'AUTO' ? 'توليد تلقائي' : 'إدخال يدوي'}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-muted">
                    {mode === 'AUTO' ? 'P-0001 للقطع، S-0001 للأطقم' : 'أنت تحدد الكود لكل قطعة'}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-5 text-muted">
              الأكواد المولّدة تلقائياً لا تتكرر ولا تُعاد استخدامها حتى بعد حذف صنف.
            </p>
          </Card>

          {/* احتساب الوزن */}
          <Card>
            <SectionTitle
              title="أساس احتساب الوزن"
              description="يحدد أي وزن يُضرب في سعر الغرام عند حساب قيمة الذهب."
              action={<Badge tone="gold">{BASIS_LABEL[basis]}</Badge>}
            />
            <div className="mt-4 space-y-3.5">
              <Switch
                checked={draft.deductStone}
                onChange={(v) => update('deductStone', v)}
                label="خصم وزن الحجر من الوزن الإجمالي"
                description="إذا كان للحجر سعر خاص، فوزنه يُخصم دائماً حتى لو كان هذا الخيار مغلقاً (BR-10)."
              />
              <Switch
                checked={draft.deductInlays}
                onChange={(v) => update('deductInlays', v)}
                label="خصم وزن الفصوص من الوزن الإجمالي"
                description="الفصوص هي الحبيبات أو الأحجار الصغيرة بدون سعر مستقل."
              />
              <div className="flex items-start gap-2 rounded-xl bg-surface2/60 px-3 py-2.5 text-[11px] leading-5 text-muted">
                <Scale className="mt-0.5 size-3.5 shrink-0 text-gold" />
                <p>
                  الأساس الحالي: <span className="font-semibold text-text">{BASIS_LABEL[basis]}</span>. يتم احتساب قيمة
                  الذهب = وزن الأساس × سعر غرام العيار.
                </p>
              </div>
            </div>
          </Card>

          {/* الربح */}
          <Card>
            <SectionTitle
              title="سياسة الربح والتقريب الافتراضية"
              description="قيم افتراضية تُملأ تلقائياً في شاشة البيع؛ ويمكن تعديلها لكل فاتورة على حدة."
              action={<Calculator className="size-4 text-muted" />}
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="طريقة الربح">
                <Select
                  value={draft.profitMode}
                  onChange={(e) => update('profitMode', e.target.value as ProfitMode)}
                >
                  {(['PERCENT', 'FIXED', 'MANUAL'] as const).map((mode) => (
                    <option key={mode} value={mode}>
                      {PROFIT_MODE_LABEL[mode]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={draft.profitMode === 'PERCENT' ? 'نسبة الربح' : 'قيمة الربح'}
                hint={
                  profitDisabled
                    ? 'السعر يُدخل يدوياً عند البيع'
                    : draft.profitMode === 'PERCENT'
                      ? 'تُضاف كنسبة من قيمة الذهب والحجر'
                      : draft.fixedBasis === 'GRAM'
                        ? 'تُضاف كمبلغ ثابت لكل غرام'
                        : 'تُضاف كمبلغ ثابت لكل قطعة'
                }
              >
                <NumberInput
                  value={draft.profitValue}
                  onChange={(v) => update('profitValue', v)}
                  suffix={profitSuffix}
                  disabled={profitDisabled}
                  placeholder="0.00"
                />
              </Field>
              <Field label="تقريب السعر النهائي" hint="0 = بدون تقريب.">
                <Select
                  value={String(draft.roundingStep)}
                  onChange={(e) => update('roundingStep', Number(e.target.value) as RoundingStep)}
                >
                  <option value="0">بدون تقريب</option>
                  <option value="5">أقرب 5</option>
                  <option value="10">أقرب 10</option>
                </Select>
              </Field>
              {draft.profitMode === 'FIXED' ? (
                <Field label="أساس الربح الثابت" className="sm:col-span-3">
                  <div className="grid grid-cols-2 gap-2">
                    {(['GRAM', 'PIECE'] as const).map((basis) => (
                      <button
                        key={basis}
                        type="button"
                        onClick={() => update('fixedBasis', basis)}
                        className={
                          'rounded-xl border px-3.5 py-3 text-start transition-all ' +
                          (draft.fixedBasis === basis
                            ? 'border-[color-mix(in_oklab,var(--gold)_45%,transparent)] bg-goldsoft text-gold shadow-[0_6px_18px_-12px_var(--gold-glow)]'
                            : 'border-border bg-surface text-muted hover:border-borderstrong hover:bg-surface2/60')
                        }
                      >
                        <span className="block text-[13px] font-semibold">{FIXED_BASIS_LABEL[basis]}</span>
                      </button>
                    ))}
                  </div>
                </Field>
              ) : null}
            </div>
          </Card>

          {/* الأسعار */}
          <Card>
            <SectionTitle
              title="أسعار الذهب"
              description="مصدر سعر الصرف وحد التنبيه عند تقادم الأسعار."
              action={<Coins className="size-4 text-muted" />}
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field
                label="مصدر سعر الصرف"
                hint={draft.fxSource === 'API' ? 'المزوّد التلقائي غير مفعّل بعد — سيُستخدم الإدخال اليدوي.' : 'يُدخل من صفحة أسعار الذهب.'}
              >
                <Select value={draft.fxSource} onChange={(e) => update('fxSource', e.target.value as PriceSource)}>
                  <option value="MANUAL">يدوي</option>
                  <option value="API">تلقائي (غير مفعّل)</option>
                </Select>
              </Field>
              <Field label="تنبيه تقادم السعر بعد (ساعة)" hint="بين 1 و 168 ساعة.">
                <NumberInput
                  value={draft.priceStaleHours}
                  onChange={(v) => update('priceStaleHours', v)}
                  suffix="ساعة"
                  placeholder="2"
                />
              </Field>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-muted">
              عند تجاوز هذه المدة يظهر تنبيه «السعر متقادم» في الأعلى وفي صفحات البيع والمخزون.
            </p>
          </Card>

          {/* صلاحيات البائع */}
          <Card>
            <SectionTitle
              title="صلاحيات البائع"
              description="تحكّم في ما يستطيع البائع رؤيته أو فعله."
              action={<ShieldCheck className="size-4 text-muted" />}
            />
            <div className="mt-4 space-y-3.5">
              <Switch
                checked={draft.showCostToSeller}
                onChange={(v) => update('showCostToSeller', v)}
                label="إظهار تكلفة الشراء والهامش للبائع"
                description="عند الإغلاق تظهر للبائع أسعار البيع فقط، دون التكلفة أو الربح."
              />
              <Switch
                checked={draft.sellerCanAddItems}
                onChange={(v) => update('sellerCanAddItems', v)}
                label="السماح للبائع بإضافة أصناف جديدة"
                description="تعديل الأصناف وإلغاء الفواتير والتقارير تبقى للمالك فقط في كل الأحوال."
              />
            </div>
          </Card>
        </div>

        {/* ملخص جانبي */}
        <aside className="xl:sticky xl:top-[84px] xl:self-start">
          <div className="space-y-3">
            <Card className="relative overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{ background: 'radial-gradient(22rem 12rem at 100% 0%, var(--gold-glow), transparent 65%)' }}
              />
              <div className="relative">
                <SectionTitle title="ملخص القواعد الحالية" />
                <div className="mt-3 space-y-2 text-[12px]">
                  <SummaryRow label="المحل" value={draft.shopName || '—'} />
                  <SummaryRow label="العملة" value={draft.currency.toUpperCase()} />
                  <SummaryRow label="الأكواد" value={draft.codeMode === 'AUTO' ? 'تلقائية' : 'يدوية'} />
                  <SummaryRow label="أساس الوزن" value={BASIS_LABEL[basis]} />
                  <SummaryRow
                    label="الربح"
                    value={
                      draft.profitMode === 'MANUAL'
                        ? 'يدوي عند البيع'
                        : draft.profitMode === 'PERCENT'
                          ? `${fmtMoney(Number(draft.profitValue) || 0)}%`
                          : `${fmtMoney(Number(draft.profitValue) || 0)} ${draft.currency}`
                    }
                  />
                  <SummaryRow
                    label="التقريب"
                    value={draft.roundingStep === 0 ? 'بدون' : `أقرب ${draft.roundingStep}`}
                  />
                  <SummaryRow label="العيار الافتراضي" value={`${draft.defaultKarat}K`} />
                  <SummaryRow label="تكلفة البائع" value={draft.showCostToSeller ? 'ظاهرة' : 'مخفية'} />
                </div>
              </div>
            </Card>

            <Card className="bg-surface2/40">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                <Info className="size-3.5 text-gold" /> ملاحظات
              </p>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-muted">
                <li>• تغيير أساس الوزن يؤثر على التقييم المقترح فقط، لا على الفواتير السابقة.</li>
                <li>• معدل الصرف المستعمل في شراء كل صنف محفوظ معه ولا يتغير.</li>
                <li>• الربح والتقريب هنا افتراضيان؛ لكل فاتورة بيع سياستها وسعر صرفها المحفوظان معها.</li>
                <li>• التقريب يُطبَّق مرة واحدة على السعر النهائي بعد إضافة الربح.</li>
              </ul>
            </Card>
          </div>
        </aside>
      </div>

      <LookupsSection lookups={lookups} />
    </div>
  );
}

/* ═══════════════════════ إدارة القوائم ═══════════════════════ */

function LookupsSection({ lookups }: { lookups: LookupGroups | undefined }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [kind, setKind] = useState<LookupKind>('CATEGORY');
  const [newValue, setNewValue] = useState('');
  const [newSort, setNewSort] = useState<number | ''>(100);
  const [addError, setAddError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Lookup | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editSort, setEditSort] = useState<number | ''>(100);
  const [editActive, setEditActive] = useState(true);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<Lookup | null>(null);

  const rows = lookups?.[kind] ?? [];

  function invalidate() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['lookups'] }),
      queryClient.invalidateQueries({ queryKey: ['items'] }),
      queryClient.invalidateQueries({ queryKey: ['settings'] }),
    ]);
  }

  const create = useMutation({
    mutationFn: () =>
      api.post<Lookup>('/lookups', {
        kind,
        value: newValue.trim(),
        sortOrder: typeof newSort === 'number' ? newSort : 100,
      }),
    onSuccess: async () => {
      toast.success('تمت إضافة القيمة');
      setNewValue('');
      setNewSort(100);
      setAddError(null);
      await invalidate();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'تعذر إضافة القيمة';
      setAddError(message);
      toast.error(message);
    },
  });

  const update = useMutation({
    mutationFn: () =>
      api.patch<Lookup>(`/lookups/${editing?.id}`, {
        value: editValue.trim(),
        sortOrder: typeof editSort === 'number' ? editSort : 100,
        active: editActive,
      }),
    onSuccess: async () => {
      toast.success('تم تحديث القيمة');
      setEditing(null);
      setEditError(null);
      await invalidate();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'تعذر تحديث القيمة';
      setEditError(message);
      toast.error(message);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del<{ ok?: boolean; deactivated?: boolean }>(`/lookups/${id}`),
    onSuccess: async (result) => {
      toast.success(result?.deactivated ? 'القيمة مستعملة، تم إخفاؤها بدل حذفها' : 'تم حذف القيمة');
      setDeleting(null);
      await invalidate();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'تعذر حذف القيمة');
      setDeleting(null);
    },
  });

  function startAdd() {
    if (!newValue.trim()) {
      setAddError('اكتب القيمة أولاً');
      return;
    }
    if (kind === 'KARAT') {
      const k = Number(newValue);
      if (!Number.isInteger(k) || k < 1 || k > 24) {
        setAddError('العيار يجب أن يكون رقماً بين 1 و 24');
        return;
      }
    }
    setAddError(null);
    create.mutate();
  }

  function openEdit(row: Lookup) {
    setEditing(row);
    setEditValue(row.value);
    setEditSort(row.sortOrder);
    setEditActive(row.active);
    setEditError(null);
  }

  function startEdit() {
    if (!editValue.trim()) {
      setEditError('القيمة مطلوبة');
      return;
    }
    if (editing?.kind === 'KARAT') {
      const k = Number(editValue);
      if (!Number.isInteger(k) || k < 1 || k > 24) {
        setEditError('العيار يجب أن يكون رقماً بين 1 و 24');
        return;
      }
    }
    setEditError(null);
    update.mutate();
  }

  return (
    <Card className="p-0">
      <div className="border-b border-border px-4 py-3">
        <SectionTitle
          title="القوائم المرجعية"
          description="التصنيفات والموردون وبلاد المنشأ وطرق الدفع والعيارات المستعملة في النماذج."
          action={<Tag className="size-4 text-muted" />}
        />
        <div className="mt-3">
          <Tabs
            value={kind}
            onChange={(value) => {
              setKind(value);
              setNewValue('');
              setNewSort(100);
              setAddError(null);
            }}
            items={KINDS.map((value) => ({
              value,
              label: KIND_LABEL[value],
              badge: lookups?.[value]?.length ?? 0,
            }))}
          />
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-text">{KIND_LABEL[kind]}</p>
            <span className="text-[11px] text-muted">
              {fmtNum(rows.filter((r) => r.active).length)} نشط · {fmtNum(rows.length)} إجمالي
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
              <Tag className="mx-auto size-5 text-muted/70" />
              <p className="mt-2 text-[12px] font-medium text-text">لا توجد قيم بعد</p>
              <p className="mt-1 text-[11px] text-muted">أضف أول قيمة من النموذج المجاور.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 bg-surface px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate text-[13px] text-text">{row.value}</span>
                    {!row.active ? <Badge tone="muted">معطّل</Badge> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="me-1 hidden text-[10px] tabular-nums text-muted sm:inline">
                      ترتيب {row.sortOrder}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`تعديل ${row.value}`}
                      onClick={() => openEdit(row)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`حذف ${row.value}`}
                      className="text-danger hover:bg-dangersoft"
                      onClick={() => setDeleting(row)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface2/40 p-3.5">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-text">
            <Plus className="size-3.5 text-gold" /> إضافة قيمة إلى {KIND_LABEL[kind]}
          </p>
          <p className="mt-0.5 text-[10px] leading-4 text-muted">{KIND_HINT[kind]}</p>

          <div className="mt-3 space-y-2">
            <Field label="القيمة" error={addError ?? undefined}>
              <Input
                value={newValue}
                onChange={(e) => {
                  setNewValue(e.target.value);
                  setAddError(null);
                }}
                placeholder={
                  kind === 'KARAT' ? 'مثال: 22' : kind === 'MANUFACTURER' ? 'مثال: مصنع الذهب' : 'مثال: خاتم'
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    startAdd();
                  }
                }}
                maxLength={120}
              />
            </Field>
            <Field label="الترتيب" hint="الأصغر يظهر أولاً.">
              <NumberInput value={newSort} onChange={setNewSort} placeholder="100" />
            </Field>
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              icon={Plus}
              loading={create.isPending}
              onClick={startAdd}
            >
              إضافة
            </Button>
          </div>

          <p className="mt-3 border-t border-border pt-2 text-[10px] leading-4 text-muted">
            حذف قيمة مستعملة في أصناف أو فواتير لا يحذفها فعلياً، بل يخفيها من القوائم حفاظاً على السجل التاريخي.
          </p>
        </div>
      </div>

      <Modal
        open={editing !== null}
        onClose={() => {
          if (!update.isPending) setEditing(null);
        }}
        title={`تعديل «${editing?.value ?? ''}»`}
        description={`ضمن ${editing ? KIND_LABEL[editing.kind] : ''}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={update.isPending} onClick={() => setEditing(null)}>
              إلغاء
            </Button>
            <Button variant="primary" icon={Save} loading={update.isPending} onClick={startEdit}>
              حفظ
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="القيمة" required error={editError ?? undefined}>
            <Input
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value);
                setEditError(null);
              }}
              maxLength={120}
              autoFocus
            />
          </Field>
          <Field label="الترتيب" hint="الأصغر يظهر أولاً.">
            <NumberInput value={editSort} onChange={setEditSort} />
          </Field>
          <Checkbox
            checked={editActive}
            onChange={setEditActive}
            label="نشط ويظهر في القوائم المنسدلة"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title={`حذف «${deleting?.value ?? ''}»؟`}
        description="إذا كانت القيمة مستعملة في أصناف أو فواتير سابقة فسيتم إخفاؤها بدل حذفها."
        confirmLabel="تأكيد الحذف"
        cancelLabel="رجوع"
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      >
        <p className="text-[11px] leading-5 text-muted">
          لا يمكن التراجع عن الحذف النهائي. القيم المخفية تبقى محفوظة في السجلات القديمة.
        </p>
      </ConfirmDialog>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className="max-w-[190px] truncate text-end font-medium text-text">{value}</span>
    </div>
  );
}
