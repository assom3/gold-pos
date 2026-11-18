import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Coins,
  DatabaseBackup,
  Gem,
  HelpCircle,
  LayoutDashboard,
  Search,
  Settings,
  ShoppingCart,
  Users,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Badge, Card, Input, PageHeader } from '../components/ui/primitives';

interface Section {
  id: string;
  title: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
  /** نص للبحث (يُجمع من الخطوات والنصائح) */
  steps: string[];
  tips?: string[];
  link?: { to: string; label: string };
  extra?: ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: 'start',
    title: 'البداية وتسجيل الدخول',
    icon: LayoutDashboard,
    steps: [
      'افتح النظام في المتصفح وسجّل الدخول باسم المستخدم وكلمة المرور التي أعطاك إياها المالك.',
      'الصفحة الرئيسية تعرض أسعار الغرام اليوم، مبيعات اليوم والشهر، حالة المخزون، وآخر الفواتير.',
      'شريط الأسعار أعلى الشاشة يعرض سعر الأونصة وسعر الصرف وسعر غرام عيار 21 دائماً.',
      'لتغيير كلمة المرور: اضغط اسمك أعلى الشاشة ثم «تغيير كلمة المرور». سيُنهى دخولك من الأجهزة الأخرى.',
      'استعمل زر الشمس/القمر لتبديل الوضع الفاتح والداكن.',
    ],
    tips: [
      'يوجد دورين: «مالك» يرى كل شيء، و«بائع» يرى البيع والمخزون والجرد فقط.',
      'الجلسة تنتهي بعد 7 أيام من الدخول؛ سجّل الخروج دائماً من جهاز مشترك.',
    ],
  },
  {
    id: 'prices',
    title: 'أسعار الذهب',
    icon: Coins,
    steps: [
      'من «أسعار الذهب» أدخل سعر الأونصة بالدولار وسعر الصرف المحلي ثم احفظ كل منهما.',
      'يحسب النظام سعر الغرام لكل عيار: سعر الأونصة × الصرف ÷ 31.1035 ثم × (العيار ÷ 24).',
      'إذا فُعّل الربط مع goldapi.dev يُحدَّث سعر الأونصة تلقائياً كل 10 دقائق، ويمكن للمالك الجلب فوراً بزر «جلب».',
      'سجل التحديثات في أسفل الصفحة يبيّن كل سعر ومصدره (يدوي أو تلقائي) ومن أدخله.',
    ],
    tips: [
      'الأسعار المعروضة للذهب الخام قبل المصنعية، وليست سعر القطعة النهائي.',
      'إذا مرّت ساعتان دون تحديث يظهر تنبيه «السعر متقادم»؛ حدّث الأسعار قبل البيع.',
      'سعر الأونصة يعدّله المالك فقط، أما سعر الصرف فيمكن للبائع تحديثه.',
    ],
    link: { to: '/prices', label: 'فتح أسعار الذهب' },
  },
  {
    id: 'items',
    title: 'إضافة وإدارة القطع والأطقم',
    icon: Gem,
    steps: [
      'من «الذهب» اضغط «إضافة قطعة ذهب» واختر النوع: قطعة مفردة أو طقم.',
      'القطعة: اكتب الاسم والعيار والوزن الإجمالي، ووزن الحجر والفصوص إن وُجدت، ويُحسب وزن الذهب الصافي تلقائياً.',
      'الطقم: أضف مكوّناته (خاتم، أسورة، سلسلة…) لكل منها عيار ووزن مستقل، والكود واحد للطقم كله.',
      'الكمية أكثر من 1 للقطع المتطابقة تماماً فقط، وتحتاج تأكيد أن الأوزان والمواصفات واحدة.',
      'بيانات الشراء: أدخل سعر الغرام الذي اشتريت به وعملة الشراء وسعر صرف يوم الشراء، فتُحسب التكلفة بالدينار تلقائياً.',
      'الكود يُولَّد تلقائياً (P-0001 للقطع، S-0001 للأطقم) إلا إذا ضبط المالك الإدخال اليدوي.',
      'تعديل الصنف وحذفه للمالك فقط، ولا يمكن تعديل صنف مباع أو حذف صنف له فواتير.',
    ],
    tips: [
      'إذا أدخلت سعراً للحجر فسيُخصم وزنه دائماً من وزن الاحتساب.',
      'لا تظهر حقول الشراء للبائع إلا إذا سمح المالك بإظهار التكلفة.',
      'يمكنك إضافة مورّد أو مصنّع جديد بزر + مباشرة من شاشة القطعة.',
    ],
    link: { to: '/items', label: 'فتح قائمة الذهب' },
  },
  {
    id: 'sales',
    title: 'البيع وإصدار الفاتورة',
    icon: ShoppingCart,
    steps: [
      'من «المبيعات» اضغط «بيع جديد». اكتب كود القطعة أو اسمها واضغط Enter أو انقر النتيجة لإضافتها للسلة.',
      'يقترح النظام سعر البيع من سعر السوق الحالي وسياسة الربح؛ ويمكنك تعديل سعر أي قطعة يدوياً.',
      'اختر سياسة الفاتورة: نسبة ربح، أو مبلغ ثابت (لكل غرام أو لكل قطعة)، أو سعر يدوي. وحدّد التقريب (بدون / 5 / 10).',
      'اختر طريقة الدفع: نقدي أو صك مصدق. يحدّد الاختيار سعر الصرف المحفوظ مع الفاتورة، ويمكن تعديل قيمة كل منهما لهذه الفاتورة فقط.',
      'أدخل اسم العميل وهاتفه (اختياري)، ثم «إتمام البيع» وأكّد.',
      'بعد التأكيد تُخصم الكميات فوراً وتظهر الفاتورة للطباعة. تجدها لاحقاً في قائمة المبيعات.',
      'إلغاء الفاتورة للمالك فقط من صفحة الفاتورة، مع كتابة السبب، وتعود القطع للمخزون.',
    ],
    tips: [
      'سياسة الربح والتقريب والصرف تُحفظ مع كل فاتورة ولا تغيّر إعدادات المحل.',
      'التكلفة والربح/الخسارة تظهر للمالك، وللبائع فقط إذا سمح المالك.',
      'اختيار طريقة دفع تحتوي كلمة «صك» يبدّل الصرف تلقائياً إلى صرف الصك.',
    ],
    link: { to: '/sales/new', label: 'بدء بيع جديد' },
  },
  {
    id: 'inventory',
    title: 'المخزون والتقييم',
    icon: Warehouse,
    steps: [
      'صفحة «المخزون والتقييم» تعرض قيمة كل ما هو متاح بسعر اللحظة، مجمّعة حسب العيار.',
      'القيمة = وزن أساس الاحتساب × سعر غرام العيار (+ سعر الحجر إن وُجد)، وتتحدث تلقائياً مع تغيّر الأسعار.',
      'للمالك (أو البائع بإذنه) تظهر التكلفة والهامش المقدّر لكل صنف.',
    ],
    link: { to: '/inventory', label: 'فتح المخزون' },
  },
  {
    id: 'stocktake',
    title: 'الجرد الدوري',
    icon: ClipboardCheck,
    steps: [
      'المالك يفتح جرداً (ربع سنوي / نصف سنوي / سنوي) من «الجرد»، فيأخذ النظام لقطة بالوزن المتوقع وقيمة كل صنف.',
      'لكل صنف اكتب الوزن المعدود ثم اخرج من الحقل ليُحفظ، أو أزل علامة «موجود» إن لم تجده.',
      'الصنف ذو الكمية الأكبر من 1 يُعدّ في سطر واحد، والوزن المتوقع فيه = وزن القطعة × الكمية.',
      'تقرير الفروقات يبيّن الناقص وفروق الأوزان والأصناف التي أُضيفت بعد فتح الجرد.',
      'المالك يغلق الجرد فيصبح نهائياً ولا يُعدَّل. لا يمكن فتح جرد جديد قبل إغلاق المفتوح.',
    ],
    link: { to: '/stocktake', label: 'فتح الجرد' },
  },
  {
    id: 'reports',
    title: 'التقارير',
    icon: BarChart3,
    ownerOnly: true,
    steps: [
      'المبيعات: إجمالي وعدد الفواتير حسب البائع وطريقة الدفع والعيار، مع تصفية بالتاريخ.',
      'الأرباح: الإيراد والتكلفة والربح وهامشه لكل بند مباع.',
      'المخزون: قيمة وتكلفة المتاح الآن. سجل الأسعار: كل تحديث ومن أدخله.',
      'سجل التعديلات: كل عملية مهمة (بيع، إلغاء، تعديل إعدادات، نسخ احتياطي…) باسم من نفّذها ووقتها.',
    ],
    tips: ['الفواتير الملغاة لا تدخل في تقارير المبيعات والأرباح.'],
    link: { to: '/reports', label: 'فتح التقارير' },
  },
  {
    id: 'settings',
    title: 'إعدادات المحل',
    icon: Settings,
    ownerOnly: true,
    steps: [
      'اسم المحل ورمز العملة (3 حروف مثل LYD) والعيار الافتراضي وطريقة توليد الأكواد.',
      'أساس احتساب الوزن: هل يُخصم وزن الحجر والفصوص من الوزن الإجمالي.',
      'سياسة الربح والتقريب الافتراضية، ومدة اعتبار السعر متقادماً.',
      'صلاحيات البائع: إظهار التكلفة له، والسماح له بإضافة الأصناف.',
      'القوائم المرجعية: التصنيفات والموردون والمصانع وبلاد المنشأ وطرق الدفع والعيارات.',
    ],
    tips: [
      'حذف قيمة مستعملة في أصناف أو فواتير يخفيها فقط حفاظاً على السجل.',
      'إعادة تسمية مصنّع تُحدِّث اسمه في كل أصنافه تلقائياً.',
    ],
    link: { to: '/settings', label: 'فتح الإعدادات' },
  },
  {
    id: 'users',
    title: 'المستخدمون',
    icon: Users,
    ownerOnly: true,
    steps: [
      'أضف بائعين أو مالكين جدداً، واختر لكل منهم اسم دخول وكلمة مرور (8 أحرف على الأقل).',
      'عطّل المستخدم بدل حذفه؛ ينتهي دخوله فوراً وتبقى فواتيره في السجل.',
      'أعد تعيين كلمة مرور أي مستخدم عند نسيانها.',
    ],
    tips: ['لا يمكن تعطيل آخر مالك نشط في النظام.'],
    link: { to: '/users', label: 'فتح المستخدمين' },
  },
  {
    id: 'backups',
    title: 'النسخ الاحتياطي',
    icon: DatabaseBackup,
    ownerOnly: true,
    steps: [
      'النظام ينشئ نسخة احتياطية مضغوطة من قاعدة البيانات تلقائياً حسب الجدولة (افتراضياً كل يوم الساعة 02:00).',
      'من «النسخ الاحتياطي» تستطيع: النسخ فوراً، تغيير التكرار ووقت التشغيل، وعدد النسخ المحفوظة، وتنزيل أي نسخة أو حذفها.',
      'بطاقة «النسخ الاحتياطي» في الرئيسية تنبّهك إذا لم تنجح أي نسخة حديثاً.',
      'انسخ ملفاً من النسخ إلى قرص خارجي أو سحابة بانتظام؛ أو فعّل النسخة الإضافية التلقائية بضبط BACKUP_COPY_DIR.',
      'الاستعادة تتم بأمر واحد من سطر الأوامر (راجع القسم أسفل صفحة النسخ الاحتياطي).',
    ],
    tips: [
      'الجدولة تعمل ما دام الخادم شغّالاً. عند تشغيله بعد توقف طويل يُنفّذ النسخة المتأخرة تلقائياً.',
      'ملف النسخة يحوي كل بيانات المحل، احفظه في مكان آمن.',
    ],
    link: { to: '/backups', label: 'فتح النسخ الاحتياطي' },
  },
  {
    id: 'faq',
    title: 'أسئلة شائعة وحلول سريعة',
    icon: HelpCircle,
    steps: [
      'لا يظهر سعر مقترح في البيع: تأكد من إدخال سعر الأونصة وسعر الصرف في صفحة الأسعار.',
      'ظهر «الكمية المتاحة أقل»: باع مستخدم آخر القطعة قبلك؛ أعد البحث.',
      'لا أستطيع تعديل صنف: التعديل للمالك فقط، والصنف المباع لا يُعدَّل.',
      'لا أستطيع فتح جرد جديد: يوجد جرد مفتوح، أغلقه أولاً.',
      'ظهرت رسالة «محاولات كثيرة»: انتظر عدة دقائق ثم أعد تسجيل الدخول.',
      'رسالة بها رقم مرجعي: أبلغ المسؤول بالرقم ليجده في سجل الخادم.',
    ],
  },
];

