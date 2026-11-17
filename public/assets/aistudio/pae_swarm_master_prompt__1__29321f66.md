# البرومبت الهندسي الشامل لإطلاق سرب الوكلاء (Master Swarm Prompt — PAE v2.0 Rebuild & Forensic Audit)

> **طريقة الاستخدام:** انسخ النص الموجود داخل القسم أدناه بالكامل والصقه مباشرة في محادثة جديدة بعد تفعيل أداة **Swarm**، مع إرفاق ملف المستودع (`pin-arbitrage-engine`). صُممت هذه البرومبت خصيصاً لتخاطب **منسق السرب (Swarm Coordinator)** وفق القواعد الصارمة لبروتوكول `swarm` (تقسيم القنوات، منع تصادم الملفات، عزل مساحات العمل `workspace:"share"`، التحقق المزدوج `Verifier`، والإحالة بأرقام الرسائل `#seq`).

---

## النص الجاهز للنسخ واللصق في Swarm

أنت الآن **منسق السرب الهندسي (Swarm Coordinator)** المسؤول عن مهمة مزدوجة وحاسمة لمشروع **Pin Arbitrage Engine (PAE)** الموجود في المستودع المرفق:
1. **إعداد التقرير الجنائي والمعماري الموحد النهائي** لمراجعة كل سطر وزاوية في المستودع (الكود، قاعدة بيانات PostgreSQL، الزواحف، طبقة Cloudflare Worker مقابل خادم Fastify مباشر على InstaBox VPS، والواجهات الأمامية).
2. **تنفيذ إعادة الهيكلة الشاملة (v2.0 Clean SSOT Rebuild)** لتقليص الكود من ~104,000 سطر إلى ~18,000–22,000 سطر معياري خالٍ من التكرار والألغام، مع الحفاظ بنسبة 100% على الجوهر الخوارزمي والاستثماري للمشروع.

---

### أولاً: القواعد الصارمة لإدارة السرب (Swarm Protocol Directives)

1. **تسمية السرب فوراً:** استدعِ `swarm{action:"title", title:"PAE v2.0 Forensic Audit & Clean SSOT Rebuild"}`.
2. **إضافة الراوي والمراقب (إن توفرت مهاراتهما):** إذا كانت مهارة `swarm_narrator` متاحة أضف العامل `narrator`، وإذا كانت `swarm_monitor` متاحة أضف العامل `monitor` في نفس الدورة الأولى.
3. **إنشاء 4 قنوات متخصصة (`channel`):** افصل النقاشات التقنية في قنوات مستقلة حتى لا تستيقظ جميع الوكلاء على كل رسالة، واجعل القناة `main` للقرارات العابرة للقنوات والتسليم النهائي فقط:
   - `#db-ssot`: لقاعدة البيانات، المخطط الموحد (8-Table SSOT)، ومعادلات السرعة الذرية.
   - `#runtime-infra`: لخادم التطبيق (Fastify/Node.js)، بوابة Cloudflare (`wake-shield`)، وخط النشر التلقائي إلى InstaBox VPS.
   - `#core-crawlers`: لمكتبة Pinterest الأساسية، محركات الزحف الموحدة، وعمال GitHub Actions.
   - `#services-ui`: لتفكيك `fleet-router.mjs`، دمج خدمات الأعمال، وتحديث الواجهات الأمامية (`*-ui.mjs`).
4. **منع تصادم الملفات وعزل مساحات العمل:**
   - كل عامل تعديل (Author) يُضاف بخاصية `workspace:"share"` ويمتلك حصرياً مجلداته المحددة أدناه (يُمنع منعاً باتاً أن يعدل عاملان نفس الملف).
   - المراجعون (Verifiers) يُضافون بوضع الوراثة الافتراضي `inherit` لمراجعة الفروقات (`git diff`) ونتائج الاختبارات عبر أرقام التسلسل (`#seq`) دون إعادة نسخ التقارير.
   - استخدم `@name` فقط لمن عليه الدور التالي، ولا تستخدم `@all` إلا للقرارات المعمارية العامة.

---

### ثانياً: توزيع وكلاء السرب ومهامهم التفصيلية (Swarm Roster & Scoped Briefs)

