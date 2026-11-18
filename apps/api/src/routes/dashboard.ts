import { Router } from 'express';
import { prisma } from '../db.js';
import { ah, ok } from '../lib/http.js';
import { getCurrentPrices } from '../lib/prices.js';
import { buildPriceTable } from '@gold/pricing';
import { getBackupSummary } from '../lib/backup.js';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/',
  ah(async (req, res) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      prices,
      setting,
      todaySales,
      monthSales,
      availableItems,
      soldItems,
      recentSales,
      karats,
      lastStocktake,
      backup,
    ] = await Promise.all([
      getCurrentPrices(),
      prisma.setting.findUnique({ where: { id: 1 } }),
      prisma.sale.aggregate({
        where: { status: 'COMPLETED', createdAt: { gte: startOfDay } },
        _sum: { total: true },
        _count: true,
      }),
      prisma.sale.aggregate({
        where: { status: 'COMPLETED', createdAt: { gte: startOfMonth } },
        _sum: { total: true },
        _count: true,
      }),
      prisma.item.aggregate({
        where: { status: 'AVAILABLE' },
        _count: true,
        _sum: { quantity: true, totalWeight: true, netGoldWeight: true },
      }),
      prisma.item.count({ where: { status: 'SOLD' } }),
      prisma.sale.findMany({
        where: { status: 'COMPLETED' },
        include: {
          seller: { select: { name: true } },
          items: { include: { item: { select: { code: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      prisma.lookup.findMany({ where: { kind: 'KARAT', active: true }, orderBy: { sortOrder: 'asc' } }),
      prisma.stocktake.findFirst({ orderBy: { openedAt: 'desc' } }),
      // حالة النسخ الاحتياطي للمالك فقط
      req.user?.role === 'OWNER' ? getBackupSummary() : Promise.resolve(null),
    ]);

    const karatList = karats.map((k) => Number(k.value)).filter((k) => Number.isFinite(k) && k > 0);

    const table =
      prices.ounce && prices.fx
        ? buildPriceTable(prices.ounce.value, prices.fx.value, karatList.length > 0 ? karatList : [18, 21, 24])
        : null;

    return ok(res, {
      shopName: setting?.shopName ?? 'محل الذهب',
      currency: setting?.currency ?? 'LYD',
      prices,
      table,
      today: {
        count: todaySales._count,
        total: Number(todaySales._sum.total ?? 0),
      },
      month: {
        count: monthSales._count,
        total: Number(monthSales._sum.total ?? 0),
      },
      inventory: {
        items: availableItems._count,
        units: availableItems._sum.quantity ?? 0,
        totalWeight: Number(availableItems._sum.totalWeight ?? 0),
        goldWeight: Number(availableItems._sum.netGoldWeight ?? 0),
        soldItems,
      },
      recentSales,
      lastStocktake,
      backup,
      user: req.user,
    });
  }),
);
