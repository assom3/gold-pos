import { describe, expect, it } from 'vitest';
import {
  KARAT_BASE,
  TROY_OUNCE_GRAMS,
  buildPriceTable,
  gramPrice24,
  gramPriceForKarat,
  karatFactor,
  PricingError,
} from '../src/index.js';

/**
 * مرجع: الوثيقة P43 v0.6 — مثال القسم 3.4
 * أونصة 2000 دولار، سعر صرف 6.0 → سعر غرام 24 = 12000 ÷ 31.1035
 */
describe('تحويل الأونصة إلى سعر الغرام', () => {
  it('يعطي سعر غرام 24 الصحيح', () => {
    const p = gramPrice24(2000, 6);
    expect(p.toNumber()).toBeCloseTo(12000 / TROY_OUNCE_GRAMS, 9);
    expect(p.toDecimalPlaces(2).toNumber()).toBe(385.81);
  });

  it('معاملات العيارات', () => {
    expect(karatFactor(24).toNumber()).toBe(1);
    expect(karatFactor(21).toNumber()).toBe(0.875);
    expect(karatFactor(18).toNumber()).toBe(0.75);
    expect(karatFactor(12).toNumber()).toBe(0.5);
    expect(KARAT_BASE).toBe(24);
  });

  it('سعر الغرام للعيارات 18 و 21 و 24', () => {
    expect(gramPriceForKarat(2000, 6, 24).toDecimalPlaces(2).toNumber()).toBe(385.81);
    expect(gramPriceForKarat(2000, 6, 21).toDecimalPlaces(2).toNumber()).toBe(337.58);
    expect(gramPriceForKarat(2000, 6, 18).toDecimalPlaces(2).toNumber()).toBe(289.36);
  });

  it('جدول الأسعار كيرجع كل العيارات مرتبة', () => {
    const table = buildPriceTable(2000, 6, [21, 18, 24, 18]);
    expect(table.gramPrice24).toBe(385.81);
    expect(table.rows.map((r) => r.karat)).toEqual([18, 21, 24]);
    expect(table.rows.map((r) => r.pricePerGram)).toEqual([289.36, 337.58, 385.81]);
  });

  it('يرفض القيم غير الصالحة', () => {
    expect(() => gramPrice24(0, 6)).toThrow(PricingError);
    expect(() => gramPrice24(2000, 0)).toThrow(PricingError);
    expect(() => karatFactor(25)).toThrow(PricingError);
    expect(() => karatFactor(0)).toThrow(PricingError);
  });
});
