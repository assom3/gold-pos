# المواصفات الكاملة لنظام «ذهب» — الإصدار 0.2.1

> المرجع التقني المعتمد لإعادة بناء النظام من الصفر. كل ما في هذا المستند مطابق للكود الموجود في المستودع وقت الإصدار `0.2.1`، ويتضمن ميزات `0.2.0` المفصّلة في [CHANGELOG.md](CHANGELOG.md): المخطط، المسارات، الأنواع، الخوارزميات، الشاشات، والاختبارات.
> إن اختلف نص هنا عن نص قديم في ملف آخر، فالمصدر هو الكود ثم هذا المستند.

---

## 0. دليل القراءة

| الرمز | المعنى |
|---|---|
| `BR-xx` | قاعدة عمل يشار إليها في الكود أو الوثائق الأصلية (مثل `BR-10` لحجر له سعر خاص). |
| `D-xx` | قرار تصميم موثّق في [DECISIONS.md](DECISIONS.md). |
| `OWNER` / `SELLER` | دوران فقط: مالك / بائع. |
| `API` | خادم Express تحت المسار `/api`. |
| `Web` | تطبيق React الذي يعمل تحت المسارات المعرّفة في `apps/web/src/app/App.tsx`. |
| `محرك التسعير` | الحزمة `@gold/pricing` في `packages/pricing`. |

أسماء الجداول والمسارات والحقول البرمجية تبقى بالإنجليزية كما هي في الكود. النصوص الظاهرة للمستخدم عربية بالكامل، وباتجاه RTL.

---

## 1. الرؤية والنطاق

### 1.1 الرؤية

نظام نقاط بيع لمحل ذهب واحد، يعمل محلياً على جهاز المحل، ويغطي دورة كاملة:

1. إدخال/جلب سعر أونصة الذهب وسعر الصرف.
2. اشتقاق سعر غرام كل عيار بشكل لحظي.
3. تسجيل شراء القطع والأطقم بالغرام مع حفظ سعر الصرف يوم الشراء.
4. تسجيل المخزون وتقييمه بأسعار اللحظة.
5. إصدار فواتير بيع بسياسة ربح وتقريب وسعر صرف خاصة بكل فاتورة.
6. إلغاء الفواتير بأمان وإرجاع الكميات.
7. جرد دوري بلقطة أوزان وقيم، وتقرير فروقات.
8. تقارير المالك وسجل تدقيق كامل للعمليات الحساسة.
9. صلاحيتان فقط: مالك وبائع، مع إخفاء التكلفة عن البائع في الخادم عند اللزوم.

### 1.2 الشخصيات

| الشخصية | ما يفعله في النظام | ما يُمنع منه |
|---|---|---|
| **المالك (`OWNER`)** | كل شيء: الأسعار، الأصناف، البيع، الإلغاء، الجرد، التقارير، الإعدادات، القوائم، المستخدمون، رؤية التكلفة والهامش. | لا شيء ضمن نطاق النظام، عدا تعطيل آخر مالك نشط. |
| **البائع (`SELLER`)** | الدخول، عرض الأسعار/المخزون، تسجيل البيع، تسجيل أوزان الجرد، إدخال سعر الصرف فقط، إضافة صنف إن سمح `sellerCanAddItems`، إضافة مورّد/مصنّع سريعاً، رؤية التكلفة إن سمح `showCostToSeller`. | تعديل/حذف الأصناف، إلغاء البيع، فتح/إغلاق الجرد، التقارير، الإعدادات، المستخدمون، إدخال سعر الأونصة، إدخال بيانات شراء إن كانت التكلفة مخفية. |
| **مشغّل الجهاز** | تشغيل MySQL المحمول، تشغيل/إيقاف الخادم والواجهة، النسخ الاحتياطي، متابعة `/api/health` وسجل الخادم، ضبط متغيرات البيئة. | لا يحتاج صلاحية تطبيقية إضافية؛ يعمل عبر سكربتات PowerShell وأوامر npm. |

### 1.3 ما يدخل في النطاق

- محل واحد فقط، إعداداته صف واحد في جدول `Setting` بمعرّف `1`.
- عملة محلية واحدة لكل المحل (`LOCAL_CURRENCY` افتراضياً `LYD`)، مع إمكانية الشراء بعملة أخرى وتحويلها بسعر صرف محفوظ.
- واجهة عربية RTL، بأرقام لاتينية للقيم المالية، وتصميم فاتح/داكن.
- سعر أونصة يدوي دائماً، وتلقائي اختياري من `goldapi.dev`.
- سعر صرف يدوي؛ بنية مزوّد الصرف موجودة لكنها غير مفعّلة.
- طباعة الفاتورة عبر طباعة المتصفح.

### 1.4 ما لا يدخل في النطاق

صور القطع، رموز QR، طباعة بطاقات الأصناف، حالة «محجوز»، لغات إضافية، تعدد الفروع، تعدد العملات داخل الفاتورة، إشعارات خارج التطبيق، توليد PDF من الخادم، جدولة خارج عملية الـAPI.

### 1.5 المصطلحات

| المصطلح | التعريف |
|---|---|
| **الأونصة التروي** | 31.1035 غراماً (ثابت المشروع، مطابق لأمثلة الوثيقة المرجعية). |
| **عيار 24** | الذهب الخالص؛ معامل أي عيار `K` هو `K ÷ 24`. |
| **سعر غرام العيار** | `سعر غرام 24 × معامل العيار`. |
| **الوزن الإجمالي** | وزن الذهب + الحجر + الفصوص. |
| **وزن أساس الاحتساب** | الوزن الذي يُضرب في سعر الغرام بعد تطبيق خيارات الخصم وقاعدة الحجر المسعّر. |
| **صافي الذهب** | الإجمالي − الحجر − الفصوص، دائماً، بغض النظر عن أساس الاحتساب. |
| **حجر ذو سعر خاص** | `stonePrice > 0`؛ يُخصم وزنه دائماً (BR-10). |
| **الفصوص** | حبيبات صغيرة بلا سعر مستقل؛ يُخصم وزنها حسب الإعداد أو حسب الصنف. |
| **الطقم (`SET`)** | صنف واحد له مكوّنات (`SetComponent`) لكل مكوّن عيار ووزن؛ تصنيفه إجبارياً «طقم». |
| **سياسة الفاتورة** | `profitMode`, `profitValue`, `fixedBasis`, `roundingStep`, `fxMode`, `fxRate` تُحفظ مع الفاتورة ولا تُغيّر الإعدادات. |
| **الربح الثابت لكل غرام** | `fixedBasis = GRAM`: يُضرب المبلغ في وزن أساس الاحتساب. |
| **الربح الثابت لكل قطعة** | `fixedBasis = PIECE`: يُضرب المبلغ في عدد القطع/المكوّنات (الحد الأدنى 1). |
| **صرف نقدي / صك مصدق** | قيمتان مستقلتان لنمطي `CASH` و`CHEQUE`؛ يُحفظ المستعمل منهما مع الفاتورة. |
| **الجرد** | لقطة لأوزان وقيم الأصناف المتاحة لحظة الفتح، تُقفل نهائياً عند الإغلاق. |
| **التسلسل (`Sequence`)** | عدّاد ذري لتوليد أكواد الأصناف وأرقام الفواتير ومراجع الجرد. |
| **سجل التدقيق (`AuditLog`)** | صف لكل عملية حساسة مع المستخدم والكيان والقيمة قبل/بعد. |

---

## 2. البنية التقنية

### 2.1 مخطط التشغيل

```
المتصفح (Web :5173)
   │  طلبات /api من نفس الأصل (Vite proxy في التطوير)
   ▼
Express API :4000  ──Prisma 6──▶  MySQL 8.4 المحمول :3306 (gold_pos)
   │
   ├─ @gold/pricing  (حساب عشري نقي، بلا I/O)
   └─ goldapi.dev    (جلب أونصة اختياري، من الخادم فقط)
```

في الإنتاج يُبنى Web إلى ملفات ثابتة، ويُقدَّم الـAPI منفصلاً أو خلف وكيل عكسي يوجّه `/api` إلى Express. المجدول يعمل داخل عملية الـAPI نفسها ولا يتطلب خدمة ثانية.

### 2.2 شجرة المستودع

```
Gold/
├─ apps/
│  ├─ api/
│  │  ├─ prisma/schema.prisma        المخطط الكامل
│  │  ├─ prisma/seed.ts              البيانات الأولية
│  │  └─ src/
│  │     ├─ auth/                    جلسات + صلاحيات
│  │     ├─ lib/                     تسعير مساعد/تقييم/تسلسل/تدقيق/مزوّد/مجدول
│  │     ├─ middleware/              أخطاء موحّدة + حدود معدل + حماية الأصل
│  │     ├─ routes/                  كل نقاط API
│  │     ├─ app.ts                   تركيب التطبيقات والمسارات
│  │     ├─ index.ts                 تشغيل الخادم والمجدول والإغلاق الآمن
│  │     ├─ config.ts                تحقق Zod من متغيرات البيئة
│  │     └─ db.ts                    عميل Prisma
│  └─ web/
│     └─ src/
│        ├─ app/App.tsx              المسارات والحراسة
│        ├─ layout/                  الهيكل والقائمة الجانبية
│        ├─ components/              UI kit + Receipt
│        ├─ lib/                     api, types, format, pricing-preview, auth
│        └─ pages/                   كل الشاشات
├─ packages/pricing/
│  ├─ src/                           money, karat, engine, types, errors
│  └─ test/                          engine.test.ts + karat.test.ts
├─ tools/
│  ├─ mysql/                         MySQL محمول (غير متتبّع في git)
│  ├─ mysql-init.ps1
│  ├─ mysql-start.ps1
│  └─ mysql-stop.ps1
├─ docs/
│  ├─ SYSTEM_SPECIFICATION.md        هذا المستند
│  ├─ ARCHITECTURE.md
│  ├─ DECISIONS.md
│  ├─ CHANGELOG.md
│  ├─ USER_MANUAL.md
│  └─ USER_MANUAL.pdf                نسخة قراءة جاهزة (تُحدَّث يدوياً)
├─ package.json                      npm workspaces + سكربتات الجذر
└─ README.md
```

### 2.3 الحزم والمسؤوليات

