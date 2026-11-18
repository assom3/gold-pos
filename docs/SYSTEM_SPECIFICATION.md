# المواصفات الكاملة لنظام «ذهب» — الإصدار 0.3.0

> المرجع التقني المعتمد لإعادة بناء النظام من الصفر. كل ما في هذا المستند مطابق للكود الموجود في المستودع وقت الإصدار `0.3.0`، ويتضمن ميزات `0.2.0` و`0.2.1` المفصّلة في [CHANGELOG.md](CHANGELOG.md): المخطط، المسارات، الأنواع، الخوارزميات، الشاشات، والاختبارات.
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
| الجذر `gold-pos` | 0.3.0 | workspaces وسكربتات التطوير/البناء/الاختبار | لا يحتوي منطق أعمال |
| `@gold/pricing` | 0.3.0 | الأوزان، سعر الغرام، الربح، التقريب، التحقق من المدخلات | لا يعرف HTTP ولا قاعدة البيانات |
| `@gold/api` | 0.3.0 | REST، مصادقة، صلاحيات، Zod، تدقيق، معاملات Prisma | لا يعيد اختراع معادلة التسعير |
| `@gold/web` | 0.3.0 | React + TanStack Query + RTL + معاينات محلية | لا تعتمد على حساب مالي إنتاجي خارج المحرك |

الأرقام في `package.json` للحزم الأربع `0.3.0`، وتذييل الواجهة يعرض `الإصدار 0.3.0`، و`GET /api/bootstrap` يُعيد `version: '0.3.0'` من `app.ts`. هذه القيم الثلاث متطابقة حالياً، وأي رفع إصدار لاحق يجب أن يحدّثها معاً.

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
| `LOCAL_CURRENCY` | `LYD` | نص | عملة افتراضية للبيئة (الإعداد الفعلي لعملة المحل هو `Setting.currency`، وعليه تُحسب تكاليف الشراء) |
| `BACKUP_DIR` | `backups/` في جذر المشروع | مسار | مجلد حفظ ملفات النسخ الاحتياطي |
| `BACKUP_COPY_DIR` | غير مهيأ | مسار اختياري | مجلد إضافي (قرص خارجي/مزامنة سحابية) تُنسخ إليه كل نسخة ناجحة |
| `BACKUP_MYSQLDUMP_PATH` | اكتشاف تلقائي | مسار اختياري | مسار `mysqldump` إن لم يُعثر عليه تلقائياً (MySQL المحمول ثم `PATH`) |
| `BACKUP_SCHEDULER` | `on` | `on \| off` | `off` يعطّل المجدول من البيئة (النسخ اليدوي يبقى متاحاً)؛ يُستعمل لتشغيل نسخة اختبار ثانية على نفس القاعدة |
| `SEED_OWNER_PASSWORD` | غير مهيأ (تطوير: `Admin@2026`) | اختياري في التطوير، إلزامي في الإنتاج | كلمة مرور `admin` عند `db:seed`. |
| `SEED_SELLER_PASSWORD` | غير مهيأ (تطوير: `Seller@2026`) | اختياري في التطوير، إلزامي في الإنتاج | كلمة مرور `seller` عند `db:seed`. |

> `apps/api/.env.example` يحتوي على قيم نائبة فقط (14 مفتاحاً، بلا `SEED_*` وبلا `TRUST_PROXY`). `TRUST_PROXY` مدعوم في `config.ts` لكنه غير مدرج في المثال؛ أضفه يدوياً عند العمل خلف وكيل. لا تُنسخ مفاتيح أو كلمات مرور حقيقية إلى الوثائق ولا إلى المستودع العام. ملف `.env` مستثنى من git عبر `.gitignore`.

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
| `npm.cmd run db:cleanup-qa` | حذف بيانات الاختبار التي تحمل بادئة `QA-` |
| `npm.cmd run db:backup` | نسخة احتياطية SQL مؤقتة في `backups/` باسم بتاريخ الوقت (سطر أوامر، خارج نظام الجدولة) |
| `npm.cmd run db:restore -- <ملف> --yes` | استعادة قاعدة البيانات من `.sql` أو `.sql.gz` بعد إنشاء نسخة أمان `pre-restore-*` تلقائياً |
| `npm.cmd run test:backup` | فحص نظام النسخ الاحتياطي على خادم حي (16 فحصاً) |
| `npm.cmd run docs:pdf` | تحديث `docs/USER_MANUAL.pdf` من دليل Markdown عند الحاجة |
| `npm.cmd run docs:pdf:spec` | تحديث `docs/SYSTEM_SPECIFICATION.pdf` من هذا المستند |
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
| `expectedWeight` | `Decimal(10,3)` | `totalWeight × quantity` وقت الفتح |
| `countedWeight` | `Decimal(10,3)?` | يُدخله المالك أو البائع |
| `weightDiff` | `Decimal(10,3)?` | `counted − expected`، يحسبه الخادم |
| `valueAtOpen` | `Decimal(14,2)` | قيمة اللحظة × الكمية وقت الفتح |
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
| `Sequence` | `ITEM_CODE=0`, `ITEM_CODE_PIECE=0`, `ITEM_CODE_SET=0`, `INVOICE=0`, `STOCKTAKE_REF=0`, `STOCKTAKE=0` |

> الـseed idempotent: يستخدم `upsert` ولا يغيّر قيماً موجودة. غيّر كلمتي المرور فور أول دخول. في `NODE_ENV=production` يرفض `db:seed` العمل إذا لم تُضبط `SEED_OWNER_PASSWORD` و`SEED_SELLER_PASSWORD` (رسالة عربية صريحة)؛ الافتراضيات `Admin@2026`/`Seller@2026` للتطوير فقط. المتغيران يُقرآن عند إنشاء الصف فقط، و`upsert` لا يُدير كلمة مرور موجودة — استخدم `POST /api/users/:id/password` لتغييرها.

### 3.12 `BackupSetting` و`BackupRun` (جديد في 0.3.0)

تعدادات: `BackupStatus` = `RUNNING | OK | FAILED`، `BackupTrigger` = `MANUAL | SCHEDULED`.

**`BackupSetting`** — صف واحد (`id = 1`) يُنشأ عند أول قراءة عبر `upsert` (لا يحتاج seed):

| الحقل | النوع | الافتراضي | ملاحظات |
|---|---|---|---|
| `enabled` | `Boolean` | `true` | تفعيل الجدولة التلقائية |
| `intervalHours` | `Int` | `24` | `6 \| 12 \| 24 \| 48 \| 168` |
| `timeOfDay` | `String(5)` | `02:00` | `HH:MM` بتوقيت الخادم؛ يُستعمل عند الفاصل 24 ساعة فأكثر |
| `retentionCount` | `Int` | `14` | عدد النسخ الناجحة المحتفظ بها (3–90) |
| `updatedAt` | `DateTime` | تلقائي | |

**`BackupRun`** — سجل كل محاولة:

| الحقل | النوع | ملاحظات |
|---|---|---|
| `id` | `Int @id` | |
| `trigger` | `BackupTrigger` | يدوية أو مجدولة |
| `status` | `BackupStatus` | `RUNNING` ثم `OK` أو `FAILED` |
| `startedAt` / `finishedAt` | `DateTime` / `DateTime?` | |
| `fileName` | `String(120)?` | `gold_pos-YYYYMMDD-HHMMSS.sql.gz` |
| `sizeBytes` | `BigInt?` | يُحوَّل إلى رقم في الاستجابة |
| `error` | `Text?` | سبب الفشل، أو تحذير عند فشل النسخ للمجلد الإضافي رغم نجاح النسخة |
| `userId` | `Int?` | منفّذ النسخة اليدوية؛ `null` للمجدولة (`onDelete: SetNull`) |

فهارس: `startedAt`, `status`.

---

## 4. مرجع API الكامل

### 4.1 الاصطلاحات

- كل المسارات تبدأ بـ`/api`. النجاح: `ok(res, data, status)` ⇒ `{ "data": ... }`. الخطأ: `{ "error": { "code", "message", "details?", "requestId" } }` مع ترويسة `X-Request-Id`.
- `jsonSafe` يحوّل `Prisma.Decimal` إلى `number` و`Date` إلى ISO string قبل الإرسال.
- التحقق من المدخلات عبر Zod برسائل عربية؛ خطأ التحقق ⇒ `422 VALIDATION_ERROR` مع `details` الذي يعرض مسار الحقل.
- الترقيم الافتراضي: `page=1`, `pageSize=20`، والحد الأعلى `pageSize=200` في المسارات التي تستعمل `paging()`.
- كل `/api` يُعيد `Cache-Control: no-store` و`Pragma: no-cache`.
- الأخطاء الشائعة: `BAD_REQUEST 400`, `UNAUTHORIZED 401`, `FORBIDDEN 403`, `NOT_FOUND 404`, `CONFLICT 409`, `VALIDATION_ERROR 422`, `RATE_LIMITED 429`, `BAD_GATEWAY 502`, `DATABASE_UNAVAILABLE 503`, `INTERNAL 500`, `INVALID_JSON 400`, `PAYLOAD_TOO_LARGE 413`, `DUPLICATE 409`, `RELATION_CONFLICT 409`.
- المخططات الحرفية لكل جسم طلب وقواعد الاستجابة الدقيقة في الملحق 14؛ ترتيب الـmiddleware والجلسات والحدود في الملحق 15.

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
| `GET /api/dashboard` | ❌ | ✅ (مع حقل `backup`) | ✅ (`backup: null`) |
| `/api/backups/*` | ❌ | ✅ | ❌ |

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

تحقق: `currency` 3 حروف لاتينية بالضبط ثم تُحوَّل لكبير؛ `profitValue` 0–100000؛ `roundingStep` ∈ {0,5,10}؛ `priceStaleHours` 1–168؛ `defaultKarat` 1–24؛ `fixedBasis` ∈ {`GRAM`,`PIECE`}. عند تغيير `deductStone`/`deductInlays` يُعاد اشتقاق `weightBasis`.

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
| `GET` | `/api/dashboard` | أي مستخدم | `{ shopName, currency, prices, table, today, month, inventory, recentSales, lastStocktake, backup, user }` — `backup` ملخص النسخ الاحتياطي للمالك، و`null` للبائع |
| `GET` | `/api/health` | عام | `{ data: { ok: true, time } }` |
| `GET` | `/api/bootstrap` | عام | `{ initialized, version: '0.3.0', ...(shopName,currency للمسجّل فقط) }` |

### 4.14 `backups` — النسخ الاحتياطي (OWNER فقط، جديد في 0.3.0)

كل المسارات تحت `requireAuth` و`requireRole('OWNER')`.

| الطريقة | المسار | الجسم | الاستجابة |
|---|---|---|---|
| `GET` | `/api/backups` | — | `{ settings, summary, storage, runs }` (آخر 100 محاولة) |
| `PATCH` | `/api/backups/settings` | `{ enabled?, intervalHours?, timeOfDay?, retentionCount? }` | نفس شكل `GET` بعد الحفظ |
| `POST` | `/api/backups/run` | — | `201` بنفس شكل `GET` بعد انتهاء النسخة (متزامن)؛ `400` برسالة السبب إن فشلت؛ `409` إن كانت نسخة قيد التنفيذ |
| `GET` | `/api/backups/:id/download` | — | ملف `.sql.gz` (`Content-Disposition: attachment`)؛ `404` إن لم يوجد الملف |
| `DELETE` | `/api/backups/:id` | — | يحذف الملف (والمجلد الإضافي) والسجل ثم يُرجع النظرة العامة؛ `409` إن كانت قيد التنفيذ |

- **`settings`**: `{ enabled, intervalHours, timeOfDay, retentionCount }`. التحقق: `intervalHours ∈ {6,12,24,48,168}`، `timeOfDay` بصيغة `HH:MM` (24 ساعة)، `retentionCount` عدد صحيح 3–90 (وإلا `422`).
- **`summary`**: `{ health: ok|warning|none|off, enabled, schedulerActive, running, intervalHours, lastOkAt, lastOkSizeBytes, lastFailedAt, nextRunAt }`. `lastFailedAt` لا يظهر إلا إذا فشلت محاولة بعد آخر نجاح.
- **`storage`**: `{ dir, copyDir, mysqldump, totalSizeBytes, count }`؛ العدّ والحجم للنسخ التي ما زال ملفها موجوداً فقط.
- **`runs[]`**: `{ id, trigger, status, startedAt, finishedAt, fileName, sizeBytes, error, fileExists }`.
- اسم الملف في التنزيل/الحذف يُتحقَّق من صيغته `gold_pos-YYYYMMDD-HHMMSS.sql.gz` (منع الخروج من المجلد)، ويأتي من السجل لا من المستخدم.

---

## 5. الخوارزميات الدقيقة

### 5.0 الواجهة البرمجية لحزمة `@gold/pricing` (مرجع إعادة البناء)

`packages/pricing/src/index.ts` يعيد تصدير `types.js`, `errors.js`, `money.js`, `karat.js`, `engine.js` كاملة. لا توجد خطوة بناء منفصلة؛ الحزمة `private`, `type: module`, وتُستهلك كـTypeScript مباشرة عبر `exports["."] = "./src/index.ts"` و`types = "./src/index.ts"` تحت `moduleResolution: Bundler`. التوقيعات الدقيقة الواجب تطابقها:

```ts
type Numeric = Decimal | number | string;
function toDecimal(value: Numeric | null | undefined, fallback: Numeric = 0): Decimal;
function toMoney(value: Numeric): number;                  // خانتان، ROUND_HALF_UP
function toWeight(value: Numeric): number;                 // ثلاث خانات، ROUND_HALF_UP
function roundToStep(value: Numeric, step: number): Decimal; // يُعيد Decimal لا number

const TROY_OUNCE_GRAMS: number; // 31.1035
const KARAT_BASE: number;       // 24
function gramPrice24(ounceUsd: Numeric, fxRate: Numeric): Decimal;
function karatFactor(karat: number): Decimal;
function gramPriceForKarat(ounceUsd: Numeric, fxRate: Numeric, karat: number): Decimal;
function buildPriceTable(ounceUsd: Numeric, fxRate: Numeric, karats: number[]): PriceTable;

function computeWeights(input: WeightsInput): WeightBreakdown;
function computeItemPrice(input: PricingInput): PricingResult;
```

الأنواع المُصدَّرة (مطابقة لـ`src/types.ts` و`src/errors.ts`):

