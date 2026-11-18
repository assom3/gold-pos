import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { ah, ok, paging } from '../lib/http.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { nextSequence } from '../lib/sequence.js';
import { requireRole } from '../auth/middleware.js';

export const salesRouter = Router();

const createSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(9999).default(1),
        unitPrice: z.number().positive('سعر البيع يجب أن يكون أكبر من صفر'),
      }),
    )
    .min(1, 'الفاتورة يجب أن تحتوي على صنف واحد على الأقل'),
  paymentMethodId: z.number().int().positive().nullable().optional(),
  customerName: z.string().trim().max(160).nullable().optional(),
  customerPhone: z.string().trim().max(40).nullable().optional(),
  // سياسة الربح والتقريب المختارة لهذه الفاتورة (افتراضياً من الإعدادات)
  profitMode: z.enum(['PERCENT', 'FIXED', 'MANUAL']).nullable().optional(),
  profitValue: z.number().min(0).max(100_000).nullable().optional(),
  // أساس الربح الثابت (GRAM / PIECE) — اختياري للفواتير القديمة
  fixedBasis: z.enum(['GRAM', 'PIECE']).nullable().optional(),
  roundingStep: z.union([z.literal(0), z.literal(5), z.literal(10)]).nullable().optional(),
  fxMode: z.enum(['CASH', 'CHEQUE']).nullable().optional(),
  fxRate: z.number().positive().max(10_000).nullable().optional(),
});

salesRouter.get(
  '/',
  ah(async (req, res) => {
    const { page, pageSize, skip, take } = paging(req);
    const fromRaw = req.query.from ? new Date(String(req.query.from)) : undefined;
    const toRaw = req.query.to ? new Date(String(req.query.to)) : undefined;
    const from = fromRaw && !Number.isNaN(fromRaw.getTime()) ? fromRaw : undefined;
    const to = toRaw && !Number.isNaN(toRaw.getTime()) ? toRaw : undefined;
    const sellerIdNum = req.query.sellerId ? Number(req.query.sellerId) : undefined;
    const sellerId =
      Number.isInteger(sellerIdNum) && sellerIdNum! > 0 ? sellerIdNum : undefined;
    const status = req.query.status ? z.enum(['COMPLETED', 'CANCELLED']).parse(req.query.status) : undefined;

    const where: Prisma.SaleWhereInput = {
      ...(sellerId ? { sellerId } : {}),
      ...(status ? { status } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          seller: { select: { id: true, name: true } },
          paymentMethod: true,
          items: { include: { item: { select: { id: true, code: true, name: true, karat: true, totalWeight: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.sale.count({ where }),
    ]);

    return ok(res, { rows, total, page, pageSize });
  }),
);

salesRouter.get(
  '/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('معرّف غير صالح');

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        seller: { select: { id: true, name: true } },
        cancelledBy: { select: { id: true, name: true } },
        paymentMethod: true,
        items: { include: { item: { select: { id: true, code: true, name: true, karat: true, type: true, totalWeight: true } } } },
      },
    });
    if (!sale) throw notFound('الفاتورة غير موجودة');
    return ok(res, sale);
  }),
);

