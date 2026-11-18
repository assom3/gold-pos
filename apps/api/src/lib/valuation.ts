import { computeWeights, gramPriceForKarat, type WeightBasis } from '@gold/pricing';

export interface ValuatableComponent {
  karat: number;
  weight: unknown;
  stoneWeight: unknown;
  inlaysWeight: unknown;
  stonePrice: unknown;
}

export interface ValuatableItem {
  id: number;
  code: string;
  name: string;
  type: 'PIECE' | 'SET';
  karat: number;
  totalWeight: unknown;
  stoneWeight: unknown;
  stonePrice: unknown;
  inlaysWeight: unknown;
  netGoldWeight: unknown;
  quantity: number;
  purchaseCostDinar: unknown;
  weightBasis: WeightBasis | null;
  components?: ValuatableComponent[];
}

const n = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  const parsed = typeof v === 'number' ? v : Number.parseFloat(String(v));
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface ItemValuation {
  goldValue: number;
  stoneValue: number;
  value: number;
  basisWeight: number;
  netGoldWeight: number;
}

/**
 * قيمة الصنف الحالية بسعر اللحظة.
 * - القطعة: وزن أساس الاحتساب × سعر غرام عيارها
 * - الطقم: مجموع المكونات، كل مكوّن بعياره ووزنه (قسم 4.4)
 */
export function valueItem(
  item: ValuatableItem,
  ounceUsd: number,
  fxRate: number,
  settingBasis: WeightBasis,
): ItemValuation {
  const basis = item.weightBasis ?? settingBasis;

  if (item.type === 'SET' && item.components && item.components.length > 0) {
    let gold = 0;
    let stone = 0;
    let basisWeight = 0;
    let netGold = 0;

    for (const c of item.components) {
      const stonePrice = c.stonePrice === null || c.stonePrice === undefined ? null : n(c.stonePrice);
      const w = computeWeights({
        totalWeight: n(c.weight),
        stoneWeight: n(c.stoneWeight),
        inlaysWeight: n(c.inlaysWeight),
        basis,
        stoneHasPrice: stonePrice !== null && stonePrice > 0,
      });
      const gram = gramPriceForKarat(ounceUsd, fxRate, c.karat).toNumber();
      gold += w.basisWeight * gram;
      stone += stonePrice ?? 0;
      basisWeight += w.basisWeight;
      netGold += w.netGold;
    }

    return {
      goldValue: round2(gold),
      stoneValue: round2(stone),
      value: round2(gold + stone),
      basisWeight: round3(basisWeight),
      netGoldWeight: round3(netGold),
    };
  }

  const stonePrice = item.stonePrice === null || item.stonePrice === undefined ? null : n(item.stonePrice);
  const w = computeWeights({
    totalWeight: n(item.totalWeight),
    stoneWeight: n(item.stoneWeight),
    inlaysWeight: n(item.inlaysWeight),
    basis,
    stoneHasPrice: stonePrice !== null && stonePrice > 0,
  });
  const gram = gramPriceForKarat(ounceUsd, fxRate, item.karat).toNumber();
  const gold = w.basisWeight * gram;

  return {
    goldValue: round2(gold),
    stoneValue: round2(stonePrice ?? 0),
    value: round2(gold + (stonePrice ?? 0)),
    basisWeight: w.basisWeight,
    netGoldWeight: w.netGold,
  };
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
