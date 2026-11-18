import { PricingError } from './errors.js';
import { Decimal, toDecimal, toMoney, type Numeric } from './money.js';
import type { KaratPrice, PriceTable } from './types.js';

/**
 * عدد غرامات الأونصة التروي (قرار المشروع: القيمة المستعملة فالوثيقة 31.1035)
 * ملاحظة: القيمة الفيزيائية الدقيقة هي 31.1034768 — الفرق أقل من 0.001%،
 * وتم اختيار 31.1035 للتوافق الحرفي مع أمثلة الوثيقة (جداول 4.1 و 4.2).
 */
export const TROY_OUNCE_GRAMS = 31.1035;

/** أساس العيارات: 24 قيراط = ذهب خالص */
export const KARAT_BASE = 24;

function assertPositive(value: Numeric, code: 'OUNCE_INVALID' | 'FX_INVALID', label: string): Decimal {
  const d = toDecimal(value);
  if (d.lte(0)) {
    throw new PricingError(code, `${label} يجب أن يكون أكبر من صفر`);
  }
  return d;
}

/**
 * سعر غرام الذهب الخالص (24) بالعملة المحلية.
 *   gram24 = (سعر الأونصة بالدولار × سعر الصرف) ÷ 31.1035
 */
export function gramPrice24(ounceUsd: Numeric, fxRate: Numeric): Decimal {
  const ounce = assertPositive(ounceUsd, 'OUNCE_INVALID', 'سعر الأونصة');
  const fx = assertPositive(fxRate, 'FX_INVALID', 'سعر الصرف');
  return ounce.times(fx).dividedBy(TROY_OUNCE_GRAMS);
}

/** معامل العيار: 18 → 0.75 ، 21 → 0.875 ، 24 → 1 */
export function karatFactor(karat: number): Decimal {
  if (!Number.isFinite(karat) || karat <= 0 || karat > KARAT_BASE) {
    throw new PricingError('KARAT_INVALID', `عيار غير صالح: ${karat}`);
  }
  return new Decimal(karat).dividedBy(KARAT_BASE);
}

/**
 * سعر غرام عيار معين:
 *   gramK = gram24 × (K ÷ 24)
 * هادي هي نقطة التحويل الأساسية بين الأونصة والعيارات (18 / 21 / 24).
 */
export function gramPriceForKarat(ounceUsd: Numeric, fxRate: Numeric, karat: number): Decimal {
  return gramPrice24(ounceUsd, fxRate).times(karatFactor(karat));
}

/** جدول أسعار الغرام لكل العيارات المتاحة — كيستعمل فشاشة الأسعار */
export function buildPriceTable(ounceUsd: Numeric, fxRate: Numeric, karats: number[]): PriceTable {
  const gram24 = gramPrice24(ounceUsd, fxRate);
  const unique = Array.from(new Set(karats)).sort((a, b) => a - b);

  const rows: KaratPrice[] = unique.map((karat) => {
    const factor = karatFactor(karat);
    const price = gram24.times(factor);
    return {
      karat,
      factor: factor.toNumber(),
      pricePerGram: toMoney(price),
      pricePerGramRaw: price.toNumber(),
    };
  });

  return {
    ounceUsd: toDecimal(ounceUsd).toNumber(),
    fxRate: toDecimal(fxRate).toNumber(),
    gramPrice24: toMoney(gram24),
    gramPrice24Raw: gram24.toNumber(),
    rows,
  };
}