```ts
export type WeightBasis = 'NET_GOLD' | 'TOTAL' | 'MINUS_STONE' | 'MINUS_INLAYS';
export type ProfitMode  = 'PERCENT' | 'FIXED' | 'MANUAL';
export type FixedBasis  = 'GRAM' | 'PIECE';

export interface KaratPrice {
  karat: number;
  factor: number;
  pricePerGram: number;
  pricePerGramRaw: number;
}
export interface PriceTable {
  ounceUsd: number;
  fxRate: number;
  gramPrice24: number;
  gramPrice24Raw: number;
  rows: KaratPrice[];
}
export interface WeightsInput {
  totalWeight: number;
  stoneWeight?: number;
  inlaysWeight?: number;
  basis: WeightBasis;
  stoneHasPrice?: boolean;
}
export interface WeightBreakdown {
  total: number;
  stone: number;
  inlays: number;
  netGold: number;
  basisWeight: number;
  basis: WeightBasis;      // مُشتق من الخصم الفعلي بعد BR-10، وليس بالضرورة input.basis
  stoneDeducted: boolean;
  inlaysDeducted: boolean;
}
export interface PricingInput {
  ounceUsd: number;
  fxRate: number;
  karat: number;
  totalWeight: number;
  stoneWeight?: number;
  inlaysWeight?: number;
  stonePrice?: number | null;
  basis: WeightBasis;
  profitMode: ProfitMode;
  profitValue?: number;    // افتراضي 0
  fixedBasis?: FixedBasis; // افتراضي PIECE
  pieceCount?: number;     // افتراضي 1؛ يُستعمل فقط مع FIXED+PIECE
  manualPrice?: number;
  roundingStep?: number;   // افتراضي 0
  cost?: number | null;
}
export interface PricingResult {
  ounceUsd: number;
  fxRate: number;
  karat: number;
  karatFactor: number;
  gramPrice24: number;
  gramPrice24Raw: number;
  gramPriceKarat: number;
  gramPriceKaratRaw: number;
  weights: WeightBreakdown;
  goldValue: number;
  goldValueRaw: number;
  stoneValue: number;                 // لا يوجد stoneValueRaw في النتيجة
  subtotal: number;
  subtotalRaw: number;
  profit: {
    mode: ProfitMode;
    fixedBasis: FixedBasis;
    units: number;  // PIECE: القطع الفعّالة؛ GRAM: وزن الأساس (3 خانات)؛ PERCENT/MANUAL: 1
    input: number;  // MANUAL: manualPrice؛ غيره: profitValue ?? 0
    amount: number;
  };
  beforeRounding: number;
  roundingStep: number;
  roundingDelta: number;
  finalPrice: number;
  cost: number | null;
  margin: number | null;
  belowCost: boolean;
}
export type PricingErrorCode =
  | 'OUNCE_INVALID' | 'FX_INVALID' | 'KARAT_INVALID' | 'WEIGHT_INVALID'
  | 'WEIGHT_NEGATIVE' | 'STONE_TOO_HEAVY' | 'PROFIT_INVALID'
  | 'MANUAL_PRICE_INVALID' | 'ROUNDING_INVALID' | 'INVALID_NUMBER';

class PricingError extends Error {
  readonly code: PricingErrorCode;
  readonly details?: Record<string, unknown>;
  constructor(code: PricingErrorCode, message: string, details?: Record<string, unknown>);
}
```

ترتيب التحقق وأول خطأ يُرمى (مهم لإعادة إنتاج رسائل الاختبارات):

**`computeWeights`:**
1. تحويل الأوزان إلى Decimal ⇒ `INVALID_NUMBER` إن كانت غير رقمية.
2. `basis` خارج القيم الأربع ⇒ `WEIGHT_INVALID`.
3. `total ≤ 0` ⇒ `WEIGHT_INVALID`.
4. `stone < 0` أو `inlays < 0` ⇒ `WEIGHT_NEGATIVE`.
5. `stone + inlays ≥ total` ⇒ `STONE_TOO_HEAVY`.
6. BR-10 ثم `basisWeight ≤ 0` ⇒ `WEIGHT_INVALID`.

**`computeItemPrice`:**
1. `toDecimal(ounceUsd)` و`toDecimal(fxRate)` ⇒ `INVALID_NUMBER`.
2. `karatFactor(karat)` ⇒ `KARAT_INVALID` (قبل فحص الأونصة والصرف).
3. `toDecimal(stonePrice)` إن وُجد ⇒ `INVALID_NUMBER`.
4. `stonePrice < 0` ⇒ `INVALID_NUMBER` (قبل فحص الأوزان).
5. `computeWeights(...)` ⇒ أخطاء الأوزان أعلاه.
6. `gramPrice24(...)` ⇒ `OUNCE_INVALID` / `FX_INVALID` (بعد الأوزان).
7. فحص الربح ⇒ `PROFIT_INVALID` / `MANUAL_PRICE_INVALID`.
8. `roundToStep(...)` ⇒ `ROUNDING_INVALID`.

الرسائل الحرفية:

| الرمز | الرسالة |
|---|---|
| `INVALID_NUMBER` | `قيمة رقمية غير صالحة: ${value}`؛ ولسعر الحجر السالب `سعر الحجر لا يمكن أن تكون سالباً` |
| `WEIGHT_INVALID` | `أساس وزن غير معروف: ${basis}` أو `الوزن الإجمالي يجب أن يكون أكبر من صفر` أو `وزن أساس الاحتساب يجب أن يكون أكبر من صفر` |
| `WEIGHT_NEGATIVE` | `أوزان الحجر والفصوص لا يمكن أن تكون سالبة` |
| `STONE_TOO_HEAVY` | `مجموع وزن الحجر والفصوص يجب أن يكون أقل من الوزن الإجمالي` |
| `KARAT_INVALID` | `عيار غير صالح: ${karat}` |
| `OUNCE_INVALID` | `سعر الأونصة يجب أن يكون أكبر من صفر` |
| `FX_INVALID` | `سعر الصرف يجب أن يكون أكبر من صفر` |
| `PROFIT_INVALID` | `نسبة الربح لا يمكن أن تكون سالبة` أو `مبلغ الربح لا يمكن أن يكون سالباً` أو `طريقة ربح غير معروفة: ${mode}` |
| `MANUAL_PRICE_INVALID` | `السعر اليدوي مطلوب عند اختيار السعر النهائي اليدوي` أو `السعر النهائي لا يمكن أن يكون سالباً` |
| `ROUNDING_INVALID` | `خطوة التقريب غير صالحة` |

> إعدادات الحزمة: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `exactOptionalPropertyTypes: false`, `noEmit`. تعتمد على `decimal.js ^10.6.0` المُعلَن في `apps/api` و`apps/web` ويُستورد بالـhoist؛ السكربتات: `test`, `test:watch`, `typecheck`.

### 5.1 الدقة الحسابية

- `decimal.js` مع `precision = 28` و`ROUND_HALF_UP`.
- `toMoney` ⇒ خانتان عشريتان؛ `toWeight` ⇒ ثلاث خانات؛ `roundToStep` كما في 5.6.
- `toDecimal` يعامل `null` و`undefined` و`''` كـ`fallback` (الافتراضي `0`) قبل أي تحويل، ويرمي `INVALID_NUMBER` لكل قيمة غير منتهية أو غير قابلة للتحويل.
- **تنبيه الدقة:** `computeWeights` يُقرّب `total` و`stone` و`inlays` و`netGold` و`basisWeight` إلى **3 خانات** قبل الإرجاع؛ و`computeItemPrice` يبني `basisWeightRaw = toDecimal(weights.basisWeight)` من هذه القيمة المقرَّبة، ثم يحسب `goldValueRaw` و`subtotalRaw` ومبلغ الربح منها. «الخام» هنا يعني بلا تقريب السعر النهائي، لا بلا تقريب الوزن؛ لا تُمرَّر أوزان بأكثر من 3 خانات إلى الحساب الوسيط. التحويل إلى `number` عند الإدخال/الإخراج فقط.

### 5.2 سعر الغرام

```
قيمة الأونصة محلياً = ounceUsd × fxRate
gramPrice24        = قيمة الأونصة ÷ 31.1035
karatFactor(K)     = K ÷ 24          (0 < K ≤ 24)
gramPriceKarat     = gramPrice24 × karatFactor(K)
```

مثال: `2000 × 6 = 12000`؛ `12000 ÷ 31.1035 = 385.81` لعيار 24؛ `× 0.875 = 337.58` لعيار 21؛ `× 0.75 = 289.36` لعيار 18.

`karatFactor(k)` يقبل أي عدد منتهٍ في `0 < k ≤ 24`، بما في ذلك الكسور (مثل `21.5 ⇒ 21.5/24`)؛ `NaN` و`Infinity` و`0` والسالب و`>24` ⇒ `KARAT_INVALID`. قيد «عدد صحيح 1–24» مفروض في طبقة Prisma/Zod فقط. `gramPrice24` يرفض الأونصة أو الصرف `≤ 0` فقط؛ الحدود 100–100000 و0.000001–10000 مفروضة في API لا في المحرك. الثابتان `TROY_OUNCE_GRAMS = 31.1035` و`KARAT_BASE = 24` مُصدَّران من الحزمة.

`buildPriceTable(ounceUsd, fxRate, karats)` يحسب `gram24` مرة واحدة، ثم `unique = [...new Set(karats)].sort((a,b) => a-b)`؛ لذلك الصفوف مرتبة تصاعدياً وبلا تكرار. كل صف يحوي `karat`, `factor = karatFactor(karat).toNumber()`, `pricePerGram = toMoney(gram24 × factor)`, `pricePerGramRaw = (gram24 × factor).toNumber()`. الحقلان `ounceUsd`/`fxRate` يُعادان عبر `toDecimal(...).toNumber()`. مثال: `buildPriceTable(2000, 6, [21,18,24,18])` ⇒ `rows.karat = [18,21,24]` و`pricePerGram = [289.36, 337.58, 385.81]`.

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

إذا كانت `basisWeight ≤ 0` ⇒ `PricingError`. الأخطاء المعرفة: `WEIGHT_INVALID`, `WEIGHT_NEGATIVE`, `STONE_TOO_HEAVY`, `INVALID_NUMBER`, `KARAT_INVALID`, `OUNCE_INVALID`, `FX_INVALID`, `PROFIT_INVALID`, `MANUAL_PRICE_INVALID`, `ROUNDING_INVALID` (الرموز والرسائل وترتيب الرمي في 5.0).

حقل `WeightBreakdown.basis` **ليس** بالضرورة `input.basis`: يُشتق من الخصم الفعلي بعد BR-10 —

```
(stone ∧ inlays) ⇒ NET_GOLD
stone فقط        ⇒ MINUS_STONE
inlays فقط       ⇒ MINUS_INLAYS
لا شيء           ⇒ TOTAL
```

مثال: `basis:'TOTAL'` مع `stonePrice:150` ⇒ `stoneDeducted=true`, `inlaysDeducted=false`, `basis:'MINUS_STONE'`, `basisWeight=9.200`. حتى `stoneHasPrice:true` مع `stoneWeight=0` يُغيّر `basis` المُعاد إلى `MINUS_STONE`.

`computeWeights` لا يعرف `stonePrice`؛ يستقبل `stoneHasPrice?: boolean` ويطبّق BR-10 مباشرة. أمّا `computeItemPrice` فيستقبل `stonePrice?: number | null` ويشتق منه: `null/undefined/0 ⇒ false`، و`>0 ⇒ true`، والسالب ⇒ `INVALID_NUMBER`. على المستدع المباشر لـ`computeWeights` تمرير العلم بنفسه.

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
| `FIXED` + `fixedBasis=PIECE` | `units = Math.max(1, Math.floor(pieceCount || 1))`؛ `profit = profitValue × units` |
| `FIXED` + `fixedBasis=GRAM` | `units = basisWeight` (وزن الأساس بدقة 3 خانات)؛ `profit = profitValue × units` |
| `MANUAL` | `total = manualPrice`؛ `profit = manualPrice − subtotal` |

القيم الافتراضية عند غياب الحقول: `fixedBasis='PIECE'`، `pieceCount=1`، `profitValue=0`، `roundingStep=0`. في `PIECE` يُقتطع `pieceCount` للأسفل (`3.7 ⇒ 3`)، و`0` أو السالب أو `NaN` أو الغياب ⇒ `1`. `pieceCount` يُتجاهل تماماً في `GRAM` وفي باقي الأنماط. الربح الثابت السالب مرفوض بـ`PROFIT_INVALID` في كلا الأساسين، ونمط ربح خارج `PERCENT|FIXED|MANUAL` ⇒ `PROFIT_INVALID` بالرسالة `طريقة ربح غير معروفة: <mode>`.

كائن `profit` في النتيجة يحوي **دائماً**: `mode` (النمط)، `fixedBasis` (الافتراضي `PIECE` حتى في `PERCENT`/`MANUAL`)، `units` (القطع الفعّالة في `PIECE`، وزن الأساس في `GRAM`، و`1` في `PERCENT`/`MANUAL`)، `input` (`manualPrice` في `MANUAL` وإلا `profitValue ?? 0`)، و`amount`. يُعاد `roundingStep` في النتيجة كـ0 لأي قيمة غير موجبة (القيم السالبة تُرفض أصلاً بـ`ROUNDING_INVALID`).

**الطقم:** لا توجد دالة خاصة بالأطقم داخل `@gold/pricing`. للتقييم يُستدعى `computeItemPrice` لكل مكوّن على حدة بعياره ووزنه؛ أمّا `PIECE` فيُمرَّر `pieceCount = components.filter(c => c.weight > 0).length` (الحد الأدنى 1). معاينة الواجهة تحسب هذا العدد بالطريقة نفسها. لذلك «100 لكل قطعة» على طقم من 3 مكوّنات = 300، و«100 لكل غرام» = `100 ×` وزن أساس المكوّن (لا مجموع أوزان كل المكوّنات في استدعاء واحد، لأن المحرك لا يجمع المكوّنات).

### 5.6 التقريب والتكلفة

```
roundToStep(x, 0)  = round2(x)                         // نصف لأعلى، كـDecimal
roundToStep(x, s)  = round2( round0(x / s) × s )       // أي s > 0 مقبول في المحرك
beforeRounding     = round2(total قبل التقريب)
finalPrice         = roundToStep(total, roundingStep)  // ثم .toNumber()
roundingDelta      = finalPrice − beforeRounding
margin             = toMoney(finalPrice − cost)        // إن وُجدت التكلفة
belowCost          = cost !== null && finalPrice < cost
```

`roundToStep` يرفض `step` غير المنتهي أو الأقل من صفر بـ`ROUNDING_INVALID`. القيم الموجبة كلها مقبولة في المحرك، وليس فقط 5 و10؛ حصرها في `{0,5,10}` مفروض في طبقة الإعدادات/API. `computeItemPrice` يحوّل نتيجة `roundToStep` إلى `number` عبر `.toNumber()`. `cost` يُقرَّب بـ`toMoney` عند الإخراج، و`belowCost` يُحسب بعد تقريب السعر النهائي.

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

المجموعات الثلاث منفصلة بلا تكرار. `PATCH` لسطر مغلق مرفوض (BR-14). الإغلاق تحديث شرطي `{ id, status: OPEN }` يمنع الإغلاق المزدوج. تعديل سطر يقفل صف الجرد (`SELECT … FOR UPDATE`) ويعيد فحص حالته داخل المعاملة، فلا يمكن تعديل سطر أثناء إغلاق متزامن. `GET /stocktakes/:id/differences` يُعيد `404` لجرد غير موجود.

### 5.13 تحديث السعر التلقائي

- يعمل فقط إذا `GOLD_PRICE_PROVIDER=api` و`GOLD_PRICE_API_KEY` مهيأ و`GOLD_PRICE_REFRESH_MINUTES > 0`.
- عند الإقلاع يُجلب السعر فقط إن كان آخر تحديث أقدم من الفاصل؛ لا تكرار عند إعادة التشغيل.
- كل دورة تختار أول `OWNER` نشط وتنشئ `PriceUpdate` بمصدر `API` وتكتب تدقيق `AUTO_FETCH_PRICE` مع `reason: startup|schedule`.
- `inFlight` يمنع التداخل؛ الأخطاء تُطبع تحذيراً ولا تُسقط الخادم، ويبقى الإدخال اليدوي متاحاً.
- الخطة المجانية في goldapi.dev = 100 طلب/ساعة؛ الفاصل الافتراضي 10 دقائق = 6 طلبات/ساعة. لا يُنصح بأقل من 5 دقائق دون ترقية.
- عند إيقاف الخادم (`SIGINT`/`SIGTERM`) يُوقف المجدول ويُغلق اتصال Prisma بأمان.

