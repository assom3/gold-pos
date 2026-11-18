import { describe, expect, it } from 'vitest';
import {
  computeItemPrice,
  computeWeights,
  PricingError,
  type PricingInput,
  type WeightBasis,
} from '../src/index.js';

/**
 * الأرقام المرجعية من الوثيقة P43 v0.6:
 * أونصة 2000$ ، صرف 6.0 ، عيار 21 ، إجمالي 10.00غ ، حجر 0.80غ ، فصوص 0.20غ ، ربح 5%
 * سعر غرام 21 = 337.58 دينار
 */
const base: PricingInput = {
  ounceUsd: 2000,
  fxRate: 6,
  karat: 21,
  totalWeight: 10,
  stoneWeight: 0.8,
  inlaysWeight: 0.2,
  basis: 'NET_GOLD',
  profitMode: 'PERCENT',
  profitValue: 5,
};

describe('جدول 4.1 — الحجر بلا سعر خاص', () => {
  const cases: Array<[WeightBasis, number, number, number]> = [
    ['NET_GOLD', 9.0, 3038.24, 3190.16],
    ['TOTAL', 10.0, 3375.83, 3544.62],
    ['MINUS_STONE', 9.2, 3105.76, 3261.05],
    ['MINUS_INLAYS', 9.8, 3308.31, 3473.72],
  ];

  it.each(cases)('%s → وزن %s ، ذهب %s ، نهائي %s', (basis, weight, gold, final) => {
    const r = computeItemPrice({ ...base, basis });
    expect(r.weights.basisWeight).toBe(weight);
    expect(r.goldValue).toBe(gold);
    expect(r.finalPrice).toBe(final);
    expect(r.stoneValue).toBe(0);
  });
});

describe('جدول 4.2 — الحجر بسعر خاص 150', () => {
  it('وزنه كيتخصم دائماً حتى مع أساس "بدون خصم"', () => {
    const withTotal = computeItemPrice({ ...base, basis: 'TOTAL', stonePrice: 150 });
    expect(withTotal.weights.basisWeight).toBe(9.2);
    expect(withTotal.weights.stoneDeducted).toBe(true);
    expect(withTotal.goldValue).toBe(3105.76);
    expect(withTotal.stoneValue).toBe(150);
    expect(withTotal.finalPrice).toBe(3418.55);

    const withInlaysOnly = computeItemPrice({ ...base, basis: 'MINUS_INLAYS', stonePrice: 150 });
    expect(withInlaysOnly.weights.basisWeight).toBe(9.0);
    expect(withInlaysOnly.goldValue).toBe(3038.24);
    expect(withInlaysOnly.finalPrice).toBe(3347.66);

    const netGold = computeItemPrice({ ...base, basis: 'NET_GOLD', stonePrice: 150 });
    expect(netGold.weights.basisWeight).toBe(9.0);
    expect(netGold.finalPrice).toBe(3347.66);
  });

  it('ربح ثابت 100 → 3288.24 (الحالة الأولى)', () => {
    const r = computeItemPrice({
      ...base,
      basis: 'NET_GOLD',
      stonePrice: 150,
      profitMode: 'FIXED',
      profitValue: 100,
    });
    expect(r.subtotal).toBe(3188.24);
    expect(r.profit.amount).toBe(100);
    expect(r.finalPrice).toBe(3288.24);
  });
});

describe('الأوزان', () => {
  it('وزن الذهب = الإجمالي − الحجر − الفصوص', () => {
    const w = computeWeights({ totalWeight: 10, stoneWeight: 0.8, inlaysWeight: 0.2, basis: 'NET_GOLD' });
    expect(w.netGold).toBe(9);
    expect(w.total).toBe(10);
  });

  it('يرفض حجر + فصوص ≥ الإجمالي', () => {
    expect(() =>
      computeWeights({ totalWeight: 5, stoneWeight: 4, inlaysWeight: 1, basis: 'NET_GOLD' }),
    ).toThrow(PricingError);
  });

  it('يرفض الوزن الصفري أو السالب', () => {
    expect(() => computeWeights({ totalWeight: 0, basis: 'NET_GOLD' })).toThrow(PricingError);
    expect(() => computeWeights({ totalWeight: 5, stoneWeight: -1, basis: 'NET_GOLD' })).toThrow(
      PricingError,
    );
  });

  it('بدون حجر ولا فصوص الوزن الأساسي = الإجمالي', () => {
    const r = computeItemPrice({ ...base, stoneWeight: 0, inlaysWeight: 0, basis: 'NET_GOLD' });
    expect(r.weights.basisWeight).toBe(10);
    expect(r.finalPrice).toBe(3544.62);
  });
});

