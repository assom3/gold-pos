import { computeWeights, type WeightBasis } from '@gold/pricing';

/** استنتاج أساس الاحتساب من خانتَي إعداد المحل (D-08) */
export function basisFromSettings(deductStone: boolean, deductInlays: boolean): WeightBasis {
  if (deductStone && deductInlays) return 'NET_GOLD';
  if (deductStone) return 'MINUS_STONE';
  if (deductInlays) return 'MINUS_INLAYS';
  return 'TOTAL';
}

export interface ComponentInput {
  weight: number;
  stoneWeight?: number;
  inlaysWeight?: number;
}

export interface Totals {
  totalWeight: number;
  stoneWeight: number;
  inlaysWeight: number;
  netGoldWeight: number;
}

/** تجميع أوزان الطقم من مكوناته (D-10) */
export function aggregateComponents(components: ComponentInput[]): Totals {
  let totalWeight = 0;
  let stoneWeight = 0;
  let inlaysWeight = 0;

  for (const c of components) {
    totalWeight += Number(c.weight) || 0;
    stoneWeight += Number(c.stoneWeight) || 0;
    inlaysWeight += Number(c.inlaysWeight) || 0;
  }

  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  return {
    totalWeight: round3(totalWeight),
    stoneWeight: round3(stoneWeight),
    inlaysWeight: round3(inlaysWeight),
    netGoldWeight: round3(totalWeight - stoneWeight - inlaysWeight),
  };
}

/** وزن الذهب الصافي لقطعة واحدة — مع التحقق من صحة الأوزان */
export function pieceNetGold(totalWeight: number, stoneWeight = 0, inlaysWeight = 0): number {
  return computeWeights({ totalWeight, stoneWeight, inlaysWeight, basis: 'NET_GOLD' }).netGold;
}

/** سعر الشراء موحّد بالعملة المحلية (D-05) */
export function purchaseCostDinar(
  price: number,
  currency: string,
  fxRate: number,
  localCurrency: string,
): number {
  const value = currency === localCurrency ? Number(price) : Number(price) * Number(fxRate);
  return Math.round(value * 100) / 100;
}

export interface GramPurchaseTotals {
  /** إجمالي القطعة بعملة الشراء = سعر الغرام × وزن الذهب الصافي */
  total: number;
  /** سعر الصرف المستعمل (1 للعملة المحلية) */
  fxRate: number;
  /** الإجمالي بالعملة المحلية */
  costDinar: number;
}

/** حساب الشراء من سعر الغرام — الطريقة المعتمدة عند الشراء من محلات الجملة */
export function purchaseFromGram(
  gramPrice: number,
  netGoldWeight: number,
  currency: string,
  fxRate: number,
  localCurrency: string,
): GramPurchaseTotals {
  const rate = currency === localCurrency ? 1 : Number(fxRate);
  const total = Math.round(Number(gramPrice) * Number(netGoldWeight) * 100) / 100;
  const costDinar = Math.round(total * rate * 100) / 100;
  return { total, fxRate: rate, costDinar };
}
