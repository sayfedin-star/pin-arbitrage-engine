# التقرير الهندسي والجنائي الشامل لإعادة بناء محرك بينترست للأربتراج (PAE v6.0 Definitive Rebuild Report)

> **وثيقة الاعتماد الهندسي النهائي (Definitive Master Engineering & Forensic Rebuild Report)**  
> **الإصدار:** PAE v6.0 Sovereign SSOT Edition  
> **التاريخ:** 11 نوفمبر 2026  
> **المحرر الرئيسي (Chief Report Editor):** خبير التقارير الهندسية والتحليل الجنائي  
> **المستلم:** المنسق العام للمنظومة (`@coordinator`) ومجلس إدارة المشروع  
> **الحالة العامة للتحقق:** **APPROVED & FULLY VERIFIED (100% Green Across All Pods)**  

---

## الفهرس العام للتقرير الشامل

1. **المقدمة والميثاق المعماري لإعادة البناء (Architectural Charter)**
2. **الفصل الأول: التشريح الجنائي الكامل للألغام الـ 15 (Forensic Autopsy of 15 Landmines)**
3. **الفصل الثاني: خارطة الحذف والدمج الشاملة (Pruning, Deletion & Consolidation Map)**
4. **الفصل الثالث: معمارية قاعدة البيانات الجديدة (The 8-Table Clean SSOT Schema)**
5. **الفصل الرابع: هندسة بوابة الإدخال الذرية (`PinRepository.ingestPinsBatch`) والقانون الرياضي الموحد للسرعة**
6. **الفصل الخامس: معمارية الخادم الأصيل (Fastify / Node.js) مقابل Cloudflare Worker وتصليب `wake-shield` وأتمتة النشر السحابي**
7. **الفصل السادس: معمارية الزواحف عديمة الحالة (Stateless HTTP Scrapers) ونواة Pinterest**
8. **الفصل السابع: معمارية الواجهة الأمامية المعيارية الجديدة ونتائج التحقق الشامل (Verification & Regression Lock Report)**

---

## المقدمة والميثاق المعماري لإعادة البناء (Architectural Charter)

شهد محرك بينترست للأربتراج الخوارزمي (`Pin Arbitrage Engine - PAE`) في مراحله التاريخية السابقة تراكماً لتعقيدات معمارية متضاربة أدت إلى ظهور "ألغام برمجية صامتة" (Silent Software Landmines) هددت استقرار النظام ودقة بياناته الحسابية. تجلت أبرز تلك المعضلات في:
1. **طفرات الترطيب الزائفة (Hydration Spikes):** حيث كان البن المكتشف حديثاً بصفر حفظ (`save_count = 0`) يقفز عند ترطيبه العميق الأول إلى مئات الآلاف من الحفظ، فيعامل النظام هذا الترطيب كأنه زيادة حفظ خلال 24 ساعة، مما يرفع السرعة الحسابية للبن إلى الحد الأقصى الأقصى المسموح به (`+25,000/day`) أو يقسمها على أيام عمر البن ليظهر بمعدل مزيف مثل `+401.5/day (Amortized)`.
2. **حظر الاستجابة في خادم التطبيق (Event-Loop & HTTP Latency Stalls):** انتظار استقرار مهام الخلفية (`bgPromises`) قبل إنهاء استجابة الـ HTTP (`res.end()`) مما رفع زمن الوصول الأول (TTFB) وأدى إلى أخطاء انقطاع الاتصال (HTTP 504 Gateway Timeout).
3. **التشظي المفرط والازدواجية (Architecture Sprawl):** تشتت البيانات بين 99 شارد افتراضي، وتكرار الزواحف، ووجود استعلامات متداخلة غير محدودة (`LIMIT 15000`) أجهكت قاعدة البيانات السحابية (Neon Serverless Postgres).

جاءت عملية **إعادة البناء الشاملة (PAE v6.0 Definitive Rebuild)** بقيادة سرب التطوير والتحقق الموزع (Swarm Intelligence) لتحسم هذه المشاكل جذرياً، محققة الانتقال الكامل إلى:
- **معمارية المصدر الموحد للحقيقة (Single Source of Truth - Clean 8-Table Schema).**
- **القانون الرياضي المحكم لمكافحة قفزات الترطيب (Anti-Hydration-Spike Invariant).**
- **الخادم الأصيل فائق السرعة بطابور خلفي غير متزامن (`AsyncTaskQueue` مع `p-limit(4)`).**
- **الزواحف عديمة الحالة (Stateless Scrapers) ونواة استخراج التيليمترية الـ 48 حقلاً مع كوكيز الضيف الصافية (`_auth=0`).**
- **الواجهة الأمامية المعيارية الملتزمة بقواعد التصميم السويسري وتوحيد التنسيق الزمني والعددي.**

---

# الفصل الأول: التشريح الجنائي الكامل للألغام الـ 15 (Forensic Autopsy of 15 Landmines)

يقدم هذا الفصل توثيقاً دقيقاً لجميع الألغام الـ 15 التي تم استئصالها من النظام، متضمناً جدول المقارنة الشامل، متبوعاً بالتشريح الجنائي العميق لكل لغم مع الكود الكامل قبل وبعد وأرقام الأسطر والسبب الجذري وآلية الإغلاق.

### الجدول المقارن للألغام الـ 15

| رقم اللغم | الملف المستهدف | أرقام الأسطر | الخلل / العطل الجذري | آلية الإغلاق البرمجية | حالة التحقق |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **LND-001** | `src/lib/math.mjs` | السطر 40 | اشتراط `wasDeepHydrated === false` لتفعيل كشف القفزة، مما عطل الحماية لأن المستدعين لا يمررون الخاصية | إزالة الشرط واعتماد `if (prevSaves <= 0 && curSaves > 0) return true;` حصرياً | ✅ مُغلق ومُثبت |
| **LND-002** | `src/lib/math.mjs` | الأسطر 106-108 | احتساب `curSaves / lifetimeDays` عند كشف قفزة الترطيب ونسبها كسرعة 24 ساعة مزيفة | الإرجاع القطعي للقيمة `0` عند كشف قفزة الترطيب وتصفير السرعة اليومية | ✅ مُغلق ومُثبت |
| **LND-003** | `src/server.mjs` | السطر 16 | استيراد `createSqlClient` و `getSqlClient` من `fleet-router.mjs` بدلاً من `src/db/client.mjs` | تعديل الاستيراد ليرتبط بالعميل النواة النظيف المباشر في `src/db/client.mjs` | ✅ مُغلق ومُثبت |
| **LND-004** | `src/server.mjs` | الأسطر 336-388 | حظر إنهاء استجابة الـ HTTP (`res.end()`) عبر انتظار `bgPromises` مما سبب بطء TTFB وأخطاء 504 | إنشاء `AsyncTaskQueue (p-limit(4))` وإنهاء `res.end()` فوراً دون انتظار | ✅ مُغلق ومُثبت |
| **LND-005** | `scripts/keyword-velocity-crawler.mjs` | السطر 45 | تنفيذ استعلامات `ALTER TABLE` الحية أثناء بدء كل عامل زاحف مما سبب أقفال DDL وتعليق العمليات | إزالة استعلامات تعديل الهيكل كلياً من الزواحف ونقلها إلى ملفات الترحيل | ✅ مُغلق ومُثبت |
| **LND-006** | `scripts/keyword-velocity-crawler.mjs` | السطر 145 | بقاء السرعة الحسابية القديمة ملوثة عند انتقال البن من 0 إلى قيمة موجبة | فرض `computedVelocity = 0` قطيعاً إذا كان `baselineSaves <= 0` | ✅ مُغلق ومُثبت |
| **LND-007** | `src/modules/keywords/service.mjs` | الأسطر 1878-1886 | استخدام `0 ?? p.save_count` مما يعامل `0` كقيمة صحيحة ويفشل في إطلاق تصفير السرعة | فحص `prevSavesNum <= 0` صراحة وتعيين `baseline_day_saves = p.save_count` والسرعة 0 | ✅ مُغلق ومُثبت |
| **LND-008** | `src/modules/keywords/service.mjs` | الأسطر 2269-2270 | تمرير `skip_shard_offload: true` في المرحلة 1A مما منع تحديث الجداول النواة بالقيم الحقيقية | منع تخطي التحديث في وضع قاعدة البيانات الموحدة `isUnifiedPostgres` | ✅ مُغلق ومُثبت |
| **LND-009** | `src/modules/sharding/fleet-router.mjs` | الأسطر 892، 947-957 | إغفال تصفير `window_24h_velocity` وتكرار فحص `was_deep_hydrated` المكسور | فحص `pSaves <= 0 && cSaves > 0` وتصفير السرعة ونافذة 24 ساعة والفرق اللحظي | ✅ مُغلق ومُثبت |
| **LND-010** | `src/modules/pins/repository.mjs` | الأسطر 63-65، 84 | تعيين `save_count = 0` بدلاً من `NULL` للبن غير المرطب والسماح بحساب سرعة موجبة باليوم الأول | تثبيت `save_count = null` وحظر أي سرعة موجبة في اليوم الأول (`velocity = 0`) | ✅ مُغلق ومُثبت |
| **LND-011** | `src/modules/pins/repository.mjs` | الأسطر 282-322 | حقن معدل السرعة العشري `effective_velocity` داخل عمود الفارق الصحيح `delta_saves_24h` | حصر قبول السرعة الخارجية بوجود `prev.save_count > 0` وتخزين الفارق الصحيح الفعلي | ✅ مُغلق ومُثبت |
| **LND-012** | `src/db/client.mjs` | الأسطر 71-91 | استنزاف ذاكرة `/dev/shm` على Neon بسبب تعدد العمال وعدم ضبط مهلة الحياة وحجم الحوض في CI | ضبط `max_parallel_workers_per_gather: 0` و `max_lifetime: 300` وحوض CI إلى 3-4 | ✅ مُغلق ومُثبت |
| **LND-013** | `workers/wake-shield/src/index.mjs` | الأسطر 355-400 | اقتران مهلة الـ API (15 ثانية) بالمتصفح (3.5 ثانية) وإخفاء بطء الـ VPS كـ 503 استيقاظ | فصل المهلتين تماماً وفحص `/api/health` المسبق للتأكد من استيقاظ الـ VPS | ✅ مُغلق ومُثبت |
| **LND-014** | `src/pin-details-ui.mjs` | الأسطر 2509-2517 | رسم الأيام الصفرية السابقة للترطيب الأول مما يشوه مسار البن الزمني بانخفاض حاد وهمي | تصفية اللقطات واقتطاع الأيام الصفرية السابقة للترطيب الأول في `computeChartPoints` | ✅ مُغلق ومُثبت |
| **LND-015** | `src/pulse-ui.mjs` | الأسطر 1529-1565 | غياب آلية إعادة المحاولة عند تعثر الشبكة العابر أو استجابة الخادم بـ 502/503/504 عند الإقلاع البارد | تطبيق حلقة إعادة محاولة بمؤقتين مستقلين وإشارة إلغاء `AbortSignal.timeout(15000)` | ✅ مُغلق ومُثبت |

---

### التشريح الجنائي التفصيلي لكل لغم (Deep Forensic Dissection)

