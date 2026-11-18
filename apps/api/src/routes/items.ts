import { Router } from 'express';
import { z } from 'zod';
import { Prisma, type ComponentKind, type ItemType, type Role } from '@prisma/client';
import { prisma } from '../db.js';
import { ah, ok, paging } from '../lib/http.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { nextSequence } from '../lib/sequence.js';
import { aggregateComponents, basisFromSettings, pieceNetGold, purchaseCostDinar, purchaseFromGram } from '../lib/item-math.js';
import { computeWeights } from '@gold/pricing';
import { requireRole } from '../auth/middleware.js';

export const itemsRouter = Router();

const optionalId = z.number().int().positive().nullable().optional();

const componentSchema = z.object({
  kind: z.enum(['RING', 'BRACELET', 'NECKLACE', 'EARRING', 'ANKLET', 'CHAIN', 'PENDANT', 'OTHER']),
  name: z.string().trim().max(120).nullable().optional(),
  karat: z.number().int().min(1).max(24),
  weight: z.number().positive('وزن المكوّن مطلوب'),
  stoneWeight: z.number().min(0).default(0),
  stonePrice: z.number().min(0).nullable().optional(),
  inlaysWeight: z.number().min(0).default(0),
  notes: z.string().max(2000).nullable().optional(),
});

const itemSchema = z.object({
  type: z.enum(['PIECE', 'SET']),
  code: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, 'الكود يقبل حروفاً لاتينية وأرقاماً وشرطات فقط')
    .optional(),
  name: z.string().trim().min(1, 'اسم القطعة مطلوب').max(160),
  categoryId: optionalId,
  size: z.string().trim().max(40).nullable().optional(),
  karat: z.number().int().min(1).max(24),

  totalWeight: z.number().positive('الوزن الإجمالي مطلوب').optional(),
  stoneWeight: z.number().min(0).default(0),
  stonePrice: z.number().min(0).nullable().optional(),
  inlaysWeight: z.number().min(0).default(0),

  quantity: z.number().int().min(1).max(9999).default(1),
  confirmSameWeight: z.boolean().optional(),

  purchaseGramPrice: z.number().min(0).nullable().optional(),
  purchasePrice: z.number().min(0).optional().default(0),
  purchaseCurrency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'رمز عملة الشراء يجب أن يكون 3 حروف لاتينية')
    .default('USD'),
  purchaseFxRate: z.number().positive('سعر الصرف يجب أن يكون أكبر من صفر').optional(),
  purchaseStatus: z.enum(['NEW', 'USED', 'SCRAP']).default('NEW'),

  weightBasis: z.enum(['NET_GOLD', 'TOTAL', 'MINUS_STONE', 'MINUS_INLAYS']).nullable().optional(),

  supplierId: optionalId,
  countryId: optionalId,
  manufacturerId: optionalId,
  manufacturer: z.string().trim().max(160).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  addedAt: z.string().datetime().optional(),

  components: z.array(componentSchema).optional(),
});

async function getSettings() {
  const setting = await prisma.setting.findUnique({ where: { id: 1 } });
  if (!setting) throw badRequest('إعدادات المحل غير مهيأة');
  return setting;
}

/** حقول الشراء لا تُرسل للبائع إذا كان إعداد المحل يمنع إظهار التكلفة */
const PURCHASE_FIELDS = [
  'purchaseGramPrice',
  'purchasePrice',
  'purchaseCurrency',
  'purchaseFxRate',
  'purchaseCostDinar',
  'purchaseStatus',
] as const;

function hidePurchase<T extends object>(row: T): Partial<T> {
  const copy = { ...row } as Record<string, unknown>;
  for (const key of PURCHASE_FIELDS) delete copy[key];
  return copy as Partial<T>;
}

function canSeePurchase(role: Role, setting: { showCostToSeller: boolean }): boolean {
  return role === 'OWNER' || setting.showCostToSeller;
}

const CODE_PREFIX: Record<ItemType, string> = { PIECE: 'P', SET: 'S' };
const CODE_SEQUENCE: Record<ItemType, string> = { PIECE: 'ITEM_CODE_PIECE', SET: 'ITEM_CODE_SET' };

/** التحقق من أن القيمة المختارة تنتمي فعلاً لنوع القائمة المطلوب */
async function resolveLookupId(
  id: number | null | undefined,
  kind: 'CATEGORY' | 'SUPPLIER' | 'COUNTRY',
  label: string,
): Promise<number | null> {
  if (id === null || id === undefined) return null;
  const row = await prisma.lookup.findUnique({ where: { id } });
  if (!row || row.kind !== kind) throw badRequest(`${label} المحدد غير صالح`);
  return row.id;
}

