import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ah, ok } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { basisFromSettings } from '../lib/item-math.js';
import { requireRole } from '../auth/middleware.js';

export const settingsRouter = Router();

const schema = z.object({
  shopName: z.string().trim().min(1).max(160).optional(),
  currency: z
    .string()
    .trim()
    .min(2)
    .max(8)
    .regex(/^[a-zA-Z]{3}$/, 'رمز العملة يجب أن يكون 3 حروف لاتينية (مثل LYD)')
    .transform((value) => value.toUpperCase())
    .optional(),
  codeMode: z.enum(['AUTO', 'MANUAL']).optional(),
  deductStone: z.boolean().optional(),
  deductInlays: z.boolean().optional(),
  profitMode: z.enum(['PERCENT', 'FIXED', 'MANUAL']).optional(),
  profitValue: z.number().min(0).max(100_000).optional(),
  fixedBasis: z.enum(['GRAM', 'PIECE']).optional(),
  fxSource: z.enum(['MANUAL', 'API']).optional(),
  roundingStep: z.union([z.literal(0), z.literal(5), z.literal(10)]).optional(),
  priceStaleHours: z.number().int().min(1).max(168).optional(),
  showCostToSeller: z.boolean().optional(),
  sellerCanAddItems: z.boolean().optional(),
  defaultKarat: z.number().int().min(1).max(24).optional(),
});

settingsRouter.get(
  '/',
  ah(async (_req, res) => {
    const setting = await prisma.setting.findUnique({ where: { id: 1 } });
    if (!setting) return ok(res, null);

    return ok(res, {
      ...setting,
      weightBasis: basisFromSettings(setting.deductStone, setting.deductInlays),
    });
  }),
);

settingsRouter.patch(
  '/',
  requireRole('OWNER'),
  ah(async (req, res) => {
    const body = schema.parse(req.body);

    const current = await prisma.setting.findUnique({ where: { id: 1 } });
    const deductStone = body.deductStone ?? current?.deductStone ?? true;
    const deductInlays = body.deductInlays ?? current?.deductInlays ?? true;

    const setting = await prisma.setting.update({
      where: { id: 1 },
      data: {
        shopName: body.shopName,
        currency: body.currency,
        codeMode: body.codeMode,
        deductStone: body.deductStone,
        deductInlays: body.deductInlays,
        profitMode: body.profitMode,
        profitValue: body.profitValue,
        fixedBasis: body.fixedBasis,
        fxSource: body.fxSource,
        roundingStep: body.roundingStep,
        priceStaleHours: body.priceStaleHours,
        showCostToSeller: body.showCostToSeller,
        sellerCanAddItems: body.sellerCanAddItems,
        defaultKarat: body.defaultKarat,
        weightBasis: basisFromSettings(deductStone, deductInlays),
      },
    });

    await audit({
      userId: req.user!.id,
      action: 'UPDATE_SETTINGS',
      entity: 'settings',
      entityId: 1,
      oldValue: current
        ? {
            codeMode: current.codeMode,
            deductStone: current.deductStone,
            deductInlays: current.deductInlays,
            profitMode: current.profitMode,
            profitValue: current.profitValue.toString(),
            fixedBasis: current.fixedBasis,
            roundingStep: current.roundingStep,
            priceStaleHours: current.priceStaleHours,
            showCostToSeller: current.showCostToSeller,
            sellerCanAddItems: current.sellerCanAddItems,
          }
        : null,
      newValue: body,
    });

    return ok(res, {
      ...setting,
      weightBasis: basisFromSettings(setting.deductStone, setting.deductInlays),
    });
  }),
);