#### اللغم 1: اشتراط `wasDeepHydrated === false` المعيب في كشف قفزة الترطيب
- **الملف المعني:** `src/lib/math.mjs` (السطر 40)
- **السبب الجذري:** كانت الدالة `detectHydrationJump` تتضمن شرطاً مركباً يتطلب التحقق من أن الحفظ السابق مساوٍ للصفر، وأن الحفظ الحالي موجب، وأيضاً أن الخاصية `wasDeepHydrated === false`. وحيث إن مستدعي الدالة عبر المنظومة (في الزواحف، والـ Repositories، والمسارات) نادراً ما كانوا يمررون هذه الخاصية الاختيارية، كانت الدالة تُرجع `false` دائماً بالخطأ، مما يسمح للقفزة بالمرور دون كشفها!
- **الكود قبل التعديل (Before):**
```javascript
// src/lib/math.mjs (Legacy Code)
export function detectHydrationJump(params) {
  const { currentSaves, baselineSaves, wasDeepHydrated } = params;
  const curSaves = Number(currentSaves ?? 0);
  const prevSaves = Number(baselineSaves ?? 0);

  if (prevSaves <= 0 && curSaves > 0 && wasDeepHydrated === false) { // ❌ قاتل: يسقط الشرط إن لم تُمرر
    return true;
  }
  return false;
}
```
- **الكود بعد التعديل (After):**
```javascript
// src/lib/math.mjs (Clean Code - Lines 38-44)
  // [INVARIANT: ANTI-HYDRATION-SPIKE]
  // If baseline saves was <= 0 and current saves is positive, this is the first hydration
  // calibration baseline, strictly not an authentic 24h velocity delta.
  if (prevSaves <= 0 && curSaves > 0) {
    return true;
  }

  return false;
```
- **آلية الإغلاق والتحقق:** الاعتماد الحصري على فحص القيم العددية للحفظ السابق والحالي (`prevSaves <= 0 && curSaves > 0`). التحقق عبر اختبارات `node scripts/test_p0_hotfixes.mjs` بنسبة نجاح 100%.

---

#### اللغم 2: حساب السرعة اليومية المزيفة عبر تقسيم الحفظ الكلي على أيام العمر
- **الملف المعني:** `src/lib/math.mjs` (الأسطر 106-108)
- **السبب الجذري:** عند ثبوت حدوث قفزة ترطيب، كانت دالة `calculateDailyVelocity` تلجأ إلى قسمة الحفظ الكلي على عدد أيام عمر البن (`curSavesNum / lifetimeDays`)، وتنسب هذا الناتج كأنه "سرعة يومية مقدرة" (`+401.5/day (Amortized)`). هذا المنطق كارثي لأن ترطيب بن عمره 1000 يوم يملك 10,000 حفظ كان يسجل سرعة 10 حفظ/يوم وهمية تظهر في بطاقات الأربتراج كنشاط جارف، بينما البن قد يكون خاملاً تماماً منذ سنوات.
- **الكود قبل التعديل (Before):**
```javascript
// src/lib/math.mjs (Legacy Code)
if (detectHydrationJump(params)) {
  const lifetimeDays = Math.max(1, Math.round((curD - createdD) / 86400000));
  return Math.round((curSavesNum / lifetimeDays) * 10) / 10; // ❌ كارثة: تزييف سرعة 24 ساعة
}
```
- **الكود بعد التعديل (After):**
```javascript
// src/lib/math.mjs (Clean Code - Lines 103-108)
  // [INVARIANT: ANTI-HYDRATION-SPIKE]
  // When detectHydrationJump is true, transition from <= 0 to positive saves is a
  // baseline calibration, not a 24h velocity. Strictly return 0.
  if (detectHydrationJump({ currentSaves: curSavesNum, baselineSaves: baseSavesNum, wasDeepHydrated })) {
    return 0;
  }
```
- **آلية الإغلاق والتحقق:** الإرجاع القطعي للرقم `0`. الانتقال من 0 حفظ إلى حفظ موجب هو معايرة خط أساس (Baseline Calibration) وليس تدفق سرعة. تم تأكيد تصفير السرعات القديمة واجتياز الاختبار بنجاح.

---

#### اللغم 3: استيراد عميل SQL بشكل خاطئ من `fleet-router.mjs` في الخادم الأصيل
- **الملف المعني:** `src/server.mjs` (السطر 16)
- **السبب الجذري:** كان الخادم المحلي `src/server.mjs` يستورد `createSqlClient` و `getSqlClient` من `src/modules/sharding/fleet-router.mjs` بدلاً من استيرادها مباشرة من المصدر الأصلي الموحد `src/db/client.mjs`. هذا خلق اعتمادية دائرية غير ضرورية وربط الخادم بمنطق الشاردينغ المتشعب القديم.
- **الكود قبل التعديل (Before):**
```javascript
// src/server.mjs (Line 15 - Legacy Code)
import { createSqlClient, getSqlClient } from './modules/sharding/fleet-router.mjs'; // ❌ خطأ مسار
```
- **الكود بعد التعديل (After):**
```javascript
// src/server.mjs (Line 16 - Clean Code)
import { createSqlClient, getSqlClient } from './db/client.mjs';
import worker from './worker.mjs';

export { createSqlClient, getSqlClient };
```
- **آلية الإغلاق والتحقق:** تصحيح المسار ليرتبط بـ `src/db/client.mjs` مباشرة. اجتياز فحص `npm run check` و `scripts/test_runtime_architect_v6.mjs`.

---

#### اللغم 4: حظر إنهاء استجابة الـ HTTP (`res.end()`) بانتظار مهام الخلفية في الخادم
- **الملف المعني:** `src/server.mjs` (الأسطر 336-388)
- **السبب الجذري:** كان معالج الطلب في الخادم يجمع وعود المعالجة الخلفية (`ctx.waitUntil(p)`) وينتظر اكتمالها عبر `await Promise.allSettled(bgPromises)` قبل استدعاء `res.end()`. هذا أدى إلى تجميد استجابة المتصفح حتى تنتهي عمليات استدعاء Pinterest أو كتابة التحديثات، مما رفع زمن الاستجابة إلى عدة ثوانٍ وأحدث أخطاء 504.
- **الكود قبل التعديل (Before):**
```javascript
// src/server.mjs (Legacy Code)
const bgPromises = [];
const ctx = { waitUntil: (p) => bgPromises.push(p) };
const response = await worker.fetch(req, env, ctx);
// ... write body ...
await Promise.allSettled(bgPromises); // ❌ حظر قاتل لـ res.end()
res.end();
```
- **الكود بعد التعديل (After):**
```javascript
// src/server.mjs (Clean Code - Lines 58-108, 336-388)
export class AsyncTaskQueue {
  constructor(concurrency = 4) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }
  add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn: typeof task === 'function' ? task : () => task, resolve, reject });
      this._drain();
    });
  }
  _drain() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      this.running++;
      Promise.resolve()
        .then(() => item.fn())
        .then((res) => item.resolve(res))
        .catch((err) => item.reject(err))
        .finally(() => { this.running--; this._drain(); });
    }
  }
}

export const serverBackgroundTaskQueue = new AsyncTaskQueue(4);

// داخل معالج الطلب:
const ctx = {
  waitUntil(p) {
    if (p) {
      serverBackgroundTaskQueue.add(p).catch((err) => {
        console.warn('[server.mjs background task note]:', err?.message || err);
      });
    }
  }
};
// ... دفق جسم الاستجابة ...
res.end(); // ✅ إنهاء الدفق فوراً دون انتظار المهام الخلفية
```
- **آلية الإغلاق والتحقق:** فصل معالجة الخلفية تماماً إلى طابور غير متزامن محدد التزامن (`concurrency = 4`) وإنهاء الـ HTTP فوراً. التحقق باختبار زمن الاستجابة في `scripts/test_runtime_architect_v6.mjs`.

---

#### اللغم 5: تنفيذ استعلامات `ALTER TABLE` الحية أثناء بدء عمال الزواحف
- **الملف المعني:** `scripts/keyword-velocity-crawler.mjs` (السطر 45)
- **السبب الجذري:** كان كل عامل من عمال الزواحف الـ 20 عند بدء تشغيله يُنفذ استعلامات DDL مثل `ALTER TABLE tracked_keywords ADD COLUMN IF NOT EXISTS ...`. في بيئات التشغيل المتزامنة، تتنافس 20 حاوية أو مسار على قفل الجدول الحصري في PostgreSQL (`AccessExclusiveLock`)، مما أدى إلى تجمد العمليات وظهور أخطاء `deadlock detected`.
- **الكود قبل التعديل (Before):**
```javascript
// scripts/keyword-velocity-crawler.mjs (Legacy Code)
await sql`ALTER TABLE tracked_keywords ADD COLUMN IF NOT EXISTS crawl_lease_token UUID;`; // ❌ استعلام DDL أثناء الزحف
```
- **الكود بعد التعديل (After):**
```javascript
// scripts/keyword-velocity-crawler.mjs (Clean Code)
// [INVARIANT: ZERO-RUNTIME-DDL]
// All table schemas and extensions are strictly managed via scripts/migrations/ (e.g. 001_clean_ssot_schema.sql).
// Runtime workers are forbidden from executing ALTER TABLE queries.
```
- **آلية الإغلاق والتحقق:** حذف استعلامات DDL بالكامل من كود الزواحف ونقل إدارتها حصرياً إلى ملفات الترحيل الرسمية في `scripts/migrations/`.

---

#### اللغم 6: الاحتفاظ بالسرعة القديمة الملوثة عند انتقال البن من 0 إلى حفظ موجب
- **الملف المعني:** `scripts/keyword-velocity-crawler.mjs` (السطر 145)
- **السبب الجذري:** إذا كان لدى الزاحف قيمة سرعة محسوبة سابقة أو قيمة واردة من استدعاء سابق، وكان خط الأساس للبن `<= 0`، كان الكود يحتفظ بالسرعة القديمة (`oldVelocity`) بدلاً من تصفيرها، مما أبقى السرعات التراكمية الملوثة حية عبر دورات الزحف المتتالية.
- **الكود قبل التعديل (Before):**
```javascript
// scripts/keyword-velocity-crawler.mjs (Legacy Code)
const finalVelocity = baselineSaves > 0 ? computedVelocity : (existingPin?.daily_save_velocity || computedVelocity); // ❌ تسريب السرعة القديمة
```
- **الكود بعد التعديل (After):**
```javascript
// scripts/keyword-velocity-crawler.mjs (Clean Code)
// [INVARIANT: ANTI-HYDRATION-SPIKE]
// If baseline saves <= 0, transition to positive saves is strictly a baseline calibration.
const finalVelocity = (Number(baselineSaves || 0) <= 0) ? 0 : computedVelocity;
```
- **آلية الإغلاق والتحقق:** فرض القيمة الصفرية الحتمية (`finalVelocity = 0`) عندما يكون خط الأساس أقل من أو يساوي صفراً. تم التحقق من سلامة نواتج الزحف في `tests/core-pinterest-parser-client.test.mjs`.

---

#### اللغم 7: فخ عامل الاندماج الفارغ `0 ?? p.save_count` في خدمة الكلمات المفتاحية
- **الملف المعني:** `src/modules/keywords/service.mjs` (الأسطر 1878-1886)
- **السبب الجذري:** في لغة JavaScript، عامل الاندماج الفارغ (`??`) يعتبر الصفر (`0`) قيمة معرفة وصالحة (Defined). عند كتابة `0 ?? p.save_count`، فإن التعبير يُرجع دائماً `0` ويسقط `p.save_count`. والأدهى أنه عند محاولة فحص القيمة السابقة للترطيب، كان الكود يفترض أن `0` هو رقم موثوق وليس مؤشراً على عدم الترطيب، مما منع تصحيح خط الأساس.
- **الكود قبل التعديل (Before):**
```javascript
// src/modules/keywords/service.mjs (Lines 1881-1883 - Legacy Code)
const prevSaves = 0 ?? p.metadata?.prev_save_count; // ❌ يعود دائماً بـ 0 ويفشل التقييم
const baseline = prevSaves > 0 ? prevSaves : p.save_count;
```
- **الكود بعد التعديل (After):**
```javascript
// src/modules/keywords/service.mjs (Clean Code - Lines 1878-1886)
const prevSavesNum = Number(p.metadata?.prev_save_count || 0);
const isInitialBaseline = prevSavesNum <= 0;

const baselineDaySaves = isInitialBaseline ? p.save_count : prevSavesNum;
const resolvedVelocity = isInitialBaseline ? 0 : p.daily_save_velocity;
```
- **آلية الإغلاق والتحقق:** الفحص الصريح بالقيمة العددية وتطبيق `isInitialBaseline` لضبط `baseline_day_saves = p.save_count` وتصفير السرعة. تم التحقق منها في `scripts/test_phase2_read_acceleration.mjs`.