أنشئ الوكلاء الستة التاليين في الدورة الأولى وحدد لكل واحد منهم نطاق ملكيته ومهامه بدقة:

#### 1. الوكيل `db-architect` (القناة: `#db-ssot` | `workspace:"share"`)
* **ملكية الملفات الحصرية:** `src/db/**`، `scripts/migrations/**`، `scripts/migrate.mjs`، و`src/lib/math.mjs`.
* **المهام الهندسية المطلوبة (تقرير + تنفيذ):**
  1. **إنهاء تشتت مصادر الحقيقة (8-Table Clean SSOT Schema):** استبدال الـ 53 ملف هجرة المتناقضة في `scripts/migrations/` بملف تأسيسي واحد نظيف `001_clean_ssot_schema.sql`، وحذف الجداول الميتة (`pa_pins`, `pa_boards`, `pa_accounts`, `neon_projects_registry`, `pins_daily_snapshots`).
  2. **إلغاء تكرار بيانات البن في 5 جداول:** جعل جدول `universal_master_pins` (أو `pins`) هو المصدر الأوحد لحقيقة البن (`save_count`, `repin_count`, `daily_save_velocity`, `clean_domain`, `board_name`, `is_repin`, `canonical_pin_id`, `metadata`)، وتحويل `competitor_pins` إلى جدول ربط رشيق (`competitor_id, pin_id, board_id`) يقرأ تفاصيل البن عبر `JOIN` بـ `< 0.05ms`.
  3. **دمج جداول الـ SERP والـ Vault الثلاثة في جدول واحد (`keyword_serp_positions`):** استبدال عمليات `DELETE + INSERT` المستمرة بين `keyword_serp_current` و`keyword_displaced_index` و`pin_serp_positions` بجدول واحد مفتاحه `(keyword_id, pin_id)` يحتوي على `rank_position SMALLINT NULL` (إذا كان `NOT NULL` فهو Active SERP، وإذا كان `NULL` فهو في الـ Vault/Displaced) مع عمود مولّد `is_displaced BOOLEAN GENERATED ALWAYS AS (rank_position IS NULL) STORED` وفهارس جزئية (`Partial Indexes`).
  4. **قاعدة `save_count = NULL` الصارمة ومعادلة السرعة الذرية داخل PostgreSQL:**
     - التمييز القاطع بين `save_count IS NULL` (بن مكتشف سطحياً في Phase 1A ولم يُفحص عميقاً بعد) وبين `save_count = 0` (بن مفحوص فعلياً وحفظه صفر).
     - كتابة معادلة السرعة داخل CTE ذرية واحدة: عند أول فحص عميق للبن (`saves_hydrated_at IS NULL` أو لا توجد لقطة سابقة موثقة قبل اليوم)، يُسجل `is_baseline_day = TRUE` وتُضبط `delta_saves_24h = 0` و`daily_save_velocity = 0` قطعياً (مما يقضي نهائياً على ثغرة قفزة اليوم الأول `+444/d` و`+25,000/d` التي لوثت 1,148 بن).
     - عند وجود أكثر من فحص في نفس اليوم (Intraday Checkpoints)، تُحسب `daily_save_velocity` دائماً بالمقارنة مع آخر يوم تقويمي سابق (`snapshot_date < CURRENT_DATE AND save_count IS NOT NULL`) مقسومة على `calElapsed`، بينما يُحفظ فرق الخطوة الجزئية في `step_save_delta` فقط (للقضاء على ثغرة كتابة `+99/d` فوق `+262.5/d`).
  5. **إعدادات محرك PostgreSQL والعميل (`src/db/client.mjs`):**
     - ضبط `max_parallel_workers_per_gather: 0` لمنع انفجار الذاكرة المشتركة `/dev/shm` (`PostgresError 53100: No space left on device`).
     - إضافة `max_lifetime: 300` (5 دقائق)، و`keep_alive: 30`، و`onnotice: () => {}`، وتحديد سقف `max` بـ `3` اتصالات فقط لعمال الزحف و`10` للخادم الرئيسي.

