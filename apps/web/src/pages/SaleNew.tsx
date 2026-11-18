import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  Minus,
  Plus,
  Printer,
  Receipt as ReceiptIcon,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  TriangleAlert,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { buildPriceTable } from '@gold/pricing';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDebounced } from '../lib/use-debounced';
import { fmtMoney, fmtNum, fmtWeight, PROFIT_MODE_LABEL, timeAgo } from '../lib/format';
import type {
  FixedBasis,
  Item,
  Lookup,
  Paged,
  PriceTableView,
  ProfitMode,
  Sale,
  SaleFxMode,
  Setting,
} from '../lib/types';
import { basisFromSettings, buildItemPreview } from '../lib/pricing-preview';
import { useToast } from '../components/ui/toast';
import { Receipt } from '../components/Receipt';
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
} from '../components/ui/primitives';
import { ConfirmDialog } from '../components/ui/overlay';

interface CartLine {
  item: Item;
  quantity: number;
  unitPrice: number | '';
  /** هل السعر الحالي مأخوذ من الاقتراح؟ عندها يتحدّث تلقائياً مع تغيير السياسة أو الصرف */
  autoPrice: boolean;
}

type RoundingStep = 0 | 5 | 10;

function valueOf(value: number | ''): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export default function SaleNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user, isOwner } = useAuth();

  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [review, setReview] = useState(false);
  const [created, setCreated] = useState<Sale | null>(null);
  const [error, setError] = useState<string | null>(null);

  // سياسة هذه الفاتورة — تُهيأ من الإعدادات ثم تُعدّل بحرية قبل البيع
  const [profitMode, setProfitMode] = useState<ProfitMode>('PERCENT');
  const [profitValue, setProfitValue] = useState<number | ''>(5);
  const [fixedBasis, setFixedBasis] = useState<FixedBasis>('PIECE');
  const [roundingStep, setRoundingStep] = useState<RoundingStep>(0);
  const [fxMode, setFxMode] = useState<SaleFxMode>('CASH');
  const [cashFx, setCashFx] = useState<number | ''>('');
  const [chequeFx, setChequeFx] = useState<number | ''>('');
  const defaultsApplied = useRef(false);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Setting>('/settings'),
    staleTime: 5 * 60_000,
  });

  const { data: priceView } = useQuery({
    queryKey: ['prices', 'table'],
    queryFn: () => api.get<PriceTableView>('/prices/table'),
  });

  const { data: paymentMethods } = useQuery({
    queryKey: ['lookups', 'PAYMENT_METHOD'],
    queryFn: () => api.get<Lookup[]>('/lookups?kind=PAYMENT_METHOD'),
    staleTime: 5 * 60_000,
  });

  const { data: results, isLoading: loadingItems } = useQuery({
    queryKey: ['items', 'sale-search', q],
    queryFn: () =>
      api.get<Paged<Item>>(`/items?status=AVAILABLE&pageSize=12${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  });

  const currency = settings?.currency ?? 'LYD';
  const shopName = settings?.shopName ?? 'محل الذهب';
  const ounce = priceView?.current.ounce?.value ?? 0;
  const marketFx = priceView?.current.fx?.value ?? 0;
  const activeFx = fxMode === 'CHEQUE' ? valueOf(chequeFx) : valueOf(cashFx);
  const pricesReady = Boolean(priceView?.ready) && ounce > 0 && activeFx > 0;
  const showCost = isOwner || settings?.showCostToSeller === true;

  const basis = settings
    ? basisFromSettings(settings.deductStone, settings.deductInlays)
    : ('NET_GOLD' as const);

  /* افتراضيات الإعدادات تُطبَّق مرة واحدة، وبعدها كل تغيير يخص هذه الفاتورة فقط */
  useEffect(() => {
    if (!settings || defaultsApplied.current) return;
    defaultsApplied.current = true;
    setProfitMode(settings.profitMode);
    setProfitValue(settings.profitValue);
    setFixedBasis(settings.fixedBasis ?? 'PIECE');
    setRoundingStep(
      settings.roundingStep === 5 || settings.roundingStep === 10 ? settings.roundingStep : 0,
    );
    setCart((list) =>
      list.map((line) => {
        if (!line.autoPrice) return line;
        if (settings.profitMode === 'MANUAL') return { ...line, unitPrice: '', autoPrice: false };
        const suggested = suggestWith(
          line.item,
          settings.profitMode,
          settings.profitValue,
          settings.roundingStep,
          marketFx > 0 ? marketFx : activeFx,
          settings.fixedBasis ?? 'PIECE',
        );
        return suggested === null ? line : { ...line, unitPrice: suggested };
      }),
    );
  }, [settings]);

  /* سعر الصرف الافتراضي = سعر السوق الحالي، مع إمكانية تعديل الكاش والصك لكل فاتورة */
  useEffect(() => {
    const rate = priceView?.current.fx?.value;
    if (!rate || rate <= 0) return;
    setCashFx((prev) => (valueOf(prev) > 0 ? prev : rate));
    setChequeFx((prev) => (valueOf(prev) > 0 ? prev : rate));
  }, [priceView?.current.fx?.value]);

  /* اختيار «صك» كطريقة دفع يبدّل تلقائياً إلى سعر صرف الصك */
  function choosePaymentMethod(id: string) {
    setPaymentMethodId(id);
    const method = paymentMethods?.find((p) => String(p.id) === id);
    if (method && method.value.includes('صك') && fxMode !== 'CHEQUE') {
      applyContext({ fxMode: 'CHEQUE' });
    }
  }

  /** السعر المقترح حسب سياسة هذه الفاتورة وسعر الصرف المختار */
  function suggestWith(
    item: Item,
    mode: ProfitMode,
    value: number,
    rounding: number,
    fxRate: number,
    fixed: FixedBasis,
  ): number | null {
    if (!settings || mode === 'MANUAL' || !(ounce > 0) || !(fxRate > 0)) return null;
    const res = buildItemPreview(
      {
        type: item.type,
        karat: item.karat,
        totalWeight: Number(item.totalWeight),
        stoneWeight: Number(item.stoneWeight),
        stonePrice: item.stonePrice === null ? null : Number(item.stonePrice),
        inlaysWeight: Number(item.inlaysWeight),
        components: (item.components ?? []).map((c) => ({
          karat: c.karat,
          weight: Number(c.weight),
          stoneWeight: Number(c.stoneWeight),
          stonePrice: c.stonePrice === null ? null : Number(c.stonePrice),
          inlaysWeight: Number(c.inlaysWeight),
        })),
      },
      ounce,
      fxRate,
      basis,
      mode,
      value,
      rounding,
      showCost ? Number(item.purchaseCostDinar) : null,
      fixed,
    );
    return res ? res.finalPrice : null;
  }

  function suggestFor(item: Item): number | null {
    return suggestWith(item, profitMode, valueOf(profitValue), roundingStep, activeFx, fixedBasis);
  }

  /** تغيير السياسة أو سعر الصرف يحدّث الأسعار التي كانت مأخوذة من «المقترح» فقط */
  function applyContext(next: {
    mode?: ProfitMode;
    value?: number | '';
    rounding?: RoundingStep;
    fxMode?: SaleFxMode;
    cash?: number | '';
    cheque?: number | '';
    basis?: FixedBasis;
  }) {
    const nextMode = next.mode ?? profitMode;
    const nextValue = next.value ?? profitValue;
    const nextRounding = next.rounding ?? roundingStep;
    const nextFxMode = next.fxMode ?? fxMode;
    const nextCash = next.cash ?? cashFx;
    const nextCheque = next.cheque ?? chequeFx;
    const nextFixedBasis = next.basis ?? fixedBasis;
    const fxForCalc = nextFxMode === 'CHEQUE' ? valueOf(nextCheque) : valueOf(nextCash);

    setCart((list) =>
      list.map((line) => {
        const newSuggested = suggestWith(
          line.item,
          nextMode,
          valueOf(nextValue),
          nextRounding,
          fxForCalc,
          nextFixedBasis,
        );

        if (line.autoPrice) {
          const nextPrice = nextMode === 'MANUAL' ? '' : (newSuggested ?? '');
          return { ...line, unitPrice: nextPrice, autoPrice: nextPrice !== '' };
        }
        if (line.unitPrice === '' && newSuggested !== null) {
          return { ...line, unitPrice: newSuggested, autoPrice: true };
        }
        return line;
      }),
    );

    setProfitMode(nextMode);
    setProfitValue(nextValue);
    setFixedBasis(nextFixedBasis);
    setRoundingStep(nextRounding);
    setFxMode(nextFxMode);
    setCashFx(nextCash);
    setChequeFx(nextFxMode === 'CHEQUE' && valueOf(nextCheque) <= 0 ? nextCash : nextCheque);
  }

  const gramForKarat = useMemo(() => {
    const map = new Map<number, number>();
    if (!(ounce > 0) || !(activeFx > 0)) return map;
    const karats = priceView?.table?.rows.map((row) => row.karat) ?? [];
    try {
      const table = buildPriceTable(ounce, activeFx, karats.length > 0 ? karats : [18, 21, 24]);
      for (const row of table.rows) map.set(row.karat, row.pricePerGram);
    } catch {
      // أسعار غير صالحة — تبقى الخريطة فارغة
    }
    return map;
  }, [ounce, activeFx, priceView]);

  const cartUnits = cart.reduce((sum, l) => sum + l.quantity, 0);
  const cartWeight = cart.reduce((sum, l) => sum + Number(l.item.totalWeight) * l.quantity, 0);
  const total = Math.round(cart.reduce((sum, l) => sum + (Number(l.unitPrice) || 0) * l.quantity, 0) * 100) / 100;
  const purchaseTotal =
    Math.round(cart.reduce((sum, l) => sum + Number(l.item.purchaseCostDinar) * l.quantity, 0) * 100) / 100;
  const missingPrices = cart.filter((l) => l.unitPrice === '' || Number(l.unitPrice) <= 0).length;

  function addItem(item: Item) {
    if (item.quantity <= 0) {
      toast.info('هذا الصنف غير متوفر في المخزون');
      return;
    }
    setCart((list) => {
      const found = list.find((l) => l.item.id === item.id);
      if (found) {
        if (found.quantity >= item.quantity) {
          toast.info(`الكمية المتاحة من ${item.code} هي ${item.quantity} فقط`);
          return list;
        }
        return list.map((l) => (l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      const suggested = suggestFor(item);
      return [...list, { item, quantity: 1, unitPrice: suggested ?? '', autoPrice: suggested !== null }];
    });
    setSearch('');
    setError(null);
  }

  function setQuantity(id: number, next: number) {
    setCart((list) =>
      list.map((l) => {
        if (l.item.id !== id) return l;
        const value = Math.max(1, Math.min(next, l.item.quantity));
        return { ...l, quantity: value };
      }),
    );
  }

  function setPrice(id: number, value: number | '', autoPrice = false) {
    setCart((list) => list.map((l) => (l.item.id === id ? { ...l, unitPrice: value, autoPrice } : l)));
  }

  const createSale = useMutation({
    mutationFn: () =>
      api.post<Sale>('/sales', {
        items: cart.map((l) => ({
          itemId: l.item.id,
          quantity: l.quantity,
          unitPrice: Number(l.unitPrice) || 0,
        })),
        paymentMethodId: paymentMethodId ? Number(paymentMethodId) : null,
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        profitMode,
        profitValue: profitMode === 'MANUAL' ? 0 : valueOf(profitValue),
        fixedBasis,
        roundingStep,
        fxMode,
        fxRate: activeFx > 0 ? activeFx : null,
      }),
    onSuccess: async (sale) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['items'] }),
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
      setReview(false);
      setCreated(sale);
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setPaymentMethodId('');
      setError(null);
      defaultsApplied.current = Boolean(settings);
      setProfitMode(settings?.profitMode ?? 'PERCENT');
      setProfitValue(settings?.profitValue ?? 5);
      setFixedBasis(settings?.fixedBasis ?? 'PIECE');
      setRoundingStep(
        settings?.roundingStep === 5 || settings?.roundingStep === 10 ? settings.roundingStep : 0,
      );
      setCashFx(marketFx > 0 ? marketFx : '');
      setChequeFx(marketFx > 0 ? marketFx : '');
      setFxMode('CASH');
      toast.success(`تم إصدار الفاتورة ${sale.invoiceNo}`);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'تعذر إتمام البيع';
      setError(message);
      setReview(false);
      toast.error(message);
    },
  });

  function resetSale() {
    setCreated(null);
    setSearch('');
    setError(null);
  }

  useEffect(() => {
    if (!created) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [created]);

  /* ═══════════ شاشة النجاح والطباعة ═══════════ */
  if (created) {
    return (
      <div className="space-y-4">
        <div className="no-print">
          <PageHeader
            title="تم إتمام البيع"
            subtitle={`الفاتورة ${created.invoiceNo} محفوظة، ويمكنك طباعة الإيصال الآن.`}
            actions={
              <>
                <Button variant="secondary" icon={ArrowRight} onClick={() => navigate('/sales')}>
                  قائمة المبيعات
                </Button>
                <Button variant="secondary" icon={RefreshCw} onClick={resetSale}>
                  بيع جديد
                </Button>
                <Button variant="primary" icon={Printer} onClick={() => window.print()}>
                  طباعة الإيصال
                </Button>
              </>
            }
          />

          <Card className="mt-4 border-[color-mix(in_oklab,var(--success)_32%,transparent)] bg-successsoft/70">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-success/10 text-success">
                <CheckCircle2 className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text">
                  {created.invoiceNo} · {fmtMoney(created.total)} {currency}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {fmtNum(created.items.reduce((s, l) => s + l.quantity, 0))} قطعة ·{' '}
                  {created.paymentMethod?.value ?? 'دفع غير محدد'} ·{' '}
                  {new Date(created.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <Link
                to={`/sales/${created.id}`}
                className="text-xs font-semibold text-gold hover:underline"
              >
                عرض الفاتورة كاملة
              </Link>
            </div>
          </Card>
        </div>

        <div className="pt-2">
          <Receipt sale={created} shopName={shopName} currency={currency} />
        </div>
      </div>
    );
  }

  /* ═══════════ شاشة البيع ═══════════ */
  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        title="بيع جديد"
        subtitle="ابحث عن الصنف بالكود أو الاسم، أضفه للسلة، ثم أكّد الفاتورة."
        actions={
          <Button variant="secondary" icon={ArrowRight} onClick={() => navigate('/sales')}>
            رجوع للمبيعات
          </Button>
        }
      />

      <StepStrip hasItems={cart.length > 0} total={total} />

      {!pricesReady ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--warning)_32%,transparent)] bg-warningsoft px-3.5 py-2.5 text-xs text-text">
          <TriangleAlert className="size-4 text-warning" />
          <span className="font-semibold">أسعار الذهب غير جاهزة</span>
          <span className="text-muted">يمكنك البيع بسعر يدوي، لكن الأسعار المقترحة لن تظهر.</span>
          <Link to="/prices" className="ms-auto font-semibold text-gold hover:underline">
            إدخال الأسعار
          </Link>
        </div>
      ) : priceView?.current.stale ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--warning)_30%,transparent)] bg-warningsoft/70 px-3.5 py-2.5 text-xs text-text">
          <TriangleAlert className="size-4 text-warning" />
          <span className="font-medium">آخر تحديث للسعر {timeAgo(priceView.current.ounce?.at)}</span>
          <span className="text-muted">تحقق من السعر قبل اعتماد الأسعار المقترحة.</span>
          <Link to="/prices" className="ms-auto font-semibold text-gold hover:underline">
            تحديث
          </Link>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-dangersoft px-3.5 py-2.5 text-[13px] font-medium text-danger">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {/* البحث */}
          <Card className="p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="امسح كود الصنف أو اكتب اسمه…"
                className="h-11 ps-9 pe-9"
                autoFocus
                aria-label="بحث عن صنف"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && results?.rows.length === 1) {
                    const only = results.rows[0];
                    if (!only) return;
                    e.preventDefault();
                    addItem(only);
                  }
                }}
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted hover:text-text"
                  aria-label="مسح البحث"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-muted">
              {q ? `نتائج البحث عن «${q}»` : 'الأصناف المتاحة حديثاً — اضغط لإضافتها للسلة'}
            </p>

            {loadingItems ? (
              <div className="mt-2 space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : (results?.rows.length ?? 0) === 0 ? (
              <div className="mt-2 rounded-xl border border-dashed border-border px-4 py-8 text-center">
                <Search className="mx-auto size-5 text-muted/70" />
                <p className="mt-2 text-[13px] font-medium text-text">لا أصناف متاحة مطابقة</p>
                <p className="mt-1 text-[11px] text-muted">جرّب كوداً آخر أو اسم قطعة مختلفاً.</p>
              </div>
            ) : (
              <ul className="mt-2 max-h-[340px] divide-y divide-border overflow-y-auto scroll-thin rounded-xl border border-border">
                {(results?.rows ?? []).map((item) => {
                  const suggested = suggestFor(item);
                  const inCart = cart.find((l) => l.item.id === item.id);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => addItem(item)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors hover:bg-surface2/70"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-goldsoft text-[10px] font-bold text-gold">
                          {item.karat}K
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-medium text-text">{item.name}</span>
                            {item.type === 'SET' ? <Badge tone="gold">طقم</Badge> : null}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-muted">
                            <span className="font-mono text-gold">{item.code}</span>
                            <span>{fmtWeight(item.totalWeight)} غ</span>
                            <span>متاح {item.quantity}</span>
                            {inCart ? <span className="font-semibold text-gold">في السلة ×{inCart.quantity}</span> : null}
                          </span>
                        </span>
                        <span className="shrink-0 text-end">
                          <span className="block text-[12px] font-semibold tabular-nums text-text">
                            {suggested !== null ? fmtMoney(suggested) : '—'}
                          </span>
                          <span className="block text-[9px] text-muted">مقترح</span>
                        </span>
                        <Plus className="size-4 shrink-0 text-gold" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* السلة */}
          <Card className="p-0">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <SectionTitle
                title={
                  <span className="flex items-center gap-2">
                    <ShoppingCart className="size-4 text-gold" />
                    سلة البيع
                    {cart.length > 0 ? <Badge tone="gold">{fmtNum(cartUnits)} قطعة</Badge> : null}
                  </span>
                }
              />
              {cart.length > 0 ? (
                <Button variant="ghost" size="sm" className="text-danger hover:bg-dangersoft" onClick={() => setCart([])}>
                  <Trash2 className="size-3.5" />
                  إفراغ السلة
                </Button>
              ) : null}
            </div>

            {cart.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                title="السلة فارغة"
                description="ابحث عن قطعة من الأعلى وأضفها، وستظهر تفاصيلها وسعرها هنا."
              />
            ) : (
              <ul className="divide-y divide-border">
                {cart.map((line) => {
                  const suggested = suggestFor(line.item);
                  const unit = Number(line.unitPrice) || 0;
                  const lineTotal = Math.round(unit * line.quantity * 100) / 100;
                  const purchaseUnit = Number(line.item.purchaseCostDinar) || 0;
                  const linePurchaseCost = Math.round(purchaseUnit * line.quantity * 100) / 100;
                  const setPieces =
                    (line.item.components ?? []).filter((c) => Number(c.weight) > 0).length || 1;
                  const belowSuggested = suggested !== null && unit > 0 && unit < suggested;
                  return (
                    <li key={line.item.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-goldsoft text-[10px] font-bold text-gold">
                          {line.item.karat}K
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-[13px] font-semibold text-text">{line.item.name}</p>
                            {line.item.type === 'SET' ? <Badge tone="gold">طقم</Badge> : null}
                          </div>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[10px] text-muted">
                            <span className="font-mono text-gold">{line.item.code}</span>
                            <span>{fmtWeight(line.item.totalWeight)} غ</span>
                            <span>سعر الغرام {gramForKarat.has(line.item.karat) ? `${fmtMoney(gramForKarat.get(line.item.karat))} ${currency}` : '—'}</span>
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-danger hover:bg-dangersoft"
                          aria-label="إزالة من السلة"
                          onClick={() => setCart((list) => list.filter((l) => l.item.id !== line.item.id))}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-end gap-2 ps-12">
                        <Field label="الكمية" className="w-[104px]">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="secondary"
                              size="icon"
                              aria-label="تقليل الكمية"
                              disabled={line.quantity <= 1}
                              onClick={() => setQuantity(line.item.id, line.quantity - 1)}
                            >
                              <Minus className="size-3.5" />
                            </Button>
                            <span className="min-w-7 text-center text-[13px] font-semibold tabular-nums text-text">
                              {line.quantity}
                            </span>
                            <Button
                              variant="secondary"
                              size="icon"
                              aria-label="زيادة الكمية"
                              disabled={line.quantity >= line.item.quantity}
                              onClick={() => setQuantity(line.item.id, line.quantity + 1)}
                            >
                              <Plus className="size-3.5" />
                            </Button>
                          </div>
                        </Field>

                        <Field
                          label={`سعر البيع (${currency})`}
                          className="min-w-[150px] flex-1"
                          hint={
                            suggested !== null
                              ? `المقترح: ${fmtMoney(suggested)}${belowSuggested ? ' — أقل من المقترح' : ''}`
                              : 'أدخل السعر يدوياً'
                          }
                        >
                          <div className="flex gap-1.5">
                            <NumberInput
                              value={line.unitPrice}
                              onChange={(v) => setPrice(line.item.id, v)}
                              placeholder={suggested !== null ? String(suggested) : '0.00'}
                              className="h-9"
                            />
                            {suggested !== null ? (
                              <Button
                                variant="soft"
                                size="sm"
                                className="h-9 shrink-0"
                                onClick={() => setPrice(line.item.id, suggested, true)}
                                title="استخدام السعر المقترح"
                              >
                                المقترح
                              </Button>
                            ) : null}
                          </div>
                        </Field>

                        <div className="ms-auto text-end">
                          <p className="text-[10px] text-muted">إجمالي سعر البيع</p>
                          <p className="text-[15px] font-semibold tabular-nums text-text">
                            {fmtMoney(lineTotal)} <span className="text-[9px] font-medium text-muted">{currency}</span>
                          </p>
                        </div>
                      </div>

                      {showCost ? (
                        <div className="mt-2.5 rounded-xl border border-border bg-surface2/40 px-3 py-2 text-[11px]">
                          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="text-muted">
                                سعر الشراء:{' '}
                                <span className="font-semibold tabular-nums text-text">
                                  {fmtMoney(purchaseUnit)} {currency}
                                </span>
                                <span className="text-muted"> / وحدة</span>
                              </span>
                              <span className="text-muted">
                                تكلفة الشراء:{' '}
                                <span className="font-semibold tabular-nums text-text">
                                  {fmtMoney(linePurchaseCost)} {currency}
                                </span>
                              </span>
                            </div>
                            <span className="flex items-center gap-1.5">
                              <span className="text-muted">الربح/الخسارة:</span>
                              <ProfitDelta
                                saleTotal={lineTotal}
                                purchaseCost={linePurchaseCost}
                                currency={currency}
                              />
                            </span>
                          </div>
                          {line.item.type === 'SET' ? (
                            <p className="mt-1 text-[10px] text-muted">
                              عدد القطع في الطقم: {fmtNum(setPieces)}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        {/* الملخص */}
        <aside className="lg:sticky lg:top-[84px] lg:self-start">
          <div className="space-y-3">
            {/* سياسة هذه الفاتورة */}
            <Card>
              <SectionTitle
                title="سياسة الربح والتقريب"
                description="تُطبَّق على هذه الفاتورة فقط، ولا تغيّر افتراضيات المحل."
                action={
                  <Badge tone="gold">
                    {PROFIT_MODE_LABEL[profitMode]}
                    {profitMode === 'FIXED'
                      ? ` · ${fixedBasis === 'GRAM' ? 'لكل غرام' : 'لكل قطعة'}`
                      : ''}
                  </Badge>
                }
              />
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="طريقة الربح">
                    <Select
                      value={profitMode}
                      onChange={(e) => applyContext({ mode: e.target.value as ProfitMode })}
                    >
                      {(['PERCENT', 'FIXED', 'MANUAL'] as const).map((m) => (
                        <option key={m} value={m}>
                          {PROFIT_MODE_LABEL[m]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {profitMode === 'MANUAL' ? (
                    <Field label="الربح">
                      <div className="flex h-[38px] items-center rounded-xl border border-dashed border-border px-3 text-[10px] leading-4 text-muted">
                        تُدخل أسعار البيع يدوياً لكل قطعة
                      </div>
                    </Field>
                  ) : (
                    <Field
                      label={
                        profitMode === 'PERCENT'
                          ? 'نسبة الربح'
                          : fixedBasis === 'GRAM'
                            ? `الربح لكل غرام (${currency})`
                            : `الربح لكل قطعة (${currency})`
                      }
                    >
                      <NumberInput
                        value={profitValue}
                        onChange={(v) => applyContext({ value: v })}
                        suffix={profitMode === 'PERCENT' ? '%' : undefined}
                        placeholder="0"
                      />
                    </Field>
                  )}
                </div>

                {profitMode === 'FIXED' ? (
                  <Field label="أساس الربح الثابت" hint="يُحسب الربح المبلغ لكل غرام أو لكل قطعة حسب اختيارك.">
                    <div className="grid grid-cols-2 gap-1.5">
                      {(['GRAM', 'PIECE'] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={fixedBasis === option}
                          onClick={() => applyContext({ basis: option })}
                          className={
                            'rounded-xl border px-2 py-1.5 text-[11px] font-medium transition-colors ' +
                            (fixedBasis === option
                              ? 'border-gold bg-goldsoft text-gold'
                              : 'border-border bg-surface text-muted hover:text-text')
                          }
                        >
                          {option === 'GRAM' ? 'لكل غرام' : 'لكل قطعة'}
                        </button>
                      ))}
                    </div>
                  </Field>
                ) : null}

                <Field label="تقريب السعر النهائي">
                  <div className="grid grid-cols-3 gap-1.5">
                    {([0, 5, 10] as const).map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => applyContext({ rounding: step })}
                        className={
                          'rounded-xl border px-2 py-1.5 text-[11px] font-medium transition-colors ' +
                          (roundingStep === step
                            ? 'border-gold bg-goldsoft text-gold'
                            : 'border-border bg-surface text-muted hover:text-text')
                        }
                      >
                        {step === 0 ? 'بدون' : `أقرب ${step}`}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field
                  label="سعر الصرف المستعمل"
                  hint={`سعر السوق الآن ${fmtMoney(marketFx)} ${currency}`}
                >
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['CASH', 'CHEQUE'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => applyContext({ fxMode: mode })}
                        className={
                          'rounded-xl border px-2 py-1.5 text-[11px] font-medium transition-colors ' +
                          (fxMode === mode
                            ? 'border-gold bg-goldsoft text-gold'
                            : 'border-border bg-surface text-muted hover:text-text')
                        }
                      >
                        {mode === 'CASH' ? 'نقدي' : 'صك مصدق'}
                      </button>
                    ))}
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-2">
                  <Field label="صرف النقدي">
                    <NumberInput
                      value={cashFx}
                      onChange={(v) => applyContext({ cash: v, fxMode: 'CASH' })}
                      suffix={currency}
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label="صرف الصك المصدق">
                    <NumberInput
                      value={chequeFx}
                      onChange={(v) => applyContext({ cheque: v, fxMode: 'CHEQUE' })}
                      suffix={currency}
                      placeholder="0.00"
                    />
                  </Field>
                </div>

                <p className="text-[10px] leading-4 text-muted">
                  سيُحفظ مع الفاتورة سعر صرف{' '}
                  {fxMode === 'CHEQUE' ? 'الصك المصدق' : 'النقدي'}:{' '}
                  <span className="font-semibold text-text">
                    {activeFx > 0 ? `${fmtMoney(activeFx)} ${currency}` : 'غير محدد'}
                  </span>
                </p>
              </div>
            </Card>

            <Card>
              <SectionTitle title="العميل والدفع" description="كلها اختيارية، لكنها تفيد في تتبّع الفواتير." />
              <div className="mt-3 space-y-3">
                <Field label="اسم العميل">
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="اسم العميل"
                      className="ps-9"
                    />
                  </div>
                </Field>
                <Field label="هاتف العميل">
                  <Input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="09xxxxxxxx"
                    className="ltr-nums text-start"
                    dir="ltr"
                  />
                </Field>
                <Field label="طريقة الدفع">
                  <Select
                    value={paymentMethodId}
                    onChange={(e) => choosePaymentMethod(e.target.value)}
                    placeholder="غير محددة"
                  >
                    {(paymentMethods ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.value}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </Card>

            <Card className="relative overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{ background: 'radial-gradient(22rem 12rem at 100% 0%, var(--gold-glow), transparent 65%)' }}
              />
              <div className="relative">
                <SectionTitle title="ملخص الفاتورة" action={<Wallet className="size-4 text-muted" />} />
                <div className="mt-3 space-y-1.5 text-[12px]">
                  <SummaryRow label="عدد الأصناف" value={fmtNum(cart.length)} />
                  <SummaryRow label="عدد القطع" value={fmtNum(cartUnits)} />
                  <SummaryRow label="إجمالي الوزن" value={`${fmtWeight(cartWeight)} غ`} />
                  <SummaryRow label="البائع" value={user?.name ?? '—'} />
                </div>
                {showCost ? (
                  <div className="mt-2 space-y-1.5 border-t border-border pt-2">
                    <SummaryRow label="تكلفة الشراء" value={`${fmtMoney(purchaseTotal)} ${currency}`} />
                    <SummaryRow label="إجمالي سعر البيع" value={`${fmtMoney(total)} ${currency}`} />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted">صافي الربح/الخسارة</span>
                      <ProfitDelta saleTotal={total} purchaseCost={purchaseTotal} currency={currency} />
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 flex items-end justify-between border-t border-border pt-3">
                  <span className="text-[12px] font-medium text-muted">الإجمالي</span>
                  <span className="text-[26px] font-semibold leading-none tracking-tight tabular-nums text-text">
                    {fmtMoney(total)}
                    <span className="ms-1 text-[10px] font-medium text-muted">{currency}</span>
                  </span>
                </div>

                {missingPrices > 0 ? (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-warningsoft px-2.5 py-2 text-[11px] leading-4 text-text">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                    {missingPrices} صنف بدون سعر بيع. أدخل السعر قبل التأكيد.
                  </p>
                ) : null}

                <Button
                  variant="primary"
                  size="lg"
                  className="mt-3 w-full"
                  icon={ReceiptIcon}
                  disabled={cart.length === 0 || missingPrices > 0}
                  onClick={() => setReview(true)}
                >
                  إتمام البيع
                </Button>
                <p className="mt-2 text-center text-[10px] leading-4 text-muted">
                  سيتم خصم الكميات من المخزون مباشرة بعد التأكيد.
                </p>
              </div>
            </Card>

            <Card className="bg-surface2/40">
              <p className="text-[11px] leading-5 text-muted">
                السعر المقترح يُحسب من سعر غرام العيار × وزن أساس الاحتساب + الحجر + الربح، ثم يُقرَّب حسب سياسة هذه
                الفاتورة. سعر الصرف المستعمل (نقدي أو صك) يُحفظ مع الفاتورة، ويمكنك تعديل سعر أي قطعة قبل التأكيد.
              </p>
            </Card>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={review}
        title="تأكيد إتمام البيع"
        description={`الفاتورة ستُحفظ باسم ${user?.name ?? 'البائع'} وتُخصم الكميات من المخزون.`}
        confirmLabel={createSale.isPending ? 'جارٍ الحفظ…' : 'تأكيد وإصدار الفاتورة'}
        cancelLabel="رجوع"
        tone="primary"
        loading={createSale.isPending}
        onCancel={() => setReview(false)}
        onConfirm={() => createSale.mutate()}
      >
        <div className="space-y-2.5">
          <div className="max-h-56 space-y-1.5 overflow-y-auto scroll-thin rounded-xl border border-border bg-surface2/40 p-2.5">
            {cart.map((l) => (
              <div key={l.item.id} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="min-w-0 truncate text-text">
                  {l.item.name}
                  <span className="ms-1.5 font-mono text-[10px] text-muted">×{l.quantity}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-text">
                  {fmtMoney((Number(l.unitPrice) || 0) * l.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-xl bg-goldsoft/60 px-3 py-2">
            <span className="text-[12px] font-medium text-text">الإجمالي المطلوب</span>
            <span className="text-lg font-bold tabular-nums text-gold">
              {fmtMoney(total)} <span className="text-[10px] font-medium text-muted">{currency}</span>
            </span>
          </div>
          {showCost ? (
            <div className="space-y-1.5 rounded-xl border border-border px-3 py-2 text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">تكلفة الشراء</span>
                <span className="font-semibold tabular-nums text-text">
                  {fmtMoney(purchaseTotal)} {currency}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">إجمالي سعر البيع</span>
                <span className="font-semibold tabular-nums text-text">
                  {fmtMoney(total)} {currency}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border pt-1.5">
                <span className="text-muted">صافي الربح/الخسارة</span>
                <ProfitDelta saleTotal={total} purchaseCost={purchaseTotal} currency={currency} />
              </div>
            </div>
          ) : null}
          <p className="text-[11px] leading-5 text-muted">
            طريقة الدفع: {paymentMethods?.find((p) => String(p.id) === paymentMethodId)?.value ?? 'غير محددة'}
            {customerName.trim() ? ` · العميل: ${customerName.trim()}` : ''}
          </p>
          <p className="text-[11px] leading-5 text-muted">
            الربح:{' '}
            {profitMode === 'MANUAL'
              ? 'سعر يدوي لكل قطعة'
              : `${PROFIT_MODE_LABEL[profitMode]} ${fmtMoney(valueOf(profitValue))}${
                  profitMode === 'PERCENT' ? '%' : ` ${currency}`
                }${profitMode === 'FIXED' ? ` · ${fixedBasis === 'GRAM' ? 'لكل غرام' : 'لكل قطعة'}` : ''}`}
            {' · '}التقريب: {roundingStep === 0 ? 'بدون' : `أقرب ${roundingStep}`}
            {' · '}الصرف: {fxMode === 'CHEQUE' ? 'صك مصدق' : 'نقدي'}{' '}
            {activeFx > 0 ? fmtMoney(activeFx) : '—'}
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}

/* ═══════════════════════ عناصر مساعدة ═══════════════════════ */

function StepStrip({ hasItems, total }: { hasItems: boolean; total: number }) {
  const steps = [
    { label: 'اختيار الأصناف', done: hasItems },
    { label: 'العميل والدفع', done: hasItems },
    { label: 'التأكيد والفاتورة', done: false },
  ];
  return (
    <div className="card flex items-center gap-1 overflow-x-auto p-2 scroll-thin">
      {steps.map((step, index) => (
        <div key={step.label} className="flex min-w-0 flex-1 items-center gap-2 px-2">
          <span
            className={
              'grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ' +
              (step.done ? 'bg-gold text-[#1b1505]' : 'bg-surface2 text-muted')
            }
          >
            {step.done ? <CheckCircle2 className="size-3.5" /> : index + 1}
          </span>
          <span className={'truncate text-[11px] font-medium ' + (step.done ? 'text-text' : 'text-muted')}>
            {step.label}
          </span>
          {index < steps.length - 1 ? <span className="mx-1 hidden h-px flex-1 bg-border sm:block" /> : null}
        </div>
      ))}
      <div className="ms-auto hidden shrink-0 rounded-lg bg-goldsoft/60 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-gold sm:block">
        {fmtMoney(total)}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="font-medium tabular-nums text-text">{value}</span>
    </div>
  );
}

const percentFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

/** ربح/خسارة مبلغ البيع مقابل تكلفة الشراء — تُعرض فقط لمن يملك صلاحية التكلفة */
function ProfitDelta({
  saleTotal,
  purchaseCost,
  currency,
}: {
  saleTotal: number;
  purchaseCost: number;
  currency: string;
}) {
  const cost = Number(purchaseCost) || 0;
  if (!(cost > 0)) {
    return <span className="font-medium tabular-nums text-muted">—</span>;
  }
  const diff = Math.round((saleTotal - cost) * 100) / 100;
  if (diff === 0) {
    return <span className="whitespace-nowrap font-semibold text-muted">ربح 0</span>;
  }
  if (diff < 0) {
    const amount = Math.abs(diff);
    return (
      <span className="whitespace-nowrap font-semibold tabular-nums text-danger">
        خسارة {fmtMoney(amount)} {currency}{' '}
        <span className="text-[10px] font-medium">({percentFmt.format((amount / cost) * 100)}%)</span>
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap font-semibold tabular-nums text-success">
      ربح {fmtMoney(diff)} {currency}{' '}
      <span className="text-[10px] font-medium">({percentFmt.format((diff / cost) * 100)}%)</span>
    </span>
  );
}