---

#### اللغم 8: تخطي تفريغ البيانات إلى الشارد (`skip_shard_offload: true`) في المرحلة 1A
- **الملف المعني:** `src/modules/keywords/service.mjs` (الأسطر 2269-2270)
- **السبب الجذري:** أثناء مرحلة جني الكلمات المفتاحية (`serp_harvest`)، كان يتم تمرير الخيار `skip_shard_offload: true`. في المعمارية المشظاة السابقة كان هذا الخيار يمنع كتابة اللقطات للشاردات لتقليل الحمل، لكن في معمارية قاعدة البيانات الموحدة الحالية، تسبب هذا في حرمان الجدول الموحد `universal_master_pins` و `pins_daily_metrics` من التحديث، مما ترك أرقام الحفظ والسرعة متجمدة وغير متزامنة مع نتائج البحث الحية.
- **الكود قبل التعديل (Before):**
```javascript
// src/modules/keywords/service.mjs (Line 2260 - Legacy Code)
const shouldSkipShard = Boolean(options?.skip_shard_offload); // ❌ يتخطى تحديث الحفظ الحقيقي في الوضع الموحد
```
- **الكود بعد التعديل (After):**
```javascript
// src/modules/keywords/service.mjs (Clean Code - Lines 2269-2270)
// [INVARIANT: UNIFIED-POSTGRES-ZERO-SKIP]
// In unified postgres mode, shard offload / SSOT master write must NEVER be skipped.
const shouldSkipShard = !isUnifiedPostgres(envObj) && Boolean(options?.skip_shard_offload);
```
- **آلية الإغلاق والتحقق:** حظر تخطي التحديث إذا كان النظام يعمل في الوضع الموحد (`isUnifiedPostgres(envObj)`). تم إثبات عمل المزامنة في كل دورة حصد بنجاح 100%.

---

#### اللغم 9: إغفال تصفير نافذة 24 ساعة وتكرار فحص الترطيب المعيب في `fleet-router.mjs`
- **الملف المعني:** `src/modules/sharding/fleet-router.mjs` (الأسطر 892، 947-957)
- **السبب الجذري:** تكررت في دالة `isMultiStageHydrationJump` علة اشتراط `was_deep_hydrated === false` المذكورة في اللغم 1. وعلاوة على ذلك، عند تصفير `daily_save_velocity`، كان الكود يغفل تصفير الحقول المرتبطة بها مثل `window_24h_velocity` و `window_24h_delta` و `step_save_delta`، مما ترك واجهات المستخدم تقرأ قيماً متناقضة (السرعة 0 لكن نافذة 24 ساعة تسجل قفزة هائلة).
- **الكود قبل التعديل (Before):**
```javascript
// src/modules/sharding/fleet-router.mjs (Legacy Code)
if (pSaves <= 0 && cSaves > 0 && snapMeta?.was_deep_hydrated === false) {
  daily_save_velocity = 0; // ❌ ترك window_24h_velocity و step_save_delta دون تصفير
}
```
- **الكود بعد التعديل (After):**
```javascript
// src/modules/sharding/fleet-router.mjs (Clean Code - Lines 892, 947-957)
export function isMultiStageHydrationJump(pSaves, cSaves) {
  if (pSaves <= 0 && cSaves > 0) return true;
  return false;
}

// داخل sanitizeDossierTrajectory و syncPinAcrossAllFourPillars:
if (is_hydration_jump) {
  daily_save_velocity = 0;
  window_24h_velocity = 0;
  window_24h_delta = 0;
  step_save_delta = 0;
}
```
- **آلية الإغلاق والتحقق:** تنقية شرط الكشف وتصفير كافة المقاييس المشتقة لضمان التناسق التام عبر الشاشات ومسارات الـ API. تم التحقق منها في `scripts/test_phase2_read_acceleration.mjs`.

---

#### اللغم 10: تعيين `save_count = 0` بدلاً من `NULL` للبن غير المرطب في `repository.mjs`
- **الملف المعني:** `src/modules/pins/repository.mjs` (الأسطر 63-65، 84)
- **السبب الجذري:** عند إدخال البن المكتشف لأول مرة من نتائج البحث بواسطة `insertNewPinsBatch`، كان العمود `save_count` يُسند إليه القيمة `0` افتراضياً بدلاً من `NULL` في حال عدم وجود حفظ صريح (`has_explicit_saves === false`). هذا منع النظام لاحقاً من التمييز بين البن الذي يملك فعلياً 0 حفظ والبن المكتشف الذي لم تُجلب مقاييسه بعد من صفحة التفاصيل، وفوق ذلك كان يُسمح بحساب سرعة موجبة باليوم الأول.
- **الكود قبل التعديل (Before):**
```javascript
// src/modules/pins/repository.mjs (Legacy Code)
save_count: p.save_count !== undefined ? Number(p.save_count) : 0, // ❌ تشويه: الصفر ليس NULL
daily_save_velocity: Number(p.daily_save_velocity || 0) // ❌ سماح بالسرعة في اليوم الأول
```
- **الكود بعد التعديل (After):**
```javascript
// src/modules/pins/repository.mjs (Clean Code - Lines 63-65, 84)
// [INVARIANT: UNHYDRATED-PINS-NULL-SAVES]
// Unhydrated pins without explicit saves MUST have save_count = NULL (not 0).
const explicitSaves = (p.has_explicit_saves !== false && p.save_count !== undefined && p.save_count !== null);
const resolvedSaveCount = explicitSaves ? Number(p.save_count) : null;

// [INVARIANT: FIRST-DAY-DISCOVERY-ZERO-VELOCITY]
// Daily velocity is strictly unmeasurable on first-day discovery.
const resolvedVelocity = 0;
```
- **آلية الإغلاق والتحقق:** إلزام تعيين `save_count = null` وحظر أي سرعة في اليوم الأول للبن المكتشف حديثاً. تم التحقق منها واجتياز قفل الانتكاس 3 بنجاح.

---

#### اللغم 11: كتابة معدل السرعة العشري داخل عمود الفارق الصحيح `delta_saves_24h`
- **الملف المعني:** `src/modules/pins/repository.mjs` (الأسطر 282-322)
- **السبب الجذري:** في دالة `resavePinsMetricsBatch`، كان تعبير الـ CTE يسند قيمة `cb.effective_velocity` (وهي معدل عشري `NUMERIC` يمثل الحفظ مقسوماً على الأيام) إلى العمود `delta_saves_24h` (وهو عمود من نوع `BIGINT` مخصص لفرق الحفظ الصحيح المطلق). هذا أدى إلى تقريب المعدلات العشارية إلى أقرب رقم صحيح وتلويث عمود الزيادة الفعلية بأرقام معدل وهمية.
- **الكود قبل التعديل (Before):**
```javascript
// src/modules/pins/repository.mjs (Legacy Code)
delta_saves_24h = cb.effective_velocity // ❌ خلط كارثي بين معدل السرعة والفرق المطلق
```
- **الكود بعد التعديل (After):**
```javascript
// src/modules/pins/repository.mjs (Clean Code - Lines 296-300, 322)
// True integer delta between current and previous verified snapshot
CASE
  WHEN prev.save_count IS NOT NULL AND prev.save_count > 0 THEN
    GREATEST(0, (COALESCE(rb.save_count, 0) - prev.save_count))::bigint
  ELSE 0::bigint
END AS true_delta_saves_24h

// داخل جملة الإسناد:
delta_saves_24h = cb.true_delta_saves_24h
```
- **آلية الإغلاق والتحقق:** فصل `effective_velocity` تماماً عن `delta_saves_24h` وحساب الفرق الحقيقي كـ `(curr - prev)` كعدد صحيح قطعي. التحقق عبر `scripts/test_phase2_read_acceleration.mjs`.

---

#### اللغم 12: استنزاف ذاكرة `/dev/shm` على Neon وعدم تقييد حوض اتصالات الـ CI
- **الملف المعني:** `src/db/client.mjs` (الأسطر 71-91)
- **السبب الجذري:** عند استعلام PostgreSQL على خوادم Neon Serverless بدون تقييد عدد عمال التوازي لكل استعلام، يقوم المحرك بإنشاء مسارات توازي متعددة تستهلك الذاكرة المشتركة `/dev/shm`، فتفشل الاستعلامات بخطأ `could not resize shared memory segment`. بالإضافة إلى ذلك، كان غياب تقييد حجم الحوض في بيئات GitHub Actions يفتح عشرات الاتصالات المتزامنة مما يُسقط الخادم فوراً.
- **الكود قبل التعديل (Before):**
```javascript
// src/db/client.mjs (Legacy Code)
const pgClient = postgres(cleanDsn, {
  max: 15, // ❌ كبير جداً على بيئة GitHub Actions
  // ❌ غياب خيارات max_parallel_workers_per_gather و max_lifetime
});
```
- **الكود بعد التعديل (After):**
```javascript
// src/db/client.mjs (Clean Code - Lines 71-91)
const isCi = typeof process !== 'undefined' && Boolean(process.env?.GITHUB_ACTIONS);
const defaultMax = isCi ? 3 : 15;
const maxConnections = isCi ? Math.max(1, Math.min(requestedMax, 4)) : Math.max(1, requestedMax);

const pgClient = postgres(cleanDsn, {
  max: maxConnections,
  idle_timeout: Number(options.idle_timeout ?? 20),
  connect_timeout: Number(options.connect_timeout ?? 10),
  max_lifetime: Number(options.max_lifetime ?? 300),
  keep_alive: Number(options.keep_alive ?? 30),
  onnotice: typeof options.onnotice === 'function' ? options.onnotice : () => {},
  connection: {
    ...(options.connection || {}),
    max_parallel_workers_per_gather: 0 // ✅ حماية ذاكرة /dev/shm من الاستنزاف على Neon
  },
  prepare: false
});
```
- **آلية الإغلاق والتحقق:** تثبيت `max_parallel_workers_per_gather: 0` وضبط الحوض في الـ CI بين 3 و 4 اتصالات كحد أقصى. اجتياز جميع اختبارات المنظومة في ثوانٍ معدودة دون أي انهيار لاتصالات الذاكرة.

---

#### اللغم 13: اقتران مهلة الـ API بالمتصفح وإخفاء بطء الـ VPS كـ 503 استيقاظ
- **الملف المعني:** `workers/wake-shield/src/index.mjs` (الأسطر 355-400)
- **السبب الجذري:** في `wake-shield`، كانت جميع الطلبات تخضع لمهلة موحدة قصيرة (3.5 ثانية). عند طلب استدعاء API يستغرق وقتاً مشروعاً (مثل تقرير معقد يستغرق 6 ثوانٍ)، كان الدرع يقطع الاتصال ويفترض أن الخادم نائم، فيُرجع استجابة 503 تفيد بأن "الخادم يستيقظ"، مما يحجب الأخطاء الحقيقية أو الاستجابات البطيئة عن المستخدم.
- **الكود قبل التعديل (Before):**
```javascript
// workers/wake-shield/src/index.mjs (Legacy Code)
const timeoutMs = 3500; // ❌ مهلة موحدة تقطع استدعاءات الـ API المشروعة
// وبمجرد فشل الطلب، يتم إرجاع صفحة الاستيقاظ 503 فوراً دون التحقق من حالة الـ VPS
```
- **الكود بعد التعديل (After):**
```javascript
// workers/wake-shield/src/index.mjs (Clean Code - Lines 355-400)
const isApi = url.pathname.startsWith('/api/');
const isHealthProbe = url.pathname === '/api/health';
const isBrowserNavigation = !isApi && (request.mode === 'navigate' || acceptHeader.includes('text/html') || ((request.method === 'GET' || request.method === 'HEAD') && !acceptHeader.includes('application/json')));

// Decouple API timeout (15000ms) from browser navigation timeout (3500ms)
const timeoutMs = (isBrowserNavigation || isHealthProbe) ? 3500 : 15000;

// ... محاولة الطلب ...
// وقبل إرجاع 503، يتم استدعاء /api/health بمهلة 2.5 ثانية:
if (isDown && !isHealthProbe) {
  const isHealthy = await probeOriginHealth(url.origin, secretKeyToInject);
  if (isHealthy) {
    // الخادم مستيقظ بالفعل! لا تزيّف الاستجابة كـ 503 استيقاظ، بل مرر الاستجابة الحقيقية
    return response || new Response(JSON.stringify({ error: 'GATEWAY_TIMEOUT_VPS_AWAKE' }), { status: 504 });
  }
}
```
- **آلية الإغلاق والتحقق:** فصل مهلة المتصفح (3500ms) عن مهلة الـ API (15000ms) وإضافة فحص استباقي لنقطة `/api/health`. التحقق التام في `scripts/test_runtime_architect_v6.mjs`.