| الحزمة | الإصدار | المسؤولية | لا تفعل |
|---|---|---|---|
| الجذر `gold-pos` | 0.2.1 | workspaces وسكربتات التطوير/البناء/الاختبار | لا يحتوي منطق أعمال |
| `@gold/pricing` | 0.2.1 | الأوزان، سعر الغرام، الربح، التقريب، التحقق من المدخلات | لا يعرف HTTP ولا قاعدة البيانات |
| `@gold/api` | 0.2.1 | REST، مصادقة، صلاحيات، Zod، تدقيق، معاملات Prisma | لا يعيد اختراع معادلة التسعير |
| `@gold/web` | 0.2.1 | React + TanStack Query + RTL + معاينات محلية | لا تعتمد على حساب مالي إنتاجي خارج المحرك |

الأرقام في `package.json` للحزم الأربع `0.2.1`، وتذييل الواجهة يعرض `الإصدار 0.2.1`، و`GET /api/bootstrap` يُعيد `version: '0.2.1'` من `app.ts`. هذه القيم الثلاث متطابقة حالياً، وأي رفع إصدار لاحق يجب أن يحدّثها معاً.

### 2.4 التقنيات

| الطبقة | التقنية |
|---|---|
| الواجهة | React 19، Vite 8، Tailwind CSS 4، React Router 7، TanStack Query 5، lucide-react، خط IBM Plex Sans Arabic |
| الخادم | Express 5، Zod 4، helmet 8، cors، cookie-parser، bcryptjs 3، TypeScript 7 |
| البيانات | Prisma 6.19.3، MySQL 8.4 (`utf8mb4`)، `decimal.js` 10 |
| الاختبار | Vitest 5 (28 اختباراً في ملفين) |
| التشغيل | Node.js 20+، npm، PowerShell 5.1+ لسكربتات MySQL على Windows |

### 2.5 متغيرات البيئة

تُقرأ من `apps/api/.env` عبر `dotenv/config` وتُتحقَّق عند الإقلاع في `config.ts`. أي قيمة غير صالحة تُوقف الخادم برسالة عربية توضّح الحقل.

| المتغير | الافتراضي | التحقق / النطاق | الغرض |
|---|---|---|---|
| `NODE_ENV` | `development` | `development \| test \| production` | يضبط `secure` في الكوكي وتقييد CORS/Access |
| `PORT` | `4000` | عدد صحيح موجب | منفذ الـAPI |
| `DATABASE_URL` | — | مطلوب، غير فارغ | اتصال Prisma بـMySQL |
| `SESSION_SECRET` | — | مطلوب، 16 حرفاً على الأقل | موقّع/تأمين الجلسات في التطبيق |
| `SESSION_DAYS` | `7` | عدد صحيح موجب | مدة صلاحية الجلسة بالأيام |
| `TRUST_PROXY` | `0` | 0–10 | عدد الوكلاء الموثوقين عند التشغيل خلف وكيل |
| `APP_ORIGIN` | `http://localhost:5173` | نص | الأصل المسموح في CORS و`originGuard` |
| `GOLD_PRICE_PROVIDER` | `manual` | `manual \| api` | تفعيل مسار goldapi.dev |
| `GOLD_PRICE_API_URL` | `https://goldapi.dev/api/v1` | نص | أساس رابط المزوّد |
| `GOLD_PRICE_API_KEY` | غير مهيأ | اختياري | مفتاح المزوّد؛ يبقى في الخادم فقط |
| `GOLD_PRICE_REFRESH_MINUTES` | `10` | 0–1440 | فاصل التحديث التلقائي؛ `0` يعطّله |
| `FX_PROVIDER` | `manual` | `manual \| api` | محجوز لمزوّد صرف لاحق |
| `FX_API_URL` | فارغ | اختياري | محجوز |
| `FX_API_KEY` | فارغ | اختياري | محجوز |
| `LOCAL_CURRENCY` | `LYD` | نص | عملة المحل التي تُوحَّد إليها التكاليف |

> `apps/api/.env.example` يحتوي على قيم نائبة فقط. لا تُنسخ مفاتيح أو كلمات مرور حقيقية إلى الوثائق ولا إلى المستودع العام. ملف `.env` مستثنى من git عبر `.gitignore`.

### 2.6 الأوامر المعتمدة

| الأمر | الوظيفة |
|---|---|
| `npm.cmd install` | تثبيت workspaces |
| `npm.cmd run dev` | تشغيل API وWeb معاً |
| `npm.cmd run dev:api` / `dev:web` | تشغيل أحدهما |
| `npm.cmd run build` | بناء الإنتاج للخادم والواجهة |
| `npm.cmd run typecheck` | فحص أنواع الحزم الثلاث |
| `npm.cmd test` | اختبارات محرك التسعير (28 اختباراً) |
| `npm.cmd run test:integration` | فحص تكاملي شامل على خادم وMySQL حيّين |
| `npm.cmd run test:stress` | فحص حِمل وتزامن على المسارات الحساسة |
| `npm.cmd run db:generate` | توليد Prisma Client |
| `npm.cmd run db:push` | مزامنة المخطط مع MySQL (المسار المعتمد حالياً) |
| `npm.cmd run db:migrate` | `prisma migrate dev --name init` لإنشاء أول ترحيل عند الحاجة |
| `npm.cmd run db:seed` | البيانات الأولية (idempotent) |
| `npm.cmd run db:reset` | `db push --force-reset` ثم seed — **يحذف كل البيانات** |
| `npm.cmd run db:studio` | Prisma Studio |

> على Windows يُستعمل `npm.cmd` بدل `npm`/`npx` بسبب سياسة تنفيذ PowerShell.

---

## 3. نموذج البيانات الكامل (Prisma)

المصدر: `apps/api/prisma/schema.prisma`. قاعدة البيانات `mysql`، وكل النصوص العربية تُخزَّن في أعمدة `utf8mb4`. الأوزان `Decimal(10,3)`، المبالغ غالباً `Decimal(14,2)`، وسعر الأونصة `Decimal(16,6)`.

### 3.1 التعدادات

| التعداد | القيم |
|---|---|
| `Role` | `OWNER`, `SELLER` |
| `ItemType` | `PIECE`, `SET` |
| `ItemStatus` | `AVAILABLE`, `SOLD` |
| `PurchaseStatus` | `NEW`, `USED`, `SCRAP` |
| `PriceType` | `OUNCE`, `FX` |
| `PriceSource` | `MANUAL`, `API` |
| `SaleStatus` | `COMPLETED`, `CANCELLED` |
| `StocktakeType` | `QUARTERLY`, `SEMIANNUAL`, `ANNUAL` |
| `StocktakeStatus` | `OPEN`, `CLOSED` |
| `ComponentKind` | `RING`, `BRACELET`, `NECKLACE`, `EARRING`, `ANKLET`, `CHAIN`, `PENDANT`, `OTHER` |
| `LookupKind` | `CATEGORY`, `SUPPLIER`, `MANUFACTURER`, `COUNTRY`, `PAYMENT_METHOD`, `KARAT` |
| `WeightBasis` | `NET_GOLD`, `TOTAL`, `MINUS_STONE`, `MINUS_INLAYS` |
| `ProfitMode` | `PERCENT`, `FIXED`, `MANUAL` |
| `FixedBasis` | `GRAM`, `PIECE` |
| `CodeMode` | `AUTO`, `MANUAL` |
| `SaleFxMode` | `CASH`, `CHEQUE` |

### 3.2 `User` و`Session`

**`User`**

| الحقل | النوع | الافتراضي | ملاحظات |
|---|---|---|---|
| `id` | `Int @id @default(autoincrement())` | — | معرّف داخلي |
| `name` | `String @db.VarChar(160)` | — | الاسم الظاهر |
| `username` | `String @unique @db.VarChar(60)` | — | اسم الدخول، لاتيني |
| `passwordHash` | `String @db.VarChar(255)` | — | bcrypt cost 12، لا يُعاد في أي استجابة |
| `role` | `Role` | — | `OWNER` أو `SELLER` |
| `active` | `Boolean` | `true` | المعطّل لا يستطيع الدخول |
| `createdAt`, `updatedAt` | `DateTime` | `now()` / تلقائي | — |

العلاقات: `sessions`, `priceUpdates`, `sales` (`SaleSeller`), `cancellations` (`SaleCancelledBy`), `stocktakesOpened`, `stocktakesClosed`, `auditLogs`. الفهرس: `@@index([role, active])`.

**`Session`**

| الحقل | النوع | ملاحظات |
|---|---|---|
| `id` | `String @id @db.FastVarChar(64)` | `sha256(token)`؛ التوكن الخام لا يُخزَّن |
| `userId` | `Int` | FK إلى `User` مع `onDelete: Cascade` |
| `expiresAt`, `createdAt`, `lastUsedAt` | `DateTime` | `lastUsedAt` يُحدَّث مرة كل ساعة |
| `ip`, `userAgent` | `String?` | للتتبع، مقتطعة الطول |

فهارس: `userId`, `expiresAt`.

### 3.3 `Item` و`SetComponent`

**`Item`**

| الحقل | النوع | الافتراضي | ملاحظات |
|---|---|---|---|
| `id` | `Int @id` | تلقائي | — |
| `type` | `ItemType` | — | `PIECE` أو `SET` |
| `code` | `String @unique` | — | `P-0001` أو `S-0001` أو يدوي |
| `name` | `String(160)` | — | مطلوب |
| `karat` | `Int` | — | 1–24 |
| `categoryId` | `Int?` | `null` | FK `ItemCategory` → `Lookup` (`SetNull`) |
| `size` | `String?(40)` | `null` | — |
| `totalWeight` | `Decimal(10,3)` | — | مطلوب |
| `stoneWeight` | `Decimal(10,3)` | `0` | — |
| `stonePrice` | `Decimal(12,2)?` | `null` | إن كان > 0 يفرض خصم وزن الحجر |
| `inlaysWeight` | `Decimal(10,3)` | `0` | — |
| `netGoldWeight` | `Decimal(10,3)` | — | محسوب ومحفوظ |
| `quantity` | `Int` | `1` | للقطع المتطابقة فقط؛ الطقم دائماً 1 |
| `purchaseGramPrice` | `Decimal(14,4)?` | `null` | سعر الغرام بعملة الشراء |
| `purchasePrice` | `Decimal(14,2)` | — | إجمالي القطعة بعملة الشراء |
| `purchaseCurrency` | `String(3)` | `USD` | رمز العملة |
| `purchaseFxRate` | `Decimal(14,6)` | — | `1` إن كانت عملة الشراء هي المحلية |
| `purchaseCostDinar` | `Decimal(14,2)` | — | التكلفة الموحّدة محلياً |
| `status` | `ItemStatus` | `AVAILABLE` | يتحول إلى `SOLD` عند نفاد الكمية |
| `purchaseStatus` | `PurchaseStatus` | `NEW` | جديد/مستعمل/كسر |
| `weightBasis` | `WeightBasis?` | `null` | تجاوز اختياري لإعداد المحل لهذا الصنف |
| `supplierId`, `countryId`, `manufacturerId` | `Int?` | `null` | FK إلى `Lookup` بعلاقات مختلفة (`SetNull`) |
| `manufacturer` | `String?(160)` | `null` | نسخة نصية مرآة من اسم المصنع |
| `description`, `notes` | `String? @db.Text` | `null` | — |
| `addedAt`, `createdAt`, `updatedAt` | `DateTime` | `now()` / تلقائي | — |