export default function Guide() {
  const { isOwner } = useAuth();
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return SECTIONS.filter((s) => isOwner || !s.ownerOnly).filter((s) => {
      if (!term) return true;
      const haystack = [s.title, ...s.steps, ...(s.tips ?? [])].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [isOwner, query]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="دليل الاستخدام"
        subtitle={
          isOwner
            ? 'شرح مختصر لكل شاشة في النظام، وكل ما يخص المالك والبائع.'
            : 'شرح مختصر لشاشات البيع والمخزون والجرد.'
        }
        actions={<BookOpen className="hidden size-5 text-gold sm:block" aria-hidden />}
      />

      <Card className="p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث في الدليل… مثال: إلغاء فاتورة، جرد، نسخ احتياطي"
            className="ps-9 pe-9"
            aria-label="بحث في الدليل"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:text-text"
              aria-label="مسح البحث"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visible.map((s) => (
            <a
              key={s.id}
              href={`#guide-${s.id}`}
              className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:border-borderstrong hover:text-text"
            >
              {s.title}
            </a>
          ))}
        </div>
      </Card>

      {visible.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted">لا نتائج مطابقة. جرّب كلمة أخرى.</Card>
      ) : null}

      <div className="space-y-3">
        {visible.map((s, index) => (
          <Card key={s.id} id={`guide-${s.id}`} className="scroll-mt-24 p-0">
            <details open={index === 0 || Boolean(query.trim())} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-goldsoft text-gold">
                  <s.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 text-[14px] font-semibold text-text">{s.title}</span>
                {s.ownerOnly ? <Badge tone="gold">للمالك</Badge> : null}
                <span className="text-xs text-muted transition-transform group-open:rotate-180" aria-hidden>
                  ▾
                </span>
              </summary>
              <div className="border-t border-border px-4 pb-4 pt-3">
                <ol className="list-decimal space-y-2 ps-5 text-[13px] leading-6 text-text marker:font-semibold marker:text-gold">
                  {s.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {s.tips && s.tips.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-border bg-surface2/50 px-3.5 py-3">
                    <p className="text-[11px] font-semibold text-gold">ملاحظات مهمة</p>
                    <ul className="mt-1.5 list-disc space-y-1 ps-5 text-[12px] leading-5 text-muted">
                      {s.tips.map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {s.extra}
                {s.link ? (
                  <Link to={s.link.to} className="mt-3 inline-flex text-xs font-semibold text-gold hover:underline">
                    {s.link.label} ←
                  </Link>
                ) : null}
              </div>
            </details>
          </Card>
        ))}
      </div>

      <p className="px-1 text-[11px] leading-5 text-muted">
        الدليل الكامل بصيغة PDF موجود في مجلد <span dir="ltr">docs/USER_MANUAL.pdf</span>.
      </p>
    </div>
  );
}