#### 2. الوكيل `runtime-architect` (القناة: `#runtime-infra` | `workspace:"share"`)
* **ملكية الملفات الحصرية:** `src/server.mjs`، `src/worker.mjs`، `workers/wake-shield/**`، `wrangler.toml`، و`.github/workflows/**`.
* **المهام الهندسية المطلوبة (تقرير + تنفيذ):**
  1. **حسم معمارية الخادم (Fastify / Hono Native Node.js مقابل Cloudflare Worker):**
     - تقديم مقارنة هندسية حاسمة وتنفيذ التحول من ازدواجية `src/worker.mjs` + `src/server.mjs` إلى خادم Node.js أصيل وعالي الأداء (باستخدام **Fastify** أو **Hono** مع محول Node الأصلي) يعمل مباشرة على خادم InstaBox VPS.
     - **إصلاح اللغم الكارثي في `src/server.mjs` (السطر 126):** حالياً يقوم الخادم بانتظار جميع المهام الخلفية `await Promise.allSettled(bgPromises)` **قبل** إرسال `res.statusCode` و`res.end()` للمتصفح! يجب إرسال الاستجابة فوراً للمستخدم وتنفيذ مهام الخلفية في طابور غير معطّل (Non-blocking Queue بسقف توازي محدد `concurrency = 4`).
  2. **تقييم وإعادة هيكلة بوابة Cloudflare (`workers/wake-shield`):**
     - تحليل الخيارين: (أ) الاستغناء عن `wake-shield` إذا كان الخادم يعمل 24/7 خلف Cloudflare Tunnel مباشر، أو (ب) الإبقاء على `wake-shield` كبوابة رشيقة جداً (أقل من 150 سطراً) لإيقاظ InstaBox عند الخمول فقط.
     - إصلاح ثغرة المهلة القاتلة في `workers/wake-shield/src/index.mjs` (السطر 355): فصل مسارات `/api/*` عن شرط `request.method === 'GET'` ومنح `/api/pulse/*` مهلة `15000ms` بدلاً من `3500ms`، وعدم إرجاع كود `503` برسالة `PAE dedicated instance is waking up...` إلا عندما يفشل الاتصال بالنفق فعلياً (`502/503/504/530`) وليس عند بطء استعلام برمجي.
  3. **إلغاء الفجوة بين GitHub وخادم InstaBox الحي (Auto-Deploy Pipeline):**
     - تحديث `.github/workflows/ci.yml` لإضافة خطوة نشر تلقائية عند الدمج في `main` تستدعي واجهة InstaBox لتحديث `/data/app` (`git pull` + `migrate.mjs` + إعادة تشغيل نظيفة للخادم) حتى لا يظل خادم الإنتاج يعمل على Commit قديم.

#### 3. الوكيل `crawler-architect` (القناة: `#core-crawlers` | `workspace:"share"`)
* **ملكية الملفات الحصرية:** `scripts/lib/pinterest.mjs`، `src/modules/shared/pinterest-headers.mjs`، `src/modules/keywords/typeahead.mjs`، `src/modules/keywords/trends-service.mjs`، وجميع ملفات الزواحف في `scripts/*crawler*.mjs` و`scripts/*fleet*.mjs` و`scripts/cluster-intelligence.mjs`.
* **المهام الهندسية المطلوبة (تقرير + تنفيذ):**
  1. **نقل وتوحيد نواة Pinterest في `src/core/`:**
     - دمج `scripts/lib/pinterest.mjs` (2,622 سطراً) و`pinterest-headers.mjs` في وحدتين معياريتين داخل `src/core/`:
       - `src/core/pinterest-client.mjs`: مسؤولة عن الشبكة، Circuit Breaker، والالتزام الصارم بقاعدة الضيف المجهول (`_auth=0`) عند فحص البنات والـ SERP حتى لا تصفر Pinterest عدادات الحفظ.
       - `src/core/pinterest-parser.mjs`: مسؤولة عن تفكيك `__PWS_DATA__` و`PinResource` و`Pidgets` واستخراج الـ 48 حقلاً الاستثمارياً وإنتاج كائن قياسي موحد `NormalizedPinDTO`.
     - إنهاء جميع الاستيرادات العكسية الخاطئة (`import ... from '../../../scripts/lib/pinterest.mjs'`) داخل `src/`.
  2. **دمج الزواحف الخمسة ومنع انهيار عمال GitHub Actions بعد 31 دقيقة:**
     - توحيد `keyword-velocity-crawler.mjs`، `creator-velocity-crawler.mjs`، `crawler-engine.mjs`، `cluster-intelligence.mjs`، و`account-related-crawler.mjs` في محرك مهام معياري داخل `src/jobs/` يعتمد كلياً على دالة الإدخال الموحدة.
     - حذف جملتي `ALTER TABLE tracked_keywords ADD COLUMN IF NOT EXISTS crawl_lease_token...` من بداية تشغيل العمال (السطرين 2172–2173 في `keyword-velocity-crawler.mjs`) للقضاء على تنافس أقفال `AccessExclusiveLock` بين الـ 20 عاملاً.
     - تصميم آلية إرسال دفعات الزحف من GitHub Actions إما عبر نقطة نهاية HTTP مضغوطة (`POST /api/internal/ingest-batch`) أو عبر اتصالات قصيرة العمر ومحدودة (`max: 3`, `max_lifetime: 300`) لمنع موت المقابس (`TypeError: Cannot read properties of null (reading 'write')`) عبر نفق `cloudflared`.

