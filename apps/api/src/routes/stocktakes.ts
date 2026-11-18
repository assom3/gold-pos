import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ah, ok } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { nextSequence } from '../lib/sequence.js';
import { basisFromSettings } from '../lib/item-math.js';
import { getCurrentPrices } from '../lib/prices.js';
import { round2, round3, valueItem } from '../lib/valuation.js';
import { requireRole } from '../auth/middleware.js';

export const stocktakesRouter = Router();

const createSchema = z.object({
  type: z.enum(['QUARTERLY', 'SEMIANNUAL', 'ANNUAL']),
  notes: z.string().max(2000).nullable().optional(),
});

/** فتح جرد جديد + لقطة للأصناف الموجودة (القسم 6.2) */
stocktakesRouter.post(
  '/',
  requireRole('OWNER'),
  ah(async (req, res) => {
    const body = createSchema.parse(req.body);

    const [setting, prices, items] = await Promise.all([
      prisma.setting.findUnique({ where: { id: 1 } }),
      getCurrentPrices(),
      prisma.item.findMany({ where: { status: 'AVAILABLE' }, include: { components: true } }),
    ]);

    const basis = basisFromSettings(setting?.deductStone ?? true, setting?.deductInlays ?? true);
    const ounce = prices.ounce?.value ?? 0;
    const fx = prices.fx?.value ?? 0;

    const stocktake = await prisma.$transaction(async (tx) => {
      // أخذ العدّاد أولاً يقفل صفه، فيتسلسل فتح الجردين المتزامنين
      // ويرى الثاني الجرد المفتوح من الأول قبل أن يُنشئ جرداً آخر.
      const seq = await nextSequence(tx, 'STOCKTAKE_REF');

      // قراءة بقفل (FOR UPDATE) لترى آخر ما التُزم به، لا لقطة المعاملة القديمة
      const open = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM Stocktake WHERE status = 'OPEN' LIMIT 1 FOR UPDATE
      `;
      if (open.length > 0) throw badRequest('يوجد جرد مفتوح بالفعل، يجب إغلاقه أولاً');

      const created = await tx.stocktake.create({
        data: {
          type: body.type,
          openedById: req.user!.id,
          notes: body.notes ?? null,
        },
      });

      if (items.length > 0) {
        await tx.stocktakeLine.createMany({
          data: items.map((item) => {
            const valuation = prices.ready
              ? valueItem(item, ounce, fx, basis)
              : { value: 0 };
            // الصنف بكمية N يُعدّ كله في سطر واحد: الوزن والقيمة المتوقعان = وحدة × الكمية
            return {
              stocktakeId: created.id,
              itemId: item.id,
              itemCode: item.code,
              expectedWeight: round3(Number(item.totalWeight) * item.quantity),
              valueAtOpen: round2(valuation.value * item.quantity),
              present: true,
            };
          }),
        });
      }

      await audit(
        {
          userId: req.user!.id,
          action: 'OPEN_STOCKTAKE',
          entity: 'stocktake',
          entityId: created.id,
          newValue: { type: body.type, ref: seq, lines: items.length },
        },
        tx,
      );

      return created;
    });

    const full = await prisma.stocktake.findUnique({
      where: { id: stocktake.id },
      include: {
        openedBy: { select: { id: true, name: true } },
        lines: { include: { item: { select: { id: true, code: true, name: true, karat: true, quantity: true } } } },
      },
    });

    return ok(res, full, 201);
  }),
);

stocktakesRouter.get(
  '/',
  ah(async (_req, res) => {
    const rows = await prisma.stocktake.findMany({
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
    return ok(res, rows);
  }),
);

stocktakesRouter.get(
  '/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('معرّف غير صالح');

    const row = await prisma.stocktake.findUnique({
      where: { id },
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        lines: {
          include: { item: { select: { id: true, code: true, name: true, karat: true, quantity: true } } },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!row) throw notFound('الجرد غير موجود');
    return ok(res, row);
  }),
);

const lineSchema = z.object({
  countedWeight: z.number().min(0).nullable().optional(),
  present: z.boolean().optional(),
});

stocktakesRouter.patch(
  '/:id/lines/:lineId',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const lineId = Number(req.params.lineId);
    if (!Number.isInteger(id) || !Number.isInteger(lineId)) throw badRequest('معرّف غير صالح');

    const body = lineSchema.parse(req.body);

    const stocktake = await prisma.stocktake.findUnique({ where: { id } });
    if (!stocktake) throw notFound('الجرد غير موجود');
    if (stocktake.status === 'CLOSED') throw badRequest('لا يمكن تعديل جرد مغلق (BR-14)');

    const line = await prisma.stocktakeLine.findUnique({ where: { id: lineId } });
    if (!line || line.stocktakeId !== id) throw notFound('السطر غير موجود');

    const expected = Number(line.expectedWeight);
    const counted = body.countedWeight === undefined ? (line.countedWeight ? Number(line.countedWeight) : null) : body.countedWeight;
    const diff = counted === null || counted === undefined ? null : Math.round((counted - expected) * 1000) / 1000;

    // تعديل الجرد يُسجَّل بالكامل: من عدّل، وماذا كانت القيمة قبل وبعد
    const updated = await prisma.$transaction(async (tx) => {
      // نقفل صف الجرد ثم نعيد فحص حالته: يمنع تعديل سطر أثناء إغلاق الجرد من طلب متزامن (BR-14)
      const locked = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM Stocktake WHERE id = ${id} FOR UPDATE
      `;
      if (locked[0]?.status !== 'OPEN') throw badRequest('لا يمكن تعديل جرد مغلق (BR-14)');

      const changed = await tx.stocktakeLine.updateMany({
        where: { id: lineId, stocktakeId: id },
        data: {
          ...(body.countedWeight !== undefined ? { countedWeight: body.countedWeight } : {}),
          ...(body.present !== undefined ? { present: body.present } : {}),
          weightDiff: diff,
        },
      });
      if (changed.count !== 1) throw notFound('السطر غير موجود');

      await audit(
        {
          userId: req.user!.id,
          action: 'UPDATE_STOCKTAKE_LINE',
          entity: 'stocktakeLine',
          entityId: lineId,
          oldValue: {
            countedWeight: line.countedWeight?.toString() ?? null,
            present: line.present,
            weightDiff: line.weightDiff?.toString() ?? null,
          },
          newValue: {
            countedWeight: body.countedWeight ?? line.countedWeight?.toString() ?? null,
            present: body.present ?? line.present,
            weightDiff: diff,
            stocktakeId: id,
          },
        },
        tx,
      );

      return tx.stocktakeLine.findUniqueOrThrow({ where: { id: lineId } });
    });

    return ok(res, updated);
  }),
);