فهارس: `[type,status]`, `[karat]`, `[addedAt]`. العلاقات: `components`, `saleItems`, `stocktakeLines`.

**`SetComponent`**

| الحقل | النوع | ملاحظات |
|---|---|---|
| `id` | `Int @id` | تلقائي |
| `setItemId` | `Int` | FK إلى `Item` مع `onDelete: Cascade` |
| `kind` | `ComponentKind` | نوع المكوّن |
| `name` | `String?(120)` | اختياري |
| `karat` | `Int` | 1–24 |
| `weight`, `stoneWeight`, `inlaysWeight` | `Decimal(10,3)` | وزن المكوّن |
| `stonePrice` | `Decimal(12,2)?` | سعر خاص إن وُجد |
| `netGoldWeight` | `Decimal(10,3)` | محسوب |
| `notes` | `String? @db.Text` | — |
| `sortOrder` | `Int` | default `0` |

فهرس: `[setItemId]`.

### 3.4 `PriceUpdate`

| الحقل | النوع | ملاحظات |
|---|---|---|
| `id` | `Int @id` | تلقائي |
| `type` | `PriceType` | `OUNCE` أو `FX` |
| `value` | `Decimal(16,6)` | أكبر من صفر |
| `source` | `PriceSource` | افتراضي `MANUAL`؛ الجلب يسجّل `API` |
| `userId` | `Int` | FK إلى `User` (بدون حذف متتالٍ) |
| `createdAt` | `DateTime` | `now()` |

السجل **append-only**: لا يُعدَّل صف قديم؛ كل تحديث صف جديد. فهرس: `[type, createdAt]`.

### 3.5 `Sale` و`SaleItem`

**`Sale`**

| الحقل | النوع | الافتراضي | ملاحظات |
|---|---|---|---|
| `id` | `Int @id` | تلقائي | — |
| `invoiceNo` | `String @unique` | — | `INV-00001` من `Sequence` |
| `sellerId` | `Int` | — | FK `SaleSeller` |
| `paymentMethodId` | `Int?` | `null` | FK `SalePaymentMethod` (`SetNull`) |
| `total` | `Decimal(14,2)` | — | السعر النهائي فقط (D-30) |
| `status` | `SaleStatus` | `COMPLETED` | أو `CANCELLED` |
| `profitMode` | `ProfitMode?` | `null` | لقطة سياسة الفاتورة |
| `profitValue` | `Decimal(10,2)?` | `null` | يُفرَض `0` عند `MANUAL` |
| `fixedBasis` | `FixedBasis?` | `null` | `GRAM` أو `PIECE`؛ اختياري للفواتير القديمة |
| `roundingStep` | `Int?` | `null` | 0/5/10 |
| `fxMode` | `SaleFxMode?` | `null` | `CASH` أو `CHEQUE` |
| `fxRate` | `Decimal(14,6)?` | `null` | الصرف المستعمل لحظة البيع |
| `customerName`, `customerPhone` | `String?` | `null` | اختياريان (D-25) |
| `cancelReason` | `String? @db.Text` | `null` | 3–500 حرف عند الإلغاء |
| `cancelledAt` | `DateTime?` | `null` | — |
| `cancelledById` | `Int?` | `null` | FK `SaleCancelledBy` |
| `createdAt` | `DateTime` | `now()` | — |

فهارس: `[createdAt]`, `[status]`.

**`SaleItem`**

| الحقل | النوع | ملاحظات |
|---|---|---|
| `id` | `Int @id` | تلقائي |
| `saleId` | `Int` | FK مع `onDelete: Cascade` |
| `itemId` | `Int` | FK إلى `Item` (بدون حذف متتالٍ) |
| `quantity` | `Int` | default `1` |
| `unitPrice` | `Decimal(14,2)` | سعر الوحدة النهائي |
| `lineTotal` | `Decimal(14,2)` | `unitPrice × quantity` مقرّباً لخانتين |

فهارس: `[saleId]`, `[itemId]`.

### 3.6 `Stocktake` و`StocktakeLine`

**`Stocktake`**

| الحقل | النوع | الافتراضي |
|---|---|---|
| `id` | `Int @id` | تلقائي |
| `type` | `StocktakeType` | — |
| `status` | `StocktakeStatus` | `OPEN` |
| `openedAt` | `DateTime` | `now()` |
| `openedById` | `Int` | FK `StocktakeOpenedBy` |
| `closedAt` | `DateTime?` | `null` |
| `closedById` | `Int?` | FK `StocktakeClosedBy` |
| `notes` | `String? @db.Text` | `null` |

فهارس: `[status]`, `[openedAt]`.

**`StocktakeLine`**

| الحقل | النوع | ملاحظات |
|---|---|---|
| `id` | `Int @id` | تلقائي |
| `stocktakeId` | `Int` | FK مع `onDelete: Cascade` |
| `itemId` | `Int?` | FK (`SetNull`)؛ لقطة الرابط |
| `itemCode` | `String(40)` | لقطة الكود وقت الفتح |
| `expectedWeight` | `Decimal(10,3)` | من الصنف وقت الفتح |
| `countedWeight` | `Decimal(10,3)?` | يُدخله المالك أو البائع |
| `weightDiff` | `Decimal(10,3)?` | `counted − expected`، يحسبه الخادم |
| `valueAtOpen` | `Decimal(14,2)` | قيمة اللحظة وقت الفتح |
| `present` | `Boolean` | default `true` |

فهرس: `[stocktakeId]`.

### 3.7 `Setting`

صف واحد فقط (`id = 1`).

| الحقل | النوع | الافتراضي | ملاحظات |
|---|---|---|---|
| `id` | `Int @id` | `1` | ثابت |
| `shopName` | `String(160)` | `محل الذهب` | — |
| `currency` | `String(8)` | `LYD` | يُخزَّن بأحرف كبيرة |
| `codeMode` | `CodeMode` | `AUTO` | `AUTO` أو `MANUAL` |
| `deductStone` | `Boolean` | `true` | مع `deductInlays` يحدد `weightBasis` |
| `deductInlays` | `Boolean` | `true` | — |
| `weightBasis` | `WeightBasis` | `NET_GOLD` | يُشتق من الخانتين أعلاه في كل قراءة/كتابة |
| `profitMode` | `ProfitMode` | `PERCENT` | افتراضي لشاشة البيع فقط |
| `profitValue` | `Decimal(10,2)` | `5` | نسبة أو مبلغ |
| `fixedBasis` | `FixedBasis` | `PIECE` | أساس الربح الثابت الافتراضي |
| `fxSource` | `PriceSource` | `MANUAL` | — |
| `roundingStep` | `Int` | `0` | 0/5/10 |
| `priceStaleHours` | `Int` | `2` | 1–168 |
| `showCostToSeller` | `Boolean` | `false` | إخفاء التكلفة يُطبَّق في الخادم |
| `sellerCanAddItems` | `Boolean` | `true` | — |
| `defaultKarat` | `Int` | `21` | 1–24 |
| `updatedAt` | `DateTime` | تلقائي | — |

### 3.8 `Lookup`

| الحقل | النوع | ملاحظات |
|---|---|---|
| `id` | `Int @id` | تلقائي |
| `kind` | `LookupKind` | أحد الأنواع الستة |
| `value` | `String(120)` | نص القيمة |
| `sortOrder` | `Int` | default `0` |
| `active` | `Boolean` | default `true`؛ الحذف الناعم يعني `active=false` |
| `createdAt` | `DateTime` | `now()` |

قيد فريد: `@@unique([kind, value])`. فهرس: `[kind, active]`. العلاقات: `itemsAsCategory`, `itemsAsSupplier`, `itemsAsManufacturer`, `itemsAsCountry`, `salesAsPayment`.

### 3.9 `AuditLog`

| الحقل | النوع | ملاحظات |
|---|---|---|
| `id` | `Int @id` | تلقائي |
| `userId` | `Int?` | FK (`SetNull`)؛ قد يكون تدقيقاً نظامياً |
| `action` | `String(60)` | مثل `CREATE_SALE` |
| `entity` | `String(60)` | مثل `sale` |
| `entityId` | `String?(60)` | دائماً نص |
| `oldValue`, `newValue` | `Json?` | قبل/بعد؛ لا تحتوي كلمات مرور |
| `createdAt` | `DateTime` | `now()` |

فهارس: `[entity, entityId]`, `[createdAt]`.

### 3.10 `Sequence`

| الحقل | النوع | ملاحظات |
|---|---|---|
| `name` | `String @id` | اسم العدّاد |
| `value` | `Int` | default `0`؛ يُزاد ذرياً عبر `upsert` |

العدّادات المستعملة فعلياً: `ITEM_CODE_PIECE`, `ITEM_CODE_SET`, `INVOICE`, `STOCKTAKE_REF`. كما ينشئ الـseed العدّادات `ITEM_CODE`, `INVOICE`, `STOCKTAKE`؛ والعدّادات غير الموجودة تُنشأ تلقائياً عند أول استعمال عبر `nextSequence`. لا يُعاد استعمال رقم بعد صرفه.

### 3.11 البيانات الأولية (`seed.ts`)

| المجموعة | المحتوى |
|---|---|
| `Setting` | `shopName=محل الذهب`, `currency=LYD`, `codeMode=AUTO`, `deductStone=true`, `deductInlays=true`, `weightBasis=NET_GOLD`, `profitMode=PERCENT`, `profitValue=5`, `fixedBasis=PIECE`, `fxSource=MANUAL`, `roundingStep=0`, `priceStaleHours=2`, `showCostToSeller=false`, `sellerCanAddItems=true`, `defaultKarat=21`. |
| `Lookup / CATEGORY` | `طقم`, `خاتم`, `سلسلة`, `أسورة`, `حلق`, `تعليقة`, `خراصات` (بالترتيب). تصنيف «طقم» مطلوب لفرض تصنيف الأطقم. |
| `Lookup / COUNTRY` | `ليبيا`, `الإمارات`, `تركيا`, `إيطاليا`, `الهند` |
| `Lookup / PAYMENT_METHOD` | `نقدي`, `بطاقة مصرفية`, `تحويل مصرفي`, `صك` |
| `Lookup / KARAT` | `18`, `21`, `24` |
| `Lookup / SUPPLIER`, `MANUFACTURER` | فارغان؛ يُضيفهما المستخدم من الواجهة |
| `User` | `admin` / `Admin@2026` (`OWNER`)، `seller` / `Seller@2026` (`SELLER`)؛ التجزئة بـbcrypt cost 12. |
| `Sequence` | `ITEM_CODE=0`, `INVOICE=0`, `STOCKTAKE=0` |

