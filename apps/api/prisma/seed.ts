import 'dotenv/config';
import { PrismaClient, LookupKind, Role, WeightBasis, ProfitMode, CodeMode, PriceSource } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedSettings() {
  await prisma.setting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      shopName: 'محل الذهب',
      currency: 'LYD',
      codeMode: CodeMode.AUTO,
      deductStone: true,
      deductInlays: true,
      weightBasis: WeightBasis.NET_GOLD,
      profitMode: ProfitMode.PERCENT,
      profitValue: 5,
      fxSource: PriceSource.MANUAL,
      roundingStep: 0,
      priceStaleHours: 2,
      showCostToSeller: false,
      sellerCanAddItems: true,
      defaultKarat: 21,
    },
  });
  console.log('  settings ✓');
}

const LOOKUPS: Record<LookupKind, string[]> = {
  CATEGORY: ['طقم', 'خاتم', 'سلسلة', 'أسورة', 'حلق', 'تعليقة', 'خراصات'],
  SUPPLIER: [],
  MANUFACTURER: [],
  COUNTRY: ['ليبيا', 'الإمارات', 'تركيا', 'إيطاليا', 'الهند'],
  PAYMENT_METHOD: ['نقدي', 'بطاقة مصرفية', 'تحويل مصرفي', 'صك'],
  KARAT: ['18', '21', '24'],
};

async function seedLookups() {
  for (const [kind, values] of Object.entries(LOOKUPS) as Array<[LookupKind, string[]]>) {
    let order = 0;
    for (const value of values) {
      await prisma.lookup.upsert({
        where: { kind_value: { kind, value } },
        update: {},
        create: { kind, value, sortOrder: order++ },
      });
    }
  }
  console.log('  lookups ✓');
}

async function seedUsers() {
  const isProd = process.env.NODE_ENV === 'production';
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  const sellerPassword = process.env.SEED_SELLER_PASSWORD;

  if (isProd && (!ownerPassword || !sellerPassword)) {
    throw new Error(
      'في بيئة الإنتاج يجب ضبط SEED_OWNER_PASSWORD و SEED_SELLER_PASSWORD قبل إنشاء المستخدمين',
    );
  }

  const ownerHash = await bcrypt.hash(ownerPassword ?? 'Admin@2026', 12);
  const sellerHash = await bcrypt.hash(sellerPassword ?? 'Seller@2026', 12);

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { name: 'المالك', username: 'admin', passwordHash: ownerHash, role: Role.OWNER },
  });

  await prisma.user.upsert({
    where: { username: 'seller' },
    update: {},
    create: { name: 'البائع', username: 'seller', passwordHash: sellerHash, role: Role.SELLER },
  });

  console.log(
    `  users ✓  (admin${ownerPassword ? '' : ' — كلمة المرور الافتراضية للتطوير فقط'} — seller)`,
  );
  if (!isProd && !ownerPassword) {
    console.log('  ⚠ غيّر كلمة مرور المالك الافتراضية قبل الاستخدام الحقيقي أو اضبط SEED_OWNER_PASSWORD');
  }
}

async function seedSequences() {
  const names = [
    ['ITEM_CODE', 0],
    ['ITEM_CODE_PIECE', 0],
    ['ITEM_CODE_SET', 0],
    ['INVOICE', 0],
    ['STOCKTAKE_REF', 0],
    ['STOCKTAKE', 0],
  ] as const;
  for (const [name, value] of names) {
    await prisma.sequence.upsert({ where: { name }, update: {}, create: { name, value } });
  }
  console.log('  sequences ✓');
}

async function main() {
  console.log('Seeding…');
  await seedSettings();
  await seedLookups();
  await seedUsers();
  await seedSequences();
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