### 5.14 قدم السعر

`ageHours = max(عمر آخر أونصة، عمر آخر صرف)`؛ `stale = ageHours > priceStaleHours`. يُعرض تنبيه في الرئيسية والشاشات ذات الصلة. `ready = وجود آخر سعرين`.

### 5.15 النسخ الاحتياطي والجدولة (جديد في 0.3.0)

**التنفيذ (`lib/backup.ts → runBackup`):**

1. علم `running` في الذاكرة يُرفع **قبل أي `await`** (يمنع تجاوز طلبين متزامنين)، ثم فحص وجود `BackupRun` بحالة `RUNNING` أحدث من 15 دقيقة (حماية من خادمين على نفس القاعدة). عند التعارض ⇒ `409`.
2. إنشاء سجل `RUNNING`، ثم `mysqldump` بالخيارات `--single-transaction --no-tablespaces --routines --triggers --default-character-set=utf8mb4` عبر TCP، وكلمة المرور في `MYSQL_PWD` (لا تظهر في سطر الأوامر). المخرجات تمر عبر `gzip` إلى `<الاسم>.partial`. مهلة 10 دقائق.
3. **تحقق السلامة:** فك الضغط كاملاً، والتأكد أن الملف غير فارغ ويبدأ بـ`MySQL dump`/`CREATE TABLE` وينتهي بسطر `Dump completed`. عند الفشل يُحذف `.partial` ويُسجَّل `FAILED`.
4. `rename` إلى `gold_pos-YYYYMMDD-HHMMSS.sql.gz`، ثم النسخ إلى `BACKUP_COPY_DIR` إن وُجد (فشله تحذير في `error` لا يُفشل النسخة).
5. تحديث السجل `OK` + تدقيق `BACKUP_MANUAL`/`BACKUP_SCHEDULED`، ثم **الاحتفاظ**: يُحذف (ملفاً وسجلاً) ما زاد عن `retentionCount` من النسخ الناجحة الأقدم، ويُحتفظ بآخر 30 سجل فشل فقط.

**موعد النسخة التالية `computeNextRun` (دالة صافية):**

```
غير مفعّل                       ⇒ null
لا نسخة ناجحة سابقة (بملف موجود) ⇒ الآن
intervalHours < 24              ⇒ آخر نجاح + intervalHours
intervalHours ≥ 24              ⇒ (يوم آخر نجاح عند timeOfDay) + intervalHours/24 يوماً
بعد فشل أحدث من آخر نجاح        ⇒ max(الموعد، وقت الفشل + 30 دقيقة)
```

**المجدول:** يبدأ مع الخادم (`startBackupScheduler`)؛ يعلّم أي `RUNNING` أقدم من 15 دقيقة كـ`FAILED` (انقطاع)، ثم يفحص كل 60 ثانية (وأول فحص بعد 15 ثانية من الإقلاع) فينفّذ نسخة `SCHEDULED` إذا حلّ الموعد. توقف الخادم لا يفوّت النسخة: تُنفَّذ فور تشغيله. `BACKUP_SCHEDULER=off` يعطّله. «آخر نسخة ناجحة» تعني نسخة ما زال ملفها على القرص.

**الصحة `summary.health`:** `none` لا نسخة صالحة؛ `warning` آخر نسخة أقدم من `max(36 ساعة، 2 × الفاصل)` أو فشلت محاولة بعدها؛ `off` الجدولة معطّلة (من الإعدادات أو البيئة)؛ وإلا `ok`.

**الاستعادة (`tools/restore-db.mjs`):** تتطلب `--yes`؛ تُنشئ `backups/pre-restore-*.sql.gz` أولاً (وتتوقف دون تغيير إن فشلت)، ثم تمرر الملف (مع `gunzip` للـ`.gz`) إلى `mysql`. الاستعادة تُنفَّذ من سطر الأوامر عمداً ولا توجد في الواجهة لخطورتها.

---

## 6. سير العمل

### 6.1 التشغيل الأول

1. جهّز `tools/mysql/` (راجع 13.5) وعدّل المسارات المطلقة في السكربتات و`my.ini` إن اختلف جهازك عن `C:\Users\D047\Gold`. ثم `powershell -ExecutionPolicy Bypass -File .\tools\mysql-init.ps1`.
2. `npm.cmd install`
3. `copy apps\api\.env.example apps\api\.env` ثم ضبط `DATABASE_URL` (= `mysql://gold:Gold@Dev2026@127.0.0.1:3306/gold_pos` في التطوير) و`SESSION_SECRET` (والمفتاح اختيارياً). في الإنتاج أضف `SEED_OWNER_PASSWORD` و`SEED_SELLER_PASSWORD`.
4. `npm.cmd run db:generate` ثم `npm.cmd run db:push` ثم `npm.cmd run db:seed`.
5. `npm.cmd run dev`؛ افتح `http://localhost:5173` وتحقق من `/api/health`.
6. سجّل الدخول بـ`admin / Admin@2026` و`seller / Seller@2026` في التطوير، وغيّر كلمتي المرور فوراً.

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
| `/backups` | النسخ الاحتياطي | OWNER |
| `/guide` | دليل الاستخدام (يُخفي أقسام المالك عن البائع) | مسجّل |

`Protected` يمنع غير المسجل ويحفظ مسار العودة؛ `OwnerOnly` يعرض شاشة «هذه الصفحة للمالك فقط». أي مسار آخر ⇒ شاشة «الصفحة غير موجودة».

### 7.2 سلوك عام

- `dir="rtl"` كامل، أرقام لاتينية، خط IBM Plex Sans Arabic، ثيم فاتح/داكن عبر `data-theme`.
- TanStack Query بمفاتيح `['auth','me']`, `['settings']`, `['prices']`, `['items']`, `['inventory']`, `['sales']`, `['stocktakes']`, `['reports',...]`, `['users']`, `['lookups',...]`, `['dashboard']`؛ تُبطل المفاتيح المتأثرة بعد كل كتابة.
- `lib/api.ts` يوحّد الطلبات ويعرض `ApiError.displayMessage` بالعربية.
- `lib/format.ts` يضبط `fmtMoney` (خانتان) و`fmtWeight` (2–3) والتاريخ/الوقت بتنسيق `en-GB`، و`timeAgo`.
- `lib/pricing-preview.ts` يستدعي `@gold/pricing` نفسه في المتصفح لبناء معاينة الأوزان/الأسعار، لكنه يُستدعى فعلياً من شاشة البيع فقط؛ سعر البيع الفعلي يُدخل عند الفاتورة. التفاصيل الكاملة في الملحق 16.

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
- نموذج الصنف يعرض أوزان الأساس (الإجمالي/الحجر/الفصوص/الصافي) وملخص الشراء بالعملة المحلية، ولا يعرض سعر بيع بالغرام لكل عيار: دالة `buildItemPreview` موجودة في `lib/pricing-preview.ts` لكنها **غير مستخدمة** في `ItemForm.tsx`. بطاقة «أين سعر البيع؟» مطويّة بـ`<details>` على كل المقاسات لتقليل الفوضى، ومحتواها يشرح أن سعر البيع يُحسب لحظة الفاتورة من سعر السوق وسياسة الفاتورة (راجع 16.4.4).

### 7.7 طبيعة الأسعار المعروضة وتجربة الجوال

- نص عربي موحّد في `apps/web/src/lib/copy.ts`: `RAW_GOLD_PRICE_NOTE = 'هذه أسعار الذهب الخام قبل المصنعية؛ تختلف تكلفة القطعة حسب التصنيع والمصنع وبلد المنشأ والشحن.'`. لا توجد صيغة أخرى للرسالة في أي شاشة.
- يظهر النص كسطر مختصر في أعلى **صفحة الأسعار** مباشرة بعد `PageHeader`، وأسفل بطاقة **«أسعار الغرام اليوم»** في الرئيسية، وضمن `title` شرائح الأونصة/غرام 21 في الهيدر (لا يظهر في الهيدر بصرياً حفاظاً على المساحة؛ شريحة «الصرف» مستثناة لأنها ليست سعر ذهب).
- المعنى الحسابي: الجدول والنسب مأخوذة من `(الأونصة × الصرف) ÷ 31.1035` ثم معامل العيار؛ **لا تتضمن** المصنعية، هامش المصنع، بلد المنشأ، الشحن، أو سعر الحجر/الفصوص. هذه العناصر تُضاف في تكلفة الشراء المسجّلة للقطعة أو تُختار في سياسة فاتورة البيع.
- تقليل فوضى الجوال (القرار مقصود للشاشات < `sm` / < `md`):
  - صفحة الأسعار: إخفاء رابط «توثيق goldapi.dev»، والجملة التقنية «المفتاح يعمل من داخل الخادم فقط…»، وكتلة «المعادلة المستعملة»، وكتلة «كيف يتحوّل سعر الأونصة إلى سعر العيار؟» (`hidden md:block`)، ومكرّر التحويل أسفل الجدول؛ يبقى التوضيح الجديد والتنبيهات والتحذيرات الجوهرية ظاهرة.
  - نموذج الصنف: طيّ «أين سعر البيع؟» داخل `<details>`.
  - الجرد والمخزون: إخفاء الملاحظات التوضيحية الطويلة أسفل القوائم على `<sm`.
  - لا يُحذف أي حقل إدخال أو زر تأكيد أو تنبيه خطأ/تقادم السعر على الجوال.

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

> سكربتا `test:integration` و`test:stress` موجودان في `package.json` ويستدعيان `tools/integration-test.mjs` و`tools/stress-test.mjs`. يحتاجان خادماً حياً على `http://localhost:4000` وقاعدة بيانات مهيأة. بيانات الاختبار تحمل بادئة `QA-` وتُنظَّف آلياً، ويبقى منها فقط ما يمنعه تصميم السجل التاريخي (فواتير ملغاة، سجل أسعار، جرد مغلق، سجل تدقيق). المتغيرات والAssertions الدقيقة في 13.6.

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
3. جهّز MySQL المحمول كما في 13.5 (عدّل `$root` في السكربتات الثلاثة و`my.ini`)، ثم شغّل `tools/mysql-init.ps1` ثم `tools/mysql-start.ps1`.
4. انسخ `.env.example` إلى `apps/api/.env` واضبط `DATABASE_URL` و`SESSION_SECRET`؛ أضف `SEED_OWNER_PASSWORD`/`SEED_SELLER_PASSWORD` في الإنتاج؛ لا تضع أسراراً حقيقية في الملفات المتتبعة.
5. نفّذ `npm.cmd run db:generate` ⇒ `db:push` ⇒ `db:seed` (تذكّر: لا يوجد `postinstall`، و`db:generate` إلزامي على جهاز جديد).
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
9. `GET /api/bootstrap` يُعيد `version: '0.3.0'` ثابتاً في `app.ts`، ويجب تحديثه يدوياً مع رقم الحزم وتذييل الواجهة عند كل رفع إصدار.
10. أرقام التكلفة/الربح في شاشة البيع مشتقة من `purchaseCostDinar` المحفوظ للصنف، وليست تكلفة استبدال لحظية.
11. سكربتا `test:integration` و`test:stress` يحتاجان خادماً حياً وقاعدة بيانات؛ لا يعملان في CI معزول بلا تهيئة.
12. لا إشعارات خارج التطبيق (بريد/رسائل).
13. مجدول النسخ الاحتياطي داخل عملية الـAPI: لا نسخ تلقائي والخادم متوقف (تُنفَّذ المتأخرة عند التشغيل). تشغيل أكثر من نسخة من الخادم على نفس القاعدة محمي بفحص `RUNNING` الحديث لكنه غير مُوصى به.
14. الاستعادة من سطر الأوامر فقط (`db:restore`) وليست من الواجهة؛ والنسخ الاحتياطية على نفس جهاز قاعدة البيانات ما لم يُضبط `BACKUP_COPY_DIR`.
15. تعديل كمية صنف من نموذج التعديل يُكتب كما هو؛ إن بيعت وحدات بعد فتح النموذج تُستبدل الكمية الحالية بالمُرسلة.

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

---

## 13. ملحق إعادة البناء التنفيذي (تفاصيل البنية والتشغيل)

هذا الملحق يكمّل الأقسام 2 و6 و9 بالتفاصيل التي لا تظهر في منطق الأعمال لكنها ضرورية لبناء نسخة مطابقة تعمل فعلياً.

### 13.1 شجرة الملفات الكاملة

ما يلي هو التوسيع الدقيق لشجرة 2.2 (الملفات المهملة في 2.2 مذكورة هنا):

```
Gold/
├─ package.json, package-lock.json, README.md, .gitignore
├─ apps/api/
│  ├─ .env.example
│  ├─ package.json, tsconfig.json, tsup.config.ts
│  ├─ prisma/
│  │  ├─ schema.prisma
│  │  ├─ seed.ts
│  │  └─ cleanup-qa.ts
│  └─ src/ ... (auth, lib, middleware, routes, app.ts, index.ts, config.ts, db.ts)
├─ apps/web/
│  ├─ index.html, package.json, tsconfig.json, vite.config.ts
│  └─ src/ ... (app, layout, components, lib, pages)
│     └─ public/favicon.svg
├─ packages/pricing/
│  ├─ package.json, tsconfig.json
│  └─ src/ , test/
├─ tools/
│  ├─ integration-test.mjs
│  ├─ stress-test.mjs
│  ├─ build-user-guide.mjs
│  ├─ build-spec-pdf.mjs
│  ├─ backup-db.mjs
│  ├─ mysql-init.ps1, mysql-start.ps1, mysql-stop.ps1
│  ├─ download/                      (مستثنى من git؛ أرشيف MySQL 8.4.0 winx64)
│  └─ mysql/                         (مستثنى من git بالكامل)
│     ├─ my.ini
│     ├─ mysql-8.4.0-winx64/         (الثنائيات)
│     └─ data/                       (قاعدة البيانات وسجل الأخطاء)
├─ backups/                          (مستثنى من git؛ ملفات SQL بتاريخ الوقت)
└─ docs/ (SYSTEM_SPECIFICATION.md, SYSTEM_SPECIFICATION.pdf, ARCHITECTURE.md,
          DECISIONS.md, CHANGELOG.md, USER_MANUAL.md, USER_MANUAL.pdf)
```

### 13.2 الإصدارات الدقيقة للتبعيات

النطاقات المعلنة في ملفات `package.json` الأربعة (القفل `lockfileVersion 3` يثبّت النسخ المحلولة؛ أمثلة: React 19.3.1، Vite 8.3.8، Express 5.3.0، TypeScript 7.0.2، decimal.js 10.6.0، Zod 4.6.7):