/**
 * التصنيف: الطقم يُجبَر على تصنيف «طقم» إن كان موجوداً في القوائم،
 * حتى لو أرسل العميل تصنيفاً آخر. القطع المفردة تبقى كما اختارها المستخدم.
 */
async function resolveCategoryId(
  type: ItemType,
  categoryId: number | null | undefined,
): Promise<number | null> {
  if (type === 'SET') {
    const setCategory = await prisma.lookup.findFirst({
      where: { kind: 'CATEGORY', value: 'طقم', active: true },
      orderBy: { id: 'asc' },
    });
    if (setCategory) return setCategory.id;
  }
  return resolveLookupId(categoryId, 'CATEGORY', 'التصنيف');
}

/**
 * المصنّع يُختار من قائمة المصانع. نحفظ المعرّف للربط،
 * ونُبقي النص في manufacturer للتوافق مع التقارير والبيانات القديمة.
 */
async function resolveManufacturer(body: z.infer<typeof itemSchema>): Promise<{ id: number | null; name: string | null }> {
  if (body.manufacturerId) {
    const row = await prisma.lookup.findUnique({ where: { id: body.manufacturerId } });
    if (!row || row.kind !== 'MANUFACTURER') throw badRequest('المصنّع المحدد غير صالح');
    return { id: row.id, name: row.value };
  }
  return { id: null, name: body.manufacturer?.trim() || null };
}

/** كود جديد من العدّاد الذري، مع تجاوز أي كود مستعمل (حتى لو حُذف صنف قديم) */
async function generateCode(tx: Prisma.TransactionClient, type: ItemType): Promise<string> {
  const prefix = CODE_PREFIX[type];
  const seqName = CODE_SEQUENCE[type];

  for (let attempt = 0; attempt < 100; attempt++) {
    const n = await nextSequence(tx, seqName);
    const candidate = `${prefix}-${String(n).padStart(4, '0')}`;
    const exists = await tx.item.findUnique({ where: { code: candidate } });
    if (!exists) return candidate;
  }
  throw conflict('تعذر توليد كود فريد، الرجاء إدخال كود يدوي');
}