> الـseed idempotent: يستخدم `upsert` ولا يغيّر قيماً موجودة. غيّر كلمتي المرور فور أول دخول.

---

## 4. مرجع API الكامل

### 4.1 الاصطلاحات

- كل المسارات تبدأ بـ`/api`. النجاح: `ok(res, data, status)` ⇒ `{ "data": ... }`. الخطأ: `{ "error": { "code", "message", "details?", "requestId" } }` مع ترويسة `X-Request-Id`.
- `jsonSafe` يحوّل `Prisma.Decimal` إلى `number` و`Date` إلى ISO string قبل الإرسال.
- التحقق من المدخلات عبر Zod برسائل عربية؛ خطأ التحقق ⇒ `422 VALIDATION_ERROR` مع `details` الذي يعرض مسار الحقل.
- الترقيم الافتراضي: `page=1`, `pageSize=20`، والحد الأعلى `pageSize=200` في المسارات التي تستعمل `paging()`.
- كل `/api` يُعيد `Cache-Control: no-store` و`Pragma: no-cache`.
- الأخطاء الشائعة: `BAD_REQUEST 400`, `UNAUTHORIZED 401`, `FORBIDDEN 403`, `NOT_FOUND 404`, `CONFLICT 409`, `VALIDATION_ERROR 422`, `RATE_LIMITED 429`, `BAD_GATEWAY 502`, `DATABASE_UNAVAILABLE 503`, `INTERNAL 500`, `INVALID_JSON 400`, `PAYLOAD_TOO_LARGE 413`, `DUPLICATE 409`, `RELATION_CONFLICT 409`.

### 4.2 مصفوفة الوصول

| المسار | عام | OWNER | SELLER |
|---|---|---|---|
| `GET /api/health`, `GET /api/bootstrap` | ✅ | ✅ | ✅ |
| `POST /api/auth/login`, `POST /api/auth/logout` | ✅ | ✅ | ✅ |
| `GET /api/auth/me`, `POST /api/auth/change-password` | ❌ | ✅ | ✅ |
| `/api/users/*` | ❌ | ✅ | ❌ |
| `/api/reports/*` | ❌ | ✅ | ❌ |
| `PATCH /api/settings` | ❌ | ✅ | ❌ |
| `POST /api/prices` (`FX`) | ❌ | ✅ | ✅ |
| `POST /api/prices` (`OUNCE`) | ❌ | ✅ | ❌ |
| `POST /api/prices/refresh-ounce` | ❌ | ✅ | ❌ |
| `POST /api/items`, `GET /api/items/*` | ❌ | ✅ | ✅ بقيود |
| `PATCH/DELETE /api/items/:id` | ❌ | ✅ | ❌ |
| `POST /api/sales`, `GET /api/sales/*` | ❌ | ✅ | ✅ |
| `POST /api/sales/:id/cancel` | ❌ | ✅ | ❌ |
| `GET /api/inventory/summary` | ❌ | ✅ | ✅ (حقول التكلفة مشروطة) |
| `POST /api/stocktakes`, `/:id/close`, `/:id/differences` | ❌ | ✅ | ❌ |
| `PATCH /api/stocktakes/:id/lines/:lineId` | ❌ | ✅ | ✅ |
| `POST /api/lookups` | ❌ | أي نوع | `SUPPLIER`/`MANUFACTURER` فقط |
| `PATCH/DELETE /api/lookups/:id` | ❌ | ✅ | ❌ |
| `GET /api/dashboard` | ❌ | ✅ | ✅ |

### 4.3 `auth` — المصادقة

| الطريقة | المسار | الطلب | الاستجابة |
|---|---|---|---|
| `POST` | `/api/auth/login` | `{ username, password }` | بيانات المستخدم `{ id, name, username, role }` + كوكي `gold_session` |
| `POST` | `/api/auth/logout` | — | `{ ok: true }` ويُمسح الكوكي |
| `GET` | `/api/auth/me` | — | `{ id, name, username, role }` أو 401 |
| `POST` | `/api/auth/change-password` | `{ currentPassword, newPassword }` (8+ أحرف) | `{ ok: true }`؛ تُنهي بقية جلسات المستخدم |

حدود الدخول: 30 محاولة/10 دقائق لكل IP، و8 محاولات/10 دقائق لكل حساب؛ عند النجاح تُصفَّر العدّادات. المقارنة تستخدم هاشاً وهمياً عند غياب المستخدم لتقريب زمن الاستجابة.

### 4.4 `users` — المستخدمون (OWNER فقط)

| الطريقة | المسار | الطلب | الاستجابة |
|---|---|---|---|
| `GET` | `/api/users` | — | مصفوفة `{ id, name, username, role, active, createdAt }` |
| `POST` | `/api/users` | `{ name, username, password, role, active? }` | نفس الشكل، 201 |
| `PATCH` | `/api/users/:id` | `{ name?, role?, active? }` | نفس الشكل |
| `POST` | `/api/users/:id/password` | `{ password }` | `{ ok: true }`؛ تُنهي كل جلسات المستخدم |

قيود: اسم الدخول `[A-Za-z0-9._-]` بطول 3–60؛ كلمة المرور 8–72 حرفاً، ليست اسم المستخدم ولا من القائمة الضعيفة. لا يمكن تعطيل أو تحويل آخر `OWNER` نشط إلى `SELLER`.

### 4.5 `lookups` — القوائم المرجعية

| الطريقة | المسار | الطلب/الاستعلام | الاستجابة |
|---|---|---|---|
| `GET` | `/api/lookups` | `kind?`, `activeOnly?` (افتراضي `true`) | إن وُجد `kind`: مصفوفة؛ وإلا كائن مجمّع بجميع الأنواع الستة |
| `POST` | `/api/lookups` | `{ kind, value, sortOrder? }` | الصف الجديد، 201 |
| `PATCH` | `/api/lookups/:id` | `{ value?, sortOrder?, active? }` | الصف المحدَّث |
| `DELETE` | `/api/lookups/:id` | — | `{ ok: true }` أو `{ ...row, deactivated: true }` إن كان مستعملاً |

عيار `KARAT` يجب أن يكون بين 1 و24. إذا كانت القيمة مستعملة في صنف/فاتركة فتُعطَّل بدل حذفها.

### 4.6 `settings` — الإعدادات

| الطريقة | المسار | الوصول | الطلب | الاستجابة |
|---|---|---|---|---|
| `GET` | `/api/settings` | أي مستخدم | — | كائن `Setting` + `weightBasis` مشتق، أو `null` |
| `PATCH` | `/api/settings` | OWNER | أي حقل من حقول `Setting` عدا `id/updatedAt` | الكائن المحدَّث |

تحقق: `currency` حروف لاتينية 2–8 ثم تُحوَّل لكبير؛ `profitValue` 0–100000؛ `roundingStep` ∈ {0,5,10}؛ `priceStaleHours` 1–168؛ `defaultKarat` 1–24؛ `fixedBasis` ∈ {`GRAM`,`PIECE`}. عند تغيير `deductStone`/`deductInlays` يُعاد اشتقاق `weightBasis`.

### 4.7 `prices` — الأسعار

| الطريقة | المسار | الوصول | الطلب/الاستعلام | الاستجابة |
|---|---|---|---|---|
| `GET` | `/api/prices/current` | أي مستخدم | — | `CurrentPrices` |
| `GET` | `/api/prices/table` | أي مستخدم | `ounce?`, `fx?` (قيم موجبة للمعاينة) | `{ ready, ounce, fx, table, current, providers }` |
| `POST` | `/api/prices/refresh-ounce` | OWNER | — | `{ row, quote }`، 201 |
| `POST` | `/api/prices` | انظر المصفوفة | `{ type: 'OUNCE'\|'FX', value > 0 }` | صف `PriceUpdate`، 201 |
| `GET` | `/api/prices/history` | أي مستخدم | `type?`, `page`, `pageSize` | `{ rows, total, page, pageSize }` |

شكل `CurrentPrices`: `{ ounce: PriceSnapshot|null, fx: PriceSnapshot|null, stale, staleHours, ageHours, ready }`، و`PriceSnapshot = { value, at, source, userId, userName }`.

شكل `providers.ounce`: `{ mode, configured, docsUrl, autoRefresh, refreshMinutes }`. الواجهة تعرض شارة «تحديث تلقائي كل {refreshMinutes} دقيقة» عند `autoRefresh=true`.

حدود القيم: الأونصة 100–100000 (يدوياً ومن المزوّد)، الصرف 0.000001–10000. الجلب اليدوي محدود بـ20 عملية/5 دقائق لكل مستخدم.

طلب المزوّد: `GET {GOLD_PRICE_API_URL}/price/XAU/USD` مع ترويسة `X-API-Key` ومهلة 10 ثوانٍ؛ يُقرأ حقل `price` من JSON ويُرفض خارج النطاق.

### 4.8 `items` — الأصناف

| الطريقة | المسار | الوصول | الطلب/الاستعلام | الاستجابة |
|---|---|---|---|---|
| `GET` | `/api/items` | أي مستخدم | `q?`, `status?`, `type?`, `karat?`, `page`, `pageSize` | `{ rows, total, page, pageSize }` |
| `GET` | `/api/items/next-code` | أي مستخدم | `type?` (افتراضي `PIECE`) | `{ code, mode }`؛ `code=null` في الوضع اليدوي |
| `GET` | `/api/items/by-code/:code` | أي مستخدم | — | الصنف أو 404 |
| `GET` | `/api/items/:id` | أي مستخدم | — | الصنف أو 404 |
| `POST` | `/api/items` | OWNER / SELLER بشرط | انظر مخطط `itemSchema` أدناه | الصنف الجديد، 201 |
| `PATCH` | `/api/items/:id` | OWNER | نفس المخطط كاملاً | الصنف المحدَّث |
| `DELETE` | `/api/items/:id` | OWNER | — | `{ ok: true }` أو 409 إن كان مرتبطاً ببيع |