stocktakesRouter.post(
  '/:id/close',
  requireRole('OWNER'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('معرّف غير صالح');

    const stocktake = await prisma.stocktake.findUnique({ where: { id }, include: { lines: true } });
    if (!stocktake) throw notFound('الجرد غير موجود');
    if (stocktake.status === 'CLOSED') throw badRequest('الجرد مغلق مسبقاً');

    const closed = await prisma.$transaction(async (tx) => {
      // تحديث شرطي: يمنع الإغلاق المزدوج من طلبين متزامنين
      const changed = await tx.stocktake.updateMany({
        where: { id, status: 'OPEN' },
        data: { status: 'CLOSED', closedAt: new Date(), closedById: req.user!.id },
      });
      if (changed.count !== 1) throw badRequest('الجرد مغلق مسبقاً');

      await audit(
        {
          userId: req.user!.id,
          action: 'CLOSE_STOCKTAKE',
          entity: 'stocktake',
          entityId: id,
          oldValue: { status: 'OPEN' },
          newValue: { status: 'CLOSED', lines: stocktake.lines.length },
        },
        tx,
      );

      return tx.stocktake.findUniqueOrThrow({ where: { id } });
    });

    return ok(res, closed);
  }),
);

/** تقرير الفروقات (القسم 6.2 — البند 4) */
stocktakesRouter.get(
  '/:id/differences',
  requireRole('OWNER'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('معرّف غير صالح');

    const exists = await prisma.stocktake.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound('الجرد غير موجود');

    const lines = await prisma.stocktakeLine.findMany({
      where: { stocktakeId: id },
      include: { item: { select: { id: true, code: true, name: true, karat: true, status: true } } },
      orderBy: { id: 'asc' },
    });

    const missing = lines.filter((l) => !l.present);
    const notExpected = await prisma.item.findMany({
      where: {
        status: 'AVAILABLE',
        id: { notIn: lines.map((l) => l.itemId).filter((v): v is number => v !== null) },
      },
      select: { id: true, code: true, name: true, karat: true, totalWeight: true },
    });
    const weightDiffs = lines.filter(
      (l) => l.present && l.weightDiff !== null && Number(l.weightDiff) !== 0,
    );

    return ok(res, {
      missing,
      notRegistered: notExpected,
      weightDiffs,
      counts: {
        lines: lines.length,
        missing: missing.length,
        notRegistered: notExpected.length,
        weightDiffs: weightDiffs.length,
      },
    });
  }),
);
