import { Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';

/**
 * زيادة عداد بشكل ذري (كيستعمل لأكواد الأصناف وأرقام الفواتير — D-04).
 * عند إنشاء العداد لأول مرة قد يتسابق طلبان، فنعيد المحاولة بعد خطأ التكرار.
 */
export async function nextSequence(tx: PrismaTypes.TransactionClient, name: string): Promise<number> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const row = await tx.sequence.upsert({
        where: { name },
        update: { value: { increment: 1 } },
        create: { name, value: 1 },
      });
      return row.value;
    } catch (err) {
      const isRace =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!isRace) throw err;
    }
  }
  throw new Error('تعذر تحديث العدّاد بسبب تزاحم الطلبات');
}