**مخطط `itemSchema` (للإنشاء/التعديل):** `type` مطلوب؛ `code?`؛ `name` مطلوب؛ `categoryId?`؛ `size?`؛ `karat` 1–24؛ `totalWeight?` (إلزامي للقطعة)؛ `stoneWeight=0`؛ `stonePrice?`؛ `inlaysWeight=0`؛ `quantity=1` (1–9999)؛ `confirmSameWeight?`؛ `purchaseGramPrice?`؛ `purchasePrice=0`؛ `purchaseCurrency=USD`؛ `purchaseFxRate?`؛ `purchaseStatus=NEW`؛ `weightBasis?`؛ `supplierId?`, `countryId?`, `manufacturerId?`, `manufacturer?`, `description?`, `notes?`, `addedAt?`؛ `components?` (للطقم).

قواعد الخادم عند الإنشاء/التعديل:

- الطقم يحتاج مكوّناً واحداً على الأقل، و`quantity` يجب أن يكون 1، و`stonePrice` على مستوى الطقم يُهمَل ويُحفظ `null`.
- إذا كانت `quantity > 1` يلزم `confirmSameWeight: true`.
- في وضع `AUTO` يتجاهل الخادم أي `code` مرسل ويولّد الكود داخل المعاملة؛ في `MANUAL` يكون الكود مطلوباً وفريداً.
- البائع يحتاج `sellerCanAddItems=true`، ولا يستطيع إرسال بيانات شراء إن كانت `showCostToSeller=false`.
- `resolveCategoryId` يفرض تصنيف «طقم» النشط لأي صنف `SET`، حتى لو أُرسل `categoryId` آخر.
- `resolveManufacturer` يتحقق أن `manufacturerId` من نوع `MANUFACTURER`، ويحفظ الاسم في `manufacturer` أيضاً.
- `resolveLookupId` يتحقق نوع `CATEGORY`/`SUPPLIER`/`COUNTRY`.
- حقول الشراء تُحذف من استجابات البائع عند إخفاء التكلفة: `purchaseGramPrice`, `purchasePrice`, `purchaseCurrency`, `purchaseFxRate`, `purchaseCostDinar`, `purchaseStatus`.
- لا يمكن تعديل صنف `SOLD`، ولا تغيير نوعه بعد الإنشاء، ولا حذف صنف مرتبط بـ`SaleItem`.

### 4.9 `sales` — المبيعات

| الطريقة | المسار | الوصول | الطلب/الاستعلام | الاستجابة |
|---|---|---|---|---|
| `GET` | `/api/sales` | أي مستخدم | `from?`, `to?`, `sellerId?`, `status?`, `page`, `pageSize` | `{ rows, total, page, pageSize }` |
| `GET` | `/api/sales/:id` | أي مستخدم | — | الفاتورة مع `items`, `seller`, `cancelledBy`, `paymentMethod` |
| `POST` | `/api/sales` | OWNER / SELLER | انظر أدناه | الفاتورة الجديدة، 201 |
| `POST` | `/api/sales/:id/cancel` | OWNER | `{ reason }` (3–500) | الفاتورة بعد الإلغاء |

**جسم إنشاء الفاتورة:**

```json
{
  "items": [{ "itemId": 1, "quantity": 1, "unitPrice": 3190.16 }],
  "paymentMethodId": null,
  "customerName": null,
  "customerPhone": null,
  "profitMode": "PERCENT",
  "profitValue": 5,
  "fixedBasis": "PIECE",
  "roundingStep": 0,
  "fxMode": "CASH",
  "fxRate": 6
}
```

`unitPrice` موجب إلزامي، و`items` غير فارغة. `profitValue` يُخزَّن `0` دائماً عند `profitMode='MANUAL'`. `total` يحسبه الخادم من `Σ(unitPrice × quantity)` مقرّباً لخانتين؛ لا يثق بالعميل في الإجمالي.

### 4.10 `inventory` — المخزون

| الطريقة | المسار | الطلب | الاستجابة |
|---|---|---|---|
| `GET` | `/api/inventory/summary` | — | `{ ready, prices, basis, totals, byKarat, rows }` |

`totals = { items, units, totalWeight, goldWeight, value, cost?, margin? }`. حقول `cost` و`margin` تُحذف من `totals` و`byKarat` و`rows` عند منع رؤية التكلفة. عند غياب الأسعار `ready=false` والقيم صفر.

### 4.11 `stocktakes` — الجرد

| الطريقة | المسار | الوصول | الطلب | الاستجابة |
|---|---|---|---|---|
| `POST` | `/api/stocktakes` | OWNER | `{ type, notes? }` | الجرد مع الأسطر، 201 |
| `GET` | `/api/stocktakes` | أي مستخدم | — | آخر 100 جرد |
| `GET` | `/api/stocktakes/:id` | أي مستخدم | — | الجرد مع الأسطر |
| `PATCH` | `/api/stocktakes/:id/lines/:lineId` | أي مستخدم | `{ countedWeight?, present? }` | السطر المحدَّث |
| `POST` | `/api/stocktakes/:id/close` | OWNER | — | الجرد بعد الإغلاق |
| `GET` | `/api/stocktakes/:id/differences` | OWNER | — | `{ missing, notRegistered, weightDiffs, counts }` |

لا يُسمح بجرد مفتوح ثانٍ. تعديل سطر في جرد `CLOSED` مرفوض (BR-14). `valueAtOpen` و`expectedWeight` يُلتقطان عند الفتح ولا يتأثران بتغيّر الأسعار لاحقاً.

### 4.12 `reports` — التقارير (OWNER فقط)

| الطريقة | المسار | الاستعلام | المخرجات |
|---|---|---|---|
| `GET` | `/api/reports/sales` | `from?`, `to?`, `sellerId?`, `paymentMethodId?`, `karat?` | `{ count, total, average, bySeller, byPayment, byKarat, rows }` للفواتير `COMPLETED` فقط |
| `GET` | `/api/reports/profit` | `from?`, `to?` | `{ revenue, cost, profit, marginPercent, rows }` لكل سطر بيع |
| `GET` | `/api/reports/inventory` | — | `{ ready, count, totalValue, totalCost, rows }` |
| `GET` | `/api/reports/prices` | `from?`, `to?` | آخر 500 تحديث سعر مع اسم المستخدم |
| `GET` | `/api/reports/audit` | `from?`, `to?`, `entity?`, `take?` (1–500، افتراضي 100) | صفوف `AuditLog` مع المستخدم |

### 4.13 `dashboard` وخدمات النظام

| الطريقة | المسار | الوصول | الاستجابة |
|---|---|---|---|
| `GET` | `/api/dashboard` | أي مستخدم | `{ shopName, currency, prices, table, today, month, inventory, recentSales, lastStocktake, user }` |
| `GET` | `/api/health` | عام | `{ data: { ok: true, time } }` |
| `GET` | `/api/bootstrap` | عام | `{ initialized, version: '0.2.1', ...(shopName,currency للمسجّل فقط) }` |

---

## 5. الخوارزميات الدقيقة

### 5.1 الدقة الحسابية

- `decimal.js` مع `precision = 28` و`ROUND_HALF_UP`.
- `toMoney` ⇒ خانتان عشريتان؛ `toWeight` ⇒ ثلاث خانات؛ `roundToStep` كما في 5.6.
- الحسابات الوسيطة تُبقى خاماً (`...Raw`) ولا تُقرَّب قبل النهاية. التحويل إلى `number` عند الإدخال/الإخراج فقط.

### 5.2 سعر الغرام

```
قيمة الأونصة محلياً = ounceUsd × fxRate
gramPrice24        = قيمة الأونصة ÷ 31.1035
karatFactor(K)     = K ÷ 24          (0 < K ≤ 24)
gramPriceKarat     = gramPrice24 × karatFactor(K)
```

مثال: `2000 × 6 = 12000`؛ `12000 ÷ 31.1035 = 385.81` لعيار 24؛ `× 0.875 = 337.58` لعيار 21؛ `× 0.75 = 289.36` لعيار 18.

### 5.3 الأوزان (D-07 / D-08 / BR-10)

```
total   > 0
stone   ≥ 0 , inlays ≥ 0
stone + inlays < total
netGold = total − stone − inlays
```

اختيار الخصم من `basis`:

| `basis` | خصم الحجر | خصم الفصوص |
|---|---|---|
| `NET_GOLD` | نعم | نعم |
| `TOTAL` | لا | لا |
| `MINUS_STONE` | نعم | لا |
| `MINUS_INLAYS` | لا | نعم |

ثم يُطبَّق BR-10: إذا كان `stonePrice > 0` يصبح خصم الحجر `true` دائماً. بعدها:

```
basisWeight = total − (stoneDeducted ? stone : 0) − (inlaysDeducted ? inlays : 0)
```

إذا كانت `basisWeight ≤ 0` ⇒ `PricingError`. الأخطاء المعرفة: `WEIGHT_INVALID`, `WEIGHT_NEGATIVE`, `STONE_TOO_HEAVY`, `INVALID_NUMBER`, `KARAT_INVALID`, `OUNCE_INVALID`, `FX_INVALID`, `PROFIT_INVALID`, `MANUAL_PRICE_INVALID`, `ROUNDING_INVALID`.

### 5.4 قيمة الصنف قبل الربح

```
goldValue = basisWeight × gramPriceKarat
stoneValue = stonePrice > 0 ? stonePrice : 0
subtotal   = goldValue + stoneValue
```

### 5.5 الربح — أساس الربح الثابت

| النمط | الحساب |
|---|---|
| `PERCENT` | `profit = subtotal × profitValue ÷ 100`؛ `total = subtotal + profit` |
| `FIXED` + `fixedBasis=PIECE` | `units = max(1, floor(pieceCount || 1))`؛ `profit = profitValue × units` |
| `FIXED` + `fixedBasis=GRAM` | `units = basisWeight` (وزن الأساس الخام بدقة 3 خانات)؛ `profit = profitValue × units` |
| `MANUAL` | `total = manualPrice`؛ `profit = manualPrice − subtotal` |

القيم الافتراضية: `fixedBasis = 'PIECE'` و`pieceCount = 1` عند غيابهما، توافقاً مع السلوك السابق. النتيجة تُعيد `profit.fixedBasis` و`profit.units` و`profit.amount` و`profit.input`. الربح الثابت السالب مرفوض في كلا الأساسين.