| الحزمة | النطاق | الملف |
|---|---|---|
| root dev: concurrently | `^10.0.7` | `package.json` |
| root dev: typescript | `^7.0.2` | `package.json` |
| api: @gold/pricing | `^0.3.0` | `apps/api/package.json` |
| api: @prisma/client | `^6.19.3` | `apps/api/package.json` |
| api: bcryptjs | `^3.0.3` | `apps/api/package.json` |
| api: cookie-parser | `^1.4.7` | `apps/api/package.json` |
| api: cors | `^2.8.6` | `apps/api/package.json` |
| api: decimal.js | `^10.6.0` | `apps/api/package.json` |
| api: dotenv | `^18.0.10` | `apps/api/package.json` |
| api: express | `^5.3.0` | `apps/api/package.json` |
| api: helmet | `^8.3.0` | `apps/api/package.json` |
| api: zod | `^4.6.7` | `apps/api/package.json` |
| api dev: @types/bcryptjs | `^2.4.6` | `apps/api/package.json` |
| api dev: @types/cookie-parser | `^1.4.10` | `apps/api/package.json` |
| api dev: @types/cors | `^2.8.19` | `apps/api/package.json` |
| api dev: @types/express | `^5.0.6` | `apps/api/package.json` |
| api dev: @types/node | `^26.6.6` | `apps/api/package.json` |
| api dev: prisma | `^6.19.3` | `apps/api/package.json` |
| api dev: tsup | `^9.0.0` | `apps/api/package.json` |
| api dev: tsx | `^4.23.15` | `apps/api/package.json` |
| web: @gold/pricing | `^0.3.0` | `apps/web/package.json` |
| web: @tanstack/react-query | `^5.107.1` | `apps/web/package.json` |
| web: clsx | `^2.1.1` | `apps/web/package.json` |
| web: decimal.js | `^10.6.0` | `apps/web/package.json` |
| web: lucide-react | `^1.73.0` | `apps/web/package.json` |
| web: react / react-dom | `^19.3.1` | `apps/web/package.json` |
| web: react-router-dom | `^7.18.5` | `apps/web/package.json` |
| web: tailwind-merge | `^3.7.0` | `apps/web/package.json` |
| web dev: @fontsource/ibm-plex-sans-arabic | `^5.3.0` | `apps/web/package.json` |
| web dev: @tailwindcss/vite | `^4.3.5` | `apps/web/package.json` |
| web dev: @types/react / @types/react-dom | `^19.3.0` | `apps/web/package.json` |
| web dev: @vitejs/plugin-react | `^6.3.0` | `apps/web/package.json` |
| web dev: tailwindcss | `^4.3.5` | `apps/web/package.json` |
| web dev: vite | `^8.3.8` | `apps/web/package.json` |
| pricing dev: vitest | `^5.1.0` | `packages/pricing/package.json` |

لا توجد حقول `engines` أو `packageManager` ولا Corepack ولا `postinstall`/`prepare`؛ لذلك `npm.cmd run db:generate` خطوة يدوية إلزامية على جهاز جديد. الجذر يحوي حقل `allowScripts` بقائمة `esbuild@0.28.2`, `@prisma/client@6.19.3`, `@prisma/engines@6.19.3` — احتفظ به كما هو. npm workspaces تتطلب npm 7+ (القفل v3 يعني عملياً npm 9+/10+).

### 13.3 TypeScript وVite والبناء

- **لا توجد مسارات مستعارة** (`baseUrl`/`paths`/`@/*`) في أي tsconfig. الاستيراد بين الحزم عبر workspaces npm و`exports` في `packages/pricing/package.json`: `"exports": { ".": "./src/index.ts" }`, `"types": "./src/index.ts"`؛ أي أن المحرك يُستهلك كملفات TypeScript مصدرية، ويُضمَّن داخل API عبر tsup `noExternal` وداخل Web عبر Vite. لا تُضف Path aliases عند إعادة البناء.
- كل الحزم: `target ES2022`, `module ESNext`, `moduleResolution Bundler`, `strict`, `noUncheckedIndexedAccess`, `noEmit`. pricing يضيف `verbatimModuleSyntax`, `noImplicitOverride`, `isolatedModules`, `exactOptionalPropertyTypes: false`. web يضيف `jsx: react-jsx`, `isolatedModules`, `types: ['vite/client']`. api يضيف `types: ['node']`, `include: ['src','prisma']`.
- **Vite dev**: port `5173`، host `127.0.0.1` افتراضياً؛ للوصول من الهاتف `VITE_HOST=0.0.0.0 npm.cmd run dev:web`. proxy: `/api ⇒ http://127.0.0.1:4000` مع `changeOrigin: false` (المتصفح يستخدم `http://localhost:5173` وهو ما يطابق `APP_ORIGIN` الافتراضي ويمرّ عبر `originGuard`).
- **بناء Vite**: `target es2022` وتقسيم يدوي: `react-router|react-dom|/react/` ⇒ chunk `react`، و`@tanstack` ⇒ chunk `query`. الناتج `apps/web/dist`.
- **بناء API**: `tsup` بـ`entry: ['src/index.ts']`, `format: ['esm']`, `target: 'node20'`, `outDir: 'dist'`, `clean: true`, `sourcemap: process.env.NODE_ENV !== 'production'`, `external: ['@prisma/client','.prisma','@prisma/client/runtime/library']`, `noExternal: ['@gold/pricing']`. الناتج `apps/api/dist/index.js`.
- **تشغيل الإنتاج**: `npm run start -w @gold/api` (`node dist/index.js`)؛ `npm run preview -w @gold/web` لمعايرة dist. لا يوجد سكربت يقدّم الواجهة من Express؛ يلزم وكيل عكسي أو خادم ثابت منفصل. `db:generate` إلزامي قبل `build`/`start`.

### 13.4 سكربتات الحزم (التفويض الدقيق)

| سكربت الجذر | التنفيذ الفعلي |
|---|---|
| `dev` | `concurrently -n api,web -c yellow,cyan "npm run dev -w @gold/api" "npm run dev -w @gold/web"` |
| `dev:api` | `tsx watch --clear-screen=false src/index.ts` |
| `dev:web` | `vite` |
| `build` | بناء API ثم Web |
| `test` | `npm run test -w @gold/pricing` ⇒ `vitest run` |
| `typecheck` | pricing ثم api ثم web (`tsc --noEmit`) |
| `db:cleanup-qa` | `tsx prisma/cleanup-qa.ts` |
| `db:backup` | `node tools/backup-db.mjs` |
| `docs:pdf` | `node tools/build-user-guide.mjs` |
| `db:reset` | `prisma db push --force-reset --skip-generate && tsx prisma/seed.ts` (**يحذف كل البيانات**) |
| إضافية | `start` (api)، `preview` (web)، `test:watch` (pricing)، `db:studio` |

### 13.5 إعداد MySQL المحمول (تفاصيل التنفيذ)

- مجلد `tools/mysql/` مستثنى من git بالكامل؛ يحتوي `my.ini`, `mysql-8.4.0-winx64/` (من `tools/download/mysql-8.4.0-winx64.zip`) و`data/`.
- **مسارات مطلقة مكتوبة داخل السكربتات**: `mysql-init.ps1`, `mysql-start.ps1`, `mysql-stop.ps1` و`tools/mysql/my.ini` تشير إلى `C:\Users\D047\Gold\tools\mysql`. عند النسخ لجهاز آخر عدّل `$root` في السكربتات الثلاثة و`basedir`/`datadir`/`log_error` في `my.ini`، وإلا فشل التشغيل.
- `my.ini`: `port=3306`, `bind-address=127.0.0.1`, `max_connections=60`, `lower_case_table_names=1`, `character-set-server=utf8mb4`, `collation-server=utf8mb4_0900_ai_ci`, `log_error=.../data/mysql-error.log`, `log_error_verbosity=2`, `slow_query_log=0`.
- `mysql-init.ps1` (مرة واحدة، idempotent): يهيّئ `data` بـ`--initialize-insecure` إن لم يكن موجوداً، يبدأ mysqld، ثم ينشئ:
  - `CREATE DATABASE IF NOT EXISTS gold_pos CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`
  - `CREATE USER IF NOT EXISTS 'gold'@'localhost' IDENTIFIED BY 'Gold@Dev2026';` والمثيل `'gold'@'127.0.0.1'` بالكلمة نفسها.
  - `GRANT ALL ON gold_pos.*` و`GRANT ALL ON \`prisma\_migrate\_shadow\_db\_%\`.*` للاثنين، ثم `FLUSH PRIVILEGES`. الاتصال كـroot بلا كلمة (`--skip-password`).
- لذلك يجب أن يكون `DATABASE_URL` في `apps/api/.env` أثناء التطوير:
  `mysql://gold:Gold@Dev2026@127.0.0.1:3306/gold_pos` (في `.env.example` يظهر `YOUR_PASSWORD` كعنصر نائب فقط).
- `mysql-start.ps1` / `mysql-stop.ps1`: بدء/إيقاف آمن عبر فحص المنفذ 3306؛ الإيقاف بـ`mysqladmin -u root --skip-password shutdown`؛ رسائل الفشل تُحيل إلى `tools/mysql/data/mysql-error.log`. تعتمد على `Get-NetTCPConnection` (صلاحيات cmdlet مناسبة).
- النسخ الاحتياطي الموصى به: `npm.cmd run db:backup` ⇒ `node tools/backup-db.mjs`. السكربت يقرأ `DATABASE_URL` من `process.env` ثم `apps/api/.env` ثم `.env`، ويتعامل مع كلمة مرور تحتوي `@` عبر `lastIndexOf('@')` و`decodeURIComponent`، ويستعمل `MYSQL_PWD` في بيئة العملية فقط حتى لا تظهر كلمة المرور في سطر الأوامر. يستدعي `tools/mysql/mysql-8.4.0-winx64/bin/mysqldump.exe` (أو `MYSQLDUMP_PATH`، أو `mysqldump` من المسار) مع `--defaults-file=tools/mysql/my.ini`, `--single-transaction`, `--no-tablespaces`, `--routines`, `--triggers`, `--default-character-set=utf8mb4`, `--result-file=...`. المخرج `backups/gold_pos-YYYYMMDD-HHMMSS.sql` بتوقيت الجهاز، والمجلد مستثنى من git. النسخة المباشرة من `tools/mysql/data` تظل ممكنة لكنها تتطلب إيقاف MySQL.
- الاستعادة: `mysql.exe --defaults-file=...\my.ini -u gold -p gold_pos < backups\<الملف>.sql` بعد إيقاف الخادم (راجع USER_MANUAL.md §14).

### 13.5.1 محتوى `.env.example` المرجعي

الملف يحتوي 14 مفتاحاً (بدون `SEED_*` و`TRUST_PROXY`) بالقيم النائبة التالية:

```dotenv
NODE_ENV=development
PORT=4000
DATABASE_URL="mysql://gold:YOUR_PASSWORD@127.0.0.1:3306/gold_pos"
SESSION_SECRET="replace-with-a-long-random-secret"
SESSION_DAYS=7
APP_ORIGIN=http://localhost:5173
GOLD_PRICE_PROVIDER=manual
GOLD_PRICE_API_URL=https://goldapi.dev/api/v1
GOLD_PRICE_API_KEY=
GOLD_PRICE_REFRESH_MINUTES=10
FX_PROVIDER=manual
FX_API_URL=
FX_API_KEY=
LOCAL_CURRENCY=LYD
```

### 13.6 عقود سكربتات الفحص

**`tools/integration-test.mjs`** — متغيرات: `API_BASE_URL` (افتراضي `http://localhost:4000/api`) و`ROUNDS` (افتراضي 2). يسجّل الدخول كـ`admin`/`Admin@2026` و`seller`/`Seller@2026` في كل دورة، ويمرّ بعشر مجموعات: public، auth، settings، lookups، prices، items، sales (بأنماط `PERCENT` و`FIXED/PIECE` و`FIXED/GRAM` مع `fxMode: CHEQUE` و`MANUAL`)، inventory/dashboard/reports، stocktakes، users. يتحقق من إخفاء التكلفة، فرض تصنيف الطقم، حفظ سياسة الفاتورة، إرجاع الكمية عند الإلغاء، ومنع 403 للبائع. التنظيف: إلغاء الفواتير، إرجاع الإعدادات، حذف الأصناف والقوائم، إغلاق الجرد؛ الصفوف غير القابلة للحذف (الأسعار، الفواتير، الجرد، `AuditLog`, الجلسات) تُبلَّغ كـ`leftovers` ولا تُحذف. الرقم `142` نتيجة الدورتين الأخيرتين وليس ثابتاً في الكود؛ المعيار `failed=0` وخروج العملية بـ0.

**`tools/stress-test.mjs`** — متغيرات: `API_BASE_URL`, `WORKERS` (12), `REQUESTS_PER_WORKER` (40), `ROUNDS` (2). 21 نقطة قراءة + دفعة كتابة (صنفان `QA-STRESS-*` يُنشآن ثم يُحذفان كل دورة) ⇒ 960 طلباً في التشغيل الافتراضي. يفشل عند أي خطأ شبكة، أي حالة غير 2xx، أي 5xx، أو health غير 2xx؛ يطبع JSON فيه توزيع الحالات و`min/avg/max/p95` و`result: PASS|FAIL` ويخرج بـ1 عند الفشل.

**`apps/api/prisma/cleanup-qa.ts`** — حذف مباشر داخل معاملة واحدة لصفوف `QA-`: `Sale` حيث `customerName startsWith 'QA-'`, `Item` حيث `name startsWith 'QA-'`, `Stocktake` حيث `notes startsWith 'QA-'`, `Lookup` حيث `value startsWith 'QA-'`. يُبقي `AuditLog` ويحتاج `DATABASE_URL`.

### 13.7 توليد دليل PDF

- المدخل `docs/USER_MANUAL.md`، المخرج `docs/USER_MANUAL.pdf` (ملف ثنائي متتبَّع في git ويُحدَّث يدوياً وقت التوثيق). كذلك `npm.cmd run docs:pdf:spec` يولّد `docs/SYSTEM_SPECIFICATION.pdf` من هذا المستند بالأداة نفسها عبر `tools/build-spec-pdf.mjs` (متغيرات `DOCS_MD/DOCS_PDF/DOCS_TITLE`).
- `tools/build-user-guide.mjs` محوّل Markdown→HTML عربي RTL (عناوين بمعرّفات، جداول، اقتباسات، قوائم، كود) ويضمّن خط IBM Plex Sans Arabic من `node_modules/@fontsource/ibm-plex-sans-arabic/files` بالأوزان 400/600/700 كـbase64 داخل CSS.
- الطباعة عبر Microsoft Edge headless بمسار ثابت `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` وخيارات `--headless=new --no-pdf-header-footer --virtual-time-budget=5000`؛ ملف تعريف مؤقت في `os.tmpdir()` يُحذف بعد الطباعة. يتحقق أن حجم الناتج ≥10 كيلوبايت وإلا يفشل؛ مهلة 120 ثانية. `KEEP_HTML=1` يُبقي `docs/.user-manual.tmp.html` للمعاينة.
- هذا المسار مخصوص لتوثيق PDF ولا علاقة له بطباعة فواتير التطبيق (تتم عبر `window.print`).

### 13.8 سير العمل والإصدار

- المستودع: فرع `main` واحد + `origin/main`، بلا وسوم (tags) وبلا `.github`/CI وبلا سكربت إصدار آلي. عند 0.2.1 commitان: `1caba8a release: gold POS v0.2.1` ثم `7d3c407 docs: finalize v0.2.1 system specification and regenerate user manual PDF`.
- النشر يدوي بالكامل: `npm.cmd install` ⇒ `db:generate` ⇒ `db:push` ⇒ `db:seed` ⇒ `build` ⇒ تشغيل API وخدمة ثابتة للواجهة خلف وكيل.
- عند رفع الإصدار حدّث **يدوياً** المواقع الستة معاً: `version` في `package.json` الجذر والثلاثة workspaces، `version: '0.3.0'` في `apps/api/src/app.ts`، `الإصدار 0.3.0` في `apps/web/src/layout/AppShell.tsx`، ثم README/CHANGELOG/عناوين المستندات وأعد توليد PDF.
- المتتبَّع في git: الكود والوثائق و`USER_MANUAL.pdf` و`.env.example`. المستبعد: `node_modules/`, `dist/`, `.env`/`.env.*`, `tools/mysql/`, `tools/download/`, `*.log`, `coverage/`, `.vite/`.