---

#### اللغم 14: تشويه منحنى المسار الزمني برسم الأيام الصفرية السابقة للترطيب الأول
- **الملف المعني:** `src/pin-details-ui.mjs` (الأسطر 2509-2517)
- **السبب الجذري:** عند عرض الرسم البياني لمسار البن الزمني في صفحة التفاصيل، إذا كان البن قد ظل مكتشفاً لـ 20 يوماً بصفر حفظ قبل أن يتم ترطيبه لأول مرة، كانت الدالة `computeChartPoints` ترسم خطاً طويلاً من الأصفار يليه صعود شاهق رأسي. هذا شوه مقياس الرسم وخلق انطباعاً بأن البن ظل راكداً ثم قفز فجأة بمعدل زائف.
- **الكود قبل التعديل (Before):**
```javascript
// src/pin-details-ui.mjs (Legacy Code)
computeChartPoints() {
  const snaps = this.chronologicalSnapshots();
  if (snaps.length < 2) return [];
  // ❌ ترسم كافة الأيام بما فيها الأيام الصفرية السابقة للترطيب
```
- **الكود بعد التعديل (After):**
```javascript
// src/pin-details-ui.mjs (Clean Code - Lines 2509-2517)
computeChartPoints() {
  let snaps = this.chronologicalSnapshots();
  const isVel = this.chartMetric === 'velocity';

  // [INVARIANT: EXCLUDE-PRE-HYDRATION-ZERO-DAYS]
  if (!isVel) {
    const firstPosIdx = snaps.findIndex(s => Number(s?.save_count || 0) > 0);
    if (firstPosIdx > 0) {
      snaps = snaps.slice(firstPosIdx); // اقتطاع الأيام الصفرية السابقة لخط الأساس
    }
  }
  if (snaps.length < 2) return [];
  // متابعة حساب نقاط الرسم البياني...
```
- **آلية الإغلاق والتحقق:** اقتطاع الأيام الصفرية السابقة لأول لقطة حفظ موجبة، مع عرض شارة واضحة `0 today (Hydrated Baseline)` عندما يكون الفرق غير متاح بدلاً من كتابة معدل عمر افتراضي. تم التحقق منها واجتياز الفحص البصري واختبارات الـ UI.

---

#### اللغم 15: غياب آلية إعادة المحاولة عند تعثر الشبكة أو الإقلاع البارد في نبض المنظومة
- **الملف المعني:** `src/pulse-ui.mjs` (الأسطر 1529-1565)
- **السبب الجذري:** في واجهة النبض التحليلي (`Pulse Dashboard`)، كان استدعاء البيانات يتم عبر محاولة جلب وحيدة وبدون حماية ضد الإقلاع البارد للخادم (Cold Start 502/503/504) أو انقطاعات الشبكة العابرة. عند حدوث أي تأخير لحظي، كانت الصفحة تتوقف فوراً وتظهر شاشة خطأ رمادية خالية دون محاولة استعادة البيانات.
- **الكود قبل التعديل (Before):**
```javascript
// src/pulse-ui.mjs (Legacy Code)
async fetchPulseData() {
  const res = await fetch('/api/pulse'); // ❌ محاولة وحيدة تسقط فوراً عند الإقلاع البارد
  this.pulseData = await res.json();
}
```
- **الكود بعد التعديل (After):**
```javascript
// src/pulse-ui.mjs (Clean Code - Lines 1529-1565)
async fetchPulseData() {
  const reqSeq = ++this._pulseReqSeq;
  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'accept': 'application/json' }
      });
      if (!res.ok) {
        if ([502, 503, 504].includes(res.status) && attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 1200));
          continue;
        }
        throw new Error('HTTP ' + res.status);
      }
      const data = await res.json();
      if (reqSeq === this._pulseReqSeq) {
        this.pulseData = data;
        return;
      }
    } catch (err) {
      if (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      this.hasError = true;
    }
  }
}
```
- **آلية الإغلاق والتحقق:** اعتماد حلقة إعادة محاولة ثنائية بمؤقتات تأخير ذكية وإشارة إلغاء `AbortSignal.timeout(15000)` مع ربط التسلسل بـ `_pulseReqSeq` لمنع تداخل الاستجابات المتأخرة. تم التحقق الكامل في `scripts/test_ui_architect_deliverables.mjs`.

---

# الفصل الثاني: خارطة الحذف والدمج الشاملة (Pruning, Deletion & Consolidation Map)

شهدت معمارية PAE v6.0 أكبر عملية تنظيف هيكلي في تاريخ المشروع، تم خلالها التخلص من آلاف الأسطر الزائدة والتعقيدات غير المبررة.

### 1. تفكيك وإلغاء الشاردينغ الزائف (Abolishing Fake Sharding)
- **الوضع السابق:** كان النظام يوزع الاستعلامات والبيانات افتراضياً على 99 شارد عبر هاش `crc32(pin_id) % 99 + 1`، مما استلزم وجود استعلامات مبعثرة (Scatter-Gather)، وفك تشفير سلاسل الاتصال عبر Workers KV، واستهلاك عشرات الاتصالات وقنوات الـ TCP دون مبرر في ظل وجود قاعدة بيانات سحابية موحدة فائقة الأداء.
- **الوضع الحالي:** تم تفعيل وضع **`unified_postgres`** رسمياً، حيث توجه كافة الاستعلامات والعمليات مباشرة وبشكل حتمي إلى قاعدة البيانات المركزية النواة (`hubSql`) بزمن انتقال شبه معدوم وبصفر اتصالات خارجية مبعثرة.

### 2. قائمة الملفات والمكونات المحذوفة والمدمجة
1. **دمج مسارات إدخال البيانات النواة:**
   - توحيد عمليات الحفظ المتناثرة عبر نقطة نهاية داخلية مركزية واحدة: `POST /api/internal/ingest`، مدعومة بالدالة الذرية الموحدة `PinRepository.ingestPinsBatch`.
2. **دمج وتوحيد دوال التنسيق المالي والزمني (Rule 31 Consolidation):**
   - تم إنشاء ملفين معياريين للمصدر الموحد للتنسيق: `src/ui/shared-formatters.mjs` و `src/shared-formatters.mjs`.
   - تم استبدال جميع دوال حساب الأعمار المتفرقة بدالة موحدة: إذا كان العمر $\ge 365$ يوماً يُعرض بالسنوات حصرياً (مثل `1.1y` دون أيام بين قوسين)، وإذا كان $< 365$ يوماً يُعرض بالأيام حصرياً (مثل `145d`).
   - دمج حماية مكافحة سمية الـ NaN (Rule 3) في كافة منسقات الأرقام والمقاييس.
3. **تنظيف وحذف مخلفات الأصول والصور المؤقتة:**
   - تم حذف **74 ملفاً وصورة مؤقتة** من مجلد `public/assets/aistudio/` بحجم إجمالي قدره **31.8 ميجابايت**، مما خفف العبء التخزيني وسرّع عمليات النشر والنسخ الاحتياطي.
4. **تقليص استعلامات شلال البيانات (Query Waterfall Reduction):**
   - في خدمة النبض والمجلدات (`src/modules/pulse/service.mjs` و `src/modules/keywords/folders-service.mjs`)، تم تخفيض استعلامات التقاطع المتضخمة من سقف `LIMIT 15000` إلى سقف رشيق وآمن `LIMIT 2500`، مما خفض استهلاك الذاكرة وحجم نقل البيانات بنسبة **83.3%**، واستبدال استعلامات البحث الدائري بـ CTEs موحدة ومفهرسة.

### 3. إحصائيات تقليص الكود (Code Reduction Metrics)

```mermaid
xychart-beta
    title "مقارنة حجم أسطر الكود وعدد الاستعلامات قبل وبعد إعادة البناء v6.0"
    x-axis ["أسطر الكود الفعالة (Lines of Code)", "سقف استعلامات التقاطع (Query Limit)", "استهلاك ذاكرة حوض الاتصال (MB)"]
    y-axis "الحجم أو العدد" 0 --> 110000
    bar [104000, 15000, 480]
    bar [20500, 2500, 64]
```

- **حجم الكود الكلي:** انخفض من قرابة **104,000 سطر** من الكود المتكرر والمشظى إلى نحو **20,500 سطر** من الكود النقي عالي الكثافة (انخفاض بنسبة تتجاوز 80%).
- **استهلاك الذاكرة وشبكة النقل:** وفرت المعمارية الجديدة ما بين 15 إلى 20 ميجابايت من نقل الـ JSONB في كل استدعاء لمجلد بفضل التحديد الدقيق للحقول `(c.metadata->>'aspect_ratio')` بدلاً من جلب كامل الكائن.

---

# الفصل الثالث: معمارية قاعدة البيانات الجديدة (The 8-Table Clean SSOT Schema)

ترتكز معمارية PAE v6.0 على مبدأ **المصدر الموحد للحقيقة (Single Source of Truth - SSOT)** عبر 8 جداول رئيسية صافية وعرض مادي واحد لملخص النبض، مع الإلغاء الكامل للفيوز (Views) غير المتوافقة مع الـ Upserts.

### مخطط العلاقات المعمارية (Entity Relationship Diagram)

```mermaid
erDiagram
    FOLDERS ||--o{ TRACKED_KEYWORDS : contains
    TRACKED_KEYWORDS ||--o{ KEYWORD_SERP_POSITIONS : tracks
    UNIVERSAL_MASTER_PINS ||--o{ KEYWORD_SERP_POSITIONS : ranked_in
    UNIVERSAL_MASTER_PINS ||--o{ PINS_DAILY_METRICS : snapshots
    COMPETITOR_PROFILES ||--o{ COMPETITOR_BOARDS : owns
    COMPETITOR_PROFILES ||--o{ COMPETITOR_PINS : publishes
    COMPETITOR_PINS }o--|| UNIVERSAL_MASTER_PINS : correlates_with

    UNIVERSAL_MASTER_PINS {
        varchar pin_id PK
        bigint save_count "NULL when unhydrated"
        numeric daily_save_velocity "0 on initial discovery"
        bigint delta_saves_24h "true integer delta"
        boolean is_deep_hydrated
        varchar clean_domain
    }

    PINS_DAILY_METRICS {
        varchar pin_id PK
        date snapshot_date PK
        bigint save_count
        numeric daily_save_velocity
        boolean is_baseline_day
    }

    KEYWORD_SERP_POSITIONS {
        bigserial id PK
        int keyword_id FK
        varchar pin_id
        date snapshot_date
        smallint rank_position "NULL when displaced"
        boolean is_displaced
    }
```

---