**الطقم:** المحرك لا يعرف ما هو الطقم؛ يُرسل له `pieceCount = عدد المكوّنات ذات الوزن > 0` (الحد الأدنى 1). معاينة الواجهة تحسب هذا العدد من `components.filter(c => c.weight > 0).length`. لذلك «100 لكل قطعة» على طقم من ثلاثة مكوّنات تعني 300، بينما «100 لكل غرام» تعني `100 × مجموع أوزان أساس المكوّنات`.

### 5.6 التقريب والتكلفة

```
roundToStep(x, 0)  = round2(x)                         // نصف لأعلى
roundToStep(x, s)  = round2( round0(x / s) × s )       // s ∈ {5, 10}
beforeRounding     = round2(total قبل التقريب)
finalPrice         = roundToStep(total, roundingStep)
roundingDelta      = finalPrice − beforeRounding
margin             = finalPrice − cost      (إن وُجدت التكلفة)
belowCost          = finalPrice < cost
```

التقريب يُطبَّق **مرة واحدة** بعد جمع الحجر والربح، وبعد ضرب الربح الثابت في عدد الوحدات.

### 5.7 أمثلة محسوبة مرجعية

**المدخلات الأساسية:** أونصة `2000` USD، صرف `6`، عيار `21`، إجمالي `10 g`، حجر `0.8 g`، فصوص `0.2 g`، ربح `5%`، تقريب `0`.

| الأساس | وزن الأساس | قيمة الذهب | السعر النهائي |
|---|---:|---:|---:|
| `NET_GOLD` | 9.000 | 3,038.24 | 3,190.16 |
| `TOTAL` | 10.000 | 3,375.83 | 3,544.62 |
| `MINUS_STONE` | 9.200 | 3,105.76 | 3,261.05 |
| `MINUS_INLAYS` | 9.800 | 3,308.31 | 3,473.72 |

**BR-10 — حجر بسعر 150 مع أساس `TOTAL`:** وزن الأساس `9.200` (خُصم الحجر رغم الأساس)، قيمة الذهب `3,105.76`، الحجر `150.00`، المجموع `3,255.76`، النهائي بعد 5% = `3,418.55`. مع `MINUS_INLAYS` أو `NET_GOLD` يصبح النهائي `3,347.66`.

**الربح الثابت 100 على نفس المدخلات دون سعر حجر:**

| الحالة | الوحدات | مبلغ الربح | قبل التقريب | النهائي |
|---|---:|---:|---:|---:|
| `PIECE` افتراضي | 1 | 100.00 | 3,138.24 | 3,138.24 |
| `PIECE` مع 3 مكوّنات | 3 | 300.00 | 3,338.24 | 3,338.24 |
| `GRAM` | 9 | 900.00 | 3,938.24 | 3,938.24 |
| `GRAM` + تقريب 5 | 9 | 900.00 | 3,938.24 | 3,940.00 |
| `PIECE` × 3 + تقريب 5 | 3 | 300.00 | 3,338.24 | 3,340.00 |

مع حجر مسعّر 150 و`FIXED 100 / PIECE` ⇒ المجموع `3,188.24` والنهائي `3,288.24`.

**التقريب بالنسبة المئوية:** قبل التقريب `3,190.16`؛ أقرب 5 ⇒ `3,190` (الفرق `-0.16`)؛ أقرب 10 ⇒ `3,190`؛ بدون ⇒ `3,190.16`.

**الشراء بالغرام:** سعر الغرام `300 USD` × صافي ذهب `5 g` = `1,500.00 USD`؛ بصرف `6` ⇒ تكلفة `9,000.00 LYD`. تُحفظ هذه القيم مع الصنف ولا يُحسب أي سعر بيع تقديري وقت الشراء.

### 5.8 تقييم المخزون

- للقطعة: `قيمة = basisWeight × gramPriceKarat + stoneValue`، ثم `× quantity`.
- للطقم: تُجمع قيمة كل مكوّن بعياره ووزنه وأساسه (`item.weightBasis ?? setting.weightBasis`)، ثم يُضاف سعر الحجر لكل مكوّن.
- إذا لم تتوفر الأونصة والصرف معاً ⇒ `ready=false` وكل القيم صفر.
- القيمة لحظية بأسعار اليوم، وليست سعر الشراء.

### 5.9 الأكواد والتسلسلات

```
nextSequence(tx, name):
  upsert(name) { update: value += 1, create: value = 1 }   // مع إعادة محاولة عند P2002
كود الصنف = P- أو S- + رقم من 4 خانات (P-0001 / S-0001)
رقم الفاتورة = INV- + رقم من 5 خانات (INV-00001)
```

`generateCode` يتخطى أي كود مستعمل حتى لو حُذف الصنف. `peekNextCode` يحسب معاينة دون استهلاك العدّاد، وينظر أيضاً إلى أعلى كود موجود. مرجع الجرد يُقرأ من عدّاد `STOCKTAKE_REF` ويُسجَّل في التدقيق.

### 5.10 إنشاء البيع (ذرّي)

1. تجميع الكميات المطلوبة لكل `itemId` داخل الطلب الواحد.
2. التحقق من نوع طريقة الدفع إن وُجدت.
3. التحقق من وجود كل صنف، وحالته `AVAILABLE`، وتوفر الكمية.
4. حساب `total` في الخادم.
5. أخذ رقم `INV-#####` من التسلسل.
6. لكل صنف: `updateMany` بشرط `{ id, status: AVAILABLE, quantity >= wanted }` مع `decrement`؛ فإن لم يُصَب صف واحد ⇒ 409. ثم `updateMany` يحول الصنف إلى `SOLD` عند `quantity <= 0`.
7. إنشاء `Sale` و`saleItems` مع لقطة السياسة كاملة.
8. كتابة تدقيق `CREATE_SALE`.
9. كل الخطوات داخل `prisma.$transaction`؛ أي فشل يُتراجع كلياً.

### 5.11 إلغاء البيع (ذرّي)

1. قراءة الفاتورة وسطورها.
2. `updateMany` بشرط `{ id, status: COMPLETED }` لتغيير الحالة وتسجيل السبب والوقت والمُلغي؛ إن لم يُصَب صف ⇒ الفاتورة ملغاة مسبقاً.
3. إعادة `quantity` لكل صنف وتعيين `AVAILABLE`.
4. تدقيق `CANCEL_SALE` بالحالة قبل/بعد والسبب.
5. لا يمكن التراجع عن الإلغاء.

### 5.12 الجرد والفروقات

```
weightDiff = round3(countedWeight − expectedWeight)
missing     = lines حيث present = false
weightDiffs = lines حيث present = true و weightDiff ≠ 0
notRegistered = أصناف AVAILABLE غير موجودة في لقطة الجرد
```

المجموعات الثلاث منفصلة بلا تكرار. `PATCH` لسطر مغلق مرفوض (BR-14). الإغلاق تحديث شرطي `{ id, status: OPEN }` يمنع الإغلاق المزدوج.

### 5.13 تحديث السعر التلقائي

- يعمل فقط إذا `GOLD_PRICE_PROVIDER=api` و`GOLD_PRICE_API_KEY` مهيأ و`GOLD_PRICE_REFRESH_MINUTES > 0`.
- عند الإقلاع يُجلب السعر فقط إن كان آخر تحديث أقدم من الفاصل؛ لا تكرار عند إعادة التشغيل.
- كل دورة تختار أول `OWNER` نشط وتنشئ `PriceUpdate` بمصدر `API` وتكتب تدقيق `AUTO_FETCH_PRICE` مع `reason: startup|schedule`.
- `inFlight` يمنع التداخل؛ الأخطاء تُطبع تحذيراً ولا تُسقط الخادم، ويبقى الإدخال اليدوي متاحاً.
- الخطة المجانية في goldapi.dev = 100 طلب/ساعة؛ الفاصل الافتراضي 10 دقائق = 6 طلبات/ساعة. لا يُنصح بأقل من 5 دقائق دون ترقية.
- عند إيقاف الخادم (`SIGINT`/`SIGTERM`) يُوقف المجدول ويُغلق اتصال Prisma بأمان.

### 5.14 قدم السعر

`ageHours = max(عمر آخر أونصة، عمر آخر صرف)`؛ `stale = ageHours > priceStaleHours`. يُعرض تنبيه في الرئيسية والشاشات ذات الصلة. `ready = وجود آخر سعرين`.

---

## 6. سير العمل

### 6.1 التشغيل الأول

1. `powershell -ExecutionPolicy Bypass -File .\tools\mysql-init.ps1`
2. `npm.cmd install`
3. `copy apps\api\.env.example apps\api\.env` ثم ضبط `DATABASE_URL` و`SESSION_SECRET` (والمفتاح اختيارياً).
4. `npm.cmd run db:generate` ثم `npm.cmd run db:push` ثم `npm.cmd run db:seed`.
5. `npm.cmd run dev`؛ افتح `http://localhost:5173` وتحقق من `/api/health`.
6. سجّل الدخول بـ`admin / Admin@2026` وغيّر كلمتي المرور.

### 6.2 تحديث الأسعار

- يدوياً: صفحة **أسعار الذهب** ⇒ أدخل الأونصة (OWNER) والصرف (OWNER أو SELLER) ⇒ معاينة فورية ⇒ حفظ. كل حفظ صف تاريخي جديد.
- تلقائياً: أضف المفتاح في `.env` واضبط `GOLD_PRICE_PROVIDER=api` + الفاصل ⇒ أعد التشغيل ⇒ شارة التحديث التلقائي وزر الجلب يظهران في الصفحة.

### 6.3 شراء قطعة ذهب

1. اختر النوع: `PIECE` أو `SET`.
2. الطقم: أضف مكوّنات بعيارات وأوزان؛ النظام يجمع الأوزان ويُثبّت التصنيف «طقم».
3. أدخل الوزن الإجمالي والحجر والفصوص وسعر الحجر الاختياري؛ تُحسب أوزان التحقق.
4. اختر التصنيف/المقاس/المورّد/البلد/المصنّع؛ يمكن إضافة مورّد أو مصنع سريعاً.
5. أدخل سعر الغرام بعملة الشراء والصرف إن كانت أجنبية؛ تظهر التكلفة بالدينار فقط، دون سعر بيع تقديري.
6. احفظ ⇒ الكود التلقائي أو اليدوي، الحالة `AVAILABLE`، وتدقيق `CREATE_ITEM`.

### 6.4 البيع