/** معاينة الكود التالي دون استهلاك العدّاد — تُحسب من أعلى كود موجود أيضاً */
async function peekNextCode(type: ItemType): Promise<string> {
  const prefix = CODE_PREFIX[type];
  const [sequence, rows] = await Promise.all([
    prisma.sequence.findUnique({ where: { name: CODE_SEQUENCE[type] } }),
    prisma.item.findMany({ where: { code: { startsWith: `${prefix}-` } }, select: { code: true } }),
  ]);

  const used = new Set(rows.map((row) => row.code));
  let highest = sequence?.value ?? 0;
  for (const code of used) {
    const match = /^([A-Z])-(\d+)$/.exec(code);
    if (match && match[1] === prefix) highest = Math.max(highest, Number(match[2]));
  }

  let next = highest + 1;
  while (used.has(`${prefix}-${String(next).padStart(4, '0')}`)) next += 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

function resolveTotals(
  body: z.infer<typeof itemSchema>,
): { totalWeight: number; stoneWeight: number; inlaysWeight: number; netGoldWeight: number } {
  if (body.type === 'SET') {
    const components = body.components ?? [];
    if (components.length === 0) throw badRequest('الطقم يجب أن يحتوي على مكوّن واحد على الأقل');

    const totals = aggregateComponents(components);
    if (totals.netGoldWeight <= 0) throw badRequest('مجموع أوزان المكونات غير صالح');
    return totals;
  }

  if (!body.totalWeight || body.totalWeight <= 0) throw badRequest('الوزن الإجمالي مطلوب');

  // التحقق من الأوزان (BR-04)
  const weights = computeWeights({
    totalWeight: body.totalWeight,
    stoneWeight: body.stoneWeight,
    inlaysWeight: body.inlaysWeight,
    basis: 'NET_GOLD',
  });

  return {
    totalWeight: weights.total,
    stoneWeight: weights.stone,
    inlaysWeight: weights.inlays,
    netGoldWeight: weights.netGold,
  };
}

interface PurchaseValues {
  gramPrice: number | null;
  total: number;
  currency: string;
  fxRate: number;
  costDinar: number;
}

/**
 * حساب الشراء: سعر الغرام هو المصدر، والوزن هو الذهب الصافي.
 * إذا لم يُرسل سعر الغرام (واجهات قديمة) نستخدم الإجمالي المرسل ونستنتج سعر الغرام.
 */
function resolvePurchase(
  body: z.infer<typeof itemSchema>,
  netGoldWeight: number,
  localCurrency: string,
): PurchaseValues {
  const currency = body.purchaseCurrency.toUpperCase();
  const gramPrice = body.purchaseGramPrice;
  const isLocal = currency === localCurrency;
  const fxRate = isLocal ? 1 : Number(body.purchaseFxRate ?? 0);
  if (!isLocal && (!Number.isFinite(fxRate) || fxRate <= 0)) {
    throw badRequest('سعر الصرف مطلوب عند الشراء بعملة أجنبية');
  }

  if (gramPrice !== null && gramPrice !== undefined) {
    const calc = purchaseFromGram(gramPrice, netGoldWeight, currency, fxRate, localCurrency);
    return { gramPrice, total: calc.total, currency, fxRate: calc.fxRate, costDinar: calc.costDinar };
  }

  const total = Math.round(Number(body.purchasePrice) * 100) / 100;
  return {
    gramPrice: total > 0 && netGoldWeight > 0 ? Math.round((total / netGoldWeight) * 10_000) / 10_000 : null,
    total,
    currency,
    fxRate,
    costDinar: purchaseCostDinar(total, currency, fxRate, localCurrency),
  };
}

itemsRouter.get(
  '/',
  ah(async (req, res) => {
    const { page, pageSize, skip, take } = paging(req);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const status = req.query.status ? z.enum(['AVAILABLE', 'SOLD']).parse(req.query.status) : undefined;
    const type = req.query.type ? z.enum(['PIECE', 'SET']).parse(req.query.type) : undefined;
    const karatParsed = req.query.karat ? Number(req.query.karat) : undefined;
    const karat = Number.isInteger(karatParsed) && karatParsed! >= 1 && karatParsed! <= 24 ? karatParsed : undefined;

    const where: Prisma.ItemWhereInput = {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(karat ? { karat } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { code: { contains: q } },
              { description: { contains: q } },
              { manufacturer: { contains: q } },
            ],
          }
        : {}),
    };

    const [rows, total, setting] = await Promise.all([
      prisma.item.findMany({
        where,
        include: {
          category: true,
          supplier: true,
          country: true,
          manufacturerLookup: true,
          components: { orderBy: { sortOrder: 'asc' } },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take,
      }),
      prisma.item.count({ where }),
      prisma.setting.findUnique({ where: { id: 1 } }),
    ]);

    const visible = setting ? canSeePurchase(req.user!.role, setting) : req.user!.role === 'OWNER';
    const safeRows = visible ? rows : rows.map((row) => hidePurchase(row));

    return ok(res, { rows: safeRows, total, page, pageSize });
  }),
);

/** معاينة الكود التالي قبل الحفظ */
itemsRouter.get(
  '/next-code',
  ah(async (req, res) => {
    const type = z.enum(['PIECE', 'SET']).parse(req.query.type ?? 'PIECE');
    const setting = await getSettings();

    if (setting.codeMode === 'MANUAL') {
      return ok(res, { code: null, mode: 'MANUAL' });
    }

    return ok(res, { code: await peekNextCode(type as ItemType), mode: 'AUTO' });
  }),
);

/** بحث بالكود — كيستعمل فشاشة البيع (D-11) */
itemsRouter.get(
  '/by-code/:code',
  ah(async (req, res) => {
    const code = String(req.params.code ?? '').trim();
    const item = await prisma.item.findUnique({
      where: { code },
      include: {
        category: true,
        manufacturerLookup: true,
        components: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!item) throw notFound('لا يوجد صنف بهذا الكود');
    const setting = await prisma.setting.findUnique({ where: { id: 1 } });
    const visible = setting ? canSeePurchase(req.user!.role, setting) : req.user!.role === 'OWNER';
    return ok(res, visible ? item : hidePurchase(item));
  }),
);

itemsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('معرّف غير صالح');

    const [item, setting] = await Promise.all([
      prisma.item.findUnique({
        where: { id },
        include: {
          category: true,
          supplier: true,
          country: true,
          manufacturerLookup: true,
          components: { orderBy: { sortOrder: 'asc' } },
        },
      }),
      prisma.setting.findUnique({ where: { id: 1 } }),
    ]);
    if (!item) throw notFound('الصنف غير موجود');
    const visible = setting ? canSeePurchase(req.user!.role, setting) : req.user!.role === 'OWNER';
    return ok(res, visible ? item : hidePurchase(item));
  }),
);

