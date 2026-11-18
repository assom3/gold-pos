import { Router } from 'express';
import { z } from 'zod';
import { LookupKind } from '@prisma/client';
import { prisma } from '../db.js';
import { ah, ok } from '../lib/http.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { requireRole } from '../auth/middleware.js';

export const lookupsRouter = Router();

const KINDS = ['CATEGORY', 'SUPPLIER', 'MANUFACTURER', 'COUNTRY', 'PAYMENT_METHOD', 'KARAT'] as const;
const kindSchema = z.enum(KINDS);

lookupsRouter.get(
  '/',
  ah(async (req, res) => {
    const kind = req.query.kind ? kindSchema.parse(req.query.kind) : undefined;
    const activeOnly = req.query.activeOnly !== 'false';

    const rows = await prisma.lookup.findMany({
      where: { ...(kind ? { kind: kind as LookupKind } : {}), ...(activeOnly ? { active: true } : {}) },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { value: 'asc' }],
    });

    if (kind) return ok(res, rows);

    // تجميع حسب النوع لراحة الواجهة
    const grouped: Record<string, typeof rows> = {};
    for (const kindKey of KINDS) grouped[kindKey] = rows.filter((r) => r.kind === kindKey);
    return ok(res, grouped);
  }),
);

const createSchema = z.object({
  kind: kindSchema,
  value: z.string().trim().min(1, 'القيمة مطلوبة').max(120),
  sortOrder: z.number().int().min(0).optional(),
});

lookupsRouter.post(
  '/',
  ah(async (req, res) => {
    const body = createSchema.parse(req.body);

    // البائع يستطيع إضافة مورد أو مصنع بسرعة من شاشة إضافة القطعة.
    // بقية القوائم (التصنيفات، العيارات…) تبقى للمالك فقط.
    if (req.user!.role !== 'OWNER' && body.kind !== 'SUPPLIER' && body.kind !== 'MANUFACTURER') {
      throw forbidden('إضافة عناصر هذه القائمة متاحة للمالك فقط');
    }

    // العيار يُخزَّن بصيغة موحّدة («21» لا «021» ولا «21.0») حتى لا يتكرر بصيغ مختلفة
    let value = body.value;
    if (body.kind === 'KARAT') {
      const k = Number(body.value);
      if (!/^\d{1,2}$/.test(body.value) || !Number.isInteger(k) || k < 1 || k > 24) {
        throw badRequest('العيار يجب أن يكون رقماً صحيحاً بين 1 و 24');
      }
      value = String(k);
    }

    const exists = await prisma.lookup.findUnique({
      where: { kind_value: { kind: body.kind as LookupKind, value } },
    });
    if (exists) throw conflict('هذه القيمة موجودة مسبقاً');

    const row = await prisma.lookup.create({
      data: {
        kind: body.kind as LookupKind,
        value,
        sortOrder: body.sortOrder ?? 100,
      },
    });

    await audit({
      userId: req.user!.id,
      action: 'CREATE_LOOKUP',
      entity: 'lookup',
      entityId: row.id,
      newValue: { kind: row.kind, value: row.value },
    });

    return ok(res, row, 201);
  }),
);

const updateSchema = z.object({
  value: z.string().trim().min(1).max(120).optional(),
  sortOrder: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

lookupsRouter.patch(
  '/:id',
  requireRole('OWNER'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('معرّف غير صالح');

    const body = updateSchema.parse(req.body);
    const existing = await prisma.lookup.findUnique({ where: { id } });
    if (!existing) throw notFound('العنصر غير موجود');

    if (body.value !== undefined && existing.kind === 'KARAT') {
      const k = Number(body.value);
      if (!/^\d{1,2}$/.test(body.value) || !Number.isInteger(k) || k < 1 || k > 24) {
        throw badRequest('العيار يجب أن يكون رقماً صحيحاً بين 1 و 24');
      }
      body.value = String(k);
    }

    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.lookup.update({ where: { id }, data: body });
      // اسم المصنّع يُنسخ نصاً داخل الصنف (للتقارير والبحث) — نُبقيه مطابقاً عند إعادة التسمية
      if (existing.kind === 'MANUFACTURER' && body.value !== undefined && body.value !== existing.value) {
        await tx.item.updateMany({ where: { manufacturerId: id }, data: { manufacturer: body.value } });
      }
      return updated;
    });

    await audit({
      userId: req.user!.id,
      action: 'UPDATE_LOOKUP',
      entity: 'lookup',
      entityId: id,
      oldValue: { value: existing.value, active: existing.active, sortOrder: existing.sortOrder },
      newValue: body,
    });

    return ok(res, row);
  }),
);

lookupsRouter.delete(
  '/:id',
  requireRole('OWNER'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('معرّف غير صالح');

    const existing = await prisma.lookup.findUnique({ where: { id } });
    if (!existing) throw notFound('العنصر غير موجود');

    // إخفاء بدل الحذف إذا كان مستعملاً (باش ما تنكسرش البيانات التاريخية)
    const used =
      existing.kind === 'CATEGORY'
        ? await prisma.item.count({ where: { categoryId: id } })
        : existing.kind === 'SUPPLIER'
          ? await prisma.item.count({ where: { supplierId: id } })
          : existing.kind === 'MANUFACTURER'
            ? await prisma.item.count({ where: { manufacturerId: id } })
            : existing.kind === 'COUNTRY'
              ? await prisma.item.count({ where: { countryId: id } })
              : existing.kind === 'PAYMENT_METHOD'
                ? await prisma.sale.count({ where: { paymentMethodId: id } })
                : 0;

    if (used > 0) {
      const row = await prisma.lookup.update({ where: { id }, data: { active: false } });
      await audit({ userId: req.user!.id, action: 'DEACTIVATE_LOOKUP', entity: 'lookup', entityId: id });
      return ok(res, { ...row, deactivated: true });
    }

    await prisma.lookup.delete({ where: { id } });
    await audit({ userId: req.user!.id, action: 'DELETE_LOOKUP', entity: 'lookup', entityId: id });
    return ok(res, { ok: true });
  }),
);
