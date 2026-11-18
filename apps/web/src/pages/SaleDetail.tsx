import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Ban,
  Calendar,
  CircleAlert,
  Phone,
  Printer,
  ReceiptText,
  UserRound,
  Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/toast';
import type { Sale, Setting } from '../lib/types';
import { FIXED_BASIS_LABEL, fmtDateTime, fmtMoney, fmtNum, fmtWeight, PROFIT_MODE_LABEL, timeAgo } from '../lib/format';
import { Receipt } from '../components/Receipt';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  SectionTitle,
  Skeleton,
} from '../components/ui/primitives';
import { ConfirmDialog } from '../components/ui/overlay';

export default function SaleDetail() {
  const { id } = useParams<{ id: string }>();
  const saleId = id ? Number(id) : null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { isOwner } = useAuth();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Setting>('/settings'),
    staleTime: 5 * 60_000,
  });

  const { data: sale, isLoading } = useQuery({
    queryKey: ['sales', saleId],
    queryFn: () => api.get<Sale>(`/sales/${saleId}`),
    enabled: saleId !== null && Number.isInteger(saleId),
  });

  const cancel = useMutation({
    mutationFn: () => api.post<Sale>(`/sales/${saleId}/cancel`, { reason: reason.trim() }),
    onSuccess: async (updated) => {
      toast.success('تم إلغاء الفاتورة وإرجاع الكميات للمخزون');
      queryClient.setQueryData(['sales', saleId], updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['items'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
      setCancelOpen(false);
      setReason('');
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'تعذر إلغاء الفاتورة';
      setReasonError(message);
      toast.error(message);
    },
  });

  if (!saleId || !Number.isInteger(saleId)) {
    return (
      <Card className="mx-auto mt-10 max-w-md text-center">
        <p className="text-sm font-semibold text-text">رقم فاتورة غير صالح</p>
        <Button variant="primary" className="mt-3" onClick={() => navigate('/sales')}>
          عودة للمبيعات
        </Button>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-11 w-72" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-[460px] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!sale) {
    return (
      <Card className="mx-auto mt-10 max-w-md text-center">
        <ReceiptText className="mx-auto size-8 text-muted" />
        <p className="mt-3 text-sm font-semibold text-text">الفاتورة غير موجودة</p>
        <Button variant="primary" className="mt-3" onClick={() => navigate('/sales')}>
          عودة للمبيعات
        </Button>
      </Card>
    );
  }

  const currency = settings?.currency ?? 'LYD';
  const shopName = settings?.shopName ?? 'محل الذهب';
  const unitCount = sale.items.reduce((s, l) => s + l.quantity, 0);
  const weight = sale.items.reduce((s, l) => s + Number(l.item.totalWeight) * l.quantity, 0);

  function confirmCancel() {
    if (reason.trim().length < 3) {
      setReasonError('اكتب سبباً واضحاً لا يقل عن 3 أحرف');
      return;
    }
    setReasonError(null);
    cancel.mutate();
  }

  return (
    <div className="space-y-4">
      <div className="no-print">
        <PageHeader
          title={`الفاتورة ${sale.invoiceNo}`}
          subtitle={`${fmtDateTime(sale.createdAt)} · ${sale.seller.name}`}
          actions={
            <>
              <Button variant="secondary" icon={ArrowRight} onClick={() => navigate('/sales')}>
                رجوع
              </Button>
              <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
                طباعة
              </Button>
              {isOwner && sale.status === 'COMPLETED' ? (
                <Button variant="danger" icon={Ban} onClick={() => setCancelOpen(true)}>
                  إلغاء الفاتورة
                </Button>
              ) : null}
            </>
          }
        />
      </div>

      {sale.status === 'CANCELLED' ? (
        <div className="no-print flex items-start gap-2 rounded-xl border border-[color-mix(in_oklab,var(--danger)_32%,transparent)] bg-dangersoft px-3.5 py-2.5 text-xs leading-5 text-text">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
          <div>
            <p className="font-semibold text-danger">فاتورة ملغاة</p>
            <p className="mt-0.5 text-muted">
              السبب: {sale.cancelReason ?? '—'}
              {sale.cancelledBy ? ` · ألغاها ${sale.cancelledBy.name}` : ''}
              {sale.cancelledAt ? ` · ${timeAgo(sale.cancelledAt)}` : ''}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* التفاصيل */}
        <div className="no-print space-y-4">
          <Card className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <SectionTitle
                title="أصناف الفاتورة"
                description={`${fmtNum(sale.items.length)} صنف · ${fmtNum(unitCount)} قطعة · ${fmtWeight(weight)} غ`}
              />
              <Badge tone={sale.status === 'COMPLETED' ? 'success' : 'danger'} dot>
                {sale.status === 'COMPLETED' ? 'مكتملة' : 'ملغاة'}
              </Badge>
            </div>

            <div className="overflow-x-auto scroll-thin">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface2/60 text-[11px] text-muted">
                    <th className="px-4 py-2 text-start font-semibold">الصنف</th>
                    <th className="px-3 py-2 text-center font-semibold">العيار</th>
                    <th className="px-3 py-2 text-center font-semibold">الوزن</th>
                    <th className="px-3 py-2 text-center font-semibold">الكمية</th>
                    <th className="px-3 py-2 text-end font-semibold">سعر الوحدة</th>
                    <th className="px-4 py-2 text-end font-semibold">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((line) => (
                    <tr key={line.id} className="border-b border-border/70 last:border-0">
                      <td className="px-4 py-3">
                        <Link to={`/items/${line.item.id}`} className="group block min-w-0">
                          <p className="truncate text-[13px] font-medium text-text group-hover:text-gold">
                            {line.item.name}
                          </p>
                          <p className="font-mono text-[10px] text-gold">{line.item.code}</p>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-flex rounded-md bg-goldsoft px-1.5 py-0.5 text-[10px] font-bold text-gold">
                          {line.item.karat}K
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-[12px] tabular-nums text-muted">
                        {fmtWeight(line.item.totalWeight)} غ
                      </td>
                      <td className="px-3 py-3 text-center text-[12px] tabular-nums text-text">{line.quantity}</td>
                      <td className="px-3 py-3 text-end text-[12px] tabular-nums text-muted">
                        {fmtMoney(line.unitPrice)}
                      </td>
                      <td className="px-4 py-3 text-end text-[13px] font-semibold tabular-nums text-text">
                        {fmtMoney(line.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-surface2/50">
                    <td colSpan={5} className="px-4 py-3 text-[12px] font-medium text-muted">
                      الإجمالي قبل الإلغاء
                    </td>
                    <td className="px-4 py-3 text-end">
                      <span className="text-[16px] font-bold tabular-nums text-gold">
                        {fmtMoney(sale.total)} <span className="text-[10px] font-medium text-muted">{currency}</span>
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <SectionTitle title="بيانات العميل" action={<UserRound className="size-4 text-muted" />} />
              <div className="mt-3 space-y-2 text-[12px]">
                <DetailRow label="الاسم" value={sale.customerName ?? 'غير مذكور'} />
                <DetailRow
                  label="الهاتف"
                  value={
                    sale.customerPhone ? (
                      <span className="inline-flex items-center gap-1.5" dir="ltr">
                        <Phone className="size-3 text-muted" />
                        {sale.customerPhone}
                      </span>
                    ) : (
                      'غير مذكور'
                    )
                  }
                />
                <DetailRow
                  label="طريقة الدفع"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <Wallet className="size-3 text-muted" />
                      {sale.fxMode === 'CHEQUE'
                        ? 'صك مصدق'
                        : sale.fxMode === 'CASH'
                          ? 'نقدي'
                          : (sale.paymentMethod?.value ?? 'غير محددة')}
                    </span>
                  }
                />
              </div>
            </Card>

            <Card>
              <SectionTitle title="بيانات الفاتورة" action={<Calendar className="size-4 text-muted" />} />
              <div className="mt-3 space-y-2 text-[12px]">
                <DetailRow label="رقم الفاتورة" value={<span className="font-mono text-gold">{sale.invoiceNo}</span>} />
                <DetailRow label="البائع" value={sale.seller.name} />
                <DetailRow label="تاريخ الإصدار" value={fmtDateTime(sale.createdAt)} />
                {sale.status === 'CANCELLED' ? (
                  <DetailRow
                    label="الإلغاء"
                    value={
                      <span className="text-danger">
                        {sale.cancelledAt ? fmtDateTime(sale.cancelledAt) : '—'}
                        {sale.cancelledBy ? ` · ${sale.cancelledBy.name}` : ''}
                      </span>
                    }
                  />
                ) : (
                  <DetailRow label="الحالة" value={<span className="font-medium text-success">مكتملة</span>} />
                )}
                {sale.profitMode ? (
                  <DetailRow
                    label="سياسة الربح"
                    value={
                      sale.profitMode === 'MANUAL'
                        ? PROFIT_MODE_LABEL.MANUAL
                        : `${PROFIT_MODE_LABEL[sale.profitMode]} · ${fmtMoney(sale.profitValue ?? 0)}${
                            sale.profitMode === 'PERCENT'
                              ? '%'
                              : ` ${currency}${
                                  sale.profitMode === 'FIXED'
                                    ? ` · ${FIXED_BASIS_LABEL[sale.fixedBasis ?? 'PIECE']}`
                                    : ''
                                }`
                          }`
                    }
                  />
                ) : null}
                {sale.roundingStep !== null ? (
                  <DetailRow
                    label="التقريب"
                    value={sale.roundingStep === 0 ? 'بدون' : `أقرب ${sale.roundingStep}`}
                  />
                ) : null}
                {sale.fxRate !== null ? (
                  <DetailRow
                    label="سعر الصرف المعتمد"
                    value={fmtMoney(sale.fxRate)}
                  />
                ) : null}
              </div>
            </Card>
          </div>

          {isOwner && sale.status === 'COMPLETED' ? (
            <p className="px-1 text-[11px] leading-5 text-muted">
              إلغاء الفاتورة يعيد الكميات إلى المخزون ويسجّل السبب والمستخدم في سجل التعديلات. لا يمكن التراجع عن الإلغاء.
            </p>
          ) : null}
        </div>

        {/* الإيصال */}
        <aside>
          <div className="no-print mb-2 flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold text-muted">معاينة الإيصال</p>
            <Button variant="ghost" size="sm" icon={Printer} onClick={() => window.print()}>
              طباعة
            </Button>
          </div>
          <Receipt sale={sale} shopName={shopName} currency={currency} />
        </aside>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        title={`إلغاء الفاتورة ${sale.invoiceNo}؟`}
        description="ستُعاد جميع القطع إلى المخزون، ويبقى سجل الفاتورة محفوظاً بحالة «ملغاة»."
        confirmLabel="تأكيد الإلغاء"
        cancelLabel="رجوع"
        loading={cancel.isPending}
        onCancel={() => {
          setCancelOpen(false);
          setReasonError(null);
        }}
        onConfirm={confirmCancel}
      >
        <Field label="سبب الإلغاء" required error={reasonError}>
          <Input
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setReasonError(null);
            }}
            placeholder="مثال: العميل غيّر رأيه"
            autoFocus
          />
        </Field>
        <p className="mt-2 text-[11px] leading-5 text-muted">
          سيُسجَّل السبب واسمك ووقت الإلغاء في سجل التعديلات.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 text-end text-text">{value}</span>
    </div>
  );
}