itemsRouter.post(
  '/',
  ah(async (req, res) => {
    const body = itemSchema.parse(req.body);
    const setting = await getSettings();

    if (req.user!.role === 'SELLER' && !setting.sellerCanAddItems) {
      throw forbidden('إدخال الأصناف غير مسموح للبائع حسب إعداد المحل');
    }

    // D-06 / BR-03: الكمية فقط للقطع المتطابقة وبتأكيد المستخدم
    if (body.type === 'SET' && body.quantity !== 1) {
      throw badRequest('الطقم كود واحد لنسخة واحدة فقط');
    }
    if (body.quantity > 1 && body.confirmSameWeight !== true) {
      throw badRequest('يجب تأكيد أن جميع القطع بنفس الوزن والمواصفات');
    }

    if (setting.codeMode === 'MANUAL' && !body.code) {
      throw badRequest('إدخال الكود يدوي حسب إعدادات المحل — اكتب كود الصنف');
    }

    // حماية التكلفة: البائع لا يكتب بيانات شراء لا يستطيع رؤيتها
    if (req.user!.role === 'SELLER' && !setting.showCostToSeller) {
      const hasCost =
        Number(body.purchaseGramPrice ?? 0) > 0 || Number(body.purchasePrice ?? 0) > 0;
      if (hasCost) throw forbidden('إدخال بيانات الشراء متاح للمالك فقط');
    }

    const totals = resolveTotals(body);
    const purchase = resolvePurchase(body, totals.netGoldWeight, setting.currency.toUpperCase());
    const [manufacturer, categoryId, supplierId, countryId] = await Promise.all([
      resolveManufacturer(body),
      resolveCategoryId(body.type as ItemType, body.categoryId),
      resolveLookupId(body.supplierId, 'SUPPLIER', 'المورّد'),
      resolveLookupId(body.countryId, 'COUNTRY', 'بلد المنشأ'),
    ]);

    const created = await prisma.$transaction(async (tx) => {
      // في النمط التلقائي الخادم هو من يحدد الكود دائماً،
      // حتى لا يُحفظ كود معاينة قديم أو مكرر أرسله العميل.
      const code =
        setting.codeMode === 'MANUAL'
          ? body.code!.trim()
          : await generateCode(tx, body.type as ItemType);

      const exists = await tx.item.findUnique({ where: { code } });
      if (exists) throw conflict('كود الصنف مستعمل مسبقاً. اختر كوداً آخر أو اتركه فارغاً ليُولَّد تلقائياً.');

      const item = await tx.item.create({
        data: {
          type: body.type as ItemType,
          code,
          name: body.name,
          karat: body.karat,
          categoryId,
          size: body.size ?? null,
          totalWeight: totals.totalWeight,
          stoneWeight: totals.stoneWeight,
          stonePrice: body.type === 'SET' ? null : (body.stonePrice ?? null),
          inlaysWeight: totals.inlaysWeight,
          netGoldWeight: totals.netGoldWeight,
          quantity: body.quantity,
          purchaseGramPrice: purchase.gramPrice,
          purchasePrice: purchase.total,
          purchaseCurrency: purchase.currency,
          purchaseFxRate: purchase.fxRate,
          purchaseCostDinar: purchase.costDinar,
          purchaseStatus: body.purchaseStatus,
          weightBasis: body.weightBasis ?? null,
          supplierId,
          countryId,
          manufacturerId: manufacturer.id,
          manufacturer: manufacturer.name,
          description: body.description ?? null,
          notes: body.notes ?? null,
          addedAt: body.addedAt ? new Date(body.addedAt) : new Date(),
          ...(body.type === 'SET' && body.components
            ? {
                components: {
                  create: body.components.map((c, i) => ({
                    kind: c.kind as ComponentKind,
                    name: c.name ?? null,
                    karat: c.karat,
                    weight: c.weight,
                    stoneWeight: c.stoneWeight,
                    stonePrice: c.stonePrice ?? null,
                    inlaysWeight: c.inlaysWeight,
                    netGoldWeight: pieceNetGold(c.weight, c.stoneWeight, c.inlaysWeight),
                    notes: c.notes ?? null,
                    sortOrder: i,
                  })),
                },
              }
            : {}),
        },
        include: { components: true, category: true, manufacturerLookup: true },
      });

      await audit(
        {
          userId: req.user!.id,
          action: 'CREATE_ITEM',
          entity: 'item',
          entityId: item.id,
          newValue: { code: item.code, name: item.name, type: item.type },
        },
        tx,
      );

      return item;
    });

    return ok(res, canSeePurchase(req.user!.role, setting) ? created : hidePurchase(created), 201);
  }),
);

