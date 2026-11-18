import {
  computeItemPrice,
  computeWeights,
  gramPrice24,
  gramPriceForKarat,
  PricingError,
  roundToStep,
  type WeightBasis,
} from '@gold/pricing';
import type { FixedBasis, ProfitMode } from './types';

export interface PreviewComponent {
  karat: number;
  weight: number;
  stoneWeight: number;
  stonePrice: number | null;
  inlaysWeight: number;
}

export interface PreviewInput {
  type: 'PIECE' | 'SET';
  karat: number;
  totalWeight: number;
  stoneWeight: number;
  stonePrice: number | null;
  inlaysWeight: number;
  components: PreviewComponent[];
}

export interface ItemPricePreview {
  gram24: number;
  gramKarat: number | null;
  karatFactor: number | null;
  basisWeight: number;
  goldValue: number;
  stoneValue: number;
  subtotal: number;
  profitMode: ProfitMode;
  /** أساس الربح الثابت المستعمل في المعاينة */
  fixedBasis: FixedBasis;
  /** عدد الوحدات اللي ضُرب فالربح الثابت (قطع أو غرامات) */
  profitUnits: number;
  profitInput: number;
  profitAmount: number;
  beforeRounding: number;
  roundingStep: number;
  finalPrice: number;
  belowCost: boolean;
  margin: number | null;
}

export function basisFromSettings(deductStone: boolean, deductInlays: boolean): WeightBasis {
  if (deductStone && deductInlays) return 'NET_GOLD';
  if (deductStone) return 'MINUS_STONE';
  if (deductInlays) return 'MINUS_INLAYS';
  return 'TOTAL';
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * معاينة سعر الصنف قبل الحفظ.
 * - القطعة: عبر محرك التسعير الكامل computeItemPrice
 * - الطقم: تجميع قيمة كل مكوّن بعياره ثم إضافة الربح والتقريب
 * ملاحظة: هذه معاينة استرشادية فقط؛ سعر البيع الفعلي يُدخل عند الفاتورة.
 */
export function buildItemPreview(
  input: PreviewInput,
  ounceUsd: number,
  fxRate: number,
  basis: WeightBasis,
  profitMode: ProfitMode,
  profitValue: number,
  roundingStep: number,
  cost: number | null = null,
  fixedBasis: FixedBasis = 'PIECE',
): ItemPricePreview | null {
  if (!(ounceUsd > 0) || !(fxRate > 0)) return null;

  const effectiveMode: ProfitMode = profitMode;
  const modeForCalc: ProfitMode = profitMode === 'MANUAL' ? 'PERCENT' : profitMode;
  const valueForCalc = profitMode === 'MANUAL' ? 0 : profitValue;

  try {
    if (input.type === 'PIECE') {
      if (!(input.totalWeight > 0)) return null;
      const r = computeItemPrice({
        ounceUsd,
        fxRate,
        karat: input.karat,
        totalWeight: input.totalWeight,
        stoneWeight: input.stoneWeight,
        inlaysWeight: input.inlaysWeight,
        stonePrice: input.stonePrice,
        basis,
        profitMode: modeForCalc,
        profitValue: valueForCalc,
        roundingStep,
        cost,
        fixedBasis,
        pieceCount: 1,
      });

      return {
        gram24: r.gramPrice24,
        gramKarat: r.gramPriceKarat,
        karatFactor: r.karatFactor,
        basisWeight: r.weights.basisWeight,
        goldValue: r.goldValue,
        stoneValue: r.stoneValue,
        subtotal: r.subtotal,
        profitMode: effectiveMode,
        fixedBasis,
        profitUnits: r.profit.units,
        profitInput: valueForCalc,
        profitAmount: r.profit.amount,
        beforeRounding: r.beforeRounding,
        roundingStep: r.roundingStep,
        finalPrice: r.finalPrice,
        belowCost: r.belowCost,
        margin: r.margin,
      };
    }

    const components = input.components.filter((c) => c.weight > 0);
    if (components.length === 0) return null;

    let gold = 0;
    let stone = 0;
    let basisWeight = 0;

    for (const c of components) {
      const stonePrice = c.stonePrice !== null && c.stonePrice > 0 ? c.stonePrice : null;
      const w = computeWeights({
        totalWeight: c.weight,
        stoneWeight: c.stoneWeight,
        inlaysWeight: c.inlaysWeight,
        basis,
        stoneHasPrice: stonePrice !== null,
      });
      gold += w.basisWeight * gramPriceForKarat(ounceUsd, fxRate, c.karat).toNumber();
      stone += stonePrice ?? 0;
      basisWeight += w.basisWeight;
    }

    const subtotal = gold + stone;
    // الطقم: كل مكوّن يُحصى قطعة، والأساس GRAM يستعمل مجموع أوزان الأساس للمكوّنات
    const componentCount = Math.max(1, components.length);
    const profitUnits =
      profitMode === 'FIXED' ? (fixedBasis === 'GRAM' ? r3(basisWeight) : componentCount) : 1;
    const profitAmount =
      profitMode === 'PERCENT'
        ? (subtotal * profitValue) / 100
        : profitMode === 'FIXED'
          ? fixedBasis === 'GRAM'
            ? profitValue * basisWeight
            : profitValue * componentCount
          : 0;
    const before = subtotal + profitAmount;
    const final = roundToStep(before, roundingStep).toNumber();

    return {
      gram24: r2(gramPrice24(ounceUsd, fxRate).toNumber()),
      gramKarat: null,
      karatFactor: null,
      basisWeight: r3(basisWeight),
      goldValue: r2(gold),
      stoneValue: r2(stone),
      subtotal: r2(subtotal),
      profitMode: effectiveMode,
      fixedBasis,
      profitUnits,
      profitInput: valueForCalc,
      profitAmount: r2(profitAmount),
      beforeRounding: r2(before),
      roundingStep,
      finalPrice: final,
      belowCost: cost !== null && final < cost,
      margin: cost === null ? null : r2(final - cost),
    };
  } catch (err) {
    if (err instanceof PricingError) return null;
    return null;
  }
}
