export type PricingErrorCode =
  | 'OUNCE_INVALID'
  | 'FX_INVALID'
  | 'KARAT_INVALID'
  | 'WEIGHT_INVALID'
  | 'WEIGHT_NEGATIVE'
  | 'STONE_TOO_HEAVY'
  | 'PROFIT_INVALID'
  | 'MANUAL_PRICE_INVALID'
  | 'ROUNDING_INVALID'
  | 'INVALID_NUMBER';

export class PricingError extends Error {
  readonly code: PricingErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: PricingErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'PricingError';
    this.code = code;
    this.details = details;
  }
}