salesRouter.post(
  '/',
  ah(async (req, res) => {
    const body = createSchema.parse(req.body);

    const sale = await prisma.$transaction(async (tx) => {
      // تجميع الكميات المطلوبة لكل صنف (باش ما يتباعش نفس الصنف مرتين فالفاتورة)
      const requested = new Map<number, number>();
      for (const line of body.items) {
        requested.set(line.itemId, (requested.get(line.itemId) ?? 0) + line.quantity);
      }

      if (body.paymentMethodId) {
        const method = await tx.lookup.findUnique({ where: { id: body.paymentMethodId } });
        if (!method || method.kind !== 'PAYMENT_METHOD') throw badRequest('طريقة الدفع المحددة غير صالحة');
      }

      const itemIds = [...requested.keys()];
      const items = await tx.item.findMany({ where: { id: { in: itemIds } } });
      if (items.length !== itemIds.length) throw notFound('بعض الأصناف غير موجودة');

      for (const item of items) {
        if (item.status !== 'AVAILABLE') {
          throw conflict(`الصنف ${item.code} غير متاح للبيع`);
        }
        const wanted = requested.get(item.id)!;
        if (wanted > item.quantity) {
          throw conflict(`الكمية المتاحة من ${item.code} هي ${item.quantity} فقط`);
        }
      }

      const total = Math.round(body.items.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) * 100) / 100;

      const seq = await nextSequence(tx, 'INVOICE');
      const invoiceNo = `INV-${String(seq).padStart(5, '0')}`;
      const now = new Date();

      // إنقاص الكمية بشكل ذري: الشرط quantity >= المطلوب يمنع بيع نفس القطعة من عمليتين متزامنتين
      for (const item of items) {
        const wanted = requested.get(item.id)!;
        const updated = await tx.item.updateMany({
          where: { id: item.id, status: 'AVAILABLE', quantity: { gte: wanted } },
          data: { quantity: { decrement: wanted } },
        });
        if (updated.count !== 1) {
          throw conflict(`نفدت الكمية من ${item.code} أثناء إتمام البيع، أعد المحاولة`);
        }
        await tx.item.updateMany({
          where: { id: item.id, quantity: { lte: 0 } },
          data: { status: 'SOLD' },
        });
      }

      const created = await tx.sale.create({
        data: {
          invoiceNo,
          sellerId: req.user!.id,
          paymentMethodId: body.paymentMethodId ?? null,
          total,
          profitMode: body.profitMode ?? null,
          profitValue: body.profitMode === 'MANUAL' ? 0 : (body.profitValue ?? null),
          fixedBasis: body.fixedBasis ?? null,
          roundingStep: body.roundingStep ?? null,
          fxMode: body.fxMode ?? null,
          fxRate: body.fxRate ?? null,
          customerName: body.customerName ?? null,
          customerPhone: body.customerPhone ?? null,
          createdAt: now,
          items: {
            create: body.items.map((l) => ({
              itemId: l.itemId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              lineTotal: Math.round(l.unitPrice * l.quantity * 100) / 100,
            })),
          },
        },
        include: {
          seller: { select: { id: true, name: true } },
          items: { include: { item: { select: { code: true, name: true, karat: true, totalWeight: true } } } },
          paymentMethod: true,
        },
      });

      await audit(
        {
          userId: req.user!.id,
          action: 'CREATE_SALE',
          entity: 'sale',
          entityId: created.id,
          newValue: { invoiceNo, total, lines: body.items.length },
        },
        tx,
      );

      return created;
    });

    return ok(res, sale, 201);
  }),
);

const cancelSchema = z.object({
  reason: z.string().trim().min(3, 'سبب الإلغاء مطلوب').max(500),
});

salesRouter.post(
  '/:id/cancel',
  requireRole('OWNER'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('معرّف غير صالح');

    const { reason } = cancelSchema.parse(req.body);

    const sale = await prisma.$transaction(async (tx) => {
      const existing = await tx.sale.findUnique({ where: { id }, include: { items: true } });
      if (!existing) throw notFound('الفاتورة غير موجودة');

      // تغيير الحالة أولاً بشكل ذري: يمنع الإلغاء المزدوج من طلبين متزامنين ويضمن إرجاع الكميات مرة واحدة
      const cancelled = await tx.sale.updateMany({
        where: { id, status: 'COMPLETED' },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: req.user!.id,
          cancelReason: reason,
        },
      });
      if (cancelled.count !== 1) throw badRequest('الفاتورة ملغاة مسبقاً');

      // إرجاع الكميات (BR-13)
      for (const line of existing.items) {
        await tx.item.update({
          where: { id: line.itemId },
          data: {
            quantity: { increment: line.quantity },
            status: 'AVAILABLE',
          },
        });
      }

      const updated = await tx.sale.findUniqueOrThrow({
        where: { id },
        include: {
          seller: { select: { id: true, name: true } },
          cancelledBy: { select: { id: true, name: true } },
          paymentMethod: true,
          items: {
            include: {
              item: { select: { id: true, code: true, name: true, karat: true, type: true, totalWeight: true } },
            },
          },
        },
      });

      await audit(
        {
          userId: req.user!.id,
          action: 'CANCEL_SALE',
          entity: 'sale',
          entityId: id,
          oldValue: { status: 'COMPLETED', total: existing.total.toString() },
          newValue: { status: 'CANCELLED', reason },
        },
        tx,
      );

      return updated;
    });

    return ok(res, sale);
  }),
);
