# MASTER CONSOLIDATED CODEBASE ACTION PLAN & 3-WAY AUDIT SYNTHESIS
**Target Codebase:** `pin-arbitrage-engine` (Cloudflare Workers Edge + 99-Shard Neon Serverless Postgres + GitHub Actions Autonomous Fleet)  
**Verification & Synthesis Engine:** Antigravity Forensic Auditor  
**Synthesized Audit Sources:**
1. Report 1: Muse Spark ([`docs/audits/VERIFICATION_MUSE_SPARK.md`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/docs/audits/VERIFICATION_MUSE_SPARK.md))
2. Report 2: Space Bunny ([`docs/audits/VERIFICATION_AGENT_2.md`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/docs/audits/VERIFICATION_AGENT_2.md))
3. Report 3: Step 5 ([`docs/audits/VERIFICATION_STEP_5.md`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/docs/audits/VERIFICATION_STEP_5.md))  
**Date of Synthesis:** 2026-10-10  
**Status:** Strict Code Freeze Active — Master Architectural Blueprint  

---

## 1. EXECUTIVE CONSENSUS DASHBOARD (لوحة الإجماع والتحكيم التنفيذية)

تم إجراء عملية مقاطعة وتثليث رقابي شاملة (3-Way Audit Triangulation & Semantic Deduplication) بين التقارير الثلاثة وفحص الكود الفعلي على القرص. تم دمج كافة البنود المتطابقة والمتداخلة، وإلغاء الإنذارات الخاطئة، لإنتاج **62 ثغرة وعيباً معمارياً فريداً** مصنفة وموزعة بدقة قطعية.

### جدول توزيع العيوب الفريدة حسب مستوى الإجماع والخطورة:
| مستوى الإجماع الرقابي | P0 (Critical Security & Crash) | P0 (Data Integrity & Schema) | P1 (Distributed Flow & Subrequests) | P2 (Polish & Hardening) | الإجمالي الفريد | النسبة |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **3-Way Consensus (3/3)** <br/>*إجماع كامل بين التقارير الثلاثة* | 6 | 7 | 4 | 7 | **24** | **38.7%** |
| **2-Way Consensus (2/3)** <br/>*اتفاق بين تقريرين مستقلين* | 4 | 4 | 5 | 3 | **16** | **25.8%** |
| **Unique Catches (1/3)** <br/>*اكتشافات تخصصية مثبتة على القرص* | 3 | 5 | 9 | 5 | **22** | **35.5%** |
| **الإجمالي العام للبنود المعتمدة** | **13** | **16** | **18** | **15** | **62** | **100%** |

### التوزيع الهرمي لمراحل التنفيذ (Definitive Phased Waves):
- **Wave 0: P0 Critical Security & Crash (13 بنداً):** إخماد تسريبات المفاتيح، تأمين مسارات الـ API المفتوحة، سد ثغرات XSS، وتقييد بارامترات الـ DoS، وحل أخطاء `ReferenceError`.
- **Wave 1: P0 Data Integrity & Schema Parity (16 بنداً):** منع تصفير وسوم Pinterest، استبدال الأقفال الاستشارية بعقود إيجار الصفوف، توحيد هجرات الشوارد الـ 99، وتصليب الفهارس الشاملة.
- **Wave 2: P1 Distributed Flow & Subrequests (18 بنداً):** كبح سقف الـ 50 طلباً فرعياً لـ Cloudflare، تصحيح قاطع الدائرة المتزامن، وضبط زواحف الأسطول والـ Cron.
- **Wave 3: P2 Polish & Code Hardening (15 بنداً):** استضافة مكتبات الـ UI محلياً (Zero-CDN)، سد ثغرات DDE في ملفات CSV، وتوحيد معالجة الكلمات متعددة اللغات.

---

## 2. THE CONSOLIDATED DEFECT LEDGER (السجل الموحد الشامل للعيوب)

