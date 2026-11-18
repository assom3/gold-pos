/**
 * تنظيف بيانات الاختبار التي تحمل بادئة QA- من قاعدة البيانات.
 *
 * سكربتات test:integration / test:stress تنشئ فواتير وأصنافاً وجرداً بادئتها QA-،
 * وبعضها يبقى في السجل لأن واجهة API تمنع حذف فاتورة أو صنف مرتبط بفاتورة (وهذا مقصود).
 * هذا السكربت يحذف تلك البيانات مباشرة من قاعدة البيانات بعد الاختبارات،
 * ويُبقي سجل التدقيق (AuditLog) كما هو لأنه سجل إلحاقي.
 *
 * التشغيل من جذر المشروع: npm.cmd run db:cleanup-qa
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL غير موجود. تأكد من وجود apps/api/.env');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const result = await prisma.$transaction(async (tx) => {
    // 1) الفواتير أولاً: حذفها يحذف سطورها (SaleItem) عبر Cascade
    const sales = await tx.sale.deleteMany({ where: { customerName: { startsWith: 'QA-' } } });

    // 2) الأصناف: لم تعد مرتبطة بفواتير بعد حذفها
    const items = await tx.item.deleteMany({ where: { name: { startsWith: 'QA-' } } });

    // 3) الجرد: حذفه يحذف سطوره (StocktakeLine) عبر Cascade
    const stocktakes = await tx.stocktake.deleteMany({ where: { notes: { startsWith: 'QA-' } } });

    // 4) القوائم المرجعية التي أنشأها الاختبار
    const lookups = await tx.lookup.deleteMany({ where: { value: { startsWith: 'QA-' } } });

    return {
      sales: sales.count,
      items: items.count,
      stocktakes: stocktakes.count,
      lookups: lookups.count,
    };
  });

  console.log(
    `✓ تم تنظيف بيانات QA — فواتير: ${result.sales}، أصناف: ${result.items}، جرد: ${result.stocktakes}، قوائم: ${result.lookups}`,
  );
  console.log('  سجل التدقيق (AuditLog) بقي كما هو لأنه سجل إلحاقي.');
} catch (err) {
  console.error('تعذر تنظيف بيانات QA:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