1. ابحث عن صنف متاح وأضفه للسلة؛ عدّل الكمية والسعر (السعر المقترح اختياري).
2. اختر سياسة هذه الفاتورة: نسبة / مبلغ ثابت (لكل غرام أو لكل قطعة) / سعر يدوي؛ التقريب 0/5/10.
3. اختر نمط الصرف (نقدي أو صك مصدق) وعدّل سعره إن لزم.
4. أضف العميل وطريقة الدفع اختيارياً.
5. راجع الملخص بما فيه التكلفة والربح/الخسارة إن كانت الصلاحية مسموحة.
6. أكّد ⇒ خصم ذري للمخزون ورقم فاتورة `INV-00001` وإمكانية الطباعة.

### 6.5 الإلغاء، الجرد، التقارير

- الإلغاء: OWNER يفتح الفاتورة، يكتب سبباً (3+ أحرف)، يؤكد ⇒ إرجاع الكميات وتدقيق.
- الجرد: OWNER يفتح جرداً ⇒ لقطة ⇒ المالك/البائع يسجّل الأوزان ⇒ تقرير الفروقات ⇒ OWNER يغلقه نهائياً.
- التقارير: OWNER يحدد الفترة ويستعرض المبيعات/الأرباح/المخزون/الأسعار/التدقيق.

---

## 7. شاشات الواجهة

### 7.1 المسارات

| المسار | الشاشة | الوصول |
|---|---|---|
| `/login` | الدخول | عام؛ إذا كان مسجّلاً يُحوَّل للرئيسية |
| `/` | الرئيسية | مسجّل |
| `/prices` | أسعار الذهب | مسجّل |
| `/items`, `/items/new`, `/items/:id` | الأصناف والنموذج | مسجّل (الإضافة للبائع مشروطة) |
| `/sales`, `/sales/new`, `/sales/:id` | الفواتير، بيع جديد، التفاصيل | مسجّل |
| `/inventory` | المخزون والتقييم | مسجّل |
| `/stocktake`, `/stocktake/:id` | الجرد وتسجيل العدّ | مسجّل |
| `/reports` | التقارير | OWNER |
| `/settings` | الإعدادات والقوائم | OWNER |
| `/users` | المستخدمون | OWNER |

`Protected` يمنع غير المسجل ويحفظ مسار العودة؛ `OwnerOnly` يعرض شاشة «هذه الصفحة للمالك فقط». أي مسار آخر ⇒ شاشة «الصفحة غير موجودة».

### 7.2 سلوك عام

- `dir="rtl"` كامل، أرقام لاتينية، خط IBM Plex Sans Arabic، ثيم فاتح/داكن عبر `data-theme`.
- TanStack Query بمفاتيح `['auth','me']`, `['settings']`, `['prices']`, `['items']`, `['inventory']`, `['sales']`, `['stocktakes']`, `['reports',...]`, `['users']`, `['lookups',...]`, `['dashboard']`؛ تُبطل المفاتيح المتأثرة بعد كل كتابة.
- `lib/api.ts` يوحّد الطلبات ويعرض `ApiError.displayMessage` بالعربية.
- `lib/format.ts` يضبط `fmtMoney` (خانتان) و`fmtWeight` (2–3) والتاريخ/الوقت بتنسيق `en-GB`، و`timeAgo`.
- `lib/pricing-preview.ts` يستدعي `@gold/pricing` نفسه في المتصفح؛ المعاينة استرشادية وسعر البيع الفعلي يُدخل عند الفاتورة.

### 7.3 شاشة بيع جديد — التكلفة والربح/الخسارة (جديد في 0.2.0)

**قاعدة الظهور:** `showCost = isOwner || settings.showCostToSeller === true`. إن كانت `false` فلا تظهر أي تكلفة أو ربح في السلة أو الملخص أو نافذة التأكيد.

| الموضع | ما يُعرض | الحساب |
|---|---|---|
| كل سطر في السلة | سعر الشراء `/ وحدة`، تكلفة الشراء، «الربح/الخسارة» | `purchaseUnit = item.purchaseCostDinar`؛ `linePurchaseCost = round2(purchaseUnit × quantity)`؛ `lineTotal = round2(unitPrice × quantity)` |
| سطر طقم | عدد القطع في الطقم | عدد المكوّنات بوزن > 0 (الحد الأدنى 1) |
| ملخص الفاتورة | تكلفة الشراء، إجمالي سعر البيع، صافي الربح/الخسارة | `purchaseTotal = round2(Σ purchaseCostDinar × quantity)`؛ `total = round2(Σ unitPrice × quantity)` |
| نافذة التأكيد | نفس أرقام التكلفة والربح/الخسارة | نفس المصدر |

مكوّن `ProfitDelta`:

- إن كانت التكلفة `≤ 0` ⇒ `—`.
- إن كان الفرق `0` ⇒ `ربح 0`.
- إن كان الفرق موجباً ⇒ `ربح {المبلغ} {العملة} ({النسبة}%)` بالأخضر.
- إن كان سالباً ⇒ `خسارة {المبلغ} {العملة} ({النسبة}%)` بالأحمر.
- النسبة = `|الفرق| ÷ التكلفة × 100`، من 1 إلى 2 خانة عشرية.

هذه الأرقام **عرضية فقط**؛ الخادم هو من يحفظ `Sale.total`، وحقول التكلفة تُحذف أصلاً من استجابات من لا يملك صلاحيتها.

### 7.4 شاشة بيع جديد — اختيار أساس الربح الثابت

- حقل «أساس الربح الثابت» يظهر فقط عند `profitMode = FIXED`.
- زران: `لكل غرام` (`GRAM`) و`لكل قطعة` (`PIECE`)؛ الافتراضي يأتي من `settings.fixedBasis`.
- تسمية حقل القيمة تتغير تبعاً للاختيار: «الربح لكل غرام (LYD)» أو «الربح لكل قطعة (LYD)».
- شارة سياسة الفاتورة تُظهر `FIXED · لكل غرام` أو `FIXED · لكل قطعة`، وتُحفظ نفس القيمة في الفاتورة عبر `fixedBasis`.
- عند `MANUAL` يُخفى حقل الربح ويُكتب السعر يدوياً لكل سطر؛ الخادم يفرض `profitValue = 0`.

### 7.5 شاشة الإعدادات

بطاقات: هوية المحل، أكواد القطع، أساس احتساب الوزن، سياسة الربح والتقريب الافتراضية (مع اختيار `fixedBasis` عند `FIXED`)، أسعار الذهب، صلاحيات البائع، ثم إدارة القوائم بستة تبويبات: التصنيفات، الموردون، المصانع، بلاد المنشأ، طرق الدفع، العيارات. ملاحظة جانبية تؤكد أن الربح والتقريب هنا افتراضيان وأن لكل فاتورة سياستها المحفوظة.

### 7.6 شاشة الأصناف

- بحث فوري بالكود/الاسم/الوصف/المصنّع، وفلاتر الحالة/Nوع/العيار، وصفحات.
- نموذج القطعة: عند اختيار `SET` يُثبَّت التصنيف «طقم» ويُعطَّل الحقل؛ المصنّع والمورّد قائمتان مع زر إضافة سريعة (`POST /lookups` ثم اختيار القيمة).
- بطاقة الصنف تعرض سعر الغرام لكل عيار مستقلاً، وأوزان الأساس، والتكلفة لمن يملك صلاحيتها.

---

## 8. الأمان والتدقيق

### 8.1 المصادقة

- كوكي `gold_session` يحمل توكن `randomBytes(32)`؛ تُخزَّن في `Session.id` قيمة `sha256(token)` فقط.
- خصائص الكوكي: `httpOnly`, `sameSite: lax`, `secure` في الإنتاج، `path=/`، تنتهي بعد `SESSION_DAYS`.
- كلمات المرور `bcryptjs` بكلفة 12؛ سياسة: 8–72 حرفاً، لا تحتوي اسم المستخدم، وليست من القائمة الضعيفة.
- `attachUser` يحمّل المستخدم لكل طلب؛ `requireAuth` و`requireRole('OWNER')` يحميان المسارات.
- تغيير كلمة المرور يُبقي الجلسة الحالية ويلغي البقية؛ إعادة تعيين من المالك تُبطل كل الجلسات؛ تعطيل الحساب يُبطل جلساته فوراً.

### 8.2 طبقات حماية إضافية

- `helmet` مع `crossOriginResourcePolicy: same-site`، `cors` بمصدر مقيّد و`credentials: true`.
- `originGuard` يرفض الطلبات المعدِّلة من أصل غير مسموح؛ `express.json` بحد 1MB.
- `app.disable('x-powered-by')` و`trust proxy` افتراضي `0` لمنع تزوير IP.
- حدود في الذاكرة: دخول 30/IP و8/حساب لكل 10 دقائق؛ جلب سعر يدوي 20/5 دقائق لكل مستخدم؛ تُصفَّر عند إعادة تشغيل الخادم.
- تحقق Zod صارم على كل جسم/استعلام، وتحويل رسائل Prisma إلى رسائل عربية مع `requestId`.

### 8.3 إخفاء التكلفة في الخادم

القرار `canSeePurchase = role === 'OWNER' || setting.showCostToSeller`. عند `false` تُحذف حقول الشراء من `/items` و`/items/:id` و`/by-code/:code`، وتُحذف `cost/margin` من `/inventory/summary`، ويُمنع البائع من إرسال بيانات شراء عند إنشاء صنف. وهذا ليس إخفاءً بصرياً فقط.

### 8.4 سجل التدقيق

العمليات المسجّلة: `LOGIN`, `CHANGE_PASSWORD`, `CREATE_USER`, `UPDATE_USER`, `RESET_PASSWORD`, `CREATE_LOOKUP`, `UPDATE_LOOKUP`, `DEACTIVATE_LOOKUP`, `DELETE_LOOKUP`, `UPDATE_SETTINGS`, `UPDATE_PRICE`, `FETCH_PRICE`, `AUTO_FETCH_PRICE`, `CREATE_ITEM`, `UPDATE_ITEM`, `DELETE_ITEM`, `CREATE_SALE`, `CANCEL_SALE`, `OPEN_STOCKTAKE`, `UPDATE_STOCKTAKE_LINE`, `CLOSE_STOCKTAKE`. لا تُسجَّل كلمات المرور أبداً. التدقيق داخل معاملات الكتابة نفسها عند البيع/الإلغاء/الأصناف/الجرد.

### 8.5 عقد الاستجابة عند الخطأ