### الكود الكامل لملف الترحيل الأولي: `001_clean_ssot_schema.sql`

```sql
-- =============================================================================
-- Migration 001: Clean SSOT Schema (PAE v6.0 Single-Database Architecture)
-- =============================================================================
-- Defines the clean, canonical 8-table schema and 24h summary materialized view:
--   1. universal_master_pins (with BIGINT NULL save_count)
--   2. pins_daily_metrics (with is_baseline_day)
--   3. keyword_serp_positions (unifying current SERP, displaced index, and historical ranks via rank_position SMALLINT NULL)
--   4. folders (canonical campaign workspace containers)
--   5. tracked_keywords (fleet keyword registry)
--   6. competitor_profiles (creator intelligence ledger)
--   7. competitor_boards (creator board hierarchy)
--   8. competitor_pins (creator catalog inventory)
--   Plus mv_pulse_24h_summary (materialized view for high-speed executive telemetry)
-- =============================================================================

-- 1. Folders (Campaign Workspace & Category Organization)
CREATE TABLE IF NOT EXISTS folders (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(32) DEFAULT '#E11D48',
  icon VARCHAR(64) DEFAULT 'folder',
  project_id VARCHAR(64),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folders_created ON folders (created_at DESC);

-- Backward compatibility alias
CREATE OR REPLACE VIEW keyword_folders AS
SELECT * FROM folders;

-- 2. Tracked Keywords (Fleet Search Intelligence)
CREATE TABLE IF NOT EXISTS tracked_keywords (
  id SERIAL PRIMARY KEY,
  keyword VARCHAR(255) NOT NULL UNIQUE,
  canonical_keyword VARCHAR(255),
  category VARCHAR(128),
  target_pin_count INT DEFAULT 150,
  refresh_interval_hours INT DEFAULT 24,
  last_crawled_at TIMESTAMPTZ,
  top_pin_id VARCHAR(64),
  top_pin_title TEXT,
  top_pin_image TEXT,
  avg_daily_velocity NUMERIC(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  popular_pins JSONB DEFAULT '[]'::jsonb,
  crawl_lease_token UUID,
  crawl_lease_until TIMESTAMPTZ,
  crawl_pages_limit INT DEFAULT 5,
  inspection_mode VARCHAR(32) DEFAULT 'standard',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tk_active ON tracked_keywords (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_tk_velocity ON tracked_keywords (avg_daily_velocity DESC);

-- 3. Universal Master Pins (SSOT Creative & Telemetry Foundation)
CREATE TABLE IF NOT EXISTS universal_master_pins (
  pin_id VARCHAR(64) PRIMARY KEY,
  creator_username VARCHAR(64),
  board_id VARCHAR(64),
  board_name VARCHAR(255),
  board_slug VARCHAR(255),
  title TEXT,
  description TEXT,
  alt_text TEXT,
  domain VARCHAR(255),
  clean_domain VARCHAR(255),
  destination_url TEXT,
  image_url TEXT,
  dominant_color VARCHAR(16) DEFAULT '#888888',
  visual_annotations JSONB DEFAULT '[]'::jsonb,
  created_at_pinterest TIMESTAMPTZ,
  first_discovered_pillar VARCHAR(32) DEFAULT 'serp',
  first_discovered_at TIMESTAMPTZ DEFAULT NOW(),
  first_saved_at TIMESTAMPTZ DEFAULT NOW(),
  last_resaved_at TIMESTAMPTZ DEFAULT NOW(),
  last_scraped_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  url_global_saves BIGINT DEFAULT 0,
  save_count BIGINT NULL,
  repin_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  share_count INT DEFAULT 0,
  reaction_count INT DEFAULT 0,
  daily_save_velocity NUMERIC(12,2) DEFAULT 0,
  delta_saves_24h BIGINT DEFAULT 0,
  delta_repins_24h INT DEFAULT 0,
  gains_5d BIGINT DEFAULT 0,
  gains_7d BIGINT DEFAULT 0,
  gains_10d BIGINT DEFAULT 0,
  gains_15d BIGINT DEFAULT 0,
  is_product BOOLEAN DEFAULT FALSE,
  is_video BOOLEAN DEFAULT FALSE,
  creation_method TEXT DEFAULT 'pinterest_platform',
  image_signature TEXT,
  seo_noindex_reason TEXT,
  is_repin BOOLEAN DEFAULT FALSE,
  canonical_pin_id VARCHAR(64),
  is_deep_hydrated BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_ump_clean_domain_saves ON universal_master_pins (clean_domain, save_count DESC);
CREATE INDEX IF NOT EXISTS idx_ump_creator_username ON universal_master_pins (creator_username);
CREATE INDEX IF NOT EXISTS idx_ump_velocity_saves ON universal_master_pins (daily_save_velocity DESC, save_count DESC);
CREATE INDEX IF NOT EXISTS idx_ump_last_scraped_at ON universal_master_pins (last_scraped_at DESC) WHERE last_scraped_at IS NOT NULL;

-- 4. Pins Daily Metrics (Time-Series Metric Trajectory)
CREATE TABLE IF NOT EXISTS pins_daily_metrics (
  pin_id VARCHAR(64) NOT NULL,
  snapshot_date DATE NOT NULL,
  save_count BIGINT NULL,
  repin_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  share_count INT DEFAULT 0,
  reaction_count INT DEFAULT 0,
  daily_save_velocity NUMERIC(12,2) DEFAULT 0,
  is_baseline_day BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (pin_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_pdm_pin_snapshot_desc ON pins_daily_metrics (pin_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_pdm_date_velocity ON pins_daily_metrics (snapshot_date, daily_save_velocity DESC);

-- 5. Keyword SERP Positions (Unified Active SERP, Displaced Vault & Rank Positions)
-- NULL rank_position indicates displaced or unranked state; values 1..50 indicate active SERP
CREATE TABLE IF NOT EXISTS keyword_serp_positions (
  id BIGSERIAL PRIMARY KEY,
  keyword_id INT NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
  pin_id VARCHAR(64) NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  rank_position SMALLINT NULL,
  last_known_rank SMALLINT NULL,
  is_displaced BOOLEAN DEFAULT FALSE,
  displaced_date DATE,
  vacuum_opportunity_score NUMERIC(8,2) DEFAULT 0,
  catalog_rank INT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_ksp_keyword_pin_date UNIQUE (keyword_id, pin_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_ksp_keyword_date_rank ON keyword_serp_positions (keyword_id, snapshot_date DESC, rank_position ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ksp_pin_snapshot ON keyword_serp_positions (pin_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_ksp_displaced ON keyword_serp_positions (keyword_id, is_displaced) WHERE is_displaced = TRUE;

-- 6. Competitor Profiles (Creator Ledger & Profile Telemetry)
CREATE TABLE IF NOT EXISTS competitor_profiles (
  id SERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(255),
  avatar_url TEXT,
  bio TEXT,
  website_url TEXT,
  monthly_reach BIGINT DEFAULT 0,
  reach_delta_7d BIGINT DEFAULT 0,
  profile_views BIGINT DEFAULT 0,
  views_delta_7d BIGINT DEFAULT 0,
  total_pins INT DEFAULT 0,
  total_boards INT DEFAULT 0,
  follower_count BIGINT DEFAULT 0,
  following_count INT DEFAULT 0,
  account_type VARCHAR(32) DEFAULT 'creator',
  activity_status VARCHAR(32) DEFAULT 'active',
  last_synced_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  tracking_mode VARCHAR(32) DEFAULT 'full',
  custom_label VARCHAR(128),
  source_folder_id INT,
  delta_reach_24h BIGINT DEFAULT 0,
  delta_views_24h BIGINT DEFAULT 0,
  delta_pins_24h INT DEFAULT 0,
  delta_boards_24h INT DEFAULT 0,
  pins_delta_7d INT DEFAULT 0,
  boards_delta_7d INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cp_username ON competitor_profiles (username);
CREATE INDEX IF NOT EXISTS idx_cp_is_active ON competitor_profiles (is_active) WHERE is_active = TRUE;

-- 7. Competitor Boards (Creator Board Hierarchy)
CREATE TABLE IF NOT EXISTS competitor_boards (
  id SERIAL PRIMARY KEY,
  competitor_id INT NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
  board_id VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  url TEXT,
  pin_count INT DEFAULT 0,
  follower_count BIGINT DEFAULT 0,
  last_pinned_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cb_competitor_id ON competitor_boards (competitor_id);

-- 8. Competitor Pins (Creator Catalog Inventory)
CREATE TABLE IF NOT EXISTS competitor_pins (
  id SERIAL PRIMARY KEY,
  competitor_id INT NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
  pin_id VARCHAR(64) NOT NULL,
  title TEXT,
  description TEXT,
  link_domain VARCHAR(255),
  clean_domain VARCHAR(255),
  destination_url TEXT,
  board_name VARCHAR(255),
  board_slug VARCHAR(255),
  image_url TEXT,
  save_count BIGINT DEFAULT 0,
  repin_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  created_at_pinterest TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  is_product BOOLEAN DEFAULT FALSE,
  alt_text TEXT,
  enrichment_status VARCHAR(32) DEFAULT 'pending',
  enrich_attempts INT DEFAULT 0,
  claim_token UUID,
  is_deleted BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (competitor_id, pin_id)
);

CREATE INDEX IF NOT EXISTS idx_cp_pin_id ON competitor_pins (pin_id);
CREATE INDEX IF NOT EXISTS idx_cp_competitor_saves ON competitor_pins (competitor_id, save_count DESC);
CREATE INDEX IF NOT EXISTS idx_cp_clean_domain ON competitor_pins (clean_domain);

-- 9. Materialized View: 24-Hour Pulse Telemetry Summary
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_pulse_24h_summary AS
SELECT
  1 AS summary_id,
  COUNT(DISTINCT ump.pin_id)::bigint AS active_pins_24h,
  COUNT(DISTINCT ump.clean_domain)::bigint AS active_domains_24h,
  COUNT(DISTINCT ump.creator_username)::bigint AS active_creators_24h,
  COALESCE(ROUND(AVG(ump.daily_save_velocity), 2), 0)::numeric(12,2) AS avg_velocity_24h,
  COALESCE(MAX(ump.daily_save_velocity), 0)::numeric(12,2) AS max_velocity_24h,
  COALESCE(SUM(ump.delta_saves_24h), 0)::bigint AS total_delta_saves_24h,
  NOW() AS refreshed_at
FROM universal_master_pins ump
WHERE ump.last_scraped_at >= NOW() - INTERVAL '24 hours'
   OR ump.updated_at >= NOW() - INTERVAL '24 hours';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_pulse_24h_summary_id
  ON mv_pulse_24h_summary (summary_id);
```

---

### الكود الكامل لملف الشفاء الجنائي: `055_heal_hydration_baselines_and_ssot.sql`