---

## 14. ملحق عقود API التفصيلية (مطابق للكود)

القسم 4 ملخص؛ هذا الملحق يعطي مخططات Zod والقواعد الدقيقة اللازمة لإعادة إنتاج الاستجابات والأخطاء كما هي.

### 14.1 مخططات Zod الحرفية

**`itemSchema` (`routes/items.ts:18-67`):**

```ts
const optionalId = z.number().int().positive().nullable().optional();

const componentSchema = z.object({
  kind: z.enum(['RING','BRACELET','NECKLACE','EARRING','ANKLET','CHAIN','PENDANT','OTHER']),
  name: z.string().trim().max(120).nullable().optional(),
  karat: z.number().int().min(1).max(24),
  weight: z.number().positive('وزن المكوّن مطلوب'),
  stoneWeight: z.number().min(0).default(0),
  stonePrice: z.number().min(0).nullable().optional(),
  inlaysWeight: z.number().min(0).default(0),
  notes: z.string().max(2000).nullable().optional(),
});

const itemSchema = z.object({
  type: z.enum(['PIECE','SET']),
  code: z.string().trim().max(40).regex(/^[A-Za-z0-9_-]+$/,
    'الكود يقبل حروفاً لاتينية وأرقاماً وشرطات فقط').optional(),
  name: z.string().trim().min(1,'اسم القطعة مطلوب').max(160),
  categoryId: optionalId,
  size: z.string().trim().max(40).nullable().optional(),
  karat: z.number().int().min(1).max(24),
  totalWeight: z.number().positive('الوزن الإجمالي مطلوب').optional(),
  stoneWeight: z.number().min(0).default(0),
  stonePrice: z.number().min(0).nullable().optional(),
  inlaysWeight: z.number().min(0).default(0),
  quantity: z.number().int().min(1).max(9999).default(1),
  confirmSameWeight: z.boolean().optional(),
  purchaseGramPrice: z.number().min(0).nullable().optional(),
  purchasePrice: z.number().min(0).optional().default(0),
  purchaseCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/, 'رمز عملة الشراء يجب أن يكون 3 حروف لاتينية').default('USD'),
  purchaseFxRate: z.number().positive('سعر الصرف يجب أن يكون أكبر من صفر').optional(),
  purchaseStatus: z.enum(['NEW','USED','SCRAP']).default('NEW'),
  weightBasis: z.enum(['NET_GOLD','TOTAL','MINUS_STONE','MINUS_INLAYS']).nullable().optional(),
  supplierId: optionalId, countryId: optionalId, manufacturerId: optionalId,
  manufacturer: z.string().trim().max(160).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  addedAt: z.string().datetime().optional(),
  components: z.array(componentSchema).optional(),
});
```

**`createSchema` للمبيعات (`routes/sales.ts:13-34`):**

```ts
const createSchema = z.object({
  items: z.array(z.object({
    itemId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(9999).default(1),
    unitPrice: z.number().positive('سعر البيع يجب أن يكون أكبر من صفر'),
  })).min(1,'الفاتورة يجب أن تحتوي على صنف واحد على الأقل'),
  paymentMethodId: z.number({ error: 'اختر طريقة الدفع' }).int().positive('اختر طريقة الدفع'),
  customerName: z.string().trim().max(160).nullable().optional(),
  customerPhone: z.string().trim().max(40).nullable().optional(),
  profitMode: z.enum(['PERCENT','FIXED','MANUAL']).nullable().optional(),
  profitValue: z.number().min(0).max(100_000).nullable().optional(),
  fixedBasis: z.enum(['GRAM','PIECE']).nullable().optional(),
  roundingStep: z.union([z.literal(0),z.literal(5),z.literal(10)]).nullable().optional(),
  fxMode: z.enum(['CASH','CHEQUE']).nullable().optional(),
  fxRate: z.number().positive().max(10_000).nullable().optional(),
});
const cancelSchema = z.object({
  reason: z.string().trim().min(3,'سبب الإلغاء مطلوب').max(500),
});
```

**`schema` للإعدادات (`routes/settings.ts:11-33`):**

```ts
const schema = z.object({
  shopName: z.string().trim().min(1).max(160).optional(),
  currency: z.string().trim().min(2).max(8)
    .regex(/^[a-zA-Z]{3}$/,'رمز العملة يجب أن يكون 3 حروف لاتينية (مثل LYD)')
    .transform(v => v.toUpperCase()).optional(),
  codeMode: z.enum(['AUTO','MANUAL']).optional(),
  deductStone: z.boolean().optional(), deductInlays: z.boolean().optional(),
  profitMode: z.enum(['PERCENT','FIXED','MANUAL']).optional(),
  profitValue: z.number().min(0).max(100_000).optional(),
  fixedBasis: z.enum(['GRAM','PIECE']).optional(),
  fxSource: z.enum(['MANUAL','API']).optional(),
  roundingStep: z.union([z.literal(0),z.literal(5),z.literal(10)]).optional(),
  priceStaleHours: z.number().int().min(1).max(168).optional(),
  showCostToSeller: z.boolean().optional(), sellerCanAddItems: z.boolean().optional(),
  defaultKarat: z.number().int().min(1).max(24).optional(),
});
```

**أسعار وجرد:**

```ts
const priceCreateSchema = z.object({
  type: z.enum(['OUNCE','FX']),
  value: z.number().positive('القيمة يجب أن تكون أكبر من صفر'),
});
const stocktakeCreateSchema = z.object({
  type: z.enum(['QUARTERLY','SEMIANNUAL','ANNUAL']),
  notes: z.string().max(2000).nullable().optional(),
});
const stocktakeLineSchema = z.object({
  countedWeight: z.number().min(0).nullable().optional(),
  present: z.boolean().optional(),
});
```

### 14.2 قواعد الأصناف الدقيقة

- `resolveTotals`: للطقم يلزم مكوّن واحد على الأقل؛ تُجمع الأوزان بـ`aggregateComponents` وتُقرَّب 3 خانات، ويُرفض `netGoldWeight ≤ 0`. للقطعة يُستدعى `computeWeights` بأساس `NET_GOLD` دائماً لحساب `netGoldWeight` المخزَّن.
- `resolvePurchase`: العملة تُحوَّل لكبير؛ إن كانت مساوية عملة المحل `Setting.currency` ⇒ `purchaseFxRate=1`. إن كانت أجنبية يلزم `purchaseFxRate > 0` وإلا `400`. إن وُجد `purchaseGramPrice` ⇒ `purchasePrice = round2(gramPrice × netGoldWeight)` و`purchaseCostDinar = round2(purchasePrice × rate)`. إن غاب ⇒ `purchasePrice = round2(المرسل)` و`purchaseGramPrice = round4(purchasePrice ÷ netGoldWeight)` إن أمكن، و`purchaseCostDinar = purchaseCostDinar(...)`.
- الكود: في `AUTO` يتجاهل الخادم أي `code` مرسل ويولّد `P-####` أو `S-####` داخل المعاملة عبر `nextSequence` حتى 100 محاولة، متخطياً أي كود مستعمل؛ في `MANUAL` الكود مطلوب ويُرفض المكرر برسالة عربية مخصصة.
- `resolveCategoryId` يفرض تصنيف «طقم» النشط للـSET إن وُجد، وإلا يمرّر `categoryId` بعد التحقق من نوعه. `resolveManufacturer` يتحقق من `MANUFACTURER` ويحفظ الاسم في `manufacturer` أيضاً. `resolveLookupId` يتحقق من `CATEGORY`/`SUPPLIER`/`COUNTRY`.
- البائع: يحتاج `sellerCanAddItems=true`؛ وإن كانت `showCostToSeller=false` يُمنع من إرسال أي `purchaseGramPrice > 0` أو `purchasePrice > 0` برسالة `إدخال بيانات الشراء متاح للمالك فقط`.
- حقول الشراء المحجوبة من الاستجابة: `purchaseGramPrice`, `purchasePrice`, `purchaseCurrency`, `purchaseFxRate`, `purchaseCostDinar`, `purchaseStatus`.
- `GET /api/items` البحث `q` في `name/code/description/manufacturer`؛ `status` و`type` غير الصالحين يرميان Zod 422، أمّا `karat` غير الصالح فيُتجاهل. الترتيب `createdAt desc`. `GET /by-code/:code` و`/:id` يشملان relations مختلفة لكنهما يطبّقان الإخفاء نفسه.
- `PATCH` يتطلب المخطط كاملاً، يرفض صنف `SOLD` وتغيير النوع، ويحذف مكوّنات الطقم ثم يعيد إنشائها داخل المعاملة. `DELETE` يرفض أي صنف مرتبط بـ`SaleItem` بالرسالة `لا يمكن حذف صنف مرتبط بعمليات بيع — يمكنك تعطيله بدل ذلك`. المخطط لا يحوي حقل `active` للصنف، لذلك تُحتفظ بهذه الرسالة كما هي في الكود ولا يوجد مسار «تعطيل» مستقل؛ تغيير الحالة يتم عبر البيع/الإلغاء فقط.

### 14.3 قواعد المبيعات والأسعار الدقيقة

- `GET /sales`: `from/to` تُحلل بـ`new Date` وتُتجاهل إن كانت غير صالحة؛ `sellerId` يُتجاهل إن لم يكن عدداً صحيحاً موجباً؛ `status` غير الصالح ⇒ 422. الترتيب `createdAt desc`. استرجاع القائمة يُسقط `type` من الصنف، بينما `GET /:id` يتضمنه.
- عند الإنشاء: تُجمع الكميات المطلوبة لكل `itemId` في `Map` لفحص المخزون، لكن سطور `SaleItem` تُحفظ كما أُرسلت. `total = round2(Σ unitPrice × quantity)`؛ `lineTotal = round2(unitPrice × quantity)`. رقم الفاتورة `INV-${padStart(5,'0')}`. `profitValue` يُخزَّن `0` دائماً عند `MANUAL`. `paymentMethodId` إن وُجد يجب أن يكون من نوع `PAYMENT_METHOD`.
- `POST /sales/:id/cancel`: تحديث شرطي `{id,status:COMPLETED}` يمنع الإلغاء المزدوج؛ ثم `increment` لكمية كل سطر وتعيين `AVAILABLE`؛ تدقيق `CANCEL_SALE` بالحالة قبل/بعد والسبب. لا تراجع عن الإلغاء.
- `GET /prices/table`: `ounce` و`fx` من الاستعلام يقبلان أرقاماً منتهية موجبة فقط وإلا يُتجاهلان؛ عند غياب أي منهما ⇒ `ready:false, table:null` مع `current` و`providers`. مصادر العيارات: `Lookup(KARAT)` النشطة مرتبة بـ`sortOrder`، والبديل `[18,21,24]`. شكل `providers.ounce`: `{mode, configured, docsUrl, autoRefresh, refreshMinutes}`.
- `POST /prices`: كل حفظ صف جديد؛ `OUNCE` للمالك فقط، `FX` للمالك والبائع. `GET /history` صفحات `{rows,total,page,pageSize}` مع اسم المستخدم.

### 14.4 قواعد المخزون والجرد والتقارير

- `GET /inventory/summary`: يعمل على الأصناف `AVAILABLE` فقط؛ `ready` من الأسعار؛ عند عدم الجاهزية كل القيم صفر. `canSeeCost = role OWNER || setting.showCostToSeller`. حقول `cost/margin` تُحذف من `totals` و`byKarat` و`rows` عند المنع. `byKarat` و`rows` مرتبان بالعيار تصاعدياً (والكود داخل العيار). `totals.items` عدد الأصناف و`units` مجموع الكميات.
- فتح الجرد: يرفض وجود جرد `OPEN`؛ يأخذ لقطة لكل صنف `AVAILABLE` مع `expectedWeight=round3(totalWeight × quantity)` و`valueAtOpen=round2(قيمة الوحدة × quantity)` من التقييم اللحظي؛ فحص «لا جرد مفتوح» يتم داخل المعاملة بقراءة `SELECT … FOR UPDATE` بعد أخذ عدّاد `STOCKTAKE_REF` (فيتسلسل فتح جردين متزامنين)؛ يستهلك `STOCKTAKE_REF` ويسجّله في تدقيق `OPEN_STOCKTAKE` فقط (لا يُخزَّن على صف الجرد). الترتيب `openedAt desc` والحد 100 في القائمة.
- تعديل السطر: `countedWeight` إن غاب يُحتفظ بالقيمة السابقة؛ `diff = round3(counted − expected)` ويُحسب دائماً ويُحفظ حتى إن لم يُرسل `countedWeight`. رفض إذا كان الجرد `CLOSED`. تدقيق `UPDATE_STOCKTAKE_LINE` بقبل/بعد كاملين.
- الإغلاق: تحديث شرطي `{id,status:OPEN}` يمنع الإغلاق المزدوج. `GET /differences` يعيد `missing` (`present=false`) و`weightDiffs` (`present=true` و`weightDiff ≠ 0`) و`notRegistered` (أصناف `AVAILABLE` غير موجودة في لقطة الجرد) و`counts`؛ المجموعات منفصلة.
- `GET /reports/sales`: فواتير `COMPLETED` فقط؛ فلاتر `from/to/sellerId/paymentMethodId/karat`؛ `karat > 24` يُتجاهل. المخرجات `count,total,average,bySeller,byPayment,byKarat,rows` مع تقريب 2 للأموال و3 للأوزان.
- `GET /reports/profit`: سطور مبيعات `COMPLETED`; `cost = purchaseCostDinar × quantity`، `profit = lineTotal − cost`، `marginPercent = profit ÷ revenue × 100` (أو 0 عند غياب الإيراد).
- `GET /reports/inventory`: مسار OWNER دائماً، لذلك يتضمن `cost/margin` دائماً بغض النظر عن `showCostToSeller`.
- `GET /reports/prices`: آخر 500 صف مع اسم المستخدم. `GET /reports/audit`: `entity` يُقتطع إلى 60 حرفاً، `take` افتراضي 100 ونطاقه 1–500.
- `GET /dashboard`: حدود اليوم والشهر حسب **الوقت المحلي للخادم**؛ `today/month` من مجمع `COMPLETED`؛ `recentSales` آخر 6؛ `lastStocktake` أحدث `openedAt`؛ جدول الأسعار من العيارات النشطة أو `[18,21,24]`.
- حذف `Lookup`: يُحذف فعلياً إن لم يكن مستعملاً؛ إن كان مستعملاً في `CATEGORY/SUPPLIER/MANUFACTURER/COUNTRY` عبر FK أو `PAYMENT_METHOD` عبر فواتير ⇒ يُعطَّل (`active=false`) مع تدقيق `DEACTIVATE_LOOKUP`. نوع `KARAT` **لا** يُفحص مقابل الأصناف ويمكن حذفه.

### 14.5 مصفوفة الأخطاء الموسّعة

تُضاف إلى جدول 8.5:

| الحالة | الرمز | الرسالة/السلوك |
|---|---|---|
| مسار غير معروف | `404 NOT_FOUND` | `المسار المطلوب غير موجود (<METHOD>).` |
| Prisma `P2011` | `400 REQUIRED_FIELD` | حقل مطلوب فارغ |
| Prisma `P2000` | `400 VALUE_TOO_LONG` | قيمة أطول من المسموح |
| Prisma غير مصنَّف | `500 DATABASE_ERROR` | رسالة عامة |
| Prisma `P1000/P1001/P1002/P1008/P1010/P1017` | `503 DATABASE_UNAVAILABLE` | شغّل قاعدة البيانات |
| Prisma `P2021/P2022/P3005` | `503 DATABASE_NOT_READY` | شغّل تحديث قاعدة البيانات |
| أخطاء اتصال Prisma | `503 DATABASE_UNAVAILABLE` | كشف بالنمط: `Can't reach database server`, `ECONNREFUSED`, `ETIMEDOUT`, `connect ECONN`, `Connection refused`, `Access denied for user` أو أسماء `PrismaClientInitializationError/PrismaClientRustPanicError/PrismaClientUnknownRequestError` |
| JSON تالف | `400 INVALID_JSON` | `صيغة البيانات المرسلة غير صحيحة.` |
| جسم كبير | `413 PAYLOAD_TOO_LARGE` | `حجم البيانات المرسل كبير جداً. اختصر المحتوى ثم أعد المحاولة.` |
| حد المعدل | `429 RATE_LIMITED` | مع ترويسة `Retry-After` |

`zod-ar` يُحمَّل كـside effect في السطر الأول من `app.ts` لتطبيق الترجمة العربية عالمياً. Zod يُعيد `details = [{path, message}]` وأول رسالة في `message`. كل الأخطاء تنشئ `requestId = randomUUID()` وتضعه في الترويسة والجسم؛ أخطاء Prisma/الاتصال/غير المعالجة تُسجَّل في سجل الخادم فقط مع `requestId` و`METHOD path`.

### 14.6 مصفوفة التدقيق

| الإجراء | الكيان | داخل معاملة؟ | أهم مفاتيح `oldValue/newValue` |
|---|---|---|---|
| `LOGIN`, `CHANGE_PASSWORD` | `user` | لا | معرّف المستخدم/اسم الدخول؛ لا كلمة مرور |
| `CREATE_USER`, `UPDATE_USER`, `RESET_PASSWORD` | `user` | لا | الحقول المغيّرة؛ لا كلمة مرور |
| `CREATE_LOOKUP`, `UPDATE_LOOKUP` | `lookup` | لا | `value/active/sortOrder` |
| `DEACTIVATE_LOOKUP`, `DELETE_LOOKUP` | `lookup` | لا | `id` والقيمة قبل الحذف |
| `UPDATE_SETTINGS` | `settings` | لا | `oldValue`: `codeMode/deductStone/deductInlays/profitMode/profitValue/fixedBasis/roundingStep/priceStaleHours/showCostToSeller/sellerCanAddItems`؛ `newValue`: جسم الطلب الخام |
| `UPDATE_PRICE`, `FETCH_PRICE`, `AUTO_FETCH_PRICE` | `price` | لا/نعم حسب المسار | `type/value/source` |
| `CREATE_ITEM`, `UPDATE_ITEM`, `DELETE_ITEM` | `item` | نعم (CREATE/UPDATE) | `code/name/type/karat/totalWeight/quantity/purchasePrice` |
| `CREATE_SALE`, `CANCEL_SALE` | `sale` | نعم | `invoiceNo/total/lines` أو `status/total/reason` |
| `OPEN_STOCKTAKE`, `CLOSE_STOCKTAKE` | `stocktake` | نعم | `type/ref/lines` أو `status/lines` |
| `UPDATE_STOCKTAKE_LINE` | `stocktakeLine` | نعم | `countedWeight/present/weightDiff/stocktakeId` |
| `BACKUP_MANUAL`, `BACKUP_SCHEDULED` | `backup` | لا | `fileName/sizeBytes/warning?` |
| `BACKUP_FAILED` | `backup` | لا | `error` |
| `UPDATE_BACKUP_SETTINGS` | `backup` | لا | القيم قبل/بعد |
| `BACKUP_DOWNLOAD`, `BACKUP_DELETE` | `backup` | لا | `fileName` |

---

## 15. ملحق خط التشغيل والأمان (Runtime Pipeline)

### 15.1 ترتيب الـmiddleware في `app.ts`

1. استيراد `./lib/zod-ar.js` (ترجمة رسائل Zod عربياً).
2. `app.disable('x-powered-by')` و`app.set('trust proxy', config.TRUST_PROXY)`.
3. `helmet({ crossOriginResourcePolicy: { policy: 'same-site' } })`.
4. `cors({ origin: allowedOrigins, credentials: true })`؛ `allowedOrigins` في الإنتاج `[APP_ORIGIN]`، وفي التطوير `[APP_ORIGIN, http://localhost:5173, http://127.0.0.1:5173]`.
5. `express.json({ limit: '1mb' })` ثم `cookieParser()`.
6. `originGuard` ثم `attachUser`.
7. ترويسات `Cache-Control: no-store` و`Pragma: no-cache` لكل `/api`.
8. `/api/health` و`/api/bootstrap` عامّان؛ ثم تركيب المسارات بالترتيب: auth، users (OWNER)، lookups، settings، prices، items، sales، inventory، stocktakes، reports (OWNER)، dashboard.
9. `notFoundHandler` ثم `errorHandler`.

`originGuard` يمرّر `GET/HEAD/OPTIONS` وطلبات بلا ترويسة `Origin` (نفس الأصل/CLI)، ويرفض `Origin: null`، ويسمح في التطوير بـ`APP_ORIGIN` و`http://localhost:${PORT}` و`http://127.0.0.1:${PORT}` و`localhost:5173` و`127.0.0.1:5173`.

### 15.2 الجلسات والكوكي

- `SESSION_COOKIE = 'gold_session'`؛ التوكن `randomBytes(32).toString('hex')`； `Session.id = sha256(token)`؛ التوكن الخام لا يُحفظ في DB.
- الكوكي: `httpOnly`, `sameSite: 'lax'`, `secure = isProd`, `path: '/'`, `expires = الآن + SESSION_DAYS أيام`.
- `resolveSession` يحذف الجلسة المنتهية، ويرفض مستخدم `active=false`، ويحدّث `lastUsedAt` مرة كل ساعة فقط.
- `ip` من `req.ip` و`userAgent` مقتطع إلى 255 حرفاً.
- الدخول الناجح يُدمّر جلسة الكوكي الحالية ويُنشئ واحدة جديدة ويُصفّر عدّادات الدخول؛ `destroyAllUserSessions` لإعادة التعيين/التعطيل، و`destroyOtherUserSessions(userId, keepToken)` بعد تغيير كلمة المرور.

### 15.3 حدود المعدل

| الحد | المفتاح | النافذة | الحد الأقصى |
|---|---|---|---|
| دخول/IP | `login-ip:<req.ip>` | 10 دقائق | 30 |
| دخول/حساب | `login-user:<username منخفض>` | 10 دقائق | 8 |
| جلب سعر | `price-fetch:<userId أو ip>` | 5 دقائق | 20 |

التنفيذ في الذاكرة بخريطة `buckets` و`MAX_BUCKETS = 20000`؛ عند التجاوز يُحذف المنتهي ثم الأقدم إدراجاً. التجاوز ⇒ 429 مع `Retry-After` بالثواني. تُصفَّر عند إعادة تشغيل الخادم (راجع 11.6).

### 15.4 سياسة كلمة المرور

8 أحرف على الأقل، ولا تُقبل إذا كانت `bcrypt.truncates(password)` (أي >72 بايت)، ولا تحتوي اسم المستخدم إن كان طوله ≥3، ولا تكون من القائمة: `password, password1, 12345678, 123456789, qwerty123, admin123, admin1234, seller123, iloveyou`. عند غياب المستخدم تُقارن كلمة المرور بـ`DUMMY_PASSWORD_HASH` (`bcrypt.hashSync('gold-pos-dummy-password', 12)`) لتقريب زمن الاستجابة ومنع كشف الحسابات.

### 15.5 الإقلاع والإغلاق

- `index.ts` يستدعي `createApp()`، ويستمع على `config.PORT`، ويبدأ مجدول الأسعار ومجدول النسخ الاحتياطي (`startBackupScheduler`)، ويعرض سطر تشغيل. Prisma يسجّل `warn/error` في التطوير و`error` فقط في الإنتاج. `unhandledRejection` يُسجَّل.
- عند `SIGINT/SIGTERM`: إيقاف المجدولين ⇒ إغلاق خادم HTTP ⇒ `$disconnect()` من Prisma ⇒ خروج؛ ومؤقت إجباري 8 ثوانٍ إن تعطّل الإغلاق.

---

## 16. ملحق الواجهة الكامل (مرجع إعادة بناء الشاشات)

الأقسام 7.1–7.6 تذكر السلوك الحساس؛ هذا الملحق يكفي وحده لبناء الواجهة كما هي: الهوية البصرية، الهيكل العام، كل شاشة، وعميل المتصفح.

### 16.1 الهوية البصرية (`apps/web/src/styles.css`)

`@import 'tailwindcss';` ثم `@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));`. المتغيرات كما يلي (قيم فاتحة / داكنة):

| المتغير | فاتح `:root` | داكن `[data-theme='dark']` |
|---|---|---|
| `--bg` | `#f7f4ec` | `#0d0e11` |
| `--surface` | `#ffffff` | `#15171c` |
| `--surface-2` | `#f1ede1` | `#1b1e25` |
| `--surface-3` | `#e9e2d1` | `#232733` |
| `--border` | `#e4ddcb` | `#272b35` |
| `--border-strong` | `#d3c8ad` | `#343a48` |
| `--text` | `#191a1f` | `#f2efe6` |
| `--muted` | `#6b707a` | `#9aa1ae` |
| `--gold` | `#a8811f` | `#d8b44e` |
| `--gold-hover` | `#916d16` | `#e8ca6d` |
| `--gold-soft` | `#f4e8c5` | `#352a0e` |
| `--gold-glow` | `rgba(168,129,31,0.18)` | `rgba(216,180,78,0.22)` |
| `--success` | `#2b7455` | `#56b189` |
| `--success-soft` | `#e2f2e9` | `#12271e` |
| `--danger` | `#ae3f26` | `#dc7861` |
| `--danger-soft` | `#fbe8e3` | `#2b1613` |
| `--warning` | `#9d6d13` | `#dcab55` |
| `--warning-soft` | `#fcefd6` | `#2b2110` |
| `--info` | `#2f5f8a` | `#86aed8` |
| `--info-soft` | `#e6eff7` | `#14202c` |
| `--shadow-s` | `0 1px 2px rgba(25,26,31,.06)` | `0 1px 2px rgba(0,0,0,.4)` |
| `--shadow-m` | `0 4px 16px -4px rgba(25,26,31,.12)` | `0 6px 20px -6px rgba(0,0,0,.6)` |
| `--shadow-l` | `0 18px 45px -18px rgba(25,26,31,.28)` | `0 22px 50px -20px rgba(0,0,0,.8)` |

`@theme inline` يربط المتغيرات بأسماء Tailwind: `--color-bg`, `--color-surface`, `--color-surface2`, `--color-surface3`, `--color-border`, `--color-borderstrong`, `--color-text`, `--color-muted`, `--color-gold`, `--color-goldhover`, `--color-goldsoft`, `--color-success`, `--color-successsoft`, `--color-danger`, `--color-dangersoft`, `--color-warning`, `--color-warningsoft`, `--color-info`, `--color-infosoft`؛ الخط `--font-sans: 'IBM Plex Sans Arabic', 'Segoe UI', system-ui, sans-serif`؛ الظلال `--shadow-card/-float/-pop` تقابل `s/m/l`.

قواعد base: `*` يرث `border-color: var(--border)`؛ `html` بـ`scroll-behavior: smooth`؛ `body` بخلفية `--bg` ولون `--text` والخط المحدد، `min-height:100vh` و`-webkit-font-smoothing: antialiased`؛ `body::before` طبقة ثابتة `z-index:-1` بتدرّجين شعاعيين `75rem 45rem at 100% -10%` و`60rem 40rem at -10% 110%` من `--gold-glow` إلى شفاف، بشفافية `0.55`؛ `:selection` بـ`--gold-soft`؛ `:focus-visible` بحدّ `2px solid var(--gold)` وإزاحة `2px`؛ أزرار زيادة/نقصان الأرقام مخفية على `input[type=number]`؛ شريط التمرير بعرض 10 بكسل وقبضة `--border-strong` مستديرة.

أدوات مساعدة: `.ltr-nums` (`direction:ltr; unicode-bidi:isolate; font-variant-numeric:tabular-nums`)، `.card` (خلفية surface، حدّ 1px، نصف قطر `1rem`، ظل صغير)، `.gold-line` (تدرّج خطي شفاف→ذهبي→شفاف)، `.text-gradient-gold`، `.scroll-thin`، `.animate-in` (`fade-up 0.28s ease-out both`)، `.skeleton` (تدرّج متحرك `shimmer 1.4s`). حركات `fade-up` و`shimmer` و`spin` معرّفة بـ`@keyframes`.

الطباعة (`@media print`): إخفاء `body::before` و`.no-print`، إظهار `.print-area` بلا ظل ولا حدود، وإجبار `body` على خلفية بيضاء ونص أسود.

`apps/web/index.html`: `<html lang="ar" dir="rtl" data-theme="light">`، favicon `/favicon.svg`، viewport مع `viewport-fit=cover`، `theme-color #C9A227`، وصف «نظام تسعير ومخزون الذهب»، عنوان «ذهب — نظام إدارة الذهب»، ونقطة دخول `/src/main.tsx`.

### 16.2 عميل التشغيل (`main.tsx`, `lib/*`)

- ترتيب الـproviders: `StrictMode > QueryClientProvider > ThemeProvider > AuthProvider > ToastProvider > BrowserRouter > App`.
- افتراضات React Query: الاستعلامات `retry:1`, `refetchOnWindowFocus:false`, `staleTime:15_000`؛ الطفرات `retry:0`.
- قبل React يضبط `main.tsx` `document.documentElement.dataset.theme` من `localStorage['gold.theme']` أو `prefers-color-scheme`، مع `try/catch` يعود إلى `light`؛ `themeBootstrapScript` موجود لكن يُشار إليه بـ`void` فقط (الـIIFE المضمن في `main.tsx` هو المستخدم فعلياً). `ThemeProvider` يضيف `style.colorScheme` ويحدّث `meta[name=theme-color]` إلى `#0d0e11` أو `#f7f4ec`.
- `lib/api.ts`: الأساس `/api`؛ `fetch` مع `credentials:'include'` و`content-type: application/json` عند وجود جسم؛ `204` يُعيد `undefined`؛ النجاح يُقرأ من `json.data`؛ الفشل يبني `ApiError(status, code, message, details)` من `json.error`؛ `displayMessage` يأخذ `details[0].message` عند `VALIDATION_ERROR` وإلا `message`؛ أي 401 غير `/auth/login` يُطلق حدث `auth:expired`؛ فشل الشبكة ⇒ `ApiError(0,'NETWORK','تعذر الاتصال بالخادم، تحقق من الشبكة')`. الدوال `api.get/post/patch/del`، و`qs()` تتخطى `null/undefined/''` وترجع `?...` أو سلسلة فارغة.
- `lib/auth.tsx`: `ME_KEY=['auth','me']`؛ `/auth/me` عند 401 يُعيد `null`؛ `retry:false`, `staleTime:60_000`؛ `login` يستدعي `/auth/login` ويضبط بيانات ME؛ `logout` يستدعي `/auth/logout` ثم `setQueryData(ME_KEY,null)` و`queryClient.clear()` في `finally`؛ مستمع `auth:expired` يصفّر ME ويحذف كل الاستعلامات غير `auth`؛ `isOwner = data?.role === 'OWNER'`.
- `lib/format.ts`: `fmtMoney` خانتان (`en-US`)، `fmtWeight` من خانتين إلى ثلاث خانات، `fmtNum` صحيح، `fmtMoneyWithCurrency`، `fmtDate/fmtDateTime/fmtTime` بتنسيق `en-GB` (التاريخ `dd/mm/yyyy` والوقت 24 ساعة، الفاصل ` · `)، و`timeAgo` ⇒ «الآن» / «قبل N دقيقة» / «قبل N ساعة» / «قبل N يوم». الخرائط: `TYPE_LABEL` (قطعة/طقم)، `STATUS_LABEL` (موجود/مباع)، `PURCHASE_STATUS_LABEL` (جديد/مستعمل/كسر)، `BASIS_LABEL` (وزن الذهب الصافي/الوزن الإجمالي/خصم الحجر فقط/خصم الفصوص فقط)، `PROFIT_MODE_LABEL` (نسبة مئوية/مبلغ ثابت/سعر نهائي يدوي)، `FIXED_BASIS_LABEL` (لكل غرام/لكل قطعة)، `STOCKTAKE_TYPE_LABEL` (ربع سنوي/نصف سنوي/سنوي)، `COMPONENT_KIND_LABEL` (خاتم/أسورة/سلسلة/حلق/خلخال/حديدة/تعليقة/أخرى).