كل خطأ يمر عبر `middleware/error.ts` ويعيد الشكل التالي مع ترويسة `X-Request-Id`:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "رسالة عربية مختصرة للمستخدم",
    "details": [{ "path": "items.0.unitPrice", "message": "سعر البيع يجب أن يكون أكبر من صفر" }],
    "requestId": "uuid"
  }
}
```

| المصدر | الحالة | الرمز | ملاحظة |
|---|---|---|---|
| Zod | 422 | `VALIDATION_ERROR` | `details` لكل حقل، وأول رسالة في `message` |
| محرك التسعير | 422 | رمز المحرك | رسائل المحرك عربية أصلاً |
| Prisma P2002 | 409 | `DUPLICATE` | رسالة مخصصة للصنف/المستخدم/الفاتورة/القائمة |
| Prisma P2025 | 404 | `NOT_FOUND` | العنصر غير موجود |
| Prisma P2003/P2014 | 409 | `RELATION_CONFLICT` | بيانات مرتبطة |
| Prisma اتصال/تهيئة | 503 | `DATABASE_UNAVAILABLE` / `DATABASE_NOT_READY` | يوجّه المسؤول لتشغيل القاعدة أو `db:push` |
| JSON تالف / جسم كبير | 400 / 413 | `INVALID_JSON` / `PAYLOAD_TOO_LARGE` | بلا تفاصيل داخلية |
| حد المعدل | 429 | `RATE_LIMITED` | مع `Retry-After` |
| أي خطأ آخر | 500 | `INTERNAL` | رسالة عامة + `requestId` |

الرسائل الإنجليزية وتتبّعات المكدّس لا تُرسل للعميل؛ تُكتب في سجل الخادم مع `requestId` والمسار. الواجهة تعرض `message` مباشرة، ويمكنها إظهار `details` عند الحاجة.

---

## 9. الجودة والإصدار

### 9.1 أوامر التحقق

```powershell
npm.cmd test           # 28 اختباراً: 23 محرك + 5 تحويل عيار
npm.cmd run typecheck  # pricing + api + web
npm.cmd run build      # إنتاج api + web
npm.cmd run test:integration  # 142 فحصاً تكاملياً على خادم حي (دورتان)
npm.cmd run test:stress       # فحص حِمل وتزامن على المسارات الحساسة
```

اختبارات محرك التسعير: `packages/pricing/test/engine.test.ts` (جداول الأوزان، BR-10، الربح والتقريب، الأخطاء، `fixedBasis`) و`karat.test.ts` (الأونصة، معاملات العيار، جدول الأسعار، رفض القيم غير الصالحة).

> سكربتا `test:integration` و`test:stress` موجودان في `package.json` ويستدعيان `tools/integration-test.mjs` و`tools/stress-test.mjs`. يحتاجان خادماً حياً على `http://localhost:4000` وقاعدة بيانات مهيأة. بيانات الاختبار تحمل بادئة `QA-` وتُنظَّف آلياً، ويبقى منها فقط ما يمنعه تصميم السجل التاريخي (فواتير ملغاة، سجل أسعار، جرد مغلق، سجل تدقيق).

### 9.2 قائمة فحص الإصدار

- [ ] `npm.cmd test` ⇒ 28/28 ناجح.
- [ ] `npm.cmd run typecheck` بلا أخطاء.
- [ ] `npm.cmd run build` ينتج `apps/api/dist` و`apps/web/dist`.
- [ ] `npm.cmd run test:integration` ناجح على خادم وMySQL حيّين (راجع 9.1 للمتطلبات).
- [ ] `npm.cmd run test:stress` بلا أخطاء 5xx أو فشل شبكة.
- [ ] `/api/health` يُعيد `{ data: { ok: true, ... } }` مع 200.
- [ ] الدخول بـ`admin` و`seller`، وظهور الصلاحيات الصحيحة لكل منهما.
- [ ] حفظ أونصة وصرف ⇒ تحديث جدول العيارات وسجل الأسعار وتدقيق `UPDATE_PRICE`.
- [ ] إضافة قطعة ثم طقم ⇒ الكودان `P-0001`/`S-0001` وتصنيف الطقم «طقم» وظهور المصنّع.
- [ ] بيع بكل أنماط الربح؛ التأكد من حفظ `profitMode/profitValue/fixedBasis/roundingStep/fxMode/fxRate` على الفاتورة.
- [ ] شاشة البيع: التكلفة والربح/الخسارة تظهر للمالك، وتختفي للبائع عند `showCostToSeller=false`.
- [ ] `FIXED + GRAM` و`FIXED + PIECE` يعطيان أرقام القسم 5.7، بما فيها الطقم متعدد المكوّنات.
- [ ] إلغاء فاتورة ⇒ إرجاع الكمية وتدقيق `CANCEL_SALE`.
- [ ] فتح جرد، تسجيل أوزان، تقرير الفروقات، إغلاق نهائي ورفض التعديل بعده.
- [ ] التقارير الخمسة تُعرض للمالك فقط.
- [ ] النسخ الاحتياطي: إيقاف MySQL ثم نسخ `tools/mysql/data` أو `mysqldump`.

### 9.3 قائمة إعادة البناء من الصفر

1. انسخ المستودع (بدون `node_modules` و`tools/mysql`) إلى جهاز جديد.
2. ثبّت Node.js 20+ وPowerShell، ثم `npm.cmd install`.
3. شغّل `tools/mysql-init.ps1` ثم `tools/mysql-start.ps1`.
4. انسخ `.env.example` إلى `apps/api/.env` واضبط `DATABASE_URL` و`SESSION_SECRET`؛ لا تضع أسراراً حقيقية في الملفات المتتبعة.
5. نفّذ `npm.cmd run db:generate` ⇒ `db:push` ⇒ `db:seed`.
6. راجع جدول `Setting`، القوائم الستة، المستخدمين، والعدّادات (القسم 3.11).
7. شغّل `npm.cmd run dev` وتحقق من `/api/health` و`/api/bootstrap` وصفحة الدخول.
8. غيّر كلمات المرور الافتراضية، ثم اضبط اسم المحل والعملة والعيار الافتراضي وسياسة الربح الافتراضية بما فيها `fixedBasis`.
9. إن أردت التحديث التلقائي: أضف `GOLD_PRICE_API_KEY` و`GOLD_PRICE_PROVIDER=api` و`GOLD_PRICE_REFRESH_MINUTES=10` ثم أعد التشغيل.
10. أدخل الأونصة والصرف، وأضف صنفاً تجريبياً، وأصدر فاتورة اختبار، ثم احذف بيانات الاختبار أو أعد `db:reset` في بيئة فارغة فقط.
11. نفّذ سلسلة التحقق في 9.1 و9.2 قبل التسليم، بما فيها الفحصان التكاملي والحِمل على بيئة تشغيل فعلية.

---

## 10. التكاملات

| الطرف | التفاصيل |
|---|---|
| `goldapi.dev` | `GET /price/XAU/USD` مع `X-API-Key`؛ مهلة 10 ثوانٍ؛ مصدر الصفوف `API`؛ توثيق <https://goldapi.dev/docs>؛ الخطة المجانية 100 طلب/ساعة. |
| مزوّد الصرف | متغيرات `FX_PROVIDER/FX_API_URL/FX_API_KEY` محجوزة؛ الإدخال الحالي يدوي. |
| Prisma / MySQL | `prisma db push` هو المسار المعتمد، مع سكربت `db:migrate` لإنشاء أول ترحيل عند الحاجة؛ MySQL محمول في `tools/mysql/data` مستثنى من git. |
| المتصفح | طباعة الإيصال عبر `window.print`؛ لا مولّد PDF خادمي داخل التطبيق. |

---

## 11. القيود المعروفة

1. محل واحد فقط، بلا فروع أو مستأجرين.
2. سعر الصرف يدوي؛ `FX_PROVIDER=api` غير مفعّل بعد.
3. لغة واحدة (العربية) وعملة محلية واحدة للفاتورة.
4. لا صور أو QR أو حالة «محجوز» أو بطاقات أصناف مطبوعة من الخادم.
5. الطباعة عبر المتصفح؛ ملف `docs/USER_MANUAL.pdf` يُحدَّث يدوياً عند التوثيق ولا يُولَّد من التطبيق.
6. حدود معدل الطلبات في الذاكرة؛ تُصفَّر عند إعادة تشغيل الخادم ولا تصلح لتعدد النسخ.
7. المجدول داخل عملية الـAPI؛ تشغيل أكثر من نسخة يؤدي إلى جلب مزدوج ما لم يُدار خارجياً.
8. لا يوجد مجلد `migrations` بعد: المسار المعتمد هو `db push`، وسكربت `db:migrate` متاح لإنشاء أول ترحيل عند الحاجة؛ `db:reset` مدمّر للبيانات.
9. `GET /api/bootstrap` يُعيد `version: '0.2.1'` ثابتاً في `app.ts`، ويجب تحديثه يدوياً مع رقم الحزم وتذييل الواجهة عند كل رفع إصدار.
10. أرقام التكلفة/الربح في شاشة البيع مشتقة من `purchaseCostDinar` المحفوظ للصنف، وليست تكلفة استبدال لحظية.
11. سكربتا `test:integration` و`test:stress` يحتاجان خادماً حياً وقاعدة بيانات؛ لا يعملان في CI معزول بلا تهيئة.
12. لا إشعارات خارج التطبيق (بريد/رسائل).

---

## 12. مصادر الملفات المعتمدة

| الموضوع | الملف |
|---|---|
| المخطط والعلاقات | `apps/api/prisma/schema.prisma` |
| البيانات الأولية | `apps/api/prisma/seed.ts` |
| تركيب المسارات والإصدار في bootstrap | `apps/api/src/app.ts` |
| متغيرات البيئة | `apps/api/src/config.ts`, `apps/api/.env.example` |
| الجلسات والصلاحيات | `apps/api/src/auth/*`, `apps/api/src/middleware/*` |
| كل نقاط API | `apps/api/src/routes/*` |
| القيم/الدوال المساعدة | `apps/api/src/lib/*` |
| الخوارزمية والأنواع | `packages/pricing/src/*`, `packages/pricing/test/*` |
| المسارات والشاشات | `apps/web/src/app/App.tsx`, `apps/web/src/pages/*` |
| أنواع الاستجابة والتنسيق والمعاينة | `apps/web/src/lib/types.ts`, `format.ts`, `pricing-preview.ts` |
| الأوامر والإصدارات | `package.json`, `apps/*/package.json`, `packages/pricing/package.json` |

> للاستخدام اليومي راجع [USER_MANUAL.md](USER_MANUAL.md)، وللفروق بين الإصدارات راجع [CHANGELOG.md](CHANGELOG.md)، ولخلفية القرارات راجع [ARCHITECTURE.md](ARCHITECTURE.md) و[DECISIONS.md](DECISIONS.md).