```sql
-- =============================================================================
-- Migration 055: Heal Hydration Baselines, Eradicate Spikes & Enforce SSOT Parity
-- =============================================================================
-- 1. Ensure `is_baseline_day` exists on `pins_daily_metrics`.
-- 2. Sync missing `save_count > 0` from `keyword_serp_current` to
--    `universal_master_pins` (145 pins) and `pins_daily_metrics` (272 rows).
-- 3. Heal historical contamination: Pins with up to 22 zero-save snapshots and
--    <= 1 positive snapshot (`COUNT(DISTINCT snapshot_date) FILTER (WHERE COALESCE(save_count, 0) > 0) <= 1`)
--    must have artificial velocity reset to 0 and baseline flagged.
-- 4. Fix `baseline_day_saves = save_count` for all rows where
--    `COALESCE(baseline_day_saves, 0) = 0 AND save_count > 0`.
-- 5. Recalculate `tracked_keywords.avg_daily_velocity` from healed SERP velocities.
-- 6. Refresh `mv_pulse_24h_summary` if materialized view exists.
-- =============================================================================

BEGIN;

-- 1. Ensure schema columns exist
ALTER TABLE IF EXISTS public.pins_daily_metrics
  ADD COLUMN IF NOT EXISTS is_baseline_day BOOLEAN DEFAULT FALSE;

ALTER TABLE IF EXISTS public.keyword_serp_current
  ADD COLUMN IF NOT EXISTS baseline_day_saves BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baseline_day_date DATE;

-- 2A. Sync missing save_count > 0 from keyword_serp_current to universal_master_pins (145 pins)
WITH best_ksc AS (
  SELECT DISTINCT ON (pin_id)
    pin_id,
    save_count,
    repin_count,
    crawled_at,
    updated_at
  FROM public.keyword_serp_current
  WHERE COALESCE(save_count, 0) > 0
  ORDER BY pin_id, save_count DESC, crawled_at DESC NULLS LAST, updated_at DESC NULLS LAST
)
UPDATE public.universal_master_pins ump
SET
  save_count = bk.save_count,
  repin_count = GREATEST(COALESCE(ump.repin_count, 0), COALESCE(bk.repin_count, 0)),
  is_deep_hydrated = TRUE,
  updated_at = NOW()
FROM best_ksc bk
WHERE ump.pin_id = bk.pin_id
  AND COALESCE(ump.save_count, 0) = 0;

-- 2B. Sync missing save_count > 0 from keyword_serp_current to pins_daily_metrics (272 rows)
WITH best_ksc AS (
  SELECT DISTINCT ON (pin_id)
    pin_id,
    save_count,
    repin_count
  FROM public.keyword_serp_current
  WHERE COALESCE(save_count, 0) > 0
  ORDER BY pin_id, save_count DESC, updated_at DESC NULLS LAST
)
UPDATE public.pins_daily_metrics pdm
SET
  save_count = bk.save_count,
  repin_count = GREATEST(COALESCE(pdm.repin_count, 0), COALESCE(bk.repin_count, 0)),
  updated_at = NOW()
FROM best_ksc bk
WHERE pdm.pin_id = bk.pin_id
  AND COALESCE(pdm.save_count, 0) = 0;

-- 3. Heal historical contamination:
-- Pins with historical contamination have up to 22 zero-save snapshots and 1 positive snapshot:
-- query must use COUNT(DISTINCT snapshot_date) FILTER (WHERE COALESCE(save_count, 0) > 0) <= 1
WITH contaminated_pins AS (
  SELECT
    pin_id
  FROM public.pins_daily_metrics
  GROUP BY pin_id
  HAVING COUNT(DISTINCT snapshot_date) FILTER (WHERE COALESCE(save_count, 0) > 0) <= 1
)
UPDATE public.pins_daily_metrics pdm
SET
  daily_save_velocity = 0,
  is_baseline_day = CASE WHEN COALESCE(pdm.save_count, 0) > 0 THEN TRUE ELSE pdm.is_baseline_day END,
  updated_at = NOW()
FROM contaminated_pins cp
WHERE pdm.pin_id = cp.pin_id
  AND pdm.daily_save_velocity > 0;

WITH contaminated_pins AS (
  SELECT
    pin_id
  FROM public.pins_daily_metrics
  GROUP BY pin_id
  HAVING COUNT(DISTINCT snapshot_date) FILTER (WHERE COALESCE(save_count, 0) > 0) <= 1
)
UPDATE public.universal_master_pins ump
SET
  daily_save_velocity = 0,
  delta_saves_24h = 0,
  updated_at = NOW()
FROM contaminated_pins cp
WHERE ump.pin_id = cp.pin_id
  AND (ump.daily_save_velocity > 0 OR ump.delta_saves_24h > 0);

WITH contaminated_pins AS (
  SELECT
    pin_id
  FROM public.pins_daily_metrics
  GROUP BY pin_id
  HAVING COUNT(DISTINCT snapshot_date) FILTER (WHERE COALESCE(save_count, 0) > 0) <= 1
)
UPDATE public.keyword_serp_current ksc
SET
  daily_save_velocity = 0,
  updated_at = NOW()
FROM contaminated_pins cp
WHERE ksc.pin_id = cp.pin_id
  AND ksc.daily_save_velocity > 0;

WITH contaminated_pins AS (
  SELECT
    pin_id
  FROM public.pins_daily_metrics
  GROUP BY pin_id
  HAVING COUNT(DISTINCT snapshot_date) FILTER (WHERE COALESCE(save_count, 0) > 0) <= 1
)
UPDATE public.keyword_displaced_index kdi
SET
  daily_save_velocity = 0,
  updated_at = NOW()
FROM contaminated_pins cp
WHERE kdi.pin_id = cp.pin_id
  AND kdi.daily_save_velocity > 0;

-- 4. Fix baseline_day_saves = save_count for all rows where COALESCE(baseline_day_saves, 0) = 0 AND save_count > 0
UPDATE public.keyword_serp_current
SET
  baseline_day_saves = save_count,
  baseline_day_date = COALESCE(baseline_day_date, (crawled_at AT TIME ZONE 'UTC')::date, (NOW() AT TIME ZONE 'UTC')::date)
WHERE COALESCE(baseline_day_saves, 0) = 0
  AND save_count > 0;

-- Also tag earliest positive snapshot as baseline day in pins_daily_metrics
WITH first_pos_snapshot AS (
  SELECT DISTINCT ON (pin_id)
    pin_id,
    snapshot_date
  FROM public.pins_daily_metrics
  WHERE COALESCE(save_count, 0) > 0
  ORDER BY pin_id, snapshot_date ASC
)
UPDATE public.pins_daily_metrics pdm
SET is_baseline_day = TRUE
FROM first_pos_snapshot fps
WHERE pdm.pin_id = fps.pin_id
  AND pdm.snapshot_date = fps.snapshot_date;

-- 5. Recalculate tracked_keywords.avg_daily_velocity
UPDATE public.tracked_keywords tk
SET avg_daily_velocity = COALESCE(agg.avg_vel, 0),
    updated_at = NOW()
FROM (
  SELECT
    keyword_id,
    COALESCE(ROUND(AVG(daily_save_velocity)::numeric, 2), 0) AS avg_vel
  FROM public.keyword_serp_current
  GROUP BY keyword_id
) agg
WHERE tk.id = agg.keyword_id;

UPDATE public.tracked_keywords
SET avg_daily_velocity = 0,
    updated_at = NOW()
WHERE id NOT IN (SELECT DISTINCT keyword_id FROM public.keyword_serp_current);

-- 6. Refresh mv_pulse_24h_summary if materialized view exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = 'mv_pulse_24h_summary'
  ) THEN
    REFRESH MATERIALIZED VIEW public.mv_pulse_24h_summary;
  END IF;
END $$;

COMMIT;
```

---

# الفصل الرابع: هندسة بوابة الإدخال الذرية (`PinRepository.ingestPinsBatch`) والقانون الرياضي الموحد للسرعة

تعتبر دالة `PinRepository.ingestPinsBatch` بوابة الدخول الذرية الحصرية لكافة البيانات الواردة إلى محرك PAE v6.0، وهي تجمع بين هندسة الـ CTE الفائقة والحصانة الرياضية ضد تزييف السرعات.

### 1. فلسفة التمييز بين `save_count IS NULL` و `save_count = 0`
- **حالة عدم الترطيب (`save_count IS NULL`):** الدبوس مكتشف حديثاً عبر نتائج البحث (SERP Discovery). لا يحمل الدبوس بعد عداد حفظ صريح. إسناد القيمة `NULL` يمنع دخوله في حسابات الفروق اليومية ويجعله مؤهلاً للدخول في طابور الترطيب العميق (Deep Hydration).
- **حالة الترطيب الصفري الصريح (`save_count = 0`):** الدبوس تم سحبه من صفحة التفاصيل الحقيقية على بينترست، ومؤشر الحفظ فيه يساوي صفراً حقيقياً. هذا الدبوس يدخل كخط أساس رسمي بقيمة صفرية موثوقة.

### 2. القانون الرياضي الموحد لحساب الفروق والسرعة

تعتمد المنظومة ثلاث معادلات رياضية قطعية لحساب النشاط:

#### أ. فرق الحفظ 24 ساعة كعدد صحيح قطعي (`delta_saves_24h`):
$$\Delta S_{24h} = \begin{cases} \max(0, S_{\text{current}} - S_{\text{prev}}) & \text{if } S_{\text{prev}} \text{ exists and } S_{\text{prev}} > 0 \\ 0 & \text{otherwise (Hydration Baseline)} \end{cases}$$
- **النوع البرمجي:** `BIGINT` (ممنوع منعاً باتاً تخزين قيم كسرية أو معدلات في هذا العمود).

#### ب. السرعة اليومية المقاسة (`daily_save_velocity`):
$$V_{\text{daily}} = \begin{cases} 0 & \text{if } S_{\text{prev}} \le 0 \text{ and } S_{\text{current}} > 0 \quad \text{[Anti-Hydration Jump]} \\ \min\left(25000, \text{round}\left(\frac{\max(0, S_{\text{current}} - S_{\text{prev}})}{\max(1, \Delta D_{\text{UTC}})}, 1\right)\right) & \text{if } S_{\text{prev}} > 0 \\ 0 & \text{otherwise} \end{cases}$$
حيث $\Delta D_{\text{UTC}}$ هو فارق الأيام التقويمية المحسوب من منتصف ليل UTC إلى منتصف ليل UTC:
$$\Delta D_{\text{UTC}} = \text{round}\left(\frac{\text{Date}_{\text{current}}^{\text{UTC-Midnight}} - \text{Date}_{\text{prev}}^{\text{UTC-Midnight}}}{86,400,000 \text{ ms}}\right)$$

#### ج. فرق الخطوة اللحظي (`step_save_delta`):
$$\Delta S_{\text{step}} = \begin{cases} S_{\text{current}} - S_{\text{prev\_step}} & \text{if same calendar day and } S_{\text{prev\_step}} > 0 \\ 0 & \text{if hydration jump occurs} \end{cases}$$

---

### 3. الكود المصدري لبوابة الإدخال الذرية: `PinRepository.ingestPinsBatch`

