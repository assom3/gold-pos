import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Gem,
  Plus,
  Save,
  Sparkles,
  Tag,
  Trash2,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/toast';
import { fmtMoney, fmtNum, fmtWeight, COMPONENT_KIND_LABEL, PURCHASE_STATUS_LABEL } from '../lib/format';
import type {
  ComponentKind,
  Item,
  ItemType,
  Lookup,
  LookupGroups,
  PriceTableView,
  PurchaseStatus,
  Setting,
} from '../lib/types';
import { basisFromSettings } from '../lib/pricing-preview';
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
} from '../components/ui/primitives';

/* ═══════════════════════ الحالة ═══════════════════════ */

interface ComponentDraft {
  key: string;
  kind: ComponentKind;
  name: string;
  karat: number;
  weight: number | '';
  stoneWeight: number | '';
  stonePrice: number | '';
  inlaysWeight: number | '';
  notes: string;
}

interface FormState {
  type: ItemType;
  code: string;
  name: string;
  categoryId: string;
  size: string;
  karat: number;
  totalWeight: number | '';
  stoneWeight: number | '';
  stonePrice: number | '';
  inlaysWeight: number | '';
  quantity: number | '';
  confirmSameWeight: boolean;
  purchaseGramPrice: number | '';
  purchaseCurrency: string;
  purchaseFxRate: number | '';
  purchaseStatus: PurchaseStatus;
  supplierId: string;
  countryId: string;
  manufacturerId: string;
  manufacturer: string;
  description: string;
  notes: string;
  addedAt: string;
}

const COMPONENT_KINDS: ComponentKind[] = [
  'RING',
  'BRACELET',
  'NECKLACE',
  'EARRING',
  'ANKLET',
  'CHAIN',
  'PENDANT',
  'OTHER',
];

let draftCounter = 0;

