/**
 * محرك التسعير — الأنواع المشتركة
 * كل الواجهات (API / Web) كتستعمل نفس الأنواع باش ما يكونش اختلاف فالحساب.
 */

/** أساس وزن الاحتساب (D-08) */
export type WeightBasis = 'NET_GOLD' | 'TOTAL' | 'MINUS_STONE' | 'MINUS_INLAYS';

/** طريقة تحديد الربح (D-11) */
export type ProfitMode = 'PERCENT' | 'FIXED' | 'MANUAL';

/** أساس الربح الثابت عند profitMode = FIXED: لكل غرام أو لكل قطعة */
export type FixedBasis = 'GRAM' | 'PIECE';

export interface KaratPrice {
  /** العيار (18 / 21 / 24 ...) */
  karat: number;
  /** معامل العيار من 24 */
  factor: number;
  /** سعر الغرام بهذا العيار، مقرّب لخانتين */
  pricePerGram: number;
  /** سعر الغرام الكامل بلا تقريب (للمراجعة والاختبارات) */
  pricePerGramRaw: number;
}

export interface PriceTable {
  ounceUsd: number;
  fxRate: number;
  /** سعر غرام عيار 24 */
  gramPrice24: number;
  gramPrice24Raw: number;
  rows: KaratPrice[];
}

export interface WeightsInput {
  totalWeight: number;
  stoneWeight?: number;
  inlaysWeight?: number;
  basis: WeightBasis;
  /** إذا كان للحجر سعر خاص، وزنه كيتخصم دائماً (BR-10 / D-17) */
  stoneHasPrice?: boolean;
}

export interface WeightBreakdown {
  total: number;
  stone: number;
  inlays: number;
  netGold: number;
  basisWeight: number;
  /** الأساس الفعلي بعد تطبيق BR-10 */
  basis: WeightBasis;
  stoneDeducted: boolean;
  inlaysDeducted: boolean;
}

export interface PricingInput {
  ounceUsd: number;
  fxRate: number;
  karat: number;
  totalWeight: number;
  stoneWeight?: number;
  inlaysWeight?: number;
  /** سعر الحجر الخاص إن وجد (D-09 / D-17) */
  stonePrice?: number | null;
  basis: WeightBasis;
  profitMode: ProfitMode;
  /** نسبة مئوية أو مبلغ ثابت حسب profitMode */
  profitValue?: number;
  /** أساس الربح الثابت عند FIXED — الافتراضي PIECE (توافق مع السلوك القديم) */
  fixedBasis?: FixedBasis;
  /**
   * عدد القطع المكوّنة للصنف عند FIXED و fixedBasis = PIECE (الافتراضي 1).
   * بالنسبة للطقم يجب إرسال عدد كل القطع المكوّنة للطقم، وليس 1.
   */
  pieceCount?: number;
  /** السعر النهائي اليدوي عند mode = MANUAL */
  manualPrice?: number;
  /** تقريب السعر النهائي: 0 = بدون، 5 / 10 (D: تقريب السعر) */
  roundingStep?: number;
  /** تكلفة الصنف بالعملة المحلية، اختياري — لحساب التحذير BR-09 */
  cost?: number | null;
}

export interface PricingResult {
  ounceUsd: number;
  fxRate: number;
  karat: number;
  karatFactor: number;

  gramPrice24: number;
  gramPrice24Raw: number;
  gramPriceKarat: number;
  gramPriceKaratRaw: number;

  weights: WeightBreakdown;

  goldValue: number;
  goldValueRaw: number;
  stoneValue: number;
  subtotal: number;
  subtotalRaw: number;

  profit: {
    mode: ProfitMode;
    /** أساس الربح الثابت المستعمل (الافتراضي PIECE حتى في الأنماط الأخرى) */
    fixedBasis: FixedBasis;
    /**
     * عدد الوحدات المضروبة في الربح الثابت:
     * - PIECE: عدد القطع الفعّال بعد التنظيف (الحد الأدنى 1)
     * - GRAM: وزن أساس الاحتساب المستخدم، مقرّب لثلاث خانات
     * - PERCENT / MANUAL: 1 (لا يُستعمل أساس الربح الثابت)
     */
    units: number;
    /** النسبة أو المبلغ المدخل */
    input: number;
    /** مبلغ الربح الفعلي بالعملة */
    amount: number;
  };

  /** السعر قبل تطبيق التقريب */
  beforeRounding: number;
  roundingStep: number;
  roundingDelta: number;
  finalPrice: number;

  cost: number | null;
  margin: number | null;
  belowCost: boolean;
}