**مفاتيح الاستعلام وتبعيات الإبطال:**

| المفتاح | أمثلة الشكل | مَن يُبطلها |
|---|---|---|
| `['auth','me']` | ثابت | login/logout/انتهاء الجلسة، تعديل مستخدم |
| `['settings']` | ثابت | حفظ الإعدادات، CRUD القوائم |
| `['lookups',kind]` | `['lookups','KARAT']` | CRUD القوائم |
| `['prices','table']`, `['prices','history',filter,page]` | معاملات | حفظ/جلب السعر ⇒ `prices,dashboard,inventory,reports` |
| `['dashboard']` | ثابت | السعر، البيع، الإلغاء |
| `['items',{q,status,type,karat,page}]`, `['items','sale-search',q]`, `['items','next-code',form.type]` | معاملات | إضافة/تعديل/حذف صنف، البيع، الإلغاء، القوائم |
| `['inventory']` | ثابت | الأسعار، الأصناف، البيع/الإلغاء |
| `['sales',{...filters,page}]`, `['sales',saleId]` | معاملات | البيع، الإلغاء |
| `['stocktakes']`, `['stocktakes',id,'differences']` | معاملات | فتح/تعديل سطر/إغلاق الجرد |
| `['reports','sales',from,to,sellerId,paymentMethodId,karat]`, `['reports','audit',from,to,entity,take]`, `['reports','inventory']` | معاملات | الأسعار، البيع/الإلغاء، إعادة التقييم |
| `['users']` | ثابت | CRUD المستخدمين |

حفظ الإعدادات يُبطل ستة مفاتيح (الإعدادات، القوائم، الأسعار، المخزون، الأصناف، لوحة المعلومات). تغيير مستخدم يُبطل `users` و`auth/me`. إعادة تقييم المخزون في تبويب «المخزون» تُبطل `reports/inventory`.

### 16.3 الهيكل العام (`app/App.tsx`, `layout/AppShell.tsx`)

المسارات كما في 7.1. `Protected` يعرض `Splash` أثناء التحميل، ويحوّل إلى `/login` مع `state.from`؛ `OwnerOnly` يعرض «هذه الصفحة للمالك فقط» ووصفها وزر «رجوع»؛ المسار غير المعروف يعرض «الصفحة غير موجودة» وزر «العودة للرئيسية». `/login` إذا كان المستخدم مسجلاً ⇒ تحويل إلى `/`.

**AppShell:** سايدبار ثابت بعرض 268px (`lg:translate-x-0`) يتحول إلى درج منزلق على الشاشات الصغيرة مع طبقة تعتيم `z-40`؛ ترويسة شعار `Au` بتدرّج `#e8cf8a → #c9a227 → #8a6e14` واسم المحل من `settings.shopName` (الافتراضي «محل الذهب») والسطر «نظام تسعير ومخزون الذهب». ترتيب التنقل: الرئيسية، أسعار الذهب، الذهب، المبيعات، المخزون والتقييم، الجرد، التقارير، الإعدادات، المستخدمون، النسخ الاحتياطي (للمالك فقط)، ثم دليل الاستخدام (للجميع). أسفل السايدبار: «آخر تحديث للسعر» بـ`timeAgo` أو «لم يُدخل بعد»، ثم «الإصدار 0.3.0 · جميع الحقوق محفوظة».

الهيدر لاصق (`sticky top-0`, `bg-bg/85`, `backdrop-blur-md`) يحوي زر القائمة على الجوال، مؤشر «السوق الآن» النابض على الشاشات المتوسطة، شريط «أونصة / صرف / غرام 21» (الأونصة بصيغة `$...`، والصرف برقم، وغرام 21 بتمييز ذهبي؛ `title` شريحتي الأونصة وغرام 21 يحمل `RAW_GOLD_PRICE_NOTE` دون ظهور بصري)، شارة «السعر متقادم» إن لزم، زر تبديل الثيم (شمس/قمر)، وقائمة المستخدم. القائمة تعرض الاسم والمعرّف `@username` وعنصرَي «تغيير كلمة المرور» و«تسجيل الخروج». نافذة تغيير كلمة المرور: الحقول «كلمة المرور الحالية / الجديدة / التأكيد»، تحقق محلي (≥8 وتطابق)، رسائل «كلمتا المرور غير متطابقتين» و«سيتم إنهاء الجلسات الأخرى تلقائياً بعد التغيير»، واستدعاء `POST /auth/change-password`. المحتوى في `<main>` بعرض أقصى 1400px وهامش `px-3 sm:px-5 lg:px-7`.

### 16.4 الشاشات

#### 16.4.1 الدخول (`pages/Login.tsx`)
شاشة من عمودين على `lg`: عمود النموذج في بداية الاتجاه (يمين الصفحة في RTL) ولوحة تسويقية داكنة في نهايته. العنوان «أهلاً بعودتك» والوصف «سجّل الدخول للوصول إلى الأسعار اللحظية، المخزون، والمبيعات.»؛ حقول «اسم المستخدم» (placeholder `admin`) و«كلمة المرور» مع زر إظهار/إخفاء؛ زر «تسجيل الدخول» يتحول إلى «جارٍ الدخول…». تفصيلة `<details>` بعنوان «بيانات الدخول الأولية» تعرض صراحةً `admin / Admin@2026` و`seller / Seller@2026` ونصيحة تغييرها. اللوحة الأخرى تعرض «تحويل دقيق من الأونصة إلى العيار»، العبارة «كل غرام محسوب بعيارة الصحيح، من سعر الأونصة إلى الفاتورة»، المعادلة مع 31.1035، وصفوف 24K/21K/18K بمعاملات 1.000/0.875/0.750.

