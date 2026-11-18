import { PricingError } from './errors.js';
import { gramPrice24, karatFactor } from './karat.js';
import { Decimal, roundToStep, toDecimal, toMoney, toWeight } from './money.js';
import type {
  FixedBasis,
  PricingInput,
  PricingResult,
  WeightBasis,
  WeightBreakdown,
  WeightsInput,
} from './types.js';

const VALID_BASES: WeightBasis[] = ['NET_GOLD', 'TOTAL', 'MINUS_STONE', 'MINUS_INLAYS'];

function resolveBasis(stoneDeducted: boolean, inlaysDeducted: boolean): WeightBasis {
  if (stoneDeducted && inlaysDeducted) return 'NET_GOLD';
  if (stoneDeducted) return 'MINUS_STONE';
  if (inlaysDeducted) return 'MINUS_INLAYS';
  return 'TOTAL';
}

/**
 * حساب الأوزان (D-07 / D-08 / BR-04 / BR-10 / BR-11)
 *   الوزن الإجمالي = وزن الذهب + وزن الحجر + وزن الفصوص
 *   وزن الذهب = الإجمالي − الحجر − الفصوص
 * وإذا كان للحجر سعر خاص فوزنه كيتخصم دائماً حتى لو الإعداد قال العكس.
 */
export function computeWeights(input: WeightsInput): WeightBreakdown {
  const total = toDecimal(input.totalWeight);
  const stone = toDecimal(input.stoneWeight ?? 0);
  const inlays = toDecimal(input.inlaysWeight ?? 0);

  if (!VALID_BASES.includes(input.basis)) {
    throw new PricingError('WEIGHT_INVALID', `أساس وزن غير معروف: ${String(input.basis)}`);
  }
  if (total.lte(0)) {
    throw new PricingError('WEIGHT_INVALID', 'الوزن الإجمالي يجب أن يكون أكبر من صفر');
  }
  if (stone.lt(0) || inlays.lt(0)) {
    throw new PricingError('WEIGHT_NEGATIVE', 'أوزان الحجر والفصوص لا يمكن أن تكون سالبة');
  }
  if (stone.plus(inlays).gte(total)) {
    throw new PricingError('STONE_TOO_HEAVY', 'مجموع وزن الحجر والفصوص يجب أن يكون أقل من الوزن الإجمالي');
  }

  let stoneDeducted: boolean;
  let inlaysDeducted: boolean;

  switch (input.basis) {
    case 'NET_GOLD':
      stoneDeducted = true;
      inlaysDeducted = true;
      break;
    case 'TOTAL':
      stoneDeducted = false;
      inlaysDeducted = false;
      break;
    case 'MINUS_STONE':
      stoneDeducted = true;
      inlaysDeducted = false;
      break;
    case 'MINUS_INLAYS':
      stoneDeducted = false;
      inlaysDeducted = true;
      break;
  }

  // BR-10: الحجر ذو السعر الخاص كيتخصم وزنه دائماً
  if (input.stoneHasPrice) stoneDeducted = true;

  let basisWeight = total;
  if (stoneDeducted) basisWeight = basisWeight.minus(stone);
  if (inlaysDeducted) basisWeight = basisWeight.minus(inlays);

  if (basisWeight.lte(0)) {
    throw new PricingError('WEIGHT_INVALID', 'وزن أساس الاحتساب يجب أن يكون أكبر من صفر');
  }

  return {
    total: toWeight(total),
    stone: toWeight(stone),
    inlays: toWeight(inlays),
    netGold: toWeight(total.minus(stone).minus(inlays)),
    basisWeight: toWeight(basisWeight),
    basis: resolveBasis(stoneDeducted, inlaysDeducted),
    stoneDeducted,
    inlaysDeducted,
  };
}

/**
 * الحساب الكامل لسعر الصنف — كيرجع التفصيل كامل، ماشي غير السعر النهائي.
 *
 *   gram24   = (ounce × fx) ÷ 31.1035
 *   gramK    = gram24 × (K ÷ 24)
 *   gold     = وزن أساس الاحتساب × gramK
 *   subtotal = gold + سعر الحجر الخاص
 *   final    = subtotal + الربح  (أو سعر يدوي) ثم التقريب
 */