#### 4. الوكيل `services-architect` (القناة: `#services-ui` | `workspace:"share"`)
* **ملكية الملفات الحصرية:** `src/modules/**`، `src/domain/**`، `src/routes/**`، و`src/utils.mjs`.
* **المهام الهندسية المطلوبة (تقرير + تنفيذ):**
  1. **بتر طبقة التشظية الوهمية (`Sharding Layer Eradication`):**
     - حذف `src/modules/sharding/fleet-router.mjs` (3,142 سطراً)، و`src/modules/fleet/service.mjs`، و`src/modules/fleet/guardrails.mjs`، و`src/routes/fleet.mjs`، وجميع دوال الـ 99 شارد الوهمية (`crc32`, `getPinShardId`, `resolveShardConnection`, `executeShardQueryWithCircuitBreaker`, `offloadKeywordCrawlToShards`, `hydrateDisplacedIndexFromShards`).
  2. **توحيد بوابة كتابة البنات (`PinRepository.ingestPinsBatch`) وبوابة قراءة الدوسيه (`PinRepository.getDossier`):**
     - دمج أنابيب الكتابة الستة المتضاربة في دالة واحدة ذرية داخل `src/modules/pins/repository.mjs`.
     - دمج دوال جلب تفاصيل البن الخمس (`fetchUniversalPinDossier`, `getPinDossier`, `getPinDeepDossier`, `getPinDetailWithMetrics`, `getFastEdgeDossier`) في دالة واحدة نظيفة.
     - إصلاح استرجاع `board_name` ليقرأ `COALESCE(NULLIF(master.board_name, ''), serp.board_name, meta.board_name)` (إصلاح الـ 1,120 بن التي يظهر فيها `Board: --`).
     - إصلاح حساب `is_canonical_root` و`is_repin` وتمرير `reaction_count` داخل `dossier.creative`، والتحقق من `destination_url` الفارغ أو `Uploaded by user` في `is_go_linkless`.
  3. **دمج محرك `/pulse` ومحرك `Folder Crossover`:**
     - دمج `src/modules/pulse/service.mjs` (`getGlobal24hPulseService`) و`calculateFolderCrossover` في `folders-service.mjs` في محرك تحليلي واحد يقبل `folderId = null` (للنبض العام) أو `folderId = $1` (للفولدر)، مع تقليص `LIMIT 15000` المفرط في `queryVaultAndVacuum` إلى `LIMIT 2500` أو الاعتماد على جدول Rollup/Materialized View.
  4. **توحيد الدوال المكررة وتفكيك الملفات المتضخمة:**
     - توحيد `normalizeCleanDomain` (المكررة في 4 ملفات)، و`resolveCanonicalPinTitle` (المكررة في 4 ملفات)، و`extractCanonicalAnnotations` (المكررة في 3 ملفات).
     - تقسيم ملف `src/modules/creators/service.mjs` (5,376 سطراً) إلى `creators/service.mjs` (إدارة الحسابات واللوحات) و`archive/service.mjs` (أرشيف البنات وقواعد التأهيل).