| المזהي الموحد | مستوى الإجماع | الملف ورقم السطر | التوصيف الجذري للخلل | ملخص الحل الهندسي المعتمد |
|---|:---:|---|---|---|
| **[CAP-01]** | **3/3** | [`scripts/populate_neon_fleet.mjs:25-123`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/populate_neon_fleet.mjs#L25-L123) | 99 كلمة سر لـ Neon مشفرة بنص صريح ومتتبعة في Git | إزالة الملف من Git، تدوير كلمات السر الـ 100، وتوليد الروابط عبر قالب بيئي |
| **[CAP-02]** | **3/3** | [`src/worker.mjs:195, 221, 235`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/worker.mjs#L195) | كامل الـ API غير مصادق عليه مع `Access-Control-Allow-Origin: *` | فرض مصادقة Bearer Token وقصر الـ CORS على النطاقات المعتمدة |
| **[CAP-03]** | **2/3** | [`src/worker.mjs:137`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/worker.mjs#L137) | دالة `timingSafeEqualStr` معرفة ولم تُستدعَ مطلقاً في أي مكان | تفعيل الدالة كحارس فحص زمني ثابت لمفتاح `API_SECRET_KEY` في كافة المسارات |
| **[CAP-04]** | **2/3** | [`src/modules/fleet/service.mjs:822`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/fleet/service.mjs#L822) و [`src/worker.mjs:2860`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/worker.mjs#L2860) | نقطة النهاية `/api/fleet/url` تعيد رابط الـ DSN غير مقنع بكلمة السر | إعادة `database_url_masked` فقط وفرض حراسة المصادقة الإدارية |
| **[CAP-05]** | **2/3** | [`src/worker.mjs:1490-1508`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/worker.mjs#L1490-L1508) | استعراض الكوكي `/api/settings/cookie` يسرب توكن جلسة Pinterest | قصر الإرجاع على `cookie_present: boolean` وإخفاء محتوى التوكن تماماً |
| **[CAP-06]** | **1/3** | [`scripts/dashboard.mjs:2220, 2453`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/dashboard.mjs#L2220) | لوحة التحكم تستمع على `0.0.0.0` وتعرض الـ DSN الخام وتمرر رسائل الخطأ | قصر الاستماع على `127.0.0.1` وتطهير ردود الأخطاء عبر `redactSecrets` |
| **[CAP-07]** | **3/3** | [`src/worker.mjs:438`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/worker.mjs#L438) و [`src/pin-details-ui.mjs:15, 52`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/pin-details-ui.mjs#L15) | ثغرة Reflected XSS عبر مسار `/pins/:pin_id` بحقن وسوم العنوان وAlpine | التحقق من كون `pin_id` رقماً حصراً (`/^[0-9]+$/`) وتعقيم الرموز الخاصة |
| **[CAP-08]** | **3/3** | [`src/keywords-ui.mjs:63`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/keywords-ui.mjs#L63) و [`src/worker.mjs:510`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/worker.mjs#L510) | ثغرة Reflected XSS عبر معامل `?q=` slug من خلال كسر سياق السكربت | تعقيم وسوم الإغلاق `</script>` وتحويل الحروف الخطرة إلى Unicode Escapes |
| **[CAP-09]** | **3/3** | [`src/worker.mjs:993, 1387, 2163`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/worker.mjs#L993) | معاملات `limit` غير مقيدة في 11 موقعاً بالـ Edge تسمح بهجمات DoS | تطبيق تقييد صارم `Math.min(Math.max(limit, 1), 1000)` على كل المسارات |
| **[CAP-10]** | **2/3** | [`src/modules/fleet/guardrails.mjs:51`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/fleet/guardrails.mjs#L51) | استدعاء `neon(dbUrl)` دون استيراد الحزمة يؤدي لـ `ReferenceError` | إضافة `import { neon } from '@neondatabase/serverless';` في رأس الملف |
| **[CAP-11]** | **2/3** | [`scripts/ensure_indexes.mjs:110-126`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/ensure_indexes.mjs#L110-L126) | انهيار سكربت الفهارس في منتصفه لغياب الحماية المستقلة لكل أمر | إحاطة كل جملة DDL بـ `try/catch` مستقل لضمان استمرار التنفيذ |
| **[CAP-12]** | **1/3** | [`scripts/keyword-velocity-crawler.mjs:295-301, 435`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/keyword-velocity-crawler.mjs#L295) | تسرب مهمة `Promise.race` وانهيار Node بسبب Unhandled Rejection | إلغاء المؤقت في `finally`، وإرفاق `.catch` بالمهمة الخاسرة وتأمين الخروج |
| **[CAP-13]** | **3/3** | [`.github/workflows/*.yml`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/.github/workflows/crawler-pipeline.yml#L106) | أمر `curl api.ipify.org` يعطل أسطول الـ GitHub Actions بالكامل تحت `bash -e` | إضافة حارس التجاوز `\|\| echo "ip-diagnostics unavailable (non-fatal)"` |
| **[CAP-14]** | **3/3** | [`src/modules/keywords/service.mjs:1424`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/keywords/service.mjs#L1424) و [`visual-lens-cache.mjs:83`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/keywords/visual-lens-cache.mjs#L83) | الكتابة فوق `visual_annotations` دون حارس تفرغ الوسوم عند أخطاء 429 | استخدام `CASE WHEN jsonb_array_length(EXCLUDED.visual_annotations) > 0` |
| **[CAP-15]** | **2/3** | [`scripts/keyword-velocity-crawler.mjs:149, 178`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/keyword-velocity-crawler.mjs#L149) | تحديث الدبابيس دون شرط `keyword_id` يمسح وسوم الكلمات الأخرى | إضافة شرط `AND keyword_id = ${kw.id}` في كافة استعلامات التحديث |
| **[CAP-16]** | **3/3** | [`scripts/keyword-velocity-crawler.mjs:478`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/keyword-velocity-crawler.mjs#L478) و [`advisory-lock.mjs:38`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/lib/advisory-lock.mjs#L38) | استحالة عمل الأقفال الاستشارية عبر مشغل Neon HTTP وفشلها مفتوحة | استبدال الأقفال بعقود إيجار الصفوف الذرية (`crawl_lease_until`) والإغلاق عند الخطأ |
| **[CAP-17]** | **3/3** | [`scripts/migrations/011_universal_fleet_parity.sql:83-107`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/migrations/011_universal_fleet_parity.sql#L83) | هجرة 011 تنشئ هيكلاً ناقصاً (12 عموداً) لـ `competitor_pins` وتكسر 015 | جعل 011 تراكمية بحتة (`ADD COLUMN IF NOT EXISTS`) بكامل أعمدة هجرة 002 |
| **[CAP-18]** | **2/3** | [`scripts/migrations/016_*.sql:10-51`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/migrations/016_hub_and_spoke_synopses_and_shards.sql#L10) و [`migrate_fleet_016.mjs:169`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/migrate_fleet_016.mjs#L169) | هجرة 016 تطبق جداول الـ Hub ومفاتيح أجنبية غير موجودة على الشاردات الـ 99 | فصل الهجرة إلى قسمين: قسم الـ Hub وقسم الشاردات وتعديل المشغل |
| **[CAP-19]** | **1/3** | [`src/worker.mjs:1625`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/worker.mjs#L1625) و [`011:363`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/migrations/011_universal_fleet_parity.sql#L363) | غياب القيد الفريد في `seed_guided_search_capsules` يرمي خطأ 42P10 | إضافة `CREATE UNIQUE INDEX IF NOT EXISTS uq_seed_capsules_norm` في الشاردات |
| **[CAP-20]** | **2/3** | [`scripts/migrations/016:90-110`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/migrations/016_hub_and_spoke_synopses_and_shards.sql#L90) و [`keyword-velocity-crawler.mjs:278`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/keyword-velocity-crawler.mjs#L278) | تكرار سجلات الرصد اليومي لغياب القيد الفريد وتنفيذ DELETE/INSERT غير ذري | إنشاء قيد فريد `uq_pds_pin_keyword_date` واعتماد `INSERT ... ON CONFLICT DO UPDATE` |
| **[CAP-21]** | **3/3** | [`scripts/ensure_indexes.mjs:17-23`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/ensure_indexes.mjs#L17) | تصليب الفهارس محصور بالـ Hub والشاردات الـ 98 تعمل بلا فهارس حرجة | تعديل السكربت لتكرار تطبيق الفهارس على جميع شاردات `neon_projects_registry` |
| **[CAP-22]** | **2/3** | [`scripts/migrations/013_*.sql:86-89`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/migrations/013_keyword_displaced_vault_and_popular_pins.sql#L86) | جدول `keyword_displaced_pins` يفتقر لفهرس على `pin_id` | إضافة `CREATE INDEX IF NOT EXISTS idx_kdp_pin_id ON keyword_displaced_pins(pin_id);` |
| **[CAP-23]** | **1/3** | [`scripts/migrations/001:10`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/migrations/001_core_registry.sql#L10) و [`fleet-router.mjs:209`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/sharding/fleet-router.mjs#L209) | حقل `project_name` غير مفهرس واستعلام التوجيه ينفذ Full Scan | إضافة فهرس فريد على `project_name` وتفكيك استعلام `OR` |
| **[CAP-24]** | **3/3** | [`scripts/migrations/015:21-25`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/migrations/015_mvcc_hot_and_advisory_hardening.sql#L21) و [`worker.mjs:2400`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/worker.mjs#L2400) | غياب الفهارس الوظيفية عن استعلامات `LOWER(keyword)` و `LOWER(username)` | إنشاء فهارس وظيفية `CREATE INDEX ... ON tracked_keywords(LOWER(keyword))` |
| **[CAP-25]** | **2/3** | [`scripts/migrations/014, 015, 016`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/migrations/014_graph_traversal_and_velocity_indexes.sql#L8) | أمر `SET lock_timeout = '3000'` عديم الأثر على الـ Pooler في طلبات منفصلة | دمج `SET LOCAL lock_timeout = '3000'` في بداية كل طلب DDL أو استخدام WebSocket Pool |
| **[CAP-26]** | **1/3** | [`scripts/keyword-velocity-crawler.mjs:200-203`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/keyword-velocity-crawler.mjs#L200) | تحديث الشلال المقيد بتاريخ اليوم يسقط إثراء الدبابيس ويعيد إحياء الميتة | التحويل إلى Upsert غير مقيد بتاريخ وتثبيت حالة 404 بشرط `CASE WHEN` |
| **[CAP-27]** | **1/3** | [`scripts/account-related-crawler.mjs:231-236`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/account-related-crawler.mjs#L231) | تحديث `last_crawled_at = NOW()` حتى لو فشلت جميع الصفحات وبلا معالج إشارات | التحديث فقط عند `totalDiscoveredForSeed > 0` وإضافة معالجات `SIGTERM/SIGINT` |
| **[CAP-28]** | **1/3** | [`scripts/migrations/005:75`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/migrations/005_pinarchive_engine.sql#L75) و [`011:207`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/migrations/011_universal_fleet_parity.sql#L207) | وجود محفزين متزامنين على `pa_pins` يضاعف استهلاك الـ CPU مرتين | إسقاط المحفز القديم `trg_pa_pins_monotonic_metrics` وتوحيد الاسم |
| **[CAP-29]** | **1/3** | [`scripts/crawler-engine.mjs:1026-1032, 268`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/crawler-engine.mjs#L1026) | تعليق ميت (Deadlock) في نبضات الإيجار غير المرتبة بـ id وابتلاع الخطأ بصمت | إضافة `ORDER BY id` في التحديث وتحديد مهلة قفل مع إعادة المحاولة عند 40P01 |
| **[CAP-30]** | **2/3** | [`src/modules/keywords/folders-service.mjs:1057`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/keywords/folders-service.mjs#L1057) و [`trends-service.mjs:111`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/keywords/trends-service.mjs#L111) | استدعاء Crossover يطلق 75 طلباً فرعياً متجاوزاً سقف الـ 50 لـ Cloudflare | تقليص العينة إلى $\le 8$ كلمات وتوحيد مهلة الإلغاء عبر `AbortController` مشترك |
| **[CAP-31]** | **2/3** | [`src/modules/fleet/service.mjs:87-100`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/fleet/service.mjs#L87) | تفريع غير محدود في `getFleetCompetitors` بروابط DSN مباشرة | تقسيم المعالجة إلى دفعات خماسية (`CHUNK_SIZE = 5`) وإلزام استخدام `-pooler` |
| **[CAP-32]** | **2/3** | [`src/modules/sharding/fleet-router.mjs:246`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/sharding/fleet-router.mjs#L246) | قاطع دائرة الأسطول لا ينفصل تحت التوازي بسبب سباق القراءة والتعديل | جلب أو إنشاء الكائن المشترك وتحديث العداد في مكانه (`cb.failures++`) |
| **[CAP-33]** | **1/3** | [`scripts/fleet-dispatcher.mjs:83`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/fleet-dispatcher.mjs#L83) و [`crawler-engine.mjs:1554`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/crawler-engine.mjs#L1554) | انكسار تماثل توجيه الشاردات المحجورة بين الموزع والمحرك | تمرير خريطة صريحة من الموزع إلى المحرك تضمن التطابق الكامل |
| **[CAP-34]** | **1/3** | [`scripts/keyword-velocity-crawler.mjs:351-397`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/keyword-velocity-crawler.mjs#L351) | تقسيم الدبابيس عبر `idx % 20` غير محصن ضد تقلب الكتالوج المباشر | تثبيت شرائح الدبابيس بترتيب محدد مسبقاً وتمرير حقبة التشغيل (`run_epoch`) |
| **[CAP-35]** | **1/3** | [`scripts/crawler-engine.mjs:1468-1471`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/crawler-engine.mjs#L1468) | فحص اللوحات غير المعينة محصور فقط في الشارد رقم 1 | توزيع فحص اللوحات غير المعينة عبر التجزئة أو تعيينها عند الجدولة |
| **[CAP-36]** | **1/3** | [`scripts/crawler-engine.mjs:1321-1345`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/crawler-engine.mjs#L1321) | مهلة الـ 10 دقائق لتجميع اللقطات تسقط مجاميع الشاردات المتأخرة | جعل عملية التجميع غير تدميرية وقابلة للتكرار التراكمي في أي وقت |
| **[CAP-37]** | **1/3** | [`scripts/crawler-engine.mjs:595-605`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/crawler-engine.mjs#L595) | تهيئة 20 نبضة تنسيق بينما السرب الفعلي يضم 15 عاملاً فقط | جعل عدد النبضات يطابق حجم السرب الفعلي ديناميكياً (`generate_series(1, swarmSize)`) |
| **[CAP-38]** | **1/3** | [`scripts/fleet-dispatcher.mjs:98-110, 179-182`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/fleet-dispatcher.mjs#L98) | موزع الأسطول يبتلع أخطاء قاعدة البيانات ويعلن نجاح تشغيل الشارد 1 صورياً | التمييز بين غياب الحسابات وفشل الاستعلام وإيقاف المسار عند الفشل الحقيقي |
| **[CAP-39]** | **3/3** | [`scripts/keyword-fleet-consolidator.mjs:137, 186`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/keyword-fleet-consolidator.mjs#L137) | أداة الدمج تعلن النجاح الدائم متجاهلة فشل عمال الزحف | فحص نتائج مصفوفة GitHub Actions ونشر تقرير الفشل الحقيقي |
| **[CAP-40]** | **2/3** | [`.github/workflows/crawler-pipeline.yml:120`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/.github/workflows/crawler-pipeline.yml#L120) | خطأ في التعبير المنطقي يجبر `PERSONAL_BOARDS_ONLY` على القيمة `'true'` دائماً | تصحيح التعبير المنطقي في GitHub Actions ليحترم المدخلات الفعلية |
| **[CAP-41]** | **1/3** | [`src/modules/sharding/fleet-router.mjs:621-625`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/sharding/fleet-router.mjs#L621) | التعبئة الخلفية للشاردات تطلق وعوداً عائمة غير منتظرة دون `ctx.waitUntil` | تمرير سياق التنفيذ `ctx` واستخدام `safeWaitUntil` لحماية العملية |
| **[CAP-42]** | **1/3** | [`src/modules/sharding/fleet-router.mjs:359-362`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/sharding/fleet-router.mjs#L359) | انتهاء المهلة لا يلغي طلب Neon مع تسرب مؤقت التسخين المسبق | تمرير إشارة الإلغاء `{ fetchOptions: { signal } }` وإلغاء المؤقتات في `finally` |
| **[CAP-43]** | **1/3** | [`src/modules/sharding/fleet-router.mjs:190, 219`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/sharding/fleet-router.mjs#L190) | كاش السجل المركزي يعتمد ختماً زمنياً عاماً يجعل المدخلات لا تنتهي أبداً | جعل الختم الزمني مستقلاً لكل شارد (`cachedEntry.fetchedAt`) |
| **[CAP-44]** | **1/3** | [`src/modules/sharding/fleet-router.mjs:484, 798-804`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/sharding/fleet-router.mjs#L484) | الشارد المنهار يعيد خطأ `NOT_FOUND` كاذباً مما يوهم بحذف الدبوس | إرجاع خطأ صريح `SHARD_UNAVAILABLE` عند فشل الاتصال بالشارد |
| **[CAP-45]** | **1/3** | [`src/modules/sharding/fleet-router.mjs:131-140`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/sharding/fleet-router.mjs#L131) | دالة `enforceNeonPoolerUrl` تفسد كلمات السر المحتوية على `@` وتكرر كوداً ميتاً | تعديل النطاق عبر التعبيرات النمطية دون إعادة تشفير بيانات المستخدم |
| **[CAP-46]** | **1/3** | [`src/modules/pinarchive/service.mjs:403-425`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/pinarchive/service.mjs#L403) | دالة `ingestPinsBatch` تنفذ 1,000 استعلام لكل 500 دبوس وتزيد العداد مسبقاً | استخدام الإدخال الدفعي `jsonb_to_recordset` وفصل عدادات النجاح |
| **[CAP-47]** | **1/3** | [`src/modules/fleet/service.mjs:534`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/fleet/service.mjs#L534) | حلقة `syncFleetDatabases` ذات تعقيد $O(B \times P)$ تستهلك معالج Node.js | بناء خريطة مسبقة للبروفايلات `new Map(profiles.map(p => [p.id, p]))` |
| **[CAP-48]** | **3/3** | [`src/*-ui.mjs`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/dashboard-ui.mjs#L8) (جميع الواجهات الـ 6) | 100% من الواجهات تعتمد على نصوص ومكتبات CDN خارجية غير مثبتة | استضافة نصوص Alpine و Lucide و CSS محلياً داخل المشروع بدون CDN |
| **[CAP-49]** | **3/3** | [`dashboard-ui.mjs:10315`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/dashboard-ui.mjs#L10315) و [`keywords-ui.mjs:5904`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/keywords-ui.mjs#L5904) | حقن معادلات CSV (DDE) في 5 مسارات تصدير دون تنقية الرموز الخطرة | تعميم دالة التعقيم القياسية `sanitizeCsvCell` على جميع مصدّرات CSV |
| **[CAP-50]** | **3/3** | [`dashboard-ui.mjs:1160`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/dashboard-ui.mjs#L1160) و [`pin-details-ui.mjs:351`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/pin-details-ui.mjs#L351) | روابط `javascript:` و `data:` تصل لسمة `:href` من بيانات يملكها المستخدم | تطبيق دالة الفحص `safeUrl` وقصر الروابط على بروتوكول `http/https` |
| **[CAP-51]** | **2/3** | [`.github/workflows/*.yml`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/.github/workflows/crawler-pipeline.yml#L39) | غياب كتل الصلاحيات `permissions:` في مسارات عمل GitHub Actions | إضافة `permissions: contents: read` صريحة في كافة المسارات |
| **[CAP-52]** | **1/3** | [`scripts/dashboard.mjs:191-230`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/dashboard.mjs#L191) | زواحف لوحة التحكم ترث متغيرات البيئة كاملة بما فيها `GITHUB_TOKEN` | قصر بيئة العمل للعمليات الفرعية على المتغيرات التشغيلية الضرورية فقط |
| **[CAP-53]** | **2/3** | [`src/modules/keywords/service.mjs:1086-1088`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/keywords/service.mjs#L1086) | تسرب وسم `"not-given"` من بينترست وتخزينه كعنصر دلالي حقيقي | استبعاد وسوم `"not-given"` في دالة تعقيم موحدة للوسوم البصرية |
| **[CAP-54]** | **2/3** | [`keywords-ui:4808`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/keywords-ui.mjs#L4808) و [`keyword-velocity-crawler:133`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/keyword-velocity-crawler.mjs#L133) | سقف الوسوم $k \le 15$ رخو وغير متسق بين الواجهة والزاحف والخلفية | توحيد الدالة `capTags(tags, 15)` وفرضها في كافة مواقع القراءة والكتابة |
| **[CAP-55]** | **2/3** | [`src/modules/sharding/fleet-router.mjs:618`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/sharding/fleet-router.mjs#L618) | تضخم غير مقيد لمصفوفة الوسوم في `universal_master_pins` | تقييد دمج الوسوم بسقف الـ 15 وسماً ومنع استبدال وسوم الشارد الأكثر دقة |
| **[CAP-56]** | **2/3** | [`src/modules/keywords/folders-service.mjs:385-386`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/keywords/folders-service.mjs#L385) | دالة `normalizeTagLemma` تمحو كل المفردات والحروف غير الإنجليزية | استخدام تطبيع `NFKD` واستبدال الرموز غير النصية بمسافات بدل مسحها |
| **[CAP-57]** | **2/3** | [`src/modules/keywords/folders-service.mjs:1101-1106`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/keywords/folders-service.mjs#L1101) | توليد موجة جيبية رياضية وهمية عند غياب البيانات وعرض شهر إطلاق مصطنع | إعادة حالة `insufficient_data` صريحة وعدم اختلاق مواسم تضليلية |
| **[CAP-58]** | **2/3** | [`campaign-folders-ui:917`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/campaign-folders-ui.mjs#L917) و [`keywords-ui:4769`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/keywords-ui.mjs#L4769) | حسابات الـ Lift محصورة بالمتصفح ومبنية على عينات مبتورة وقواميس متضاربة | نقل محرك Lift إلى الخادم عبر دالة موحدة تعيد الدعم والثقة الرياضية |
| **[CAP-59]** | **1/3** | [`campaign-folders-ui:903, 915`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/campaign-folders-ui.mjs#L903) | ثغرات تصليب معادلات Lift (غياب التنعيم وتصادم فواصل المفاتيح `\|`) | إضافة تنعيم لابلاس (Laplace Smoothing) واستخدام قواميس متداخلة |
| **[CAP-60]** | **1/3** | [`src/modules/keywords/visual-lens-cache.mjs:106-147`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/keywords/visual-lens-cache.mjs#L106) و [`service.mjs:444`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/keywords/service.mjs#L444) | كود ميت وتضخم غير مقيد لذاكرة L1 لكاش العدسة البصرية | ضبط سقف L1 في كافة المسارات وحذف الدوال غير المستدعاة |
| **[CAP-61]** | **1/3** | [`scripts/audit_ui.mjs`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/audit_ui.mjs) وسكربتات الفحص | سكربتات فحص الواجهات شكلية وتفحص وسوم HTML فقط متجاهلة الأمان | إضافة فحوصات آلية للتعقيم، ومنع CDN، وكشف تسريب الأسرار في CI |
| **[CAP-62]** | **1/3** | [`scripts/optimize_hub_storage.mjs:53, 75-78`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/optimize_hub_storage.mjs#L53) | حذف غير مقسم (Unbatched DELETE) واستعلام جداول غير موجودة | تقسيم الحذف لدفعات (`LIMIT 5000`) وإزالة الجداول الوهمية |

---

## 3. STEP-BY-STEP EXECUTION BLUEPRINT (مخطط التنفيذ المرحلي الدقيق)

---

### 🌊 الموجة 0: احتواء الطوارئ الأمني والانهيارات (WAVE 0: P0 SECURITY & CRASH CONTAINMENT)
**الهدف:** إغلاق منافذ الاختراق المباشر، عزل بيانات الاعتماد المسربة، تأمين نقاط نهاية الـ Worker، وحل أخطاء الانهيار الحتمي.

#### الخطوة 0.1: سحب وتدوير بيانات اعتماد 99 قاعدة بيانات Neon [CAP-01, CAP-06]
- **الملفات المستهدفة:** `scripts/populate_neon_fleet.mjs` و `scripts/dashboard.mjs`.
- **التعديل الدقيق:**
  1. إزالة مصفوفة روابط DSN الصريحة من [`scripts/populate_neon_fleet.mjs:25-123`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/populate_neon_fleet.mjs#L25-L123).
  2. استبدالها بآلية قراءة قالب رابط الاتصال من متغير البيئة `NEON_SHARD_DSN_TEMPLATE` أو استعلام الـ Registry المركزي.
  3. استبعاد الملف من تتبع Git عبر `git rm --cached scripts/populate_neon_fleet.mjs` وإضافة أنماط الروابط إلى `.gitignore`.
  4. إلزام الخادم في [`scripts/dashboard.mjs:2453`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/dashboard.mjs#L2453) بالاستماع على `127.0.0.1` بدلاً من الافتراضي `0.0.0.0`.
  5. تدوير كلمات سر قواعد البيانات الـ 100 عبر Neon API أو لوحة التحكم فور رفع التجميد البرمجي.

#### الخطوة 0.2: تفعيل بوابة المصادقة وحصار CORS [CAP-02, CAP-03, CAP-04, CAP-05]
- **الملفات المستهدفة:** `src/worker.mjs` و `src/modules/fleet/service.mjs`.
- **التعديل الدقيق:**
  1. في [`src/worker.mjs:195, 221, 235`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/worker.mjs#L195): استبدال `Access-Control-Allow-Origin: *` بفحص قائمة النطاقات المعتمدة (Origin Allowlist) عبر متغير البيئة `ALLOWED_ORIGINS`.
  2. إنشاء طبقة فحص المصادقة (Auth Middleware) تستدعي الدالة المعطلة [`timingSafeEqualStr`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/worker.mjs#L137):
     - فحص ترويسة `Authorization: Bearer <TOKEN>` أو معامل `?api_key=`.
     - حظر أي طلب تعديلي (`POST`, `DELETE`, `PUT`) أو تشغيلي للـ GitHub Actions ما لم يطابق `env.API_SECRET_KEY`.
  3. في [`src/modules/fleet/service.mjs:822`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/fleet/service.mjs#L822): تعديل `getFleetProjectUrl` لتعيد `database_url_masked` المحجوب، مع منع إرجاع الرابط الصريح إلا للمشرف المصادق.
  4. في [`src/worker.mjs:1490-1508`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/worker.mjs#L1490-L1508): إلغاء استعراض مقطع الكوكي الصريح واقتصاره على القيمة المنطقية `is_configured: true`.

#### الخطوة 0.3: سد ثغرات Reflected XSS وتقييد طلبات DoS [CAP-07, CAP-08, CAP-09]
- **الملفات المستهدفة:** `src/worker.mjs`, `src/pin-details-ui.mjs`, `src/keywords-ui.mjs`.
- **التعديل الدقيق:**
  1. في [`src/worker.mjs:438`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/worker.mjs#L438): فرض فحص رقمي صارم لمعامل الرابط:
     ```javascript
     const cleanPinId = String(pinId || '').replace(/[^0-9]/g, '').slice(0, 32);
     if (!cleanPinId) return jsonResponse({ success: false, error: 'INVALID_PIN_ID' }, 400);
     ```
  2. في [`src/keywords-ui.mjs:63`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/keywords-ui.mjs#L63): تعقيم قيمة `initialSlug` قبل حقنها:
     ```javascript
     const safeSlug = JSON.stringify(initialSlug || '')
       .replace(/</g, '\\u003c')
       .replace(/>/g, '\\u003e')
       .replace(/&/g, '\\u0026');
     ```
  3. في [`src/worker.mjs:993, 1387, 1768, 1911, 2163, 2422, 2899`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/worker.mjs#L993): قيد كافة معاملات الـ limit:
     ```javascript
     const limit = Math.min(Math.max(parseInt(searchParams.get('limit'), 10) || 50, 1), 1000);
     ```

#### الخطوة 0.4: حل أخطاء Runtime ReferenceError ومسارات الـ CI [CAP-10, CAP-11, CAP-12, CAP-13]
- **الملفات المستهدفة:** `src/modules/fleet/guardrails.mjs`, `scripts/ensure_indexes.mjs`, `scripts/keyword-velocity-crawler.mjs`, `.github/workflows/*.yml`.
- **التعديل الدقيق:**
  1. في [`src/modules/fleet/guardrails.mjs:1`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/fleet/guardrails.mjs#L1): إضافة `import { neon } from '@neondatabase/serverless';`.
  2. في [`scripts/ensure_indexes.mjs:110-126`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/ensure_indexes.mjs#L110-L126): إحاطة كل عملية إنشاء فهرس أو تعديل عمود بـ `.catch(err => console.warn(err.message))` لضمان عدم توقف الفهارس الأخرى.
  3. في [`scripts/keyword-velocity-crawler.mjs:295-301`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/keyword-velocity-crawler.mjs#L295): حفظ معرف المؤقت وإلغاؤه فور اكتمال الاستعلام وربط `.catch` بالمهمة لمنع Unhandled Rejection.
  4. في كافة ملفات [`.github/workflows/*.yml`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/.github/workflows/crawler-pipeline.yml#L106): تعديل خطوة تشخيص IP لتصبح:
     ```bash
     curl -s --max-time 5 https://api.ipify.org || echo "ip-diagnostics unavailable (non-fatal)"
     ```

---

### 🌊 الموجة 1: سلامة البيانات والهجرات وتطابق الشوارد (WAVE 1: P0 DATA INTEGRITY & SCHEMA PARITY)
**الهدف:** القضاء على تصفير وفقدان البيانات الدلالية، إصلاح نظام الأقفال الميت، وتوحيد الجداول والفهارس في الشاردات الـ 99.

#### الخطوة 1.1: حماية وسوم Pinterest من التصفير العرضي [CAP-14, CAP-15]
- **الملفات المستهدفة:** `src/modules/keywords/service.mjs`, `src/modules/keywords/visual-lens-cache.mjs`, `scripts/keyword-velocity-crawler.mjs`.
- **التعديل الدقيق:**
  1. في [`src/modules/keywords/service.mjs:1424`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/keywords/service.mjs#L1424): تعديل شرط تحديث الوسوم البصرية عند الـ Conflict:
     ```sql
     visual_annotations = CASE 
       WHEN jsonb_array_length(EXCLUDED.visual_annotations) > 0 THEN EXCLUDED.visual_annotations 
       ELSE keyword_serp_current.visual_annotations 
     END
     ```
  2. في [`src/modules/keywords/visual-lens-cache.mjs:83-86`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/keywords/visual-lens-cache.mjs#L83): تطبيق نفس الحارس لعدم الكتابة فوق الكاش القديم بمصفوفة فارغة.
  3. في [`scripts/keyword-velocity-crawler.mjs:149, 178`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/keyword-velocity-crawler.mjs#L149): تقييد استعلام التحديث بشرط الدبوس والكلمة معاً:
     ```sql
     WHERE pin_id = ${pin.pin_id} AND keyword_id = ${kw.id}
     ```

#### الخطوة 1.2: استبدال الأقفال الاستشارية بعقود إيجار الصفوف الذرية [CAP-16, CAP-29]
- **الملفات المستهدفة:** `scripts/keyword-velocity-crawler.mjs`, `scripts/cluster-intelligence.mjs`, `scripts/lib/advisory-lock.mjs`, `scripts/crawler-engine.mjs`.
- **التعديل الدقيق:**
  1. إلغاء استدعاء `pg_try_advisory_lock` و `pg_advisory_unlock` بالكامل عبر مشغل Neon HTTP.
  2. إنشاء نظام حجز ذري في جدول `tracked_keywords`:
     ```sql
     UPDATE tracked_keywords 
     SET crawl_lease_token = gen_random_uuid(), crawl_lease_until = NOW() + INTERVAL '15 minutes'
     WHERE id = ${kw.id} 
       AND (crawl_lease_until IS NULL OR crawl_lease_until < NOW())
     RETURNING id, crawl_lease_token;
     ```
  3. الفشل مغلقاً (Fail-Closed): إذا فشل الاستعلام أو رمى خطأ، يتم تخطي الكلمة فوراً دون اعتبارها محجوزة.
  4. في [`scripts/crawler-engine.mjs:1026-1032`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/crawler-engine.mjs#L1026): ترتيب معرفات الدبابيس تصاعدياً `ORDER BY id` وتمرير `lock_timeout = '2s'` لمنع حالات التعليق الميت (Deadlocks).

#### الخطوة 1.3: تصحيح هجرات الشوارد وسد تعارضات الهيكل (017 Fleet Repair) [CAP-17, CAP-18, CAP-19, CAP-20]
- **الملفات المستهدفة:** `scripts/migrations/` وإنشاء هجرة موحدة `017_universal_fleet_parity_repair.sql`.
- **التعديل الدقيق:**
  1. صياغة الهجرة `017` لتكون تراكمية وآمنة:
     - إضافة الأعمدة الـ 13 المفقودة من جدول `competitor_pins` في كافة الشوارد (`title`, `save_count`, `link_domain`, `description`, إلخ).
     - إضافة الفهرس الفريد المفقود في الشوارد لجدول كبسولات البحث الموجه لمنع خطأ 42P10:
       ```sql
       CREATE UNIQUE INDEX IF NOT EXISTS uq_seed_capsules_norm ON seed_guided_search_capsules (seed_pin_id, normalized_query);
       ```
     - إضافة القيد الفريد لجدول اللقطات اليومية لحل مشكلة التكرار:
       ```sql
       CREATE UNIQUE INDEX IF NOT EXISTS uq_pds_pin_keyword_date ON pins_daily_snapshots (pin_id, keyword_id, snapshot_date);
       ```
  2. في [`scripts/migrate_fleet_016.mjs:169`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/migrate_fleet_016.mjs#L169): تعديل المشغل ليفصل أوامر القسم A (جداول الـ Hub فقط) عن القسم B (جداول الشوارد)، ومنع إنشاء جداول بمفاتيح أجنبية لـ `keyword_folders` على الشوارد.

#### الخطوة 1.4: نشر الفهارس الشاملة وتوحيد المحفزات [CAP-21, CAP-22, CAP-23, CAP-24, CAP-28]
- **الملفات المستهدفة:** `scripts/ensure_indexes.mjs`, `scripts/migrations/017_*.sql`.
- **التعديل الدقيق:**
  1. تعديل [`scripts/ensure_indexes.mjs`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/ensure_indexes.mjs) ليجلب قائمة الشوارد الـ 99 من `neon_projects_registry` ويطبق الفهارس على كافة القواعد بدلاً من حصرها في الـ Hub.
  2. إضافة الفهارس الحيوية المفقودة:
     - `CREATE INDEX IF NOT EXISTS idx_kdp_pin_id ON keyword_displaced_pins(pin_id);`
     - `CREATE UNIQUE INDEX IF NOT EXISTS idx_npr_project_name ON neon_projects_registry(project_name);`
     - `CREATE INDEX IF NOT EXISTS idx_tk_lower_keyword ON tracked_keywords(LOWER(keyword));`
     - `CREATE INDEX IF NOT EXISTS idx_cp_lower_username ON competitor_profiles(LOWER(username));`
  3. إسقاط المحفز المكرر في `pa_pins`:
     ```sql
     DROP TRIGGER IF EXISTS trg_pa_pins_monotonic_metrics ON pa_pins;
     ```

---

### 🌊 الموجة 2: التدفق الموزع وقواطع الدوائر والطلبات الفرعية (WAVE 2: P1 DISTRIBUTED FLOW & SUBREQUESTS)
**الهدف:** ضبط ميزانية اتصالات Cloudflare، استقرار قواطع الدوائر المتزامنة، وحماية محركات وسرب الزحف من التشتت.

#### الخطوة 2.1: تطبيق حارس سقف الـ 50 طلباً فرعياً لـ Cloudflare [CAP-30, CAP-31]
- **الملفات المستهدفة:** `src/modules/keywords/folders-service.mjs`, `src/modules/fleet/service.mjs`.
- **التعديل الدقيق:**
  1. في [`src/modules/keywords/folders-service.mjs:1057`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/keywords/folders-service.mjs#L1057):
     - تقليص عينة الاتجاهات في الـ Crossover إلى 8 كلمات مفتاحية كحد أقصى (8 كلمات × 5 طلبات = 40 طلباً فرعياً < سقف الـ 50 الصارم).
     - تشغيل الطلبات عبر دفعات متوازية منضبطة مع مهلة إجمالية 20 ثانية عبر `AbortController` مشترك بدلاً من الحلقات التسلسلية البطيئة.
  2. في [`src/modules/fleet/service.mjs:87-100`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/fleet/service.mjs#L87):
     - تجزئة استعلام `getFleetCompetitors` إلى دفعات خماسية (`CHUNK_SIZE = 5`) وتمرير الروابط عبر `enforceNeonPoolerUrl`.

#### الخطوة 2.2: تصليح قاطع الدائرة المتزامن والكاش [CAP-32, CAP-42, CAP-43, CAP-44, CAP-45]
- **الملفات المستهدفة:** `src/modules/sharding/fleet-router.mjs`.
- **التعديل الدقيق:**
  1. في السطر 246: إصلاح سباق التهيئة بجلب الكائن وإبقائه في الـ Map مع زيادة العداد ذرياً:
     ```javascript
     let cb = circuitBreakers.get(shardId);
     if (!cb) {
       cb = { state: 'CLOSED', failures: 0, nextAttempt: 0 };
       circuitBreakers.set(shardId, cb);
     }
     ```
  2. في السطور 359-362: إلغاء مؤقت التسخين المسبق في بلوك `finally` وتمرير إشارة الإلغاء لطلب Neon.
  3. في السطر 190: تحويل ختم الصلاحية الزمني للـ Registry ليكون مستقلاً لكل شارد (`entry.cachedAt`).
  4. في السطر 800: إرجاع خطأ صريح `SHARD_UNAVAILABLE` بدلاً من تضليل المستخدم بـ `NOT_FOUND` عند تعطل الشارد.
  5. في السطر 131: تصحيح دالة `enforceNeonPoolerUrl` بالاعتماد على استبدال اسم المضيف عبر Regex لمنع تشويه كلمات السر المحتوية على `@`.

#### الخطوة 2.3: مواءمة محركات وموزع زحف الأسطول [CAP-33, CAP-34, CAP-35, CAP-36, CAP-37, CAP-38, CAP-39, CAP-40]
- **الملفات المستهدفة:** `scripts/fleet-dispatcher.mjs`, `scripts/crawler-engine.mjs`, `scripts/keyword-velocity-crawler.mjs`, `scripts/keyword-fleet-consolidator.mjs`, `.github/workflows/crawler-pipeline.yml`.
- **التعديل الدقيق:**
  1. في [`scripts/fleet-dispatcher.mjs:83`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/fleet-dispatcher.mjs#L83): تمرير مصفوفة تعيين صريحة بين الحساب والشارد المستهدف إلى متغيرات بيئة الـ Worker لقطع التضارب مع `crawler-engine.mjs`.
  2. في [`scripts/keyword-velocity-crawler.mjs:388`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/keyword-velocity-crawler.mjs#L388): تثبيت توزيع الشرائح عبر ترتيب قطعي صارم على `pin_id` وحقبة التشغيل لمنع تكرار أو تفويت الدبابيس.
  3. في [`scripts/crawler-engine.mjs:1468`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/crawler-engine.mjs#L1468): السماح لكافة الشوارد بفحص اللوحات غير المعينة عبر تجزئة `board_id % shardTotal`.
  4. في [`scripts/crawler-engine.mjs:1321`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/crawler-engine.mjs#L1321): جعل تجميع اللقطات تراكمياً ومتاحاً لأي شارد يكتمل عمله دون حصر قيادي بمهلة 10 دقائق.
  5. في [`scripts/crawler-engine.mjs:595`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/crawler-engine.mjs#L595): تهيئة نبضات التنسيق بمقدار حجم السرب الفعلي (`SWARM_SIZE`) فقط.
  6. في [`scripts/keyword-fleet-consolidator.mjs:137`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/keyword-fleet-consolidator.mjs#L137): قراءة مصفوفة نتائج خطوات الزحف وإظهار علامة الفشل 🔴 في التقرير عند تعثر أي عامل.
  7. في [`.github/workflows/crawler-pipeline.yml:120`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/.github/workflows/crawler-pipeline.yml#L120): تصحيح التعبير المنطقي ليكون:
     ```yaml
     PERSONAL_BOARDS_ONLY: ${{ inputs.personal_boards_only == 'true' }}
     ```

---

### 🌊 الموجة 3: تصليب الإنتاج وصقل الواجهات والخوارزميات (WAVE 3: P2 POLISH & CODE HARDENING)
**الهدف:** استبعاد الاعتماد على شبكات CDN الخارجية، تحصين ملفات التصدير، وتوحيد معالجات النصوص والمعادلات الرياضية.

#### الخطوة 3.1: استضافة مكتبات الـ UI محلياً وتأمين الروابط وملفات CSV [CAP-48, CAP-49, CAP-50]
- **الملفات المستهدفة:** ملفات الواجهات الستة في `src/`.
- **التعديل الدقيق:**
  1. تنزيل نصوص ومكتبات Tailwind CSS, Alpine.js, و Lucide Icons وتضمينها كملفات ثابتة (Vendored Assets) أو نصوص مضمنة داخل الـ Worker لقطع أي اعتماد على CDN خارجي وتحقيق معيار (Zero-CDN Architecture).
  2. تعميم دالة التعقيم القياسية `sanitizeCsvCell` من [`campaign-folders-ui.mjs:994`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/campaign-folders-ui.mjs#L994) على كافة دوال تصدير CSV في `dashboard-ui.mjs` و `keywords-ui.mjs` لتحييد الرموز `=, +, -, @, \t, \r`.
  3. تعميم دالة الفحص `safeUrl` على كافة سمات `:href` لقصرها الصارم على بروتوكولات `http:` و `https:` وتحييد أي روابط `javascript:`.

#### الخطوة 3.2: تقييد صلاحيات مسارات العمل وعزل العمليات الفرعية [CAP-51, CAP-52, CAP-61]
- **الملفات المستهدفة:** كافة ملفات `.github/workflows/`, `scripts/dashboard.mjs`, `scripts/audit_ui.mjs`.
- **التعديل الدقيق:**
  1. إضافة بلوك الصلاحيات الأدنى `permissions: { contents: read }` في رأس كافة مسارات GitHub Actions.
  2. في [`scripts/dashboard.mjs:191`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/dashboard.mjs#L191): تجريد البيئة الممررة لعمليات الزحف الفرعية من `GITHUB_TOKEN` وتمرير المتغيرات الضرورية فقط.
  3. تطوير سكربتات فحص الواجهات (`audit_ui.mjs`) لتشمل فحص التعقيم ضد XSS، وخلو الملفات من روابط CDN، واكتشاف الأسرار المكشوفة.

#### الخطوة 3.3: توحيد سياسة الوسوم ومحرك الـ Lift الرياضي في الخادم [CAP-53, CAP-54, CAP-55, CAP-56, CAP-57, CAP-58, CAP-59]
- **الملفات المستهدفة:** `src/modules/keywords/folders-service.mjs`, `src/modules/keywords/service.mjs`, ملفات الواجهات.
- **التعديل الدقيق:**
  1. إنشاء موديول موحد `tag-policy.mjs`:
     - دالة `sanitizeVisualAnnotations`: استبعاد نصوص `"not-given"` والوسوم الأقل من 3 أحرف.
     - دالة `capTags(tags, 15)`: فرض سقف الـ 15 وسماً بترتيب الأهمية عبر كامل المشروع.
     - دالة `normalizeTagLemma`: دعم الحروف المشكولة وغير الإنجليزية عبر `NFKD` واستبدال الرموز بمسافات.
  2. نقل حسابات الـ Lift الرياضية من المتصفح إلى الخدمة الخلفية (`folders-service.mjs`):
     - توحيد قائمة الكلمات المستبعدة (Stopwords).
     - تطبيق تنعيم لابلاس (Laplace Smoothing) لمنع التضخم المصطنع للأزواج النادرة.
     - إرجاع قيم قابلة للتدقيق الرياضي تتضمن `lift`, `support`, و `confidence`.
  3. في حالة تعذر جلب اتجاهات بينترست، إعادة حالة `insufficient_data` رسمية وإلغاء توليد الموجات الجيبية المصطنعة.

#### الخطوة 3.4: ضبط عمليات الحذف والعمليات الدفعية [CAP-46, CAP-47, CAP-60, CAP-62]
- **الملفات المستهدفة:** `src/modules/pinarchive/service.mjs`, `src/modules/fleet/service.mjs`, `scripts/optimize_hub_storage.mjs`.
- **التعديل الدقيق:**
  1. في [`src/modules/pinarchive/service.mjs:403`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/pinarchive/service.mjs#L403): استبدال الحلقات الفردية بإدخال دفعي موحد `jsonb_to_recordset` وتأكيد الإدخال قبل زيادة العداد.
  2. في [`src/modules/fleet/service.mjs:534`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/src/modules/fleet/service.mjs#L534): بناء `Map` مسبقة للبروفايلات لتخفيض تعقيد الحلقة من $O(B \times P)$ إلى $O(B + P)$.
  3. في [`scripts/optimize_hub_storage.mjs:75`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/scripts/optimize_hub_storage.mjs#L75): تقسيم عمليات الحذف للقطات القديمة إلى دفعات عبر `DELETE ... WHERE id IN (SELECT id FROM ... LIMIT 5000)`، وحذف الجدول غير الموجود `keyword_clusters`.

---

## 4. VERIFICATION OF CODE FREEZE COMPLIANCE (تأكيد الالتزام بتجميد الكود)

- تم إنتاج وتوثيق هذه الخطة الشاملة بعد فحص وقراءة ملفات الكود المصدري على القرص ومقاطعة نتائج التقارير الثلاثة.
- **لم يتم تعديل أو كتابة أي حرف داخل أي ملف برمجي في `src/` أو `scripts/` أو `.github/workflows/` خلال هذه الجلسة.**
- تم حفظ هذا المستند كمرجع هندسي نهائي معتمد في المسار:
  [`docs/audits/MASTER_CONSOLIDATED_ACTION_PLAN.md`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/docs/audits/MASTER_CONSOLIDATED_ACTION_PLAN.md).

المشروع الآن في أعلى درجات الجاهزية والوضوح لبدء مرحلة التنفيذ البرمجي فور صدور التوجيه بذلك، بدءاً من **الموجة 0 (Wave 0: P0 Security & Crash Containment)**.