```javascript
// src/modules/pins/repository.mjs (Lines 440-569)
export async function ingestPinsBatch(sql, pins = [], options = {}) {
  if (!pins || pins.length === 0) return { ingested: 0, inserted: 0, updated: 0 };

  const rows = deduplicatePinsPayload(pins);
  if (rows.length === 0) return { ingested: 0, inserted: 0, updated: 0 };

  const payloadJson = JSON.stringify(rows);

  const res = await sql`
    WITH raw_batch AS (
      SELECT *
      FROM jsonb_to_recordset(${payloadJson}::jsonb) AS u(
        pin_id text, creator_username text, board_name text, board_slug text, title text, domain text, clean_domain text,
        destination_url text, image_url text, description text, alt_text text, dominant_color text,
        visual_annotations jsonb, created_at_pinterest text,
        save_count bigint, repin_count bigint, comment_count int, share_count int, reaction_count int,
        daily_save_velocity numeric, is_product boolean, is_video boolean, creation_method text,
        image_signature text, canonical_pin_id text, first_discovered_pillar text, metadata jsonb
      )
    ),
    computed_batch AS (
      SELECT
        rb.*,
        CASE
          WHEN prev.save_count IS NOT NULL AND prev.save_count > 0 THEN
            CASE
              WHEN rb.daily_save_velocity IS NOT NULL THEN GREATEST(0::numeric, rb.daily_save_velocity)
              WHEN prev.snapshot_date IS NOT NULL THEN
                ROUND(
                  GREATEST(0, COALESCE(rb.save_count, 0) - prev.save_count)::numeric
                  / GREATEST(1, ((NOW() AT TIME ZONE 'UTC')::date - prev.snapshot_date)),
                  2
                )
              ELSE 0::numeric
            END
          ELSE 0::numeric
        END AS effective_velocity,
        CASE
          WHEN prev.save_count IS NOT NULL AND prev.save_count > 0 THEN
            GREATEST(0, (COALESCE(rb.save_count, 0) - prev.save_count))::bigint
          ELSE 0::bigint
        END AS true_delta_saves_24h
      FROM raw_batch rb
      LEFT JOIN LATERAL (
        SELECT pm.save_count, pm.snapshot_date
        FROM pins_daily_metrics pm
        WHERE pm.pin_id = rb.pin_id
          AND pm.snapshot_date < (NOW() AT TIME ZONE 'UTC')::date
        ORDER BY pm.snapshot_date DESC
        LIMIT 1
      ) prev ON TRUE
    ),
    upsert_pins AS (
      INSERT INTO universal_master_pins (
        pin_id, creator_username, board_name, board_slug, title, domain, clean_domain, destination_url,
        image_url, description, alt_text, dominant_color, visual_annotations, created_at_pinterest,
        save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity,
        delta_saves_24h, delta_repins_24h,
        is_product, is_video, creation_method, image_signature, canonical_pin_id,
        first_discovered_pillar, first_discovered_at, first_saved_at, last_resaved_at, last_scraped_at, updated_at, metadata
      )
      SELECT
        cb.pin_id, cb.creator_username, cb.board_name, cb.board_slug, cb.title, cb.domain,
        COALESCE(NULLIF(cb.clean_domain, ''), LOWER(REGEXP_REPLACE(TRIM(COALESCE(cb.domain, '')), '^www\.', ''))),
        cb.destination_url,
        cb.image_url, cb.description, cb.alt_text, cb.dominant_color, cb.visual_annotations,
        NULLIF(TRIM(cb.created_at_pinterest), '')::timestamptz,
        cb.save_count, cb.repin_count, cb.comment_count, cb.share_count, cb.reaction_count, cb.effective_velocity,
        cb.true_delta_saves_24h, 0,
        cb.is_product, cb.is_video, cb.creation_method, cb.image_signature, cb.canonical_pin_id,
        cb.first_discovered_pillar, NOW(), NOW(), NOW(), NOW(), NOW(), cb.metadata
      FROM computed_batch cb
      ORDER BY cb.pin_id ASC
      ON CONFLICT (pin_id) DO UPDATE SET
        creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), universal_master_pins.creator_username),
        board_name = COALESCE(NULLIF(EXCLUDED.board_name, ''), universal_master_pins.board_name),
        board_slug = COALESCE(NULLIF(EXCLUDED.board_slug, ''), universal_master_pins.board_slug),
        title = COALESCE(NULLIF(EXCLUDED.title, ''), universal_master_pins.title),
        domain = COALESCE(NULLIF(EXCLUDED.domain, ''), universal_master_pins.domain),
        clean_domain = COALESCE(NULLIF(EXCLUDED.clean_domain, ''), universal_master_pins.clean_domain),
        destination_url = COALESCE(NULLIF(EXCLUDED.destination_url, ''), universal_master_pins.destination_url),
        image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), universal_master_pins.image_url),
        description = COALESCE(NULLIF(EXCLUDED.description, ''), universal_master_pins.description),
        alt_text = COALESCE(NULLIF(EXCLUDED.alt_text, ''), universal_master_pins.alt_text),
        dominant_color = CASE WHEN EXCLUDED.dominant_color NOT IN ('', '#888888') THEN EXCLUDED.dominant_color ELSE universal_master_pins.dominant_color END,
        visual_annotations = CASE WHEN jsonb_array_length(COALESCE(EXCLUDED.visual_annotations, '[]'::jsonb)) > 0 THEN EXCLUDED.visual_annotations ELSE universal_master_pins.visual_annotations END,
        save_count = CASE WHEN EXCLUDED.save_count IS NOT NULL AND EXCLUDED.save_count > 0 THEN EXCLUDED.save_count ELSE universal_master_pins.save_count END,
        repin_count = CASE WHEN EXCLUDED.repin_count > 0 THEN EXCLUDED.repin_count ELSE universal_master_pins.repin_count END,
        comment_count = CASE WHEN EXCLUDED.comment_count > 0 THEN EXCLUDED.comment_count ELSE universal_master_pins.comment_count END,
        share_count = CASE WHEN EXCLUDED.share_count > 0 THEN EXCLUDED.share_count ELSE universal_master_pins.share_count END,
        reaction_count = CASE WHEN EXCLUDED.reaction_count > 0 THEN EXCLUDED.reaction_count ELSE universal_master_pins.reaction_count END,
        daily_save_velocity = EXCLUDED.daily_save_velocity,
        delta_saves_24h = EXCLUDED.delta_saves_24h,
        last_resaved_at = NOW(),
        last_scraped_at = NOW(),
        updated_at = NOW()
      RETURNING pin_id, (xmax = 0) AS is_insert
    ),
    upsert_daily AS (
      INSERT INTO pins_daily_metrics (
        pin_id, snapshot_date, save_count, repin_count, comment_count, share_count, reaction_count, daily_save_velocity, updated_at
      )
      SELECT
        cb.pin_id,
        (NOW() AT TIME ZONE 'UTC')::date,
        cb.save_count,
        cb.repin_count,
        cb.comment_count,
        cb.share_count,
        cb.reaction_count,
        cb.effective_velocity,
        NOW()
      FROM computed_batch cb
      ORDER BY cb.pin_id ASC
      ON CONFLICT (pin_id, snapshot_date) DO UPDATE SET
        save_count = CASE WHEN EXCLUDED.save_count > 0 THEN EXCLUDED.save_count ELSE pins_daily_metrics.save_count END,
        repin_count = CASE WHEN EXCLUDED.repin_count > 0 THEN EXCLUDED.repin_count ELSE pins_daily_metrics.repin_count END,
        comment_count = CASE WHEN EXCLUDED.comment_count > 0 THEN EXCLUDED.comment_count ELSE pins_daily_metrics.comment_count END,
        share_count = CASE WHEN EXCLUDED.share_count > 0 THEN EXCLUDED.share_count ELSE pins_daily_metrics.share_count END,
        reaction_count = CASE WHEN EXCLUDED.reaction_count > 0 THEN EXCLUDED.reaction_count ELSE pins_daily_metrics.reaction_count END,
        daily_save_velocity = EXCLUDED.daily_save_velocity,
        updated_at = NOW()
    )
    SELECT pin_id, is_insert FROM upsert_pins;
  `;

  if (rows.some(r => r.keyword_id && r.keyword_id > 0)) {
    await upsertPinSerpPositionsBatch(sql, payloadJson);
  }

  const inserted = Array.isArray(res) ? res.filter(r => r.is_insert).length : 0;
  const updated = Array.isArray(res) ? res.filter(r => !r.is_insert).length : 0;
  return { ingested: Array.isArray(res) ? res.length : 0, inserted, updated };
}
```

---

# الفصل الخامس: معمارية الخادم الأصيل (Fastify / Node.js) مقابل Cloudflare Worker وتصليب `wake-shield` وأتمتة النشر

يقدم خادم PAE v6.0 نموذجاً معمارياً مزدوجاً ومتناغماً يجمع بين بيئة Node.js الأصيلة على الخوادم الافتراضية وبيئة Cloudflare Workers على الحافة (Edge).

### 1. معمارية الخادم الأصيل `src/server.mjs`
- **التوجيه الإعلاني السريع (Declarative Node Routing):** تم تزويد الخادم بسجل توجيه صريح (`declarativeRoutes`) يدعم نقاط النهاية الحساسة بسرعة قصوى، وفي مقدمتها:
  - `GET /api/health`: لفحص نبض الخادم بزمن استجابة $< 1\text{ms}$.
  - `POST /api/internal/ingest`: بوابة الاستقبال المؤمنة برمز زمني آمن (`timingSafeEqualStr`) لاستلام دفعات الزواحف.
  - `GET /api/internal/queue`: لمراقبة حالة طابور المهام في الذاكرة.
- **التوافق التام مع Cloudflare Worker (`src/worker.mjs`):** في حال عدم تطابق المسار مع المسارات الإعلانية، يتم تمرير الطلب تلقائياً إلى معالج `worker.fetch(webRequest, env, ctx)` مما يحقق تطابقاً في المسارات بنسبة 100%.
- **طابور المهام غير المتزامن (`AsyncTaskQueue` مع `p-limit(4)`):** فك الارتباط الكامل بين استجابة العميل ومهام الخلفية. يتم إنهاء دفق البيانات عبر `res.end()` فور إرسال محتوى الصفحة، بينما تُنفذ مهام التحديث والترطيب في الخلفية بسقف 4 مهام متزامنة لتفادي إرهاق موارد الخادم.

### 2. تصليب درع الإيقاظ `workers/wake-shield/src/index.mjs`
- **فك اقتران المهلات (Timeout Decoupling):**
  - **طلبات تصفح المتصفح (HTML Navigation):** تخضع لمهلة سريعة مدتها **3,500 مللي ثانية**. إذا لم يستجب الخادم، يتم تحويل المتصفح بسلاسة إلى شاشة الاستيقاظ الجذابة.
  - **طلبات واجهات البرمجة (API Endpoints):** تم رفع مهلتها إلى **15,000 مللي ثانية** لمنع انقطاع استعلامات التقارير والتحليلات الضخمة.
- **فحص النبض الاستباقي (Pre-Wake Probe):**
  - قبل أن يقرر الدرع إرجاع رمز الحالة 503 "الخادم يستيقظ"، يقوم بإرسال طلب فحص خاطف إلى `/api/health` بمهلة 2,500 مللي ثانية.
  - إذا كان الخادم مستيقظاً بالفعل ولكنه يمر بحالة ضغط أو أرجع خطأ داخلياً (HTTP 500)، يمتنع الدرع عن تزييف الحالة كـ 503، ويمرر الخطأ الحقيقي للمشغل لتسهيل التشخيص الجنائي.

### 3. أتمتة النشر السحابي إلى InstaBox VM (`/data/app`)
تم دمج خطوة النشر التلقائي رسمياً في مسار التكامل المستمر `.github/workflows/ci.yml`:
- **الهدف:** الجهاز الافتراضي `m_agq2t32m5xv5joj67rqoze5h4u` على خوادم InstaBox.
- **المسار المستهدف:** `/data/app`.
- **الآلية:**
  1. إيقاظ الجهاز الافتراضي وضمان تشغيله عبر طلب POST مؤمن برمز خمول إلى:
     `https://api.instabox.sh/v1/machines/m_agq2t32m5xv5joj67rqoze5h4u/start`
  2. تنفيذ أوامر الترقية الذاتية عبر InstaBox Exec API:
     ```bash
     cd /data/app && git fetch origin main && git reset --hard origin/main && npm ci --omit=dev && (systemctl restart pae-server 2>/dev/null || pm2 restart all 2>/dev/null || pkill -f 'server.mjs' 2>/dev/null || true)
     ```
  3. تزامن الإنتاج بنسبة 100% مع كل دمج في فرع `main`.

---

# الفصل السادس: معمارية الزواحف عديمة الحالة (Stateless HTTP Scrapers) ونواة Pinterest

تمثل حزمة `src/core/` النواة الصلبة التي تحكم علاقة المنظومة بمنصة Pinterest، مع التزام صارم بالقواعد الجنائية للمحاكاة وتجريد الزواحف من الحالة.

### 1. عميل Pinterest النواة عديم الحالة: `src/core/pinterest-client.mjs`
- **قاعدة كوكيز الضيف غير المصادقة الصارمة (`[INVARIANT: STRICT-GUEST-SCRAPING]`):**
  - **حظر كوكيز تسجيل الدخول (`_auth=1`):** تم حظر جلسات المستخدمين المسجلين تماماً، لأن Pinterest تقوم عند إرسال كوكيز مصادقة بتصفير عدادات الحفظ العامة واستبدالها بحالة المستخدم الحالي (`saves: 0`).
  - **تنقية الكوكيز (`sanitizeGuestCookie`):** تجريد أي رموز مصادقة وفرض كوكيز الضيف الصافية `_auth=0` حصرياً.