#### 16.4.2 الرئيسية (`pages/Dashboard.tsx`)
ترحيب «مرحباً، ${user.name}» مع زري «تحديث» و«بيع جديد». تنبيهات: «لم يتم إدخال أسعار الذهب بعد» مع زر «إدخال الأسعار»؛ «الأسعار متقادمة» مع عدد الساعات والحد. بطاقة «أسعار الغرام اليوم» تعرض صفوف العيارات (المعامل، السعر مع `{currency}/غ`) وسطر الأونصة/الصرف/«أونصة تروي = 31.1035 غرام»/اسم مُدخل السعر، يليه سطر مختصر بـ`RAW_GOLD_PRICE_NOTE` يوضّح أن الأرقام للخام قبل المصنعية. أربع بطاقات: «مبيعات اليوم»، «مبيعات الشهر»، «قطع متاحة»، «وزن الذهب الصافي». وتليها مجموعات «آخر المبيعات» (6 فواتير، رابط «الكل»، حالة فارغة «لا مبيعات بعد»)، «إجراءات سريعة» (تسجيل بيع جديد، إضافة قطعة ذهب، تحديث أسعار الذهب، تقييم المخزون)، «آخر جرد» (جرد #id، مفتوح/مغلق، «لم يُسجَّل أي جرد بعد»)، وبطاقة «للمالك» تشير إلى التقارير.

#### 16.4.3 الأسعار (`pages/Prices.tsx`)
العنوان «أسعار الذهب»، يليه مباشرة سطر `RAW_GOLD_PRICE_NOTE` المختصر (راجع 7.7)، ثم شريط تحذير التقادم. بطاقة «تحديث الأسعار» مع رابط «توثيق goldapi.dev» (مخفي على الجوال)، وزر «جلب من goldapi.dev» (للمالك عند التهيئة)، أو شارة «سعر الأونصة يعدّله المالك»/«API غير مهيأ»؛ شارات «مصدر الأونصة: API مباشر/يدوي»، «تحديث تلقائي كل N دقيقة»، «التحديث التلقائي معطّل»، ونص تقني «المفتاح يعمل من داخل الخادم فقط ولا يظهر في المتصفح» (مخفي على الجوال). حقول «سعر أونصة الذهب (دولار)» بـ`USD/oz` و«سعر الصرف (العملة المحلية مقابل الدولار)» مع تلميح القيمة الحالية والمُدخل والوقت، وزر «حفظ» لا يُفعّل إلا عند التغيير وصلاحية المالك. كتلة «المعادلة المستعملة» ومكرّر التحويل أسفل الجدول مخفيان على الجوال. معاينة حيّة عبر `buildPriceTable` لجدول العيارات. بطاقة «كيف يتحوّل سعر الأونصة إلى سعر العيار؟» تظهر من `md` فأعلى فقط. أسفل الصفحة: بطاقة «سجل الأسعار» بتبويبات `OUNCE/FX`، فلتر وصفحات، ورسالة «لا تحديثات في هذه الفترة». عند الجلب الناجح تظهر رسالة «تم جلب سعر الأونصة من goldapi.dev: $... · تحديث المزوّد ...».

#### 16.4.4 الأصناف ونموذج الصنف (`pages/Items.tsx`, `pages/ItemForm.tsx`)
قائمة «الذهب»: بحث فوري بـdebounce 300ms بplaceholder «ابحث بالكود، الاسم، أو الوصف…»، فلاتر «كل الأنواع/قطعة/طقم» و«كل العيارات» و«الحالة»، صفحات بحجم 20، زر «إضافة قطعة ذهب» إن سمحت الصلاحية. الأعمدة: الكود، الصنف (النوع·التصنيف·المقاس)، العيار (`NK`)، الوزن (إجمالي/صافي)، الكمية، التكلفة (مشروطة)، الحالة، وأزرار تعديل/حذف (الحذف للمالك فقط).

نموذج القطعة: «نوع الصنف» (قطعة/طقم)، «كود الصنف»، «اسم القطعة»، «العيار»، «التصنيف» (يُثبَّت على «طقم» ويُعطَّل للطقم)، «المقاس»، «الكمية» مع تأكيد «أؤكد أن جميع القطع بنفس الوزن والمواصفات والعيار» عند الكمية >1؛ «الأوزان» (إجمالي/حجر/فصوص/سعر الحجر) مع حساب «وزن الذهب الصافي»؛ «مكونات الطقم» بصفوف `ComponentRow` (النوع، العيار، الاسم، الأوزان، سعر الحجر، ملاحظات) وملخص أوزان؛ «بيانات الشراء من الجملة» (سعر الغرام، العملة، سعر الصرف يوم الشراء، حالة الشراء، تاريخ الإضافة)، تليها بطاقة «أين سعر البيع؟» المطويّة بـ`<details>`؛ «تفاصيل إضافية» (المورّد، بلد المنشأ، المصنّع/العلامة، الوصف، الملاحظات) مع إضافة سريعة للقوائم عبر `POST /lookups` (SUPPLIER/MANUFACTURER فقط). الشريط الجانبي اللاصق يعرض «ملخص الشراء — تكلفة القطعة كما اشتريتها اليوم — بدون سعر بيع»؛ شريط حفظ مثبت على الجوال. التحقق المحلي: وزن إجمالي >0، مجموع الحجر والفصوص < الإجمالي، تأكيد التماثل، أوزان المكوّنات موجبة.

#### 16.4.5 بيع جديد (`pages/SaleNew.tsx`)
العنوان «بيع جديد» والوصف «ابحث عن الصنف بالكود أو الاسم، أضفه للسلة، ثم أكّد الفاتورة.»؛ حقل بحث بplaceholder «امسح كود الصنف أو اكتب اسمه…»، نتائج بالسعر المقترح، وسلة فارغة «السلة فارغة». كل سطر: الكمية (زرّا +/-) وسعر البيع بالعملة مع زر استخدام السعر المقترح، و«إجمالي سعر البيع». تفاصيل التكلفة كما في 7.3 («سعر الشراء … / وحدة»، «تكلفة الشراء»، «الربح/الخسارة»، و«عدد القطع في الطقم»)، ولا تظهر إطلاقاً عند `showCost=false`. لوحة «سياسة الربح والتقريب» بعنوان فرعي «تُطبَّق على هذه الفاتورة فقط، ولا تغيّر افتراضيات المحل» وشارة تجمع النمط والأساس؛ «طريقة الربح»، حقل ديناميكي («نسبة الربح» / «الربح لكل غرام (LYD)» / «الربح لكل قطعة (LYD)») أو نص «تُدخل أسعار البيع يدوياً لكل قطعة»؛ زرا «لكل غرام» و«لكل قطعة»؛ «تقريب السعر النهائي»؛ «سعر الصرف المستعمل» مع «صرف النقدي» و«صرف الصك المصدق». «العميل والدفع» (اسم العميل، هاتف `09xxxxxxxx`، طريقة الدفع بplaceholder «غير محددة»). «ملخص الفاتورة»: عدد الأصناف، عدد القطع، إجمالي الوزن، البائع، ثم التكلفة/الإجمالي/الربح عند السماح. نافذة «تأكيد إتمام البيع» تعرض ملخص السياسة والإجماليات. بعد الحفظ: نافذة «تم إتمام البيع» بعنوان فرعي «الفاتورة ... محفوظة، ويمكنك طباعة الإيصال الآن.».

#### 16.4.6 المبيعات وتفاصيل الفاتورة (`pages/Sales.tsx`, `pages/SaleDetail.tsx`)
قائمة المبيعات: تبويبات «كل الفواتير / مكتملة / ملغاة»، فلاتر «من تاريخ / إلى تاريخ / البائع» للمالك فقط وزر مسح، أعمدة الفاتورة، العميل، الأصناف، البائع، الدفع، الإجمالي، الحالة («مكتملة»/«ملغاة»)، التاريخ. التفاصيل: عنوان «الفاتورة INV-...»، أزرار «رجوع / طباعة / إلغاء الفاتورة» (للمالك والفواتير المكتملة)، شريط «فاتورة ملغاة — السبب … ألغاها …». جدول «أصناف الفاتورة» بالأعمدة الصنف/العيار/الوزن/الكمية/سعر الوحدة/الإجمالي وتذييل «الإجمالي قبل الإلغاء». بطاقة جانبية للإيصال والسياسة المحفوظة (نمط الربح، التقريب، سعر الصرف، `fixedBasis` إن وُجد). نافذة الإلغاء تطلب سبباً ≥3 أحرف برسالة «اكتب سبباً واضحاً لا يقل عن 3 أحرف»، ونجاحها «تم إلغاء الفاتورة وإرجاع الكميات للمخزون».

#### 16.4.7 المخزون والتقييم (`pages/Inventory.tsx`)
بطاقات: «قيمة المخزون الحالية»، «وزن الذهب الصافي»، «عدد القطع المتاحة»، والرابعة «الهامش التقديري» عند إظهار التكلفة وإلا «أعلى عيار بالقيمة» (هذا هو التكيّف الخاص بالبائع). تنبيه «التقييم غير متاح بعد». قسم «التوزيع حسب العيار» ببطاقات نسبة القيمة (شريط تدرّج ذهبي) وشارة أساس الوزن الفعلي. جدول الأصناف فيه بحث وفلاتر عيار/نوع/حالة، وأعمدة القيمة/الوزن/الصافي/التكلفة والهامش عند السماح. الملاحظة التوضيحية أسفل الجدول تظهر من `sm` فأعلى فقط.

#### 16.4.8 الجرد (`pages/Stocktake.tsx`, `pages/StocktakeDetail.tsx`)
قائمة الجرد: شريط «يوجد جرد مفتوح الآن» مع «متابعة الجرد»؛ بطاقات «الجرد الحالي / جردات منجزة / آخر جرد مغلق / إجمالي الأسطر المسجّلة»؛ جدول «سجل الجردات»؛ نص توضيحي يذكر لقطة الفتح وBR-14 (يظهر من `sm` فأعلى فقط). نافذة «فتح جرد جديد»: «نوع الجرد» (ربع/نصف/سنوي) و«ملاحظات (اختياري)» بحد 2000، مع تحذير تسجيل القيم صفراً عند عدم جاهزية الأسعار.

تفاصيل الجرد: عنوان «جرد <النوع>» وأزرار رجوع/تحديث/«إغلاق الجرد» للمالك. شريط مفتوح أو «هذا الجرد مغلق ونهائي». أربع بطاقات: «نسبة الإنجاز»، «قطع غير موجودة»، «فروقات الوزن»، «قيمة اللقطة عند الفتح»، مع شريط تقدّم. تبويبات «كل الأصناف / غير معدودة / فروقات» وبحث «ابحث بالكود أو الاسم…». رأس الجدول: الصنف، الوزن المتوقع، الوزن المعدود، الفرق، موجود. كل سطر يحوي حقل «الوزن المعدود» يُحفظ عند `onBlur` أو Enter، شارة «مطابق» أو فرق موجب/سالب، ومربع «موجود/غير موجود» (معطّل بعد الإغلاق). «تقرير الفروقات» بثلاثة كتل: «قطع غير موجودة»، «أوزان مختلفة»، «أصناف غير مسجّلة بالجرد»، مع شارة «لا فروقات / توجد فروقات». نافذة «إغلاق الجرد نهائياً؟» تعرض معدود/غير موجود/صافي الفرق وتحذيراً إن بقيت أصناف غير معدودة، وزر «تأكيد الإغلاق».

#### 16.4.9 التقارير (`pages/Reports.tsx`)
خمسة تبويبات: «المبيعات / الأرباح / المخزون / سجل الأسعار / سجل التعديلات»، للمالك فقط.

- **المبيعات:** فلاتر التاريخ والبائع وطريقة الدفع والعيار وزر «مسح الفلاتر»؛ بطاقات «عدد الفواتير المكتملة / إجمالي المبيعات / متوسط الفاتورة»؛ توزيعات «المبيعات حسب البائع»، «حسب طريقة الدفع»، «حسب العيار»؛ جدول «فواتير الفترة» بالأعمدة الفاتورة/العميل/البائع/الدفع/القطع/الإجمالي؛ حالة فارغة «لا فواتير في هذه الفترة».
- **الأرباح:** نفس نطاق التاريخ، بطاقات الإيراد/التكلفة/الربح/الهامش، وجدول «تفصيل الأرباح حسب القطعة» (الصنف، الكمية، الإيراد، التكلفة، الربح، النسبة) مع حسابات 14.4.
- **المخزون:** «تفصيل تقييم المخزون» مع قيم ووزن وهامش لكل صنف، ورابط يفتح بطاقة الصنف؛ حالة فارغة «المخزون فارغ».
- **سجل الأسعار:** «سجل تحديثات الأسعار» بالتاريخ/النوع/القيمة/المصدر/المستخدم، فلاتر وحالة «لا تحديثات في هذه الفترة».
- **سجل التعديلات:** فلاتر from/to و«السجل» وعدد الصفوف (1–500، افتراضي 100)؛ جدول «سجل التعديلات» بالأعمدة العملية/السجل/المستخدم/التاريخ/التفاصيل؛ شارة حمراء للإجراءات التي تبدأ بـ`DELETE` أو `CANCEL`؛ حالة «لا سجلات في هذه الفترة».

خريطة التسميات العربية في الواجهة (`ACTION_LABEL`) هي: `CREATE_ITEM:'إضافة صنف'`, `UPDATE_ITEM:'تعديل صنف'`, `DELETE_ITEM:'حذف صنف'`, `CREATE_SALE:'بيع جديد'`, `CANCEL_SALE:'إلغاء فاتورة'`, `OPEN_STOCKTAKE:'فتح جرد'`, `CLOSE_STOCKTAKE:'إغلاق جرد'`, `UPDATE_SETTINGS:'تعديل الإعدادات'`, `CREATE_USER:'إضافة مستخدم'`, `UPDATE_USER:'تعديل مستخدم'`, `RESET_PASSWORD:'تغيير كلمة مرور'`, `CREATE_LOOKUP:'إضافة قيمة'`, `UPDATE_LOOKUP:'تعديل قيمة'`, `DELETE_LOOKUP:'حذف قيمة'`, `DEACTIVATE_LOOKUP:'إخفاء قيمة'`, `UPDATE_PRICES:'تحديث الأسعار'`, `LOGIN:'تسجيل دخول'`, `LOGOUT:'تسجيل خروج'`. خريطة الكيانات: `item:'صنف'`, `sale:'فاتورة'`, `user:'مستخدم'`, `lookup:'قائمة'`, `settings:'إعدادات'`, `stocktake:'جرد'`, `price:'سعر'`.

**عدم تطابق موثّق:** الخريطة تستخدم `UPDATE_PRICES` (جمع) بينما الخادم يصدر `UPDATE_PRICE` و`FETCH_PRICE` و`AUTO_FETCH_PRICE`؛ وتتضمن `LOGIN` و`LOGOUT` مع أن الخادم لا يصدر `LOGOUT`؛ وتفتقد `CHANGE_PASSWORD` و`FETCH_PRICE` و`AUTO_FETCH_PRICE` و`UPDATE_STOCKTAKE_LINE`. لذلك تظهر هذه الرموز كنص خام في شاشة التدقيق. هذا سلوك حالي مقصود توثيقه كما هو؛ المجموعة المعيارية الصادرة فعلياً مذكورة في 8.4 و14.6.

#### 16.4.10 الإعدادات (`pages/Settings.tsx`)
العنوان «إعدادات المحل» والوصف «هوية المحل، قواعد الاحتساب، الربح، والأسعار — التغييرات تسري على كل الشاشات مباشرة.»؛ شريط «تغييرات غير محفوظة» مع حفظ/رجوع. البطاقات: «هوية المحل» (اسم المحل، رمز العملة، العيار الافتراضي)، «أكواد القطع» (تلقائي/يدوي)، «أساس احتساب الوزن» (خصم الحجر/الفصوص)، «سياسة الربح والتقريب الافتراضية» (النمط، القيمة، التقريب 0/5/10، زرا `fixedBasis`)، «أسعار الذهب» (مصدر الصرف، «تنبيه تقادم السعر بعد (ساعة)» بين 1 و168)، «صلاحيات البائع» («إظهار تكلفة الشراء والهامش للبائع» و«السماح للبائع بإضافة أصناف جديدة»)، و«ملخص القواعد الحالية». تحقق: اسم المحل والعملة مطلوبان، القيمة ≥0 وبحد أقصى 100 في `PERCENT`، الساعات 1–168. قسم «القوائم المرجعية» بستة تبويبات (التصنيفات، الموردون، المصانع، بلاد المنشأ، طرق الدفع، العيارات) مع إضافة/تعديل (القيمة والترتيب، «نشط ويظهر في القوائم المنسدلة») وحذف يُترجم إلى إخفاء عند الاستخدام؛ العيار محصور 1–24.

#### 16.4.11 المستخدمون (`pages/Users.tsx`)
بطاقات «إجمالي المستخدمين / المالك / البائعون / حسابات معطّلة» وجدول «حسابات النظام» (الاسم، اسم الدخول، الدور، الحالة، شارة «أنت»، إجراءات تعديل/كلمة مرور/تفعيل). نوافذ: «مستخدم جديد» و«تعديل البيانات» و«تغيير كلمة المرور»؛ الحقول الاسم الكامل، اسم الدخول، الدور، كلمة المرور/Tأكيد، ومفتاح «الحساب نشط ويمكنه تسجيل الدخول مباشرة». التحقق: اسم الدخول `[A-Za-z0-9._-]+` بطول ≥3، الاسم ≥2، وكلمة المرور ≥8؛ منع تعديل دور النفس أو تعطيلها.

#### 16.4.12 النسخ الاحتياطي (`pages/Backups.tsx`, `components/BackupStatusCard.tsx`, `lib/backup.ts`)
صفحة `/backups` للمالك: زر «نسخ احتياطي الآن» (`useRunBackup`)، شريط تحذير عند `health = none|warning` (مع سبب آخر فشل)، وتنبيه إن لم يوجد `mysqldump`. أربع بطاقات: «آخر نسخة ناجحة»، «النسخة التالية»، «النسخ المحفوظة» (العدد والحجم)، «الجدولة». بطاقة «الجدولة التلقائية»: مفتاح التفعيل، «تكرار النسخ» (6/12 ساعة، يوم، يومين، أسبوع)، «وقت النسخ اليومي» (معطّل مع الفواصل القصيرة)، «عدد النسخ المحفوظة» (3–90)، وزر «حفظ» لا يُفعَّل إلا مع تغيير صحيح. بطاقة «مكان الحفظ» تعرض المجلد المحلي والمجلد الإضافي (أو شرح ضبط `BACKUP_COPY_DIR`). جدول «سجل النسخ» (10 صفوف/صفحة): التاريخ، النوع، الحالة (مع «الملف غير موجود»)، الحجم، الملف/سبب الفشل، وأزرار تنزيل (عبر `fetch` ثم `Blob` للتحقق من الخطأ قبل الحفظ) وحذف بتأكيد. قسم قابل للطي «كيف أستعيد نسخة احتياطية؟». تتحدث الصفحة كل 3 ثوانٍ أثناء نسخة جارية وإلا كل دقيقة.

بطاقة «النسخ الاحتياطي» في الرئيسية (للمالك فقط، من `dashboard.backup`): شارة الصحة، آخر نسخة وحجمها، الموعد التالي، تحذير الفشل، زر «نسخ احتياطي الآن» ورابط «إدارة النسخ».

#### 16.4.13 دليل الاستخدام (`pages/Guide.tsx`)
صفحة `/guide` لكل مستخدم مسجّل: بحث نصي في كل الأقسام، شريط روابط سريعة، وأقسام قابلة للطي (البداية، الأسعار، القطع والأطقم، البيع، المخزون، الجرد، التقارير، الإعدادات، المستخدمون، النسخ الاحتياطي، أسئلة شائعة) — خطوات مرقّمة وملاحظات ورابط للشاشة. أقسام «للمالك» لا تظهر للبائع. المحتوى مصفوفة `SECTIONS` ثابتة في الملف.

### 16.5 الجداول المتجاوبة (`components/ui/data-table.tsx`)
`DataTable` يعرض جدولاً على `sm+` (`hidden ... sm:block` مع تمرير أفقي) وبطاقات `<ul>` على الشاشات الأصغر (`sm:hidden`)؛ `Column.hideOnMobile` يُخفي عموداً في البطاقات، و`labelOnMobile:false` يُخفي عنوانه ويجعل القيمة بعرض كامل. `loading` ⇒ `LoadingBlock rows=5`؛ لا صفوف ⇒ `EmptyState title='لا توجد بيانات'` أو ما يمرّره المستدعي؛ `onRowClick` يضيف مؤشراً وحالة hover. `Pagination` تخفي نفسها عند صفحة واحدة، وتعرض «عرض X–Y من Z» مع «السابق» و`page / pages` و«التالي».

### 16.6 إيصال الطباعة (`components/Receipt.tsx`)
`<div class="print-area">` بعرض أقصى 430px على الشاشة، خلفية بيضاء دائماً وألوان طباعة ثابتة (`#111,#555,#666,#777,#999,#bbb,#e2e2e2,#c0392b,#222`) لا تتبع الثيم. المحتوى بالترتيب: اسم المحل، «فاتورة بيع ذهب»؛ «رقم الفاتورة / التاريخ / البائع / العميل / الهاتف»؛ جدول أعمدة «الصنف / عيار / وزن / كمية / السعر»؛ «عدد القطع / طريقة الدفع / سعر الصرف (نقدي أو صك مصدق) / الإجمالي {currency}»؛ شريط «فاتورة ملغاة — السبب» عند الإلغاء؛ «شكراً لتعاملكم معنا · البضاعة المباعة لا تُرد إلا وفق سياسة المحل»؛ وسطر `invoiceNo · fmtDateTime` باتجاه LTR. الطباعة عبر `window.print()` من شاشة البيع أو التفاصيل، ولا يوجد توليد PDF في الخادم (راجع 1.4).

### 16.7 معجم المكوّنات والملفات
`components/ui/primitives.tsx` يوفّر `Button` (variants: primary/secondary/ghost/soft/danger، sizes، loading/icon)، `Card`, `Field` (label/hint/error/required)، `Input`, `NumberInput` (suffix)، `Select` (placeholder)، `Textarea`, `Checkbox`, `Badge` (tone success/danger/warning/gold/info/muted، مع نقطة `dot`)، `StatCard`، `PageHeader`، `SectionTitle`، `Tabs` (items بـlabel/icon/badge)، `EmptyState`، `Skeleton`/`LoadingBlock`، `Modal`، `ConfirmDialog`، و`Toast`. `components/Brand.tsx` يوفّر `GoldMark` و`Splash`. ملفات الواجهة: `app/App.tsx`, `layout/AppShell.tsx`, `components/{Receipt,Brand}.tsx`, `components/ui/{primitives,data-table,toast,overlay}.tsx`, `lib/{api,auth,theme,format,types,pricing-preview,copy,cn}.ts(x)`, و`components/BackupStatusCard.tsx`, `lib/backup.ts`, و`pages/{Login,Dashboard,Prices,Items,ItemForm,Sales,SaleNew,SaleDetail,Inventory,Stocktake,StocktakeDetail,Reports,Settings,Users,Backups,Guide}.tsx`.

> للاستخدام اليومي راجع [USER_MANUAL.md](USER_MANUAL.md)، وللفروق بين الإصدارات راجع [CHANGELOG.md](CHANGELOG.md)، ولخلفية القرارات راجع [ARCHITECTURE.md](ARCHITECTURE.md) و[DECISIONS.md](DECISIONS.md).