function newComponent(karat: number): ComponentDraft {
  draftCounter += 1;
  return {
    key: `c-${draftCounter}`,
    kind: 'RING',
    name: '',
    karat,
    weight: '',
    stoneWeight: '',
    stonePrice: '',
    inlaysWeight: '',
    notes: '',
  };
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function num(value: number | '' | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function emptyForm(defaultKarat = 21): FormState {
  return {
    type: 'PIECE',
    code: '',
    name: '',
    categoryId: '',
    size: '',
    karat: defaultKarat,
    totalWeight: '',
    stoneWeight: '',
    stonePrice: '',
    inlaysWeight: '',
    quantity: 1,
    confirmSameWeight: false,
    purchaseGramPrice: '',
    purchaseCurrency: 'USD',
    purchaseFxRate: '',
    purchaseStatus: 'NEW',
    supplierId: '',
    countryId: '',
    manufacturerId: '',
    manufacturer: '',
    description: '',
    notes: '',
    addedAt: today(),
  };
}

function setNum(value: number | '' | null | undefined): number | '' {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? n : '';
}

/* ═══════════════════════ الصفحة ═══════════════════════ */

export default function ItemForm() {
  const { id } = useParams<{ id: string }>();
  const itemId = id ? Number(id) : null;
  const isEdit = itemId !== null && Number.isInteger(itemId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { isOwner } = useAuth();

  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [components, setComponents] = useState<ComponentDraft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const initialized = useRef(false);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Setting>('/settings'),
    staleTime: 5 * 60_000,
  });

  const { data: lookups } = useQuery({
    queryKey: ['lookups', 'grouped'],
    queryFn: () => api.get<LookupGroups>('/lookups'),
    staleTime: 5 * 60_000,
  });

  const { data: priceView } = useQuery({
    queryKey: ['prices', 'table'],
    queryFn: () => api.get<PriceTableView>('/prices/table'),
  });

  const { data: nextCode, isFetching: loadingCode } = useQuery({
    queryKey: ['items', 'next-code', form.type],
    queryFn: () => api.get<{ code: string | null; mode: 'AUTO' | 'MANUAL' }>(`/items/next-code${qs({ type: form.type })}`),
    enabled: !isEdit && settings?.codeMode === 'AUTO',
    staleTime: 0,
  });

  const { data: existing, isLoading: loadingItem } = useQuery({
    queryKey: ['items', itemId],
    queryFn: () => api.get<Item>(`/items/${itemId}`),
    enabled: isEdit,
  });

  const karats = useMemo(() => {
    const list = (lookups?.KARAT ?? [])
      .map((l) => Number(l.value))
      .filter((k) => Number.isInteger(k) && k > 0 && k <= 24);
    const base = list.length > 0 ? list : [18, 21, 24];
    // أعيرة الصنف المحفوظ تبقى متاحة حتى لو عُطّل العيار من القوائم لاحقاً،
    // وإلا فشل التحقق عند تعديل صنف قديم.
    const own = [existing?.karat, ...(existing?.components ?? []).map((c) => c.karat)].filter(
      (k): k is number => typeof k === 'number',
    );
    return [...new Set([...base, ...own])].sort((a, b) => a - b);
  }, [lookups, existing]);

  const categories = lookups?.CATEGORY ?? [];
  const suppliers = lookups?.SUPPLIER ?? [];
  const manufacturers = lookups?.MANUFACTURER ?? [];
  const countries = lookups?.COUNTRY ?? [];

  /** تصنيف «طقم» يُختار تلقائياً عند اختيار النوع طقم */
  const setCategory = useMemo(
    () => categories.find((c) => c.value.trim() === 'طقم') ?? null,
    [categories],
  );

  const localCurrency = settings?.currency ?? 'LYD';
  const readOnly = isEdit && (!isOwner || existing?.status === 'SOLD');
  /** بيانات الشراء للمالك، وللبائع فقط إذا فعّل المالك إظهار التكلفة (الخادم يرفض غير ذلك) */
  const canSeeCost = isOwner || settings?.showCostToSeller === true;

  /* ── تهيئة أولية للعيار وسعر الصرف ── */
  useEffect(() => {
    if (initialized.current || isEdit) return;
    if (!settings) return;
    initialized.current = true;
    const fx = priceView?.current.fx?.value;
    setForm((prev) => ({
      ...prev,
      karat: settings.defaultKarat ?? 21,
      purchaseCurrency: 'USD',
      purchaseFxRate: fx && fx > 0 ? fx : prev.purchaseFxRate,
    }));
  }, [settings, priceView, isEdit]);

  /* ── تحميل الصنف للتعديل ── */
  useEffect(() => {
    if (!existing) return;
    setForm({
      type: existing.type,
      code: existing.code,
      name: existing.name,
      categoryId: existing.categoryId ? String(existing.categoryId) : '',
      size: existing.size ?? '',
      karat: existing.karat,
      totalWeight: setNum(existing.totalWeight),
      stoneWeight: setNum(existing.stoneWeight),
      stonePrice: setNum(existing.stonePrice),
      inlaysWeight: setNum(existing.inlaysWeight),
      quantity: existing.quantity,
      confirmSameWeight: true,
      purchaseGramPrice: setNum(
        existing.purchaseGramPrice ??
          (existing.netGoldWeight > 0 ? existing.purchasePrice / existing.netGoldWeight : null),
      ),
      purchaseCurrency: existing.purchaseCurrency,
      purchaseFxRate: setNum(existing.purchaseFxRate),
      purchaseStatus: existing.purchaseStatus,
      supplierId: existing.supplierId ? String(existing.supplierId) : '',
      countryId: existing.countryId ? String(existing.countryId) : '',
      manufacturerId: existing.manufacturerId ? String(existing.manufacturerId) : '',
      manufacturer: existing.manufacturer ?? '',
      description: existing.description ?? '',
      notes: existing.notes ?? '',
      addedAt: existing.addedAt ? new Date(existing.addedAt).toISOString().slice(0, 10) : today(),
    });
    setComponents(
      (existing.components ?? []).map((c) => {
        draftCounter += 1;
        return {
          key: `c-${draftCounter}`,
          kind: c.kind,
          name: c.name ?? '',
          karat: c.karat,
          weight: setNum(c.weight),
          stoneWeight: setNum(c.stoneWeight),
          stonePrice: setNum(c.stonePrice),
          inlaysWeight: setNum(c.inlaysWeight),
          notes: c.notes ?? '',
        };
      }),
    );
  }, [existing]);

  /* ── إجبار تصنيف «طقم» عند اختيار النوع طقم ── */
  useEffect(() => {
    if (form.type !== 'SET' || !setCategory) return;
    const wanted = String(setCategory.id);
    if (form.categoryId !== wanted) {
      setForm((prev) => ({ ...prev, categoryId: wanted }));
    }
  }, [form.type, form.categoryId, setCategory]);

  /* ── ملخص الأوزان ── */
  const totals = useMemo(() => {
    if (form.type === 'PIECE') {
      return {
        total: num(form.totalWeight),
        stone: num(form.stoneWeight),
        inlays: num(form.inlaysWeight),
        net: Math.round((num(form.totalWeight) - num(form.stoneWeight) - num(form.inlaysWeight)) * 1000) / 1000,
      };
    }
    let total = 0;
    let stone = 0;
    let inlays = 0;
    for (const c of components) {
      total += num(c.weight);
      stone += num(c.stoneWeight);
      inlays += num(c.inlaysWeight);
    }
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return { total: r3(total), stone: r3(stone), inlays: r3(inlays), net: r3(total - stone - inlays) };
  }, [form, components]);

  const basis = settings
    ? basisFromSettings(settings.deductStone, settings.deductInlays)
    : ('NET_GOLD' as const);

  /**
   * الشراء من محلات الجملة بسعر الغرام:
   * إجمالي القطعة = سعر الغرام × وزن الذهب الصافي، ثم يُحوّل للعملة المحلية بسعر صرف يوم الشراء.
   */
  const purchaseCalc = useMemo(() => {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const weight = Math.max(0, totals.net);
    const gramPrice = num(form.purchaseGramPrice);
    const unitTotal = r2(gramPrice * weight);
    const rate = form.purchaseCurrency === localCurrency ? 1 : num(form.purchaseFxRate);
    const unitCost = rate > 0 ? r2(unitTotal * rate) : null;
    const quantity = Math.max(1, num(form.quantity) || 1);
    return {
      weight,
      gramPrice,
      unitTotal,
      rate,
      unitCost,
      quantity,
      batchTotal: r2(unitTotal * quantity),
      batchCost: unitCost === null ? null : r2(unitCost * quantity),
    };
  }, [totals.net, form.purchaseGramPrice, form.purchaseCurrency, form.purchaseFxRate, form.quantity, localCurrency]);

  /* ── حفظ ── */
  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      isEdit ? api.patch<Item>(`/items/${itemId}`, payload) : api.post<Item>('/items', payload),
    onSuccess: async (saved) => {
      toast.success(isEdit ? 'تم تحديث الصنف' : 'تمت إضافة الصنف');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['items'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
        queryClient.invalidateQueries({ queryKey: ['stocktakes'] }),
      ]);
      if (!isEdit) navigate('/items');
      else navigate(`/items/${saved.id}`);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'تعذر حفظ الصنف';
      setFormError(message);
      toast.error(message);
    },
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  }

  function updateComponent(key: string, patch: Partial<ComponentDraft>) {
    setComponents((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function changeType(next: ItemType) {
    update('type', next);
    if (next === 'SET') {
      update('quantity', 1);
      if (setCategory) update('categoryId', String(setCategory.id));
    } else if (setCategory && form.categoryId === String(setCategory.id)) {
      update('categoryId', '');
    }
  }

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (!form.name.trim()) next.name = 'اسم القطعة مطلوب';
    if (!karats.includes(form.karat)) next.karat = 'اختر عياراً صالحاً';

    if (form.type === 'PIECE') {
      if (num(form.totalWeight) <= 0) next.totalWeight = 'الوزن الإجمالي مطلوب';
      if (num(form.stoneWeight) + num(form.inlaysWeight) >= num(form.totalWeight) && num(form.totalWeight) > 0) {
        next.totalWeight = 'وزن الحجر والفصوص يجب أن يكون أقل من الوزن الإجمالي';
      }
      if (num(form.quantity) < 1) next.quantity = 'الكمية قطعة واحدة على الأقل';
      if (num(form.quantity) > 1 && !form.confirmSameWeight) {
        next.quantity = 'يجب تأكيد أن جميع القطع بنفس الوزن والمواصفات';
      }
    } else {
      if (components.length === 0) next.components = 'أضف مكوّناً واحداً على الأقل للطقم';
      components.forEach((c, index) => {
        if (num(c.weight) <= 0) next[`c-${c.key}-weight`] = `وزن المكوّن ${index + 1} مطلوب`;
        if (num(c.stoneWeight) + num(c.inlaysWeight) >= num(c.weight) && num(c.weight) > 0) {
          next[`c-${c.key}-weight`] = `أوزان الحجر والفصوص في المكوّن ${index + 1} أكبر من وزنه`;
        }
      });
    }

    if (canSeeCost) {
      if (num(form.purchaseGramPrice) < 0) next.purchaseGramPrice = 'سعر الغرام لا يمكن أن يكون سالباً';
      if (form.purchaseCurrency !== localCurrency && num(form.purchaseFxRate) <= 0) {
        next.purchaseFxRate = 'سعر الصرف مطلوب للعملة الأجنبية';
      }
    }
    if (settings?.codeMode === 'MANUAL' && !isEdit && !/^[A-Za-z0-9_-]+$/.test(form.code.trim())) {
      next.code = 'الكود مطلوب ويقبل حروفاً لاتينية وأرقاماً وشرطات فقط';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) {
      setFormError('يرجى تصحيح الحقول المظللة قبل الحفظ.');
      return false;
    }
    setFormError(null);
    return true;
  }

  function submit() {
    if (readOnly || save.isPending) return;
    if (!validate()) return;

    const effectiveCategoryId =
      form.type === 'SET' && setCategory
        ? setCategory.id
        : form.categoryId
          ? Number(form.categoryId)
          : null;

    const payload: Record<string, unknown> = {
      type: form.type,
      name: form.name.trim(),
      categoryId: effectiveCategoryId,
      size: form.size.trim() || null,
      karat: form.karat,
      stoneWeight: num(form.stoneWeight),
      stonePrice: form.type === 'SET' ? null : form.stonePrice === '' ? null : num(form.stonePrice),
      inlaysWeight: num(form.inlaysWeight),
      quantity: form.type === 'SET' ? 1 : num(form.quantity) || 1,
      confirmSameWeight: form.type === 'SET' ? undefined : form.confirmSameWeight,
      // بدون صلاحية التكلفة لا نرسل أي بيانات شراء (الخادم يرفضها للبائع)
      purchaseGramPrice: canSeeCost ? num(form.purchaseGramPrice) : 0,
      purchasePrice: canSeeCost ? purchaseCalc.unitTotal : 0,
      purchaseCurrency: canSeeCost ? form.purchaseCurrency.toUpperCase() : localCurrency.toUpperCase(),
      purchaseFxRate:
        !canSeeCost || form.purchaseCurrency === localCurrency ? 1 : num(form.purchaseFxRate),
      purchaseStatus: form.purchaseStatus,
      // أساس الوزن يتبع إعداد المحل ما لم يُحدَّد تجاوز خاص بالصنف؛ لا نُجمّد إعداد اليوم داخل الصنف
      weightBasis: isEdit ? (existing?.weightBasis ?? null) : null,
      supplierId: form.supplierId ? Number(form.supplierId) : null,
      countryId: form.countryId ? Number(form.countryId) : null,
      manufacturerId: form.manufacturerId ? Number(form.manufacturerId) : null,
      manufacturer: form.manufacturerId ? null : form.manufacturer.trim() || null,
      description: form.description.trim() || null,
      notes: form.notes.trim() || null,
      addedAt: new Date(`${form.addedAt}T12:00:00`).toISOString(),
    };

    if (form.type === 'PIECE') {
      payload.totalWeight = num(form.totalWeight);
    } else {
      payload.components = components.map((c) => ({
        kind: c.kind,
        name: c.name.trim() || null,
        karat: c.karat,
        weight: num(c.weight),
        stoneWeight: num(c.stoneWeight),
        stonePrice: c.stonePrice === '' ? null : num(c.stonePrice),
        inlaysWeight: num(c.inlaysWeight),
        notes: c.notes.trim() || null,
      }));
    }

    if (!isEdit) {
      if (settings?.codeMode === 'MANUAL') payload.code = form.code.trim();
      else if (form.code.trim()) payload.code = form.code.trim();
    }

    save.mutate(payload);
  }

  /* ── حالات التحميل ── */
  if (isEdit && loadingItem) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-11 w-64" />
        <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
          <Skeleton className="h-[520px] rounded-2xl" />
          <Skeleton className="h-[420px] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isEdit && !loadingItem && !existing) {
    return (
      <Card className="mx-auto mt-10 max-w-md text-center">
        <TriangleAlert className="mx-auto size-8 text-warning" />
        <p className="mt-3 text-sm font-semibold text-text">الصنف غير موجود</p>
        <p className="mt-1 text-xs text-muted">قد يكون قد حُذف أو أن الرابط غير صحيح.</p>
        <Button variant="primary" className="mt-4" onClick={() => navigate('/items')}>
          العودة إلى الذهب
        </Button>
      </Card>
    );
  }

  const currency = localCurrency;
  const codeMode = settings?.codeMode ?? 'AUTO';

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      <PageHeader
        title={isEdit ? (readOnly ? 'عرض الصنف' : 'تعديل الصنف') : 'إضافة قطعة ذهب'}
        subtitle={
          isEdit
            ? `${form.code} · ${form.name || 'بدون اسم'}`
            : 'سجّل قطعة مفردة أو طقماً كاملاً بأوزانه وعياراته وتكلفته.'
        }
        actions={
          <>
            <Button variant="secondary" icon={ArrowRight} onClick={() => navigate('/items')}>
              رجوع
            </Button>
            {!readOnly ? (
              <Button variant="primary" icon={Save} loading={save.isPending} onClick={submit}>
                {isEdit ? 'حفظ التعديلات' : 'حفظ الصنف'}
              </Button>
            ) : null}
          </>
        }
      />

      {readOnly ? (
        <div className="flex items-start gap-2 rounded-xl border border-[color-mix(in_oklab,var(--warning)_32%,transparent)] bg-warningsoft px-3.5 py-2.5 text-xs leading-5 text-text">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            {existing?.status === 'SOLD'
              ? 'هذا الصنف مباع، لذلك لا يمكن تعديل بياناته حفاظاً على سجل المبيعات.'
              : 'تعديل الأصناف متاح للمالك فقط. يمكنك عرض البيانات كاملة دون تغييرها.'}
          </p>
        </div>
      ) : null}

      {formError ? (
        <div className="rounded-xl border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-dangersoft px-3.5 py-2.5 text-[13px] font-medium text-danger">
          {formError}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]"
      >
        <fieldset disabled={readOnly} className="min-w-0 space-y-4">
          {/* النوع والكود */}
          <Card>
            <SectionTitle
              title="نوع الصنف"
              description="القطعة المفردة كود خاص بها، والطقم كود واحد يجمع مكوناته."
              action={<Badge tone="gold">{form.type === 'PIECE' ? 'قطعة' : 'طقم'}</Badge>}
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="grid grid-cols-2 gap-2">
                {(['PIECE', 'SET'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={isEdit && form.type !== t}
                    onClick={() => changeType(t)}
                    className={
                      'flex flex-col items-start gap-1 rounded-xl border px-3.5 py-3 text-start transition-all ' +
                      (form.type === t
                        ? 'border-[color-mix(in_oklab,var(--gold)_45%,transparent)] bg-goldsoft text-gold shadow-[0_6px_18px_-12px_var(--gold-glow)]'
                        : 'border-border bg-surface text-muted hover:border-borderstrong hover:bg-surface2/60')
                    }
                  >
                    <span className="flex w-full items-center justify-between">
                      <span className="text-[13px] font-semibold">{t === 'PIECE' ? 'قطعة مفردة' : 'طقم'}</span>
                      {t === 'PIECE' ? <Gem className="size-4" /> : <Sparkles className="size-4" />}
                    </span>
                    <span className="text-[10px] leading-4 text-muted">
                      {t === 'PIECE' ? 'خاتم، سلسلة، أسورة…' : 'عدة مكونات بعيارات مختلفة'}
                    </span>
                  </button>
                ))}
              </div>

              <Field
                label="كود الصنف"
                required={codeMode === 'MANUAL'}
                error={errors.code}
                hint={
                  isEdit
                    ? 'الكود ثابت بعد الإنشاء ولا يمكن تغييره'
                    : codeMode === 'AUTO'
                    ? loadingCode
                      ? 'جارٍ توليد الكود…'
                      : nextCode?.code
                        ? `سيُسند تلقائياً عند الحفظ: ${nextCode.code}`
                        : 'يُولّد تلقائياً عند الحفظ'
                    : 'النمط الحالي: إدخال يدوي للكود'
                }
              >
                <Input
                  value={codeMode === 'MANUAL' || isEdit ? form.code : (nextCode?.code ?? '')}
                  onChange={(e) => update('code', e.target.value)}
                  readOnly={isEdit || codeMode === 'AUTO'}
                  placeholder={codeMode === 'MANUAL' ? 'P-0001' : ''}
                  className="ltr-nums text-start font-mono"
                />
              </Field>

              <Field label="اسم القطعة" required error={errors.name} className="sm:col-span-2">
                <Input
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="مثال: خاتم زفاف عيار 21"
                />
              </Field>

              <Field label="العيار" required error={errors.karat}>
                <Select
                  value={String(form.karat)}
                  onChange={(e) => update('karat', Number(e.target.value))}
                >
                  {karats.map((k) => (
                    <option key={k} value={k}>
                      عيار {k}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="التصنيف"
                hint={
                  form.type === 'SET'
                    ? setCategory
                      ? 'يُحدَّد «طقم» تلقائياً عند اختيار النوع طقم'
                      : 'أضف تصنيف «طقم» من الإعدادات ليُحدَّد تلقائياً'
                    : undefined
                }
              >
                <Select
                  value={form.type === 'SET' && setCategory ? String(setCategory.id) : form.categoryId}
                  onChange={(e) => update('categoryId', e.target.value)}
                  placeholder="بدون تصنيف"
                  disabled={form.type === 'SET'}
                >
                  {categories.map((c: Lookup) => (
                    <option key={c.id} value={c.id}>
                      {c.value}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="المقاس">
                <Input
                  value={form.size}
                  onChange={(e) => update('size', e.target.value)}
                  placeholder="مثال: 54 أو 18 سم"
                />
              </Field>

              <Field
                label="الكمية"
                error={errors.quantity}
                hint={form.type === 'SET' ? 'الطقم نسخة واحدة فقط' : 'للقطع المتطابقة تماماً فقط'}
              >
                <NumberInput
                  value={form.quantity}
                  onChange={(v) => update('quantity', v)}
                  disabled={form.type === 'SET'}
                  className="h-10"
                />
              </Field>

              {form.type === 'PIECE' && num(form.quantity) > 1 ? (
                <div className="sm:col-span-2">
                  <Checkbox
                    checked={form.confirmSameWeight}
                    onChange={(v) => update('confirmSameWeight', v)}
                    label="أؤكد أن جميع القطع بنفس الوزن والمواصفات والعيار"
                  />
                </div>
              ) : null}
            </div>
          </Card>

          {/* الأوزان */}
          {form.type === 'PIECE' ? (
            <Card>
              <SectionTitle
                title="الأوزان"
                description="الوزن الإجمالي يشمل الذهب والحجر والفصوص. وزن الذهب الصافي يُحسب تلقائياً."
                action={<Badge tone="info">{basisLabel(basis)}</Badge>}
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Field label="الوزن الإجمالي (غرام)" required error={errors.totalWeight}>
                  <NumberInput
                    value={form.totalWeight}
                    onChange={(v) => update('totalWeight', v)}
                    suffix="غ"
                    placeholder="0.000"
                  />
                </Field>
                <Field label="وزن الحجر (غرام)" hint="يُخصم من الوزن إذا كان مفعّلاً">
                  <NumberInput
                    value={form.stoneWeight}
                    onChange={(v) => update('stoneWeight', v)}
                    suffix="غ"
                    placeholder="0.000"
                  />
                </Field>
                <Field label="وزن الفصوص (غرام)" hint="فصوص بدون سعر خاص">
                  <NumberInput
                    value={form.inlaysWeight}
                    onChange={(v) => update('inlaysWeight', v)}
                    suffix="غ"
                    placeholder="0.000"
                  />
                </Field>
                <Field
                  label="سعر الحجر (اختياري)"
                  hint="إذا أدخلت سعراً للحجر، يُخصم وزنه دائماً ويُضاف سعره للتكلفة."
                  className="sm:col-span-1"
                >
                  <NumberInput
                    value={form.stonePrice}
                    onChange={(v) => update('stonePrice', v)}
                    suffix={currency}
                    placeholder="0.00"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <div className="flex h-full items-center justify-between rounded-xl border border-border bg-surface2/50 px-3.5">
                    <span className="text-xs font-medium text-muted">وزن الذهب الصافي</span>
                    <span className="text-lg font-semibold tabular-nums text-gold">{fmtWeight(totals.net)} غ</span>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <SectionTitle
                title="مكونات الطقم"
                description="كل مكوّن بعياره ووزنه المستقل. أسعار الغرام تُحسب حسب عيار كل مكوّن."
                action={
                  <Button
                    size="sm"
                    variant="soft"
                    icon={Plus}
                    onClick={() => setComponents((list) => [...list, newComponent(form.karat)])}
                  >
                    إضافة مكوّن
                  </Button>
                }
              />

              {errors.components ? (
                <p className="mt-3 rounded-lg bg-dangersoft px-3 py-2 text-xs font-medium text-danger">
                  {errors.components}
                </p>
              ) : null}

              {components.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-border px-4 py-10 text-center">
                  <Sparkles className="mx-auto size-7 text-muted/70" />
                  <p className="mt-2 text-[13px] font-medium text-text">لا مكونات بعد</p>
                  <p className="mt-1 text-xs text-muted">أضف خاتماً أو أسورة أو سلسلة… ليبدأ الطقم.</p>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={Plus}
                    className="mt-3"
                    onClick={() => setComponents((list) => [...list, newComponent(form.karat)])}
                  >
                    إضافة أول مكوّن
                  </Button>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {components.map((c, index) => (
                    <ComponentRow
                      key={c.key}
                      index={index}
                      draft={c}
                      karats={karats}
                      currency={currency}
                      error={errors[`c-${c.key}-weight`]}
                      onChange={(patch) => updateComponent(c.key, patch)}
                      onRemove={() => setComponents((list) => list.filter((x) => x.key !== c.key))}
                    />
                  ))}
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniStat label="الوزن الإجمالي" value={`${fmtWeight(totals.total)} غ`} />
                <MiniStat label="وزن الحجر" value={`${fmtWeight(totals.stone)} غ`} />
                <MiniStat label="وزن الفصوص" value={`${fmtWeight(totals.inlays)} غ`} />
                <MiniStat label="الذهب الصافي" value={`${fmtWeight(totals.net)} غ`} tone />
              </div>
            </Card>
          )}

          {/* الشراء — للمالك، أو للبائع إذا سمح إعداد المحل بإظهار التكلفة */}
          {canSeeCost ? (
          <Card>
            <SectionTitle
              title="بيانات الشراء من الجملة"
              description="أدخل سعر الغرام الذي اشتريت به، ثم سعر صرف يوم الشراء. يُحسب الإجمالي بالعملة المحلية تلقائياً."
              action={<Wallet className="size-4 text-muted" />}
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field
                label="سعر الغرام"
                required
                error={errors.purchaseGramPrice}
                hint={
                  purchaseCalc.weight > 0
                    ? `على وزن الذهب الصافي ${fmtWeight(purchaseCalc.weight)} غ`
                    : 'أكمل وزن الذهب الصافي أولاً'
                }
              >
                <NumberInput
                  value={form.purchaseGramPrice}
                  onChange={(v) => update('purchaseGramPrice', v)}
                  suffix={`${form.purchaseCurrency}/غ`}
                  placeholder="0.00"
                />
              </Field>
              <Field label="عملة الشراء">
                <Select value={form.purchaseCurrency} onChange={(e) => update('purchaseCurrency', e.target.value)}>
                  {[...new Set(['USD', localCurrency, 'EUR', 'GBP', 'AED', 'TND', 'EGP', 'TRY'])].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="سعر الصرف يوم الشراء"
                error={errors.purchaseFxRate}
                hint={form.purchaseCurrency === localCurrency ? 'العملة المحلية — الصرف 1' : `1 ${form.purchaseCurrency} = ؟ ${localCurrency}`}
              >
                <NumberInput
                  value={form.purchaseCurrency === localCurrency ? 1 : form.purchaseFxRate}
                  onChange={(v) => update('purchaseFxRate', v)}
                  disabled={form.purchaseCurrency === localCurrency}
                  suffix={localCurrency}
                  placeholder="0.00"
                />
              </Field>
              <Field label="حالة الشراء">
                <Select
                  value={form.purchaseStatus}
                  onChange={(e) => update('purchaseStatus', e.target.value as PurchaseStatus)}
                >
                  {(['NEW', 'USED', 'SCRAP'] as const).map((s) => (
                    <option key={s} value={s}>
                      {PURCHASE_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="تاريخ الإضافة">
                <Input
                  type="date"
                  value={form.addedAt}
                  onChange={(e) => update('addedAt', e.target.value)}
                  className="ltr-nums"
                />
              </Field>
              <div className="grid gap-2 sm:col-span-2 lg:col-span-3 sm:grid-cols-3">
                <div className="flex items-center justify-between rounded-xl border border-border bg-surface2/50 px-3.5 py-2">
                  <span className="text-xs font-medium text-muted">إجمالي القطعة</span>
                  <span className="text-sm font-semibold tabular-nums text-text">
                    {fmtMoney(purchaseCalc.unitTotal)} <span className="text-[10px] text-muted">{form.purchaseCurrency}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border bg-surface2/50 px-3.5 py-2">
                  <span className="text-xs font-medium text-muted">التكلفة بالدينار</span>
                  <span className="text-sm font-semibold tabular-nums text-text">
                    {purchaseCalc.unitCost === null ? '—' : `${fmtMoney(purchaseCalc.unitCost)} ${localCurrency}`}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[color-mix(in_oklab,var(--gold)_30%,transparent)] bg-goldsoft/50 px-3.5 py-2">
                  <span className="text-xs font-medium text-muted">
                    {purchaseCalc.quantity > 1 ? `إجمالي ${purchaseCalc.quantity} قطع` : 'الإجمالي المدفوع'}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-gold">
                    {purchaseCalc.batchCost === null ? '—' : `${fmtMoney(purchaseCalc.batchCost)} ${localCurrency}`}
                  </span>
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-muted">
              الطريقة: سعر الغرام × وزن الذهب الصافي للقطعة = الإجمالي بعملة الشراء، ثم × سعر صرف يوم الشراء = الإجمالي
              بالدينار. سعر البيع لا يُحدد هنا؛ يُحسب في شاشة البيع حسب سعر السوق وسياسة الفاتورة.
            </p>
          </Card>
          ) : null}

          {/* تفاصيل */}
          <Card>
            <SectionTitle title="تفاصيل إضافية" description="كلها اختيارية، وتظهر في صفحة الصنف." />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <LookupPicker
                label="المورّد"
                addLabel="مورّد"
                kind="SUPPLIER"
                value={form.supplierId}
                onChange={(v) => update('supplierId', v)}
                options={suppliers}
                placeholder="غير محدد"
              />
              <Field label="بلد المنشأ">
                <Select value={form.countryId} onChange={(e) => update('countryId', e.target.value)} placeholder="غير محدد">
                  {countries.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.value}
                    </option>
                  ))}
                </Select>
              </Field>
              <LookupPicker
                label="المصنّع / العلامة"
                addLabel="مصنع"
                kind="MANUFACTURER"
                value={form.manufacturerId}
                onChange={(v) => update('manufacturerId', v)}
                options={manufacturers}
                placeholder="غير محدد"
                className="sm:col-span-2"
              />
              <Field label="الوصف" className="sm:col-span-2">
                <Input
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  placeholder="وصف مختصر يظهر في البحث"
                />
              </Field>
              <Field label="ملاحظات" className="sm:col-span-2">
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => update('notes', e.target.value)}
                  className="w-full resize-y rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text transition-colors placeholder:text-muted/70 hover:border-borderstrong focus:border-gold focus:outline-none focus:ring-[3px] focus:ring-[var(--gold-glow)] disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="أي تفاصيل إضافية عن القطعة"
                />
              </Field>
            </div>
          </Card>
        </fieldset>

        {/* ملخص الشراء */}
        <aside className="order-first lg:order-none">
          <div className="space-y-3 lg:sticky lg:top-[84px]">
            {canSeeCost ? (
            <Card className="relative overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{ background: 'radial-gradient(24rem 12rem at 100% 0%, var(--gold-glow), transparent 65%)' }}
              />
              <div className="relative">
                <SectionTitle
                  title="ملخص الشراء"
                  description="تكلفة القطعة كما اشتريتها اليوم — بدون سعر بيع."
                  action={<Badge tone="gold">{form.type === 'SET' ? 'طقم' : 'قطعة'}</Badge>}
                />
                <div className="mt-4 space-y-2 text-[12px]">
                  <SummaryLine label="وزن الذهب الصافي" value={`${fmtWeight(purchaseCalc.weight)} غ`} />
                  <SummaryLine
                    label="سعر الغرام"
                    value={`${fmtMoney(purchaseCalc.gramPrice)} ${form.purchaseCurrency}`}
                  />
                  <SummaryLine
                    label="إجمالي القطعة"
                    value={`${fmtMoney(purchaseCalc.unitTotal)} ${form.purchaseCurrency}`}
                  />
                  <SummaryLine
                    label="سعر صرف يوم الشراء"
                    value={form.purchaseCurrency === localCurrency ? '1' : fmtMoney(purchaseCalc.rate)}
                  />
                </div>

                <div className="mt-3 flex items-end justify-between rounded-xl bg-goldsoft/70 px-3 py-3">
                  <span className="text-[12px] font-semibold text-text">تكلفة القطعة بالدينار</span>
                  <span className="text-xl font-bold tabular-nums text-gold">
                    {purchaseCalc.unitCost === null ? '—' : fmtMoney(purchaseCalc.unitCost)}
                    <span className="ms-1 text-[10px] font-medium text-muted">{localCurrency}</span>
                  </span>
                </div>

                {purchaseCalc.quantity > 1 ? (
                  <div className="mt-2 flex items-center justify-between rounded-xl border border-border bg-surface2/50 px-3 py-2 text-[11px]">
                    <span className="text-muted">إجمالي {fmtNum(purchaseCalc.quantity)} قطع</span>
                    <span className="font-semibold tabular-nums text-text">
                      {purchaseCalc.batchCost === null ? '—' : fmtMoney(purchaseCalc.batchCost)} {localCurrency}
                    </span>
                  </div>
                ) : null}
              </div>
            </Card>
            ) : null}

            <Card className="bg-surface2/40">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold text-text [&::-webkit-details-marker]:hidden">
                  <Tag className="size-3.5 text-gold" /> أين سعر البيع؟
                </summary>
                <p className="mt-2 text-[11px] leading-5 text-muted">
                  سعر البيع لا يُحسب في شاشة الشراء لأن سعر الأونصة وسعر الصرف يتغيران. عند البيع يُحسب السعر المقترح من
                  سعر السوق لحظة البيع، وتختار سياسة الربح والتقريب وطريقة الدفع (نقدي أو صك مصدق) في نفس الفاتورة.
                </p>
              </details>
            </Card>
          </div>
        </aside>
      </form>

      {/* شريط حفظ للموبايل */}
      {!readOnly ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              {canSeeCost ? (
                <>
                  <p className="text-[10px] text-muted">تكلفة الشراء</p>
                  <p className="truncate text-sm font-semibold tabular-nums text-gold">
                    {purchaseCalc.unitCost === null ? 'أكمل البيانات' : `${fmtMoney(purchaseCalc.unitCost)} ${localCurrency}`}
                  </p>
                </>
              ) : (
                <p className="truncate text-[11px] text-muted">{form.name.trim() || 'صنف جديد'}</p>
              )}
            </div>
            <Button variant="primary" icon={Save} loading={save.isPending} onClick={submit}>
              {isEdit ? 'حفظ' : 'حفظ الصنف'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ═══════════════════════ اختيار من قائمة + إضافة سريعة ═══════════════════════ */

function LookupPicker({
  label,
  addLabel,
  kind,
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  label: string;
  addLabel: string;
  kind: 'SUPPLIER' | 'MANUFACTURER';
  value: string;
  onChange: (value: string) => void;
  options: Lookup[];
  placeholder?: string;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const create = useMutation({
    mutationFn: (newValue: string) => api.post<Lookup>('/lookups', { kind, value: newValue }),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ['lookups'] });
      onChange(String(row.id));
      setDraft('');
      setOpen(false);
      toast.success(`تمت إضافة ${addLabel} «${row.value}»`);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : `تعذر إضافة ${addLabel}`),
  });

  return (
    <Field
      label={label}
      className={className}
      hint={open ? undefined : `اختر من القائمة أو أضف ${addLabel} جديداً`}
    >
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Select value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.value}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          variant="soft"
          size="icon"
          aria-label={`إضافة ${addLabel} جديد`}
          title={`إضافة ${addLabel} جديد`}
          onClick={() => setOpen((v) => !v)}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {open ? (
        <div className="mt-2 flex gap-2">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`اسم ${addLabel} الجديد`}
            maxLength={120}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (draft.trim() && !create.isPending) create.mutate(draft.trim());
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="primary"
            loading={create.isPending}
            disabled={!draft.trim()}
            onClick={() => create.mutate(draft.trim())}
          >
            إضافة
          </Button>
        </div>
      ) : null}
    </Field>
  );
}

/* ═══════════════════════ مكوّن الطقم ═══════════════════════ */

function ComponentRow({
  index,
  draft,
  karats,
  currency,
  error,
  onChange,
  onRemove,
}: {
  index: number;
  draft: ComponentDraft;
  karats: number[];
  currency: string;
  error?: string;
  onChange: (patch: Partial<ComponentDraft>) => void;
  onRemove: () => void;
}) {
  const net = num(draft.weight) - num(draft.stoneWeight) - num(draft.inlaysWeight);

  return (
    <div className="rounded-xl border border-border bg-surface2/35 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[12px] font-semibold text-text">
          <span className="grid size-5 place-items-center rounded-md bg-goldsoft text-[10px] font-bold text-gold">
            {index + 1}
          </span>
          {COMPONENT_KIND_LABEL[draft.kind]}
          {net > 0 ? <span className="font-normal text-muted">· صافي {fmtWeight(net)} غ</span> : null}
        </p>
        <Button variant="ghost" size="icon" aria-label="حذف المكوّن" className="text-danger hover:bg-dangersoft" onClick={onRemove}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="النوع">
          <Select value={draft.kind} onChange={(e) => onChange({ kind: e.target.value as ComponentKind })}>
            {COMPONENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {COMPONENT_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="العيار">
          <Select value={String(draft.karat)} onChange={(e) => onChange({ karat: Number(e.target.value) })}>
            {karats.map((k) => (
              <option key={k} value={k}>
                عيار {k}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="الاسم (اختياري)">
          <Input value={draft.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="خاتم كبير" />
        </Field>
        <Field label="الوزن الإجمالي" required error={error}>
          <NumberInput value={draft.weight} onChange={(v) => onChange({ weight: v })} suffix="غ" placeholder="0.000" />
        </Field>
        <Field label="وزن الحجر">
          <NumberInput value={draft.stoneWeight} onChange={(v) => onChange({ stoneWeight: v })} suffix="غ" placeholder="0" />
        </Field>
        <Field label="وزن الفصوص">
          <NumberInput value={draft.inlaysWeight} onChange={(v) => onChange({ inlaysWeight: v })} suffix="غ" placeholder="0" />
        </Field>
        <Field label="سعر الحجر (اختياري)">
          <NumberInput value={draft.stonePrice} onChange={(v) => onChange({ stonePrice: v })} suffix={currency} placeholder="0" />
        </Field>
        <Field label="ملاحظات" className="col-span-2 sm:col-span-1">
          <Input value={draft.notes} onChange={(e) => onChange({ notes: e.target.value })} placeholder="ملاحظة قصيرة" />
        </Field>
      </div>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className="font-medium tabular-nums text-text">{value}</span>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: boolean }) {
  return (
    <div className={'rounded-lg border px-2 py-1.5 ' + (tone ? 'border-[color-mix(in_oklab,var(--gold)_30%,transparent)] bg-goldsoft/50' : 'border-border bg-surface2/40')}>
      <p className="text-[9px] text-muted">{label}</p>
      <p className={'mt-0.5 text-[11px] font-semibold tabular-nums ' + (tone ? 'text-gold' : 'text-text')}>{value}</p>
    </div>
  );
}

function basisLabel(basis: string): string {
  const map: Record<string, string> = {
    NET_GOLD: 'احتساب الذهب الصافي',
    TOTAL: 'احتساب الوزن الإجمالي',
    MINUS_STONE: 'خصم الحجر فقط',
    MINUS_INLAYS: 'خصم الفصوص فقط',
  };
  return map[basis] ?? basis;
}
