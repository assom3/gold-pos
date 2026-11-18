const moneyFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const intFmt = new Intl.NumberFormat('en-US');

const weightFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

export function fmtMoney(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0);
  if (!Number.isFinite(n)) return '0.00';
  return moneyFmt.format(n);
}

export function fmtWeight(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0);
  if (!Number.isFinite(n)) return '0.00';
  return weightFmt.format(n);
}

export function fmtNum(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0);
  if (!Number.isFinite(n)) return '0';
  return intFmt.format(n);
}

export function fmtMoneyWithCurrency(value: number | string | null | undefined, currency = 'LYD'): string {
  return `${fmtMoney(value)} ${currency}`;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return dateFmt.format(d);
}

export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return `${dateFmt.format(d)} · ${timeFmt.format(d)}`;
}

export function fmtTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return timeFmt.format(d);
}

/** «قبل 5 دقائق» — للأسعار وآخر تحديث */
export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  if (Number.isNaN(diff)) return '—';

  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `قبل ${days} يوم`;
}

export const KARAT_LABEL = (k: number) => `${k}`;

import type { FixedBasis, ProfitMode, StocktakeType, WeightBasis } from './types';

export const TYPE_LABEL: Record<string, string> = { PIECE: 'قطعة', SET: 'طقم' };
export const STATUS_LABEL: Record<string, string> = { AVAILABLE: 'موجود', SOLD: 'مباع' };
export const PURCHASE_STATUS_LABEL: Record<string, string> = {
  NEW: 'جديد',
  USED: 'مستعمل',
  SCRAP: 'كسر',
};
export const BASIS_LABEL: Record<WeightBasis, string> = {
  NET_GOLD: 'وزن الذهب الصافي',
  TOTAL: 'الوزن الإجمالي',
  MINUS_STONE: 'خصم الحجر فقط',
  MINUS_INLAYS: 'خصم الفصوص فقط',
};
export const PROFIT_MODE_LABEL: Record<ProfitMode, string> = {
  PERCENT: 'نسبة مئوية',
  FIXED: 'مبلغ ثابت',
  MANUAL: 'سعر نهائي يدوي',
};
export const FIXED_BASIS_LABEL: Record<FixedBasis, string> = {
  GRAM: 'لكل غرام',
  PIECE: 'لكل قطعة',
};
export const STOCKTAKE_TYPE_LABEL: Record<StocktakeType, string> = {
  QUARTERLY: 'ربع سنوي',
  SEMIANNUAL: 'نصف سنوي',
  ANNUAL: 'سنوي',
};
export const COMPONENT_KIND_LABEL: Record<string, string> = {
  RING: 'خاتم',
  BRACELET: 'أسورة',
  NECKLACE: 'سلسلة',
  EARRING: 'حلق',
  ANKLET: 'خلخال',
  CHAIN: 'حديدة',
  PENDANT: 'تعليقة',
  OTHER: 'أخرى',
};

/** حجم ملف مقروء: 28 ك.ب / 3.4 م.ب */
export function fmtBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ك.ب`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} م.ب`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} ج.ب`;
}

/** «كل 24 ساعة» / «كل يوم» / «كل أسبوع» */
export function fmtInterval(hours: number): string {
  if (hours === 24) return 'كل يوم';
  if (hours === 48) return 'كل يومين';
  if (hours === 168) return 'كل أسبوع';
  return `كل ${hours} ساعات`;
}
