import { Router } from 'express';
import { prisma } from '../db.js';
import { ah, ok } from '../lib/http.js';
import { basisFromSettings } from '../lib/item-math.js';
import { getCurrentPrices } from '../lib/prices.js';
import { round2, round3, valueItem } from '../lib/valuation.js';

export const inventoryRouter = Router();

/** لوحة التقييم اللحظي (القسم 6.1) */
inventoryRouter.get(
  '/summary',
  ah(async (req, res) => {
    const [setting, prices, items] = await Promise.all([
      prisma.setting.findUnique({ where: { id: 1 } }),
      getCurrentPrices(),
      prisma.item.findMany({
        where: { status: 'AVAILABLE' },
        include: { components: true },
      }),
    ]);

    /** التكلفة والهامش للمالك فقط، أو للبائع إذا سمح إعداد المحل بذلك */
    const canSeeCost = req.user?.role === 'OWNER' || setting?.showCostToSeller === true;

    const basis = basisFromSettings(setting?.deductStone ?? true, setting?.deductInlays ?? true);
    const ounce = prices.ounce?.value ?? 0;
    const fx = prices.fx?.value ?? 0;

    const groups = new Map<
      number,
      { karat: number; count: number; pieces: number; totalWeight: number; goldWeight: number; value: number; cost: number }
    >();

    let totalValue = 0;
    let totalCost = 0;
    let totalGoldWeight = 0;
    let totalWeight = 0;
    let units = 0;

    const rows: Array<{
      id: number;
      code: string;
      name: string;
      type: 'PIECE' | 'SET';
      karat: number;
      quantity: number;
      totalWeight: number;
      netGoldWeight: number;
      value: number;
      cost?: number;
      margin?: number;
    }> = [];

    for (const item of items) {
      const valuation = prices.ready
        ? valueItem(item, ounce, fx, basis)
        : { goldValue: 0, stoneValue: 0, value: 0, basisWeight: 0, netGoldWeight: 0 };

      const itemCost = Number(item.purchaseCostDinar) * item.quantity;
      const itemValue = valuation.value * item.quantity;

      rows.push({
        id: item.id,
        code: item.code,
        name: item.name,
        type: item.type,
        karat: item.karat,
        quantity: item.quantity,
        totalWeight: Number(item.totalWeight),
        netGoldWeight: Number(item.netGoldWeight),
        value: round2(itemValue),
        ...(canSeeCost ? { cost: round2(itemCost), margin: round2(itemValue - itemCost) } : {}),
      });

      const group = groups.get(item.karat) ?? {
        karat: item.karat,
        count: 0,
        pieces: 0,
        totalWeight: 0,
        goldWeight: 0,
        value: 0,
        cost: 0,
      };

      group.count += 1;
      group.pieces += item.quantity;
      group.totalWeight += Number(item.totalWeight) * item.quantity;
      group.goldWeight += Number(item.netGoldWeight) * item.quantity;
      group.value += valuation.value * item.quantity;
      group.cost += Number(item.purchaseCostDinar) * item.quantity;
      groups.set(item.karat, group);

      totalValue += valuation.value * item.quantity;
      totalCost += Number(item.purchaseCostDinar) * item.quantity;
      totalGoldWeight += Number(item.netGoldWeight) * item.quantity;
      totalWeight += Number(item.totalWeight) * item.quantity;
      units += item.quantity;
    }

    const byKarat = [...groups.values()]
      .map((g) => ({
        ...g,
        totalWeight: round3(g.totalWeight),
        goldWeight: round3(g.goldWeight),
        value: round2(g.value),
        ...(canSeeCost ? { cost: round2(g.cost) } : {}),
      }))
      .sort((a, b) => a.karat - b.karat);

    return ok(res, {
      ready: prices.ready,
      prices,
      basis,
      totals: {
        items: items.length,
        units,
        totalWeight: round3(totalWeight),
        goldWeight: round3(totalGoldWeight),
        value: round2(totalValue),
        ...(canSeeCost
          ? { cost: round2(totalCost), margin: round2(totalValue - totalCost) }
          : {}),
      },
      byKarat,
      rows: rows.sort((a, b) => a.karat - b.karat || a.code.localeCompare(b.code)),
    });
  }),
);