itemsRouter.patch(
  '/:id',
  requireRole('OWNER'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('معرّف غير صالح');

    const body = itemSchema.parse(req.body);
    const existing = await prisma.item.findUnique({ where: { id }, include: { components: true } });
    if (!existing) throw notFound('الصنف غير موجود');
    if (existing.status === 'SOLD') throw badRequest('لا يمكن تعديل صنف مباع');
    if (body.type !== existing.type) throw badRequest('لا يمكن تغيير نوع الصنف بعد إنشائه');
    if (body.type === 'SET' && body.quantity !== 1) {
      throw badRequest('الطقم كود واحد لنسخة واحدة فقط');
    }
    if (body.quantity > 1 && body.confirmSameWeight !== true) {
      throw badRequest('يجب تأكيد أن جميع القطع بنفس الوزن والمواصفات');
    }

    const setting = await getSettings();
    const totals = resolveTotals(body);
    const purchase = resolvePurchase(body, totals.netGoldWeight, setting.currency.toUpperCase());
    const [manufacturer, categoryId, supplierId, countryId] = await Promise.all([
      resolveManufacturer(body),
      resolveCategoryId(body.type as ItemType, body.categoryId),
      resolveLookupId(body.supplierId, 'SUPPLIER', 'المورّد'),
      resolveLookupId(body.countryId, 'COUNTRY', 'بلد المنشأ'),
    ]);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.setComponent.deleteMany({ where: { setItemId: id } });

      const item = await tx.item.update({
        where: { id },
        data: {
          name: body.name,
          karat: body.karat,
          categoryId,
          size: body.size ?? null,
          totalWeight: totals.totalWeight,
          stoneWeight: totals.stoneWeight,
          stonePrice: body.type === 'SET' ? null : (body.stonePrice ?? null),
          inlaysWeight: totals.inlaysWeight,
          netGoldWeight: totals.netGoldWeight,
          quantity: body.quantity,
          purchaseGramPrice: purchase.gramPrice,
          purchasePrice: purchase.total,
          purchaseCurrency: purchase.currency,
          purchaseFxRate: purchase.fxRate,
          purchaseCostDinar: purchase.costDinar,
          purchaseStatus: body.purchaseStatus,
          weightBasis: body.weightBasis ?? null,
          supplierId,
          countryId,
          manufacturerId: manufacturer.id,
          manufacturer: manufacturer.name,
          description: body.description ?? null,
          notes: body.notes ?? null,
          ...(body.addedAt ? { addedAt: new Date(body.addedAt) } : {}),
          ...(body.type === 'SET' && body.components
            ? {
                components: {
                  create: body.components.map((c, i) => ({
                    kind: c.kind as ComponentKind,
                    name: c.name ?? null,
                    karat: c.karat,
                    weight: c.weight,
                    stoneWeight: c.stoneWeight,
                    stonePrice: c.stonePrice ?? null,
                    inlaysWeight: c.inlaysWeight,
                    netGoldWeight: pieceNetGold(c.weight, c.stoneWeight, c.inlaysWeight),
                    notes: c.notes ?? null,
                    sortOrder: i,
                  })),
                },
              }
            : {}),
        },
        include: { components: true, category: true, manufacturerLookup: true },
      });

      await audit(
        {
          userId: req.user!.id,
          action: 'UPDATE_ITEM',
          entity: 'item',
          entityId: id,
          oldValue: {
            name: existing.name,
            karat: existing.karat,
            totalWeight: existing.totalWeight.toString(),
            quantity: existing.quantity,
            purchasePrice: existing.purchasePrice.toString(),
          },
          newValue: { name: item.name, karat: item.karat, totalWeight: item.totalWeight.toString(), quantity: item.quantity },
        },
        tx,
      );

      return item;
    });

    return ok(res, updated);
  }),
);

itemsRouter.delete(
  '/:id',
  requireRole('OWNER'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('معرّف غير صالح');

    const existing = await prisma.item.findUnique({
      where: { id },
      include: { _count: { select: { saleItems: true } } },
    });
    if (!existing) throw notFound('الصنف غير موجود');
    if (existing._count.saleItems > 0) {
      throw conflict('لا يمكن حذف صنف مرتبط بعمليات بيع. يبقى الصنف في السجل التاريخي للفواتير.');
    }

    await prisma.item.delete({ where: { id } });
    await audit({
      userId: req.user!.id,
      action: 'DELETE_ITEM',
      entity: 'item',
      entityId: id,
      oldValue: { code: existing.code, name: existing.name },
    });

    return ok(res, { ok: true });
  }),
);
