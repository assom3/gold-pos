import { Router } from 'express';
import { z } from 'zod';
import { buildPriceTable } from '@gold/pricing';
import { prisma } from '../db.js';
import { ah, ok, paging, qInt } from '../lib/http.js';
import { badRequest, forbidden } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { getCurrentPrices } from '../lib/prices.js';
import { GOLDAPI_DOCS_URL, fetchOunceUsd, isGoldApiConfigured } from '../lib/goldapi.js';
import { isAutoRefreshEnabled } from '../lib/price-scheduler.js';
import { priceFetchLimiter } from '../middleware/rateLimit.js';
import { config } from '../config.js';
import { requireRole } from '../auth/middleware.js';

export const pricesRouter = Router();

const createSchema = z.object({
  type: z.enum(['OUNCE', 'FX']),
  value: z.number().positive('القيمة يجب أن تكون أكبر من صفر'),
});

/** حالة مزوّد سعر الأونصة — للواجهة (زر الجلب + رابط التوثيق + التحديث التلقائي) */
function providerInfo() {
  return {
    ounce: {
      mode: config.GOLD_PRICE_PROVIDER,
      configured: isGoldApiConfigured(),
      docsUrl: GOLDAPI_DOCS_URL,
      autoRefresh: isAutoRefreshEnabled(),
      refreshMinutes: config.GOLD_PRICE_REFRESH_MINUTES,
    },
  };
}

/** الأسعار الحالية + حالة التقادم (BR-15) */
pricesRouter.get(
  '/current',
  ah(async (_req, res) => ok(res, await getCurrentPrices())),
);

/** جدول أسعار الغرام لكل العيارات (نقطة التحويل أونصة → عيار) */
pricesRouter.get(
  '/table',
  ah(async (req, res) => {
    const current = await getCurrentPrices();

    const parsePositive = (value: unknown): number | undefined => {
      if (value === undefined || value === null || value === '') return undefined;
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const ounceQuery = parsePositive(req.query.ounce);
    const fxQuery = parsePositive(req.query.fx);

    const ounce = ounceQuery ?? current.ounce?.value;
    const fx = fxQuery ?? current.fx?.value;

    if (!ounce || !fx) {
      return ok(res, {
        ready: false,
        ounce: ounce ?? null,
        fx: fx ?? null,
        table: null,
        current,
        providers: providerInfo(),
      });
    }

    const karatRows = await prisma.lookup.findMany({
      where: { kind: 'KARAT', active: true },
      orderBy: { sortOrder: 'asc' },
    });
    const karats = karatRows.map((k) => Number(k.value)).filter((k) => Number.isFinite(k) && k > 0);

    const table = buildPriceTable(ounce, fx, karats.length > 0 ? karats : [18, 21, 24]);

    return ok(res, { ready: true, ounce, fx, table, current, providers: providerInfo() });
  }),
);

/** جلب سعر الأونصة مباشرة من goldapi.dev وحفظه كمصدر API */
pricesRouter.post(
  '/refresh-ounce',
  requireRole('OWNER'),
  priceFetchLimiter,
  ah(async (req, res) => {
    const quote = await fetchOunceUsd();

    const row = await prisma.priceUpdate.create({
      data: {
        type: 'OUNCE',
        value: quote.price,
        source: 'API',
        userId: req.user!.id,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    await audit({
      userId: req.user!.id,
      action: 'FETCH_PRICE',
      entity: 'price',
      entityId: row.id,
      newValue: {
        type: 'OUNCE',
        value: quote.price,
        source: 'API',
        provider: 'goldapi.dev',
        providerUpdatedAt: quote.updatedAt,
        sourceUrl: quote.sourceUrl,
      },
    });

    return ok(res, { row, quote }, 201);
  }),
);

/** إدخال سعر جديد — المالك والبائع (D-12) مع تسجيل من أدخله */
pricesRouter.post(
  '/',
  ah(async (req, res) => {
    const body = createSchema.parse(req.body);

    // سعر الأونصة يؤثر على تقييم كل المخزون — إدخاله للمالك فقط
    if (body.type === 'OUNCE' && req.user!.role !== 'OWNER') {
      throw forbidden('تعديل سعر الأونصة متاح للمالك فقط');
    }
    if (body.type === 'OUNCE' && (body.value < 100 || body.value > 100_000)) {
      throw badRequest('سعر الأونصة خارج النطاق المنطقي');
    }
    if (body.type === 'FX' && (body.value < 0.000001 || body.value > 10_000)) {
      throw badRequest('سعر الصرف خارج النطاق المنطقي');
    }

    const row = await prisma.priceUpdate.create({
      data: {
        type: body.type,
        value: body.value,
        source: 'MANUAL',
        userId: req.user!.id,
      },
      include: { user: { select: { name: true } } },
    });

    await audit({
      userId: req.user!.id,
      action: 'UPDATE_PRICE',
      entity: 'price',
      entityId: row.id,
      newValue: { type: row.type, value: body.value, source: row.source },
    });

    return ok(res, row, 201);
  }),
);

/** سجل الأسعار (القسم 5: كل تحديث محفوظ ومصدره ومن أدخله) */
pricesRouter.get(
  '/history',
  ah(async (req, res) => {
    const type = req.query.type ? z.enum(['OUNCE', 'FX']).parse(req.query.type) : undefined;
    const { pageSize, skip, take } = paging(req);

    const where = { ...(type ? { type } : {}) };

    const [rows, total] = await Promise.all([
      prisma.priceUpdate.findMany({
        where,
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.priceUpdate.count({ where }),
    ]);

    return ok(res, { rows, total, page: qInt(req.query.page, 1, 1), pageSize });
  }),
);