#### 5. الوكيل `ui-architect` (القناة: `#services-ui` | `workspace:"share"`)
* **ملكية الملفات الحصرية:** `src/*-ui.mjs`، `src/ui/**`، `src/edge-shield-client.mjs`، و`public/**`.
* **المهام الهندسية المطلوبة (تقرير + تنفيذ):**
  1. **تفكيك وحوش الـ Template Literals (أكثر من 35,000 سطر في `*-ui.mjs`):**
     - استخراج القوالب والمكونات المشتركة (`PinCard`, `VelocityBadge`, `SerpTable`, `PinInspectorDrawer`, `AppSidebar`) في هيكل معياري نظيف داخل `src/web/` مع فصل ملفات JavaScript/Alpine.js عن قوالب HTML، وتوحيد دوال التنسيق (`formatNumber`, `format24hSaveDelta`, `totalEngagementScore`) في وحدة واحدة.
     - حذف الـ 35 ميجابايت من الصور والمخلفات القديمة في `public/assets/aistudio/`.
  2. **إصلاح الثغرات البصرية والحسابية في الواجهات الحالية:**
     - في `src/pulse-ui.mjs` (الأسطر 1537–1551): زيادة محاولات إعادة الجلب عند استلام `503` من محاولة واحدة بعد `1200ms` إلى 4 محاولات بفاصل `3000ms` مع إبقاء حالة التحميل بدلاً من تصفير البطاقات السبع.
     - في `src/pin-details-ui.mjs` (السطر 755 و1363): عدم عرض شارة `100% Original Creator Upload` إلا إذا كان `!is_repin && is_canonical_root !== false`، وعرض شارة `Canonical Derivative` عندما يختلف `canonical_pin_id` عن `pin_id`.
     - في `src/pin-details-ui.mjs` (السطر 877): إظهار `reactions` بجانب `comments` و`shares` تحت بطاقة `TOTAL ENGAGEMENT` حتى يتطابق التفصيل النصي (`0 comments, 119 shares, 37 reactions`) مع المجموع (`156`).
     - في `src/pin-details-ui.mjs` (السطر 1075 و1846): حساب عدد الأيام التقويمية الفريدة في عداد اللقطات (`5 days / 6 snapshots`)، وعرض فترة القياس الفعلية (`+525 (2d)` أو القسمة على `calElapsed`) عندما يكون الفارق الزمني أكثر من يوم واحد.

#### 6. الوكيل `chief-verifier` (مراجع شامل عابر للقنوات | `workspace:"inherit"`)
* **المهمة:**
  - لا يعدل أي ملف بنفسه؛ يراقب مخرجات الوكلاء الخمسة عبر أرقام الرسائل (`#seq`)، ويفحص فروقات الكود (`git diff`)، ويتحقق من عدم وجود أي تعارض بين مخرجاتهم، ويشغل فحوصات القواعد النحوية والاختبارات، ويرسل ملاحظات التصحيح مباشرة بالاسم (`@db-architect`, `@runtime-architect`, إلخ) حتى تنجح جميع الفحوصات، ثم يخطر `@coordinator`.

---

### ثالثاً: المخرجات النهائية المطلوبة منك كمنسق للسرب (Final Deliverables)

عندما ينتهي الوكلاء ويصادق `@chief-verifier` على سلامة العمل، قدم لي مخرجين شاملين باللغة العربية:
1. **التقرير الهندسي والمعماري الشامل (Master Engineering & Audit Report):**
   - مراجعة دقيقة لكل زاوية من الزوايا الخمس (قاعدة البيانات والـ SSOT، خادم Fastify مقابل Cloudflare Worker، الزواحف وGitHub Actions، دمج الخدمات وحذف الـ Sharding، وتحديث الواجهة الأمامية).
   - جدول كامل بجميع الملفات والدوال التي حُذفت، والتي دُمجت، والتي أُنشئت، مع مقارنة عدد الأسطر والأداء قبل وبعد.
   - استعلامات SQL الجاهزة لتنظيف البيانات التاريخية المتأثرة في قاعدة البيانات الحية (Backfill & Sanitize للـ 1,148 بن ذات سرعة اليوم الأول الوهمية، والـ 1,120 بن الفاقدة لاسم البورد، والـ 8,724 بن ذات `is_repin` المتناقض).
2. **ملخص التعديلات البرمجية المنفذة وخطوات النشر الآمن على InstaBox VPS.**