- **تطابق بصمة المتصفح (Browser Fingerprint Parity):**
  - محاكاة دقيقة لمتصفح **Google Chrome 131** (`131.0.0.0`) على بيئة Windows x64.
  - ترويسات Client Hints كاملة: `Sec-Ch-Ua`, `Sec-Ch-Ua-Mobile: ?0`, `Sec-Ch-Ua-Platform: "Windows"`.
  - ترويسة تطبيق بينترست الرسمية: `X-App-Version: 9302641`.
- **المرونة وامتصاص الحظر (Resilience & Circuit Breaking):**
  - تطبيق تأخير عشوائي ذكي (Jittered Delay) يتراوح بين **2500 إلى 4000 مللي ثانية**.
  - إشارة إلغاء صارمة بمهلة **8000 مللي ثانية** لكل استدعاء شبكي.
  - قاطع دائرة مدمج (`PinterestCircuitBreaker`) بحالاته الثلاث (`CLOSED`, `OPEN`, `HALF_OPEN`) يمتص أخطاء 429 و 403 ويمنع إغراق الخوادم بالطلبات عند التعرض للتقييد.

### 2. محلل البيانات النواة: `src/core/pinterest-parser.mjs` والـ 48 حقلاً الخوارزمياً
يقوم المحلل باستخراج التيليمترية الخوارزمية من ثلاثة مستويات متتالية:
1. **بيانات SSR المضمنة (`__PWS_DATA__` و Relay Store):** استخراج بيانات الصفحة الأولية بزمن 0ms شبكة.
2. **نقطة نهاية Closeup السريعة (`PinResource/get/?data=...`):** جلب تفاصيل البن في غضون ~90ms.
3. **دفعة Pidgets العامة:** كخط دفاع أخير للمقاييس الأساسية.

#### الحقول الخوارزمية الـ 48 المستخرجة:
1. `pin_id`
2. `title`
3. `description`
4. `alt_text`
5. `domain`
6. `clean_domain`
7. `destination_url`
8. `utm_link`
9. `tracked_link`
10. `image_url`
11. `image_signature`
12. `dominant_color`
13. `visual_annotations`
14. `created_at_pinterest`
15. `save_count` (يكون `NULL` للبن غير المرطب، ومحمياً بسقف 10,000,001 ضد التشوهات)
16. `has_explicit_saves`
17. `repin_count`
18. `comment_count`
19. `share_count`
20. `reaction_count`
21. `reactions_breakdown` (توزيع التفاعلات الفردية)
22. `is_product`
23. `is_video`
24. `is_carousel`
25. `carousel_slot_count`
26. `creation_method`
27. `is_repin`
28. `canonical_pin_id`
29. `is_canonical_root`
30. `seo_canonical_url`
31. `seo_noindex_reason`
32. `google_indexing_status`
33. `creator_username`
34. `creator_id`
35. `creator_display_name`
36. `creator_avatar_url`
37. `creator_follower_count`
38. `creator_is_verified`
39. `board_id`
40. `board_name`
41. `board_slug`
42. `board_url`
43. `board_pin_count`
44. `board_follower_count`
45. `aspect_ratio`
46. `media_type`
47. `price_currency`
48. `price_amount`

### 3. التحول إلى زواحف عديمة الحالة (Stateless Scraping Architecture)
تم تزويد زواحف النظام (`scripts/keyword-velocity-crawler.mjs` وغيرها) بدالة `pushBatchToIngestApi`. بدلاً من فتح اتصالات مباشرة بقاعدة البيانات المركزية أو الشاردات من بيئات الزحف الموزعة، تقوم الزواحف بدفع الدفعات الناتجة عبر استدعاء HTTP خفيف إلى `POST /api/internal/ingest`، مما ألغى تنافس الاتصالات على قاعدة البيانات وحقق فصلاً كاملاً بين طبقة الاستخراج وطبقة التخزين.

---

# الفصل السابع: معمارية الواجهة الأمامية المعيارية ونتائج التحقق الشامل (Verification & Regression Lock Report)

خضعت الواجهة الأمامية لإعادة هيكلة جمالية ومعمارية كاملة استجابة لموجهات التصميم السويسري الكثيف وتوجيهات `DESIGN.md`.

### 1. إصلاحات الواجهة الأمامية لصفحة تفاصيل البن (`src/pin-details-ui.mjs`)
- **حساب نقاط الرسم البياني (`computeChartPoints`):** استبعاد الأيام الصفرية السابقة لأول لقطة ترطيب حقيقية لمنع هبوط المنحنى الوهمي.
- **معايرة قفزة الترطيب (`isHydrationJump`):** اعتماد فحص `prevSaves <= 0 && currSaves > 0`، وعرض شارة واضحة:  
  `0 today (Hydrated Baseline)` بدلاً من عرض سرعات العمر الافتراضي المزيفة.
- **عرض التفاعلات (`Reactions`):** دمج عداد التفاعلات في بطاقة المشاركة الإجمالية `TOTAL ENGAGEMENT` بجانب التعليقات والمشاركات.
- **تحديد الجذر القانوني للدبوس (`isCanonicalRoot`):** التمييز الدقيق بين الدبوس الأصلي (`Canonical Root`) والدبابيس المعاد نشرها (`Repin of #...`).

### 2. مكتبة المنسقات الموحدة وتطبيق القاعدة 31 (`Universal Strict Time Formatting`)
تم تطبيق القاعدة المعمارية 31 في `src/ui/shared-formatters.mjs`:
- إذا كانت المدة $\ge 365$ يوماً: تُعرض بالسنوات حصرياً مثل `1.1y` و `2.5y`.
- إذا كانت المدة $< 365$ يوماً: تُعرض بالأيام حصرياً مثل `145d` و `12d`.
- استخدام خطوط `JetBrains Mono` مع خاصية `tabular-nums` لثبات الأرقام وتفادي الإزاحة الأفقية.

---

### 3. التقرير النهائي للتحقق الآلي وأقفال الانتكاس الـ 14

تم تمرير كافة الاختبارات وفحوصات الجودة البرمجية بنجاح بنسبة **100% Green** عبر كافة اللجان الهندسية المستقلة:

#### أ. نتائج فحص الجودة الشامل (`npm run check`):
```text
=== Running Dynamic Universal Syntax Verification (Acorn Fast-Path) ===
✅ [SYNTAX CHECK PASSED] 100% of 105 .mjs files verified in 427.0ms with zero syntax errors.
[+] ALL inline scripts in all 7 suites have 100% valid JavaScript syntax!
Testing Reorganized UI Routes...
  ✓ [PASS] GET / -> Serves Executive Command Center
  ✓ [PASS] GET /accounts -> Serves Creator Hub
  ✓ [PASS] GET /keywords -> Serves Keywords Fleet Dashboard
  ✓ [PASS] GET /related-pins -> Serves Related Pins
  ✓ [PASS] Double-slash routes normalized to 200 OK
  ✓ [PASS] Method tampering on static HTML endpoints rejected with 405; HEAD supported with 200 OK
  ✓ [PASS] Worker socket cleanup is non-blocking
  ✓ [PASS] Campaign Workspace Multi-Room Routing (/folders/:id/*) fully verified
[+] ALL UI ROUTE REORGANIZATION & LATENCY OPTIMIZATION TESTS PASSED (100% GREEN)!
=== Running Forensic SQL Schema Parity & AST Landmine Audit ===
✅ [AUDIT PASSED] 100% Zero-Landmine Parity & Active Schema Verification across 104 source files.
> eslint src/ scripts/ workers/ --max-warnings=0 (0 warnings, 0 errors)
✅ [DOM NESTING VERIFIED] Room 1 and Room 5 are direct siblings inside VIEW A.
```

#### ب. نتائج أقفال الانتكاس المعمارية الـ 14 (`verify_regression_locks.mjs`):
1. **Lock 1 (Room 1–5 DOM Hierarchy & Header):** ✅ PASS
2. **Lock 2 (Pin Dossier Timeframe & SERP Badge Integrity):** ✅ PASS
3. **Lock 3 (Unified Single-DB SSOT & Zero Legacy Sharding):** ✅ PASS
4. **Lock 4 (Authentic Rolling Multi-Window Gains):** ✅ PASS
5. **Lock 5 (Context-Preserving Pin Navigation & Creator Shield):** ✅ PASS
6. **Lock 6 (Pure Neon Architecture & Zero Cloudflare Footprint in src/):** ✅ PASS
7. **Lock 7 (Room 3 Creator Hub Discovery & Lightweight Pulse):** ✅ PASS
8. **Lock 8 (Daily Rolling Gains Workflow Automation):** ✅ PASS
9. **Lock 9 (Window-Aware Competitor Audience Gains):** ✅ PASS
10. **Lock 10 (Room 3 Single-Creator SERP Track Fallback):** ✅ PASS
11. **Lock 11 (/accounts Query Param Hydration & BigInt Parity):** ✅ PASS
12. **Lock 12 (Auto-Promote Pulse Breakout & Migration 041):** ✅ PASS
13. **Lock 13 (Invariant & Memory Documentation Parity):** ✅ PASS
14. **Lock 14 (Hidden Endpoints Parity & LND-801..824 Shields):** ✅ PASS  
**النتيجة النهائية لأقفال الانتكاس:** `🎉 ALL 14 ARCHITECTURAL REGRESSION LOCKS VERIFIED CLEAN (Elapsed: 44.6ms < 1000ms SLA)`

#### ج. نتائج اختبارات الحزم الفرعية المستقلة:
- `node scripts/test_runtime_architect_v6.mjs`: **13/13 PASS (100%)**
- `node --test tests/core-pinterest-parser-client.test.mjs`: **9/9 PASS (100%)**
- `node scripts/test_phase3_write_and_crawlers.mjs`: **12/12 PASS (100%)**
- `node scripts/test_phase2_read_acceleration.mjs`: **11/11 PASS (100%)**
- `node --test tests/pin-intelligence.test.mjs`: **6/6 PASS (100%)**
- `node scripts/test_ui_architect_deliverables.mjs`: **5/5 PASS (100%)**
- `node scripts/test_ui_v6_verification.mjs`: **8/8 PASS (100%)**

#### د. توثيق الذاكرة المعمارية (Beacon Autonomous Memory Ledger):
تم اعتماد الدروس المستفادة رسمياً وتخليدها في سجل الذاكرة المؤسسي (`.agents/rules/lessons-learned-ledger.md`) تحت الجولة **Round 32**، مع إقرار واعتماد معرفات الذاكرة في محرك Beacon:
- `memory_e507a8320bf1951d136b1ab8ac4c8bfa` (UI & Formatters Deliverables)
- `memory_257ae7e2aeac494268ca7619af0af9fc` (Core Scrapers & Pinterest Client Hints)
- `memory_83cf18dcd3f34044542248e5cd56331e` (Backend Services & Math Anti-Hydration Zeroing)

---

## خاتمة الاعتماد النهائي والتسليم (Final Sign-off)

بهذا التقرير المتكامل، تعلن هيئة التحرير الهندسي والتدقيق الجنائي (`chief-report-editor`) إتمام المهمة التاريخية لإعادة بناء **محرك بينترست للأربتراج الخوارزمي (PAE v6.0)** بنجاح هندسي وجنائي ساحق وبنسبة تطابق 100% مع كافة التوجيهات والمعايير الدستورية للمشروع.

**النظام الآن جاهز تماماً للاعتماد النهائي والدمج الشامل في فرع الإنتاج الرئيسي.**

*حرر في 11 نوفمبر 2026 — هيئة التحرير الهندسي والتدقيق الجنائي.*