export function computeItemPrice(input: PricingInput): PricingResult {
  const ounce = toDecimal(input.ounceUsd);
  const fx = toDecimal(input.fxRate);
  const karat = input.karat;
  const factor = karatFactor(karat);

  const stonePriceInput =
    input.stonePrice === null || input.stonePrice === undefined ? null : toDecimal(input.stonePrice);
  const stoneHasPrice = stonePriceInput !== null && stonePriceInput.gt(0);

  if (stonePriceInput !== null && stonePriceInput.lt(0)) {
    throw new PricingError('INVALID_NUMBER', 'سعر الحجر لا يمكن أن يكون سالباً');
  }

  const weights = computeWeights({
    totalWeight: input.totalWeight,
    stoneWeight: input.stoneWeight,
    inlaysWeight: input.inlaysWeight,
    basis: input.basis,
    stoneHasPrice,
  });

  const gram24 = gramPrice24(ounce, fx);
  const gramK = gram24.times(factor);

  // الوزن الخام (بلا تقريب) باش الحساب ما يتلوثش
  const basisWeightRaw = toDecimal(weights.basisWeight);
  const goldValueRaw = basisWeightRaw.times(gramK);
  const stoneValueRaw = stoneHasPrice ? stonePriceInput! : new Decimal(0);
  const subtotalRaw = goldValueRaw.plus(stoneValueRaw);

  const fixedBasis: FixedBasis = input.fixedBasis ?? 'PIECE';
  const mode = input.profitMode;
  let profitAmountRaw: Decimal;
  let totalRaw: Decimal;
  /** عدد الوحدات المضروبة في الربح الثابت؛ 1 للأنماط اللي ما تستعملش الأساس */
  let profitUnits = 1;

  if (mode === 'PERCENT') {
    const pct = toDecimal(input.profitValue ?? 0);
    if (pct.lt(0)) throw new PricingError('PROFIT_INVALID', 'نسبة الربح لا يمكن أن تكون سالبة');
    profitAmountRaw = subtotalRaw.times(pct).dividedBy(100);
    totalRaw = subtotalRaw.plus(profitAmountRaw);
  } else if (mode === 'FIXED') {
    const fixed = toDecimal(input.profitValue ?? 0);
    if (fixed.lt(0)) throw new PricingError('PROFIT_INVALID', 'مبلغ الربح لا يمكن أن يكون سالباً');
    // PIECE: مبلغ ثابت لكل قطعة (الطقم يُرسل عدد كل مكوّناته)
    // GRAM: مبلغ ثابت لكل غرام من نفس وزن أساس الاحتساب المستعمل في قيمة الذهب
    const units =
      fixedBasis === 'GRAM'
        ? basisWeightRaw
        : new Decimal(Math.max(1, Math.floor(input.pieceCount || 1)));
    profitAmountRaw = fixed.times(units);
    totalRaw = subtotalRaw.plus(profitAmountRaw);
    profitUnits = fixedBasis === 'GRAM' ? toWeight(units) : units.toNumber();
  } else if (mode === 'MANUAL') {
    if (input.manualPrice === null || input.manualPrice === undefined) {
      throw new PricingError('MANUAL_PRICE_INVALID', 'السعر اليدوي مطلوب عند اختيار السعر النهائي اليدوي');
    }
    totalRaw = toDecimal(input.manualPrice);
    if (totalRaw.lt(0)) throw new PricingError('MANUAL_PRICE_INVALID', 'السعر النهائي لا يمكن أن يكون سالباً');
    profitAmountRaw = totalRaw.minus(subtotalRaw);
  } else {
    throw new PricingError('PROFIT_INVALID', `طريقة ربح غير معروفة: ${String(mode)}`);
  }

  const roundingStep = input.roundingStep ?? 0;
  const beforeRounding = toMoney(totalRaw);
  const finalDec = roundToStep(totalRaw, roundingStep);
  const finalPrice = finalDec.toNumber();

  const cost =
    input.cost === null || input.cost === undefined ? null : toMoney(input.cost);
  const margin = cost === null ? null : toMoney(new Decimal(finalPrice).minus(cost));

  return {
    ounceUsd: ounce.toNumber(),
    fxRate: fx.toNumber(),
    karat,
    karatFactor: factor.toNumber(),

    gramPrice24: toMoney(gram24),
    gramPrice24Raw: gram24.toNumber(),
    gramPriceKarat: toMoney(gramK),
    gramPriceKaratRaw: gramK.toNumber(),

    weights,

    goldValue: toMoney(goldValueRaw),
    goldValueRaw: goldValueRaw.toNumber(),
    stoneValue: toMoney(stoneValueRaw),
    subtotal: toMoney(subtotalRaw),
    subtotalRaw: subtotalRaw.toNumber(),

    profit: {
      mode,
      fixedBasis,
      units: profitUnits,
      input: toDecimal(
        mode === 'MANUAL' ? (input.manualPrice as number) : (input.profitValue ?? 0),
      ).toNumber(),
      amount: toMoney(profitAmountRaw),
    },

    beforeRounding,
    roundingStep: roundingStep > 0 ? roundingStep : 0,
    roundingDelta: toMoney(finalDec.minus(beforeRounding)),
    finalPrice,

    cost,
    margin,
    belowCost: cost !== null && finalPrice < cost,
  };
}
