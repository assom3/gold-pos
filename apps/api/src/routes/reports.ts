import { Router } from 'express';
import { prisma } from '../db.js';
import { ah, ok, qInt } from '../lib/http.js';
import { basisFromSettings } from '../lib/item-math.js';
import { getCurrentPrices } from '../lib/prices.js';
import { round2, round3, valueItem } from '../lib/valuation.js';

export const reportsRouter = Router();

function rangeFromQuery(query: Record<string, unknown>) {
  const from = query.from ? new Date(String(query.from)) : undefined;
  const to = query.to ? new Date(String(query.to)) : undefined;
  return {
    ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
    ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}),
  };
}

/** معرّف موجب من الـquery، وإلا undefined */
function positiveInt(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** تقرير المبيعات (القسم 7) */
reportsRouter.get(
  '/sales',
  ah(async (req, res) => {
    const createdAt = rangeFromQuery(req.query);
    const sellerId = positiveInt(req.query.sellerId);
    const paymentMethodId = positiveInt(req.query.paymentMethodId);
    const karatRaw = positiveInt(req.query.karat);
    const karat = karatRaw && karatRaw <= 24 ? karatRaw : undefined;

    const sales = await prisma.sale.findMany({
      where: {
        status: 'COMPLETED',
        ...(Object.keys(createdAt).length ? { createdAt } : {}),
        ...(sellerId ? { sellerId } : {}),
        ...(paymentMethodId ? { paymentMethodId } : {}),
        ...(karat ? { items: { some: { item: { karat } } } } : {}),
      },
      include: {
        seller: { select: { id: true, name: true } },
        paymentMethod: true,
        items: { include: { item: { select: { karat: true, totalWeight: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const total = sales.reduce((s, x) => s + Number(x.total), 0);

    const bySeller = new Map<number, { id: number; name: string; count: number; total: number }>();
    const byPayment = new Map<string, { name: string; count: number; total: number }>();
    const byKarat = new Map<number, { karat: number; count: number; total: number; weight: number }>();

    for (const sale of sales) {
      const s = bySeller.get(sale.sellerId) ?? { id: sale.sellerId, name: sale.seller.name, count: 0, total: 0 };
      s.count += 1;
      s.total += Number(sale.total);
      bySeller.set(sale.sellerId, s);

      const pName = sale.paymentMethod?.value ?? 'غير محدد';
      const p = byPayment.get(pName) ?? { name: pName, count: 0, total: 0 };
      p.count += 1;
      p.total += Number(sale.total);
      byPayment.set(pName, p);

      for (const line of sale.items) {
        const k = byKarat.get(line.item.karat) ?? { karat: line.item.karat, count: 0, total: 0, weight: 0 };
        k.count += line.quantity;
        k.total += Number(line.lineTotal);
        k.weight += Number(line.item.totalWeight) * line.quantity;
        byKarat.set(line.item.karat, k);
      }
    }

    return ok(res, {
      count: sales.length,
      total: round2(total),
      average: sales.length > 0 ? round2(total / sales.length) : 0,
      bySeller: [...bySeller.values()].map((v) => ({ ...v, total: round2(v.total) })),
      byPayment: [...byPayment.values()].map((v) => ({ ...v, total: round2(v.total) })),
      byKarat: [...byKarat.values()].map((v) => ({ ...v, total: round2(v.total), weight: round3(v.weight) })),
      rows: sales,
    });
  }),
);

/** تقرير الأرباح (القسم 7) */
reportsRouter.get(
  '/profit',
  ah(async (req, res) => {
    const createdAt = rangeFromQuery(req.query);

    const lines = await prisma.saleItem.findMany({
      where: {
        sale: { status: 'COMPLETED', ...(Object.keys(createdAt).length ? { createdAt } : {}) },
      },
      include: {
        sale: { select: { id: true, invoiceNo: true, createdAt: true } },
        item: { select: { id: true, code: true, name: true, purchaseCostDinar: true, karat: true } },
      },
      orderBy: { id: 'desc' },
    });

    let revenue = 0;
    let cost = 0;

    const rows = lines.map((line) => {
      const lineRevenue = Number(line.lineTotal);
      const lineCost = Number(line.item.purchaseCostDinar) * line.quantity;
      revenue += lineRevenue;
      cost += lineCost;
      return {
        id: line.id,
        invoiceNo: line.sale.invoiceNo,
        date: line.sale.createdAt,
        code: line.item.code,
        name: line.item.name,
        karat: line.item.karat,
        quantity: line.quantity,
        revenue: round2(lineRevenue),
        cost: round2(lineCost),
        profit: round2(lineRevenue - lineCost),
      };
    });

    return ok(res, {
      revenue: round2(revenue),
      cost: round2(cost),
      profit: round2(revenue - cost),
      marginPercent: revenue > 0 ? round2(((revenue - cost) / revenue) * 100) : 0,
      rows,
    });
  }),
);

/** تقرير المخزون (القسم 7) */
reportsRouter.get(
  '/inventory',
  ah(async (_req, res) => {
    const [setting, prices, items] = await Promise.all([
      prisma.setting.findUnique({ where: { id: 1 } }),
      getCurrentPrices(),
      prisma.item.findMany({ where: { status: 'AVAILABLE' }, include: { components: true } }),
    ]);

    const basis = basisFromSettings(setting?.deductStone ?? true, setting?.deductInlays ?? true);
    const ounce = prices.ounce?.value ?? 0;
    const fx = prices.fx?.value ?? 0;

    const rows = items.map((item) => {
      const valuation = prices.ready
        ? valueItem(item, ounce, fx, basis)
        : { goldValue: 0, stoneValue: 0, value: 0, basisWeight: 0, netGoldWeight: 0 };
      const cost = Number(item.purchaseCostDinar) * item.quantity;
      return {
        id: item.id,
        code: item.code,
        name: item.name,
        type: item.type,
        karat: item.karat,
        quantity: item.quantity,
        totalWeight: Number(item.totalWeight),
        netGoldWeight: Number(item.netGoldWeight),
        value: round2(valuation.value * item.quantity),
        cost: round2(cost),
        margin: round2(valuation.value * item.quantity - cost),
      };
    });

    return ok(res, {
      ready: prices.ready,
      count: rows.length,
      totalValue: round2(rows.reduce((s, r) => s + r.value, 0)),
      totalCost: round2(rows.reduce((s, r) => s + r.cost, 0)),
      rows,
    });
  }),
);

/** سجل الأسعار (القسم 7) */
reportsRouter.get(
  '/prices',
  ah(async (req, res) => {
    const createdAt = rangeFromQuery(req.query);
    const rows = await prisma.priceUpdate.findMany({
      where: Object.keys(createdAt).length ? { createdAt } : {},
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return ok(res, rows);
  }),
);

/** سجل التعديلات (القسم 7) */
reportsRouter.get(
  '/audit',
  ah(async (req, res) => {
    const createdAt = rangeFromQuery(req.query);
    const entity = req.query.entity ? String(req.query.entity).slice(0, 60) : undefined;
    const take = qInt(req.query.take, 100, 1, 500);

    const rows = await prisma.auditLog.findMany({
      where: {
        ...(entity ? { entity } : {}),
        ...(Object.keys(createdAt).length ? { createdAt } : {}),
      },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    });

    return ok(res, rows);
  }),
);