describe('الربح والتقريب', () => {
  it('نسبة الربح كتحسب على قيمة الذهب + سعر الحجر', () => {
    const r = computeItemPrice({ ...base, basis: 'NET_GOLD', stonePrice: 150, profitValue: 10 });
    expect(r.subtotal).toBe(3188.24);
    expect(r.profit.amount).toBe(318.82);
    expect(r.finalPrice).toBe(3507.07);
  });

  it('السعر اليدوي كيتجاوز حساب الربح', () => {
    const r = computeItemPrice({
      ...base,
      basis: 'NET_GOLD',
      profitMode: 'MANUAL',
      manualPrice: 3500,
    });
    expect(r.finalPrice).toBe(3500);
    expect(r.profit.amount).toBe(461.76);
  });

  it('التقريب لأقرب 5 و 10', () => {
    const r5 = computeItemPrice({ ...base, basis: 'NET_GOLD', roundingStep: 5 });
    expect(r5.beforeRounding).toBe(3190.16);
    expect(r5.finalPrice).toBe(3190);
    expect(r5.roundingDelta).toBe(-0.16);

    const r10 = computeItemPrice({ ...base, basis: 'NET_GOLD', roundingStep: 10 });
    expect(r10.finalPrice).toBe(3190);

    const r0 = computeItemPrice({ ...base, basis: 'NET_GOLD', roundingStep: 0 });
    expect(r0.finalPrice).toBe(3190.16);
  });

  it('تحذير البيع بأقل من التكلفة (BR-09)', () => {
    const below = computeItemPrice({ ...base, basis: 'NET_GOLD', cost: 3500 });
    expect(below.belowCost).toBe(true);
    expect(below.margin).toBe(-309.84);

    const above = computeItemPrice({ ...base, basis: 'NET_GOLD', cost: 2000 });
    expect(above.belowCost).toBe(false);
    expect(above.margin).toBe(1190.16);
  });

  it('المحرك كيرجع التفصيل الكامل ماشي غير السعر', () => {
    const r = computeItemPrice({ ...base, basis: 'NET_GOLD', stonePrice: 150 });
    expect(r).toMatchObject({
      karat: 21,
      karatFactor: 0.875,
      gramPrice24: 385.81,
      gramPriceKarat: 337.58,
      goldValue: 3038.24,
      stoneValue: 150,
      subtotal: 3188.24,
      finalPrice: 3347.66,
    });
    expect(r.weights).toMatchObject({
      total: 10,
      stone: 0.8,
      inlays: 0.2,
      netGold: 9,
      basisWeight: 9,
      basis: 'NET_GOLD',
    });
  });
});

describe('حالات خطأ', () => {
  it('سعر يدوي ناقص', () => {
    expect(() => computeItemPrice({ ...base, profitMode: 'MANUAL' })).toThrow(PricingError);
  });

  it('نسبة ربح سالبة', () => {
    expect(() => computeItemPrice({ ...base, profitValue: -5 })).toThrow(PricingError);
  });

  it('سعر حجر سالب', () => {
    expect(() => computeItemPrice({ ...base, stonePrice: -1 })).toThrow(PricingError);
  });
});

describe('الربح الثابت — أساس الحساب (GRAM / PIECE)', () => {
  const fixedBase: PricingInput = {
    ...base,
    basis: 'NET_GOLD',
    profitMode: 'FIXED',
    profitValue: 100,
  };

  it('الافتراضي PIECE: ربح 100 يُضاف مرة واحدة', () => {
    const r = computeItemPrice(fixedBase);
    expect(r.weights.basisWeight).toBe(9);
    expect(r.subtotal).toBe(3038.24);
    expect(r.profit.fixedBasis).toBe('PIECE');
    expect(r.profit.units).toBe(1);
    expect(r.profit.amount).toBe(100);
    expect(r.finalPrice).toBe(3138.24);
  });

  it('PIECE مع pieceCount = 3: ربح لكل مكوّن من مكوّنات الطقم', () => {
    const r = computeItemPrice({ ...fixedBase, pieceCount: 3 });
    expect(r.profit.fixedBasis).toBe('PIECE');
    expect(r.profit.units).toBe(3);
    expect(r.profit.amount).toBe(300);
    expect(r.finalPrice).toBe(3338.24);
  });

  it('GRAM: ربح لكل غرام من وزن أساس الاحتساب (9 غرام)', () => {
    const r = computeItemPrice({ ...fixedBase, fixedBasis: 'GRAM' });
    expect(r.profit.fixedBasis).toBe('GRAM');
    expect(r.profit.units).toBe(9);
    expect(r.profit.amount).toBe(900);
    expect(r.finalPrice).toBe(3938.24);
  });

  it('التقريب يُطبَّق بعد ضرب الربح في عدد الوحدات', () => {
    const grams = computeItemPrice({ ...fixedBase, fixedBasis: 'GRAM', roundingStep: 5 });
    expect(grams.profit.amount).toBe(900);
    expect(grams.beforeRounding).toBe(3938.24);
    expect(grams.finalPrice).toBe(3940);
    expect(grams.roundingDelta).toBe(1.76);

    const pieces = computeItemPrice({ ...fixedBase, pieceCount: 3, roundingStep: 5 });
    expect(pieces.profit.amount).toBe(300);
    expect(pieces.beforeRounding).toBe(3338.24);
    expect(pieces.finalPrice).toBe(3340);
    expect(pieces.roundingDelta).toBe(1.76);
  });

  it('يرفض الربح الثابت السالب في كلا الأساسين', () => {
    expect(() => computeItemPrice({ ...fixedBase, profitValue: -100 })).toThrow(PricingError);
    expect(() =>
      computeItemPrice({ ...fixedBase, fixedBasis: 'GRAM', profitValue: -100 }),
    ).toThrow(PricingError);
  });
});
