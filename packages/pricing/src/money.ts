import { Decimal } from 'decimal.js';
import { PricingError } from './errors.js';

/**
 * إعدادات الدقة:
 * - precision عالية باش الحسابات الوسيطة ما تفقدش أرقام
 * - التقريب كيتم فقط فالنقاط المحددة (عرض / سعر نهائي)
 */
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type Numeric = Decimal | number | string;

export function toDecimal(value: Numeric | null | undefined, fallback: Numeric = 0): Decimal {
  if (value === null || value === undefined || value === ('' as unknown)) {
    return new Decimal(fallback);
  }
  try {
    const d = value instanceof Decimal ? value : new Decimal(value as Decimal.Value);
    if (!d.isFinite()) throw new Error('not finite');
    return d;
  } catch {
    throw new PricingError('INVALID_NUMBER', `قيمة رقمية غير صالحة: ${String(value)}`);
  }
}

/** تقريب مبلغ مالي لخانتين عشريتين (نصف لأعلى) */
export function toMoney(value: Numeric): number {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/** تقريب الوزن لثلاث خانات (الميزان كيعطي خانتين، ونخليو هامش) */
export function toWeight(value: Numeric): number {
  return toDecimal(value).toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toNumber();
}

/** تقريب السعر النهائي لأقرب خطوة (0 / 5 / 10) */
export function roundToStep(value: Numeric, step: number): Decimal {
  const d = toDecimal(value);
  if (!Number.isFinite(step) || step < 0) {
    throw new PricingError('ROUNDING_INVALID', 'خطوة التقريب غير صالحة');
  }
  if (step === 0) return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const s = new Decimal(step);
  return d.dividedBy(s).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).times(s).toDecimalPlaces(2);
}

export { Decimal };
