import type { Sale } from '../lib/types';
import { fmtDateTime, fmtMoney, fmtNum, fmtWeight } from '../lib/format';

/**
 * إيصال بيع بسيط وقابل للطباعة (A5 / حراري).
 * يُستعمل في شاشة البيع بعد الحفظ وفي صفحة الفاتورة.
 */
export function Receipt({
  sale,
  shopName,
  currency,
}: {
  sale: Sale;
  shopName: string;
  currency: string;
}) {
  const unitCount = sale.items.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div className="print-area mx-auto w-full max-w-[430px] rounded-2xl border border-border bg-white p-5 text-[#111] shadow-[var(--shadow-s)] print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <div className="text-center">
        <p className="text-[17px] font-bold tracking-tight">{shopName}</p>
        <p className="mt-0.5 text-[11px] text-[#555]">فاتورة بيع ذهب</p>
      </div>

      <div className="mt-4 flex items-start justify-between gap-3 border-y border-dashed border-[#bbb] py-2 text-[11px]">
        <div className="space-y-0.5">
          <p>
            <span className="text-[#666]">رقم الفاتورة: </span>
            <span className="font-mono font-semibold">{sale.invoiceNo}</span>
          </p>
          <p>
            <span className="text-[#666]">التاريخ: </span>
            <span className="tabular-nums">{fmtDateTime(sale.createdAt)}</span>
          </p>
        </div>
        <div className="space-y-0.5 text-end">
          <p>
            <span className="text-[#666]">البائع: </span>
            {sale.seller?.name ?? '—'}
          </p>
          {sale.customerName ? (
            <p>
              <span className="text-[#666]">العميل: </span>
              {sale.customerName}
            </p>
          ) : null}
          {sale.customerPhone ? (
            <p dir="ltr" className="text-end">
              {sale.customerPhone}
            </p>
          ) : null}
        </div>
      </div>

      <table className="mt-3 w-full text-[11px]">
        <thead>
          <tr className="border-b border-[#bbb] text-[#555]">
            <th className="pb-1.5 text-start font-semibold">الصنف</th>
            <th className="pb-1.5 text-center font-semibold">عيار</th>
            <th className="pb-1.5 text-center font-semibold">وزن</th>
            <th className="pb-1.5 text-center font-semibold">كمية</th>
            <th className="pb-1.5 text-end font-semibold">السعر</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((line) => (
            <tr key={line.id} className="border-b border-[#e2e2e2] align-top last:border-0">
              <td className="py-1.5 pe-1">
                <p className="font-medium leading-4">{line.item.name}</p>
                <p className="font-mono text-[9px] text-[#666]">{line.item.code}</p>
              </td>
              <td className="py-1.5 text-center tabular-nums">{line.item.karat}</td>
              <td className="py-1.5 text-center tabular-nums">{fmtWeight(line.item.totalWeight)}</td>
              <td className="py-1.5 text-center tabular-nums">{fmtNum(line.quantity)}</td>
              <td className="py-1.5 text-end font-semibold tabular-nums">{fmtMoney(line.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 space-y-1 border-t border-dashed border-[#bbb] pt-2.5 text-[12px]">
        <div className="flex items-center justify-between">
          <span className="text-[#666]">عدد القطع</span>
          <span className="font-semibold tabular-nums">{fmtNum(unitCount)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[#666]">طريقة الدفع</span>
          <span className="font-medium">
            {sale.fxMode === 'CHEQUE'
              ? 'صك مصدق'
              : sale.fxMode === 'CASH'
                ? 'نقدي'
                : (sale.paymentMethod?.value ?? 'غير محددة')}
          </span>
        </div>
        {sale.fxRate !== null ? (
          <div className="flex items-center justify-between">
            <span className="text-[#666]">سعر الصرف المعتمد</span>
            <span className="font-medium tabular-nums">{fmtMoney(sale.fxRate)}</span>
          </div>
        ) : null}
        <div className="mt-1 flex items-center justify-between border-t border-[#222] pt-2 text-[15px]">
          <span className="font-bold">الإجمالي</span>
          <span className="font-extrabold tabular-nums">
            {fmtMoney(sale.total)} <span className="text-[10px] font-medium text-[#555]">{currency}</span>
          </span>
        </div>
      </div>

      {sale.status === 'CANCELLED' ? (
        <p className="mt-3 rounded border border-[#c0392b] px-2 py-1 text-center text-[11px] font-bold text-[#c0392b]">
          فاتورة ملغاة — {sale.cancelReason ?? 'بدون سبب مسجّل'}
        </p>
      ) : null}

      <p className="mt-4 text-center text-[10px] leading-4 text-[#777]">
        شكراً لتعاملكم معنا · البضاعة المباعة لا تُرد إلا وفق سياسة المحل
      </p>
      <p className="mt-1 text-center font-mono text-[9px] text-[#999]" dir="ltr">
        {sale.invoiceNo} · {fmtDateTime(sale.createdAt)}
      </p>
    </div>
  );
}
