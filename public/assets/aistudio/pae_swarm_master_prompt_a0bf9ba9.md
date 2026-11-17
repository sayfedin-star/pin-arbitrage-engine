# 🐝 MASTER SWARM ORCHESTRATION PROMPT: PIN ARBITRAGE ENGINE (PAE) V4 — FULL FORENSIC AUDIT & CLEAN-SLATE ARCHITECTURAL REBUILD

انسخ هذا البرومبت بالكامل وأرسله مع تفعيل أداة **`swarm`** ليقوم المنسق (Swarm Coordinator) بتوزيع المهام بالتوازي على وكلاء متخصصين ومدققين (Verifiers) وفق بروتوكول `SKILL.md` الرسمي، دون أي تضارب في الملفات، لإصدار التقرير الهندسي الشامل وتنفيذ إعادة الهيكلة المعمارية.

---

## 📋 النص الكامل للبرومبت (انسخ من هنا إلى جلسة الـ Swarm)

```markdown
@swarm
أنت الآن المنسق العام للسرب (Swarm Coordinator) المسؤول عن قيادة عملية **المراجعة الهندسية الشاملة (Full Forensic Audit) وإعادة الهيكلة المعمارية الجذرية (Clean-Slate v4 Refactoring)** لمشروع **Pin Arbitrage Engine (PAE)**.

### ⚠️ قواعد تشغيل السرب الإلزامية (Mandatory Swarm Coordinator Rules - Per SKILL.md)
1. **لا تقم بالعمل التقني بنفسك (Do NOT Do Technical Work Inline):** وظيفتك كـ Coordinator هي التخطيط، تقسيم الملكيات، مراقبة لوحة الرسائل (`read_board` / `swarm_wait`)، التحكيم بين الوكلاء والمدققين، وتلخيص النتائج للمستخدم. يُمنع عليك كتابة الكود أو تشغيل الفحوصات الطويلة في دورك.
2. **سمِّ السرب فوراً:** استدعِ `swarm{action:"title", title:"PAE v4 Clean-Slate Audit & Rebuild"}`.
3. **إنشاء القنوات التخصصية (Channels):** إذا كانت عملية `channel` مدعومة في أداة `swarm`، أنشئ القنوات التالية قبل إضافة الوكلاء حتى لا يستيقظ كل وكيل على رسائل الأقسام الأخرى (وإبقاء `main` للقرارات العابرة للأقسام فقط):
   - `#db-ssot` (مخطط قاعدة البيانات الموحد والهجرات)
   - `#backend-fastify` (خادم Fastify ومحرك الإدخال الموحد والخدمات)
   - `#crawlers-edge` (الزواحف عديمة الحالة، بوابة Cloudflare Wake-Shield، وCI/CD)
   - `#frontend-ui` (تفكيك ملفات الواجهة العملاقة وتوحيد المكونات)
   - `#qa-verification` (التدقيق الجنائي واختبارات التكامل والمتصفح)
4. **عزل مساحات العمل ومنع تصادم الملفات (Zero File Collision & Workspace Isolation):**
   - كل وكيل بناء (Author) يحصل على قائمة ملفات حصرية يمتلكها (`OWNS`) وقائمة ملفات محظور عليه لمسها (`MUST NOT TOUCH`)، مع تمرير `workspace:"share"` عند التعديل المتوازي، بينما يحصل المدققون (Verifiers) على `workspace:"inherit"`.
   - أضف `narrator` و`monitor` في نفس الدور الأول **فقط إذا** كانت مهارات `swarm_narrator` و`swarm_monitor` موجودة في قائمة مهاراتك.
   - اترك حقل `model` فارغاً ليعمل جميع الوكلاء على نفس النموذج المختار.
5. **انضباط الإشارات (`@name` & `#seq`):**
   - `@name` هو جرس إيقاظ يكلّف دورة تشغيل؛ وجّه كل وكيل بأن يذكر فقط اسم النظير التالي أو المدقق المخصص له، ولا يذكر `@coordinator` إلا عند جهوزية المخرج النهائي أو وجود عائق يتطلب قراراً.
   - عند إحالة مدقق لمراجعة عمل وكيل، أشر إلى رقم الرسالة على اللوحة (`#4`, `#7`) ولا تنسخ التقارير يدوياً.
6. **اعرض رابط اللوحة للمستخدم** في نهاية دور الإنشاء الأول كما تعيده أداة `swarm`.

---

## 🧠 السياق المعماري الموحد للمشروع (Synthesized Alpha + Gamma + Codebase Truth)

يجب أن تضمّن في ملخصات التكليف (`brief`) لكل وكيل الحقائق الهندسية القطعية التالية التي كشفها فحص المستودع وتقريرا Alpha وGamma:

### 1. تشخيص المشكلة الجذرية ("متلازمة الطبقات الجيولوجية المتراكمة")
- المشروع يمتلك منطق أعمال (Domain Intelligence) استثنائياً في تحليل خوارزمية Pinterest، لكنه مرّ بثلاثة تحولات معمارية دون تنظيف آثارها:
  1. بدأ كـ Cloudflare Worker (`src/worker.mjs`) يتصل بـ **99 شارد في Neon Serverless** (`neon_projects_registry`) مع كاش متعدد في Cloudflare D1 (`edge_pins_metadata`) وCloudflare KV (`PIN_ENGINE_KV`).
  2. تقلّص في الهجرة `047` إلى 20 شارد افتراضياً.
  3. انتقل في الهجرات `048` إلى `054` إلى **قاعدة بيانات PostgreSQL واحدة وموحدة (`DATABASE_TOPOLOGY = "unified_postgres"`)** على خادم InstaBox VPS خلف بوابة الإيقاظ `workers/wake-shield`.
- **الكارثة الحالية في الكود:** رغم أن الهجرة `052_unified_clean_schema_ssot.sql` حذفت فعلياً جدول `neon_projects_registry` وأعمدة `shard_id` ودالة `pae_crc32_shard_id`، لا يزال المستودع يحتفظ بملف `src/modules/sharding/fleet-router.mjs` (3,187 سطراً) و`src/modules/fleet/` و`src/routes/fleet.mjs`، ولا تزال الزواحف والخدمات تقسم البنات برمجياً إلى 99 مجموعة ثم تكتبها في حلقات على نفس اتصال قاعدة البيانات!

### 2. القرارات المعمارية الحاسمة (The 7 Architectural Pillars of PAE v4)

#### المحور الأول: الاستغناء عن `src/worker.mjs` والتحول إلى خادم Node.js أصيل (Fastify) على الـ VPS + تقليص Cloudflare Worker إلى بوابة `wake-shield` فقط
- **إلغاء الازدواجية المشوهة:** حالياً الكود مكتوب كـ Cloudflare Worker (`src/worker.mjs` بـ 1,146 سطراً) ثم يُلف داخل محول HTTP بدائي في `src/server.mjs` (197 سطراً) حيث يقوم السطر `136` (`await Promise.allSettled(bgPromises)`) **بتعطيل إرسال استجابة HTTP للمتصفح** حتى تنتهي جميع مهام الخلفية `ctx.waitUntil`!
- **الحل المعتمد:**
  1. بناء خادم **Fastify** (أو Node HTTP قياسي عالي الأداء مع Router تصريحي) أصيل يعمل مباشرة على InstaBox VPS، مع طابور مهام خلفية غير معطّل للاستجابة (Non-blocking Background Queue بسقف توازي `concurrency: 4`).
  2. إلغاء دور Cloudflare Worker كتطبيق خلفي (`src/worker.mjs` يُفكك وتُنقل مساراته إلى خادم Fastify)، وحصر وجود Cloudflare Workers حصرياً في **`workers/wake-shield`** (بوابة مصادقة Zero-Trust + إيقاظ تلقائي للـ InstaBox VM).
  3. **إصلاح `workers/wake-shield/src/index.mjs`:** الفصل الصارم بين أخطاء نفق الشبكة وتوقف الـ VM (`502, 503, 504, 520-530` أو فشل الاتصال) وبين أخطاء التطبيق البرمجية (`500 Internal Server Error` التي تعيد JSON من الخادم)، وإلغاء مهلة الـ 3.5 ثانية العمياء على مسارات الـ API الثقيلة حتى لا تُخفى الأخطاء البرمجية خلف شاشة `"PAE dedicated instance is waking up"`.

#### المحور الثاني: مخطط قاعدة البيانات الموحد النظيف (The Clean 8-Table SSOT Schema)
بدلاً من 24+ جدولاً متداخلاً و54 ملف هجرة متناقض، وتكرار رقم `save_count` و`daily_save_velocity` في 5 جداول منفصلة (`universal_master_pins`, `pins_daily_metrics`, `keyword_serp_current`, `keyword_displaced_index`, `competitor_pins`, `pa_pins`)، يُعاد بناء المخطط التأسيسي الموحد (`001_clean_ssot_schema.sql` + هجرة انتقالية آمنة `055_v4_ssot_consolidation.sql`) وفق القواعد التالية:
1. **جدول `pins` (أو `universal_master_pins` مع View متوافق) كمصدر حقيقة أوحد (Single Source of Truth):**
   - هو المكان **الوحيد** الذي يخزن بيانات البن الإبداعية ومقاييسه الحالية: `save_count BIGINT NULL` (**يكون `NULL` إذا لم يُفحص عميقاً بعد، وليس `0` كاذباً!**)، `repin_count`, `comment_count`, `share_count`, `reaction_count`, `saves_hydrated_at TIMESTAMPTZ`, `baseline_saves BIGINT`, `baseline_date DATE`, `delta_saves_24h INT`, `daily_save_velocity NUMERIC(12,2)`, `gains_5d`, `gains_7d`, `gains_10d`, `gains_15d`.
   - أعمدة مولّدة/مفهرسة تلقائياً: `clean_domain`، و`is_canonical_root BOOLEAN GENERATED ALWAYS AS (canonical_pin_id IS NULL OR canonical_pin_id = pin_id) STORED`.
2. **جدول السجل التاريخي اليومي `pins_daily_metrics`:**
   - مفتاح أساسي مركب `(pin_id, snapshot_date)` مع تقسيم أو فهرس `idx_pdm_pin_snapshot_desc (pin_id, snapshot_date DESC)`.
   - يميز بصرامة بين `save_count IS NULL` (سطحي غير مفحوص) و`save_count = 0` (مفحوص فعلياً وحفظه صفر)، مع عمود `is_baseline_day BOOLEAN`.
3. **دمج جداول السيرب والـ Vault الثلاثة في جدول علاقة رشيق واحد (`keyword_serp_positions`):**
   - يستبدل كلاً من `keyword_serp_current` و`keyword_displaced_index` و`pin_serp_positions` بجدول ربط رشيق واحد مفتاحه `(keyword_id, pin_id)` **لا ينسخ بيانات البن أو عداداته إطلاقاً** (لأن `JOIN pins USING (pin_id)` في نفس قاعدة البيانات يستغرق `< 0.05ms` ويمنع 100% تضارب الأرقام بين الكلمات والفولدر والـ Pulse والدوسيه!).
   - الأعمدة: `rank_position SMALLINT NULL` (إذا كان `NOT NULL` فهو Active SERP، وإذا كان `NULL` فهو في الـ Displaced Vault)، `prev_rank_position SMALLINT`, `last_known_rank SMALLINT`, `is_displaced BOOLEAN GENERATED ALWAYS AS (rank_position IS NULL) STORED`, `displaced_at TIMESTAMPTZ`, `first_ranked_at TIMESTAMPTZ`, `last_seen_at TIMESTAMPTZ`.
   - مع فهرسين جزئيين (Partial Indexes):
     - `CREATE INDEX idx_ksp_active ON keyword_serp_positions (keyword_id, rank_position) WHERE rank_position IS NOT NULL;`
     - `CREATE INDEX idx_ksp_vault ON keyword_serp_positions (keyword_id, last_known_rank) WHERE rank_position IS NULL;`
4. **تطهير جداول المنافسين والأرشيف (`competitor_profiles`, `competitor_boards`, `competitor_pins`):**
   - حذف الجداول الميتة المكررة (`pa_pins`, `pa_boards`, `pa_accounts`, `neon_projects_registry`, `keyword_pins_snapshots`, `pa_pin_metrics`).
   - جعل `competitor_pins` جدول ربط رشيق يشير إلى `pins(pin_id)` دون نسخ متناقض للمقاييس.
5. **إنشاء Materialized View لصفحة النبض (`mv_pulse_24h_summary`) وضبط ذاكرة PostgreSQL:**
   - حل مشكلة استنزاف `/dev/shm` في PostgreSQL والبطء في `/pulse` عبر ضبط `max_parallel_workers_per_gather: 0` في `src/db/client.mjs`، وإنشاء `mv_pulse_24h_summary` يُحدَّث عبر `REFRESH MATERIALIZED VIEW CONCURRENTLY` بعد كل دفعة زحف لتقرأ `/pulse` النتائج في `< 5ms`.

#### المحور الثالث: بوابة الإدخال وحساب السرعة الوحيدة (`src/core/pin-ingestion.service.mjs`)
- **إعدام أنابيب الكتابة الـ 6 المتضاربة** (`writeBatchToDeterministicShards`, `syncPinAcrossAllFourPillars`, `insertNewPinsBatch`, `resavePinsMetricsBatch`, `bulkUpsertPaPins`, `upsertCompetitorPins`, ومعادلات السرعة المبعثرة في الزواحف والواجهة).
- **بناء دالة واحدة فقط في النظام كله:** `ingestPinsBatch(sql, scrapedPins, context)` داخل CTE ذرية واحدة (ACID) في PostgreSQL تطبق القوانين الرياضية الصارمة التالية:
  1. إذا كان البن قادماً من اكتشاف سطحي لم يفحص عداد الحفظ بعد، يُحفظ بـ `save_count = NULL` و`is_deep_hydrated = FALSE`.
  2. عند وصول `incoming.save_count IS NOT NULL`، يُقارن بآخر لقطة موثقة قبل اليوم (`snapshot_date < CURRENT_DATE AND save_count IS NOT NULL`):
     - **الحالة أ (لا توجد لقطة سابقة موثقة بـ `save_count IS NOT NULL`):** هذا أول يوم يُعرف فيه رصيد البن الحقيقي (`is_baseline_day = TRUE`). يُسجل `save_count = incoming.save_count`، وتُضبط `delta_saves_24h = 0` و`daily_save_velocity = 0` قطعياً (صفر قفزات Hydration وهمية مثل `0 -> 220,019` أو `+25,000/d`!).
     - **الحالة ب (توجد لقطة موثقة في يوم تقويمي سابق):**
       $$\text{days\_elapsed} = \text{CURRENT\_DATE} - \text{prev.snapshot\_date}$$
       $$\text{delta\_saves\_24h} = \max(0, \text{incoming.save\_count} - \text{prev.save\_count})$$
       $$\text{daily\_save\_velocity} = \text{ROUND}\left(\frac{\text{delta\_saves\_24h}}{\text{days\_elapsed}}, 1\right)$$
     - **الحالة ج (تحديث ثانٍ في نفس اليوم `Intraday Re-scrape`):** يُقارن دائماً بلقطة اليوم التقويمي السابق (`snapshot_date < CURRENT_DATE`) وليس بلقطة الصباح، فلا تُصفَّر السرعة اليومية ولا تُكتب فوقها قفزة جزئية!
  3. الحفاظ على `board_name` عبر `COALESCE(NULLIF(EXCLUDED.board_name, ''), pins.board_name)` وحماية `visual_annotations` من التصفير عند أخطاء `429`.

#### المحور الرابع: الزواحف عديمة الحالة (`Stateless Scrapers`) وثوابت Pinterest الخوارزمية
- **فصل عمال GitHub Actions عن قاعدة البيانات (Zero Direct DB Tunnel from GH Runners):**
  - بدلاً من فتح 20 عامل GitHub Actions لاتصالات PostgreSQL عبر نفق TCP (مما يسبب انهيار `socket.write on null` بعد 31 دقيقة واستنزاف 300 اتصال)، يتحول العمال إلى **Stateless Scrapers** يجلبون البيانات من Pinterest ويرسلون دفعات JSON مضغوطة إلى `POST /api/internal/ingest` (محمية بـ `API_SECRET_KEY` وفحص `timingSafeEqualStr`)، ليقوم خادم الـ VPS بكتابتها محلياً عبر `ingestPinsBatch` في `< 100ms`!
- **دمج الزواحف الـ 6 في محرك معياري واحد (`src/crawler/`):**
  - `pinterest-http.mjs`: إدارة الطلبات، الجلسة المجهولة الصارمة (`_auth=0` — يُمنع منعاً باتاً إرسال كوكيز تسجيل دخول في جلب الدبابيس أو السيرب لأن Pinterest يصفر العدادات العامة!)، الترويسات القياسية (`Chrome/131.0.0.0`), والـ Circuit Breaker.
  - `pinterest-parser.mjs`: استخراج الـ 48 حقلاً الخوارزمياً من `__PWS_DATA__` و`PinResource` و`Pidgets` (`method === 'carousel'`, `utm_link`, `tracked_link`, `closeupUnifiedAttribution.followerCount`, `shoppingFlags`, `isProduct`, `seo_noindex_reason`، ومعالجة سقف الـ `10,000,001` / `10M+` في مشاهدات المنافسين).
  - `strategies/`: ثلاث استراتيجيات خفيفة فقط (`keyword.strategy.mjs`, `creator.strategy.mjs`, `cluster.strategy.mjs`).

#### المحور الخامس: دمج خدمات الخلفية (`src/modules/`) وحذف `fleet-router.mjs`
1. **حذف كامل لطبقة التشظية:** إزالة `src/modules/sharding/fleet-router.mjs` و`src/modules/fleet/` و`src/routes/fleet.mjs`.
2. **دمج دوال جلب ملف البن الـ 5 في خدمة واحدة (`src/modules/pins/dossier.service.mjs`):**
   - دمج `fetchUniversalPinDossier` + `getPinDossier` + `getPinDeepDossier` + `getPinDetailWithMetrics` + `getFastEdgeDossier` في دالة واحدة `getPinDossier(sql, pinId, { keywordId, timeframe })` تقرأ باستعلام نظيف ومباشر.
3. **توحيد محرك التقاطع والنبض (`Crossover & Pulse Engine`):**
   - دمج المنطق المشترك (90% متطابق) بين `calculateFolderCrossover` (`folders-service.mjs`) و`getGlobal24hPulseService` (`pulse/service.mjs`) في محرك تجميع واحد يقبل فلتر `folderId` اختيارياً، فلا تعمل صفحة الفولدر بينما تتعطل `/pulse`.
4. **توحيد دوال التطبيع المكررة في `src/domain/`:**
   - `pin-normalizer.mjs`: يدمج النسخ الـ 4 لاستخراج العناوين (`resolveCanonicalPinTitle`, `derivePinTitle`, `extractPinTitle`, `cleanHumanTitle`).
   - `domain-normalizer.mjs`: يدمج النسخ الـ 4 لتنظيف الدومين (`normalizeCleanDomain` × 2، `cleanExternalDomain`, `normalizeDomain`).
   - `taxonomy.mjs`: يدمج النسخ الـ 3 لمعالجة الوسوم والـ Lemmatization (`extractCanonicalAnnotations`, `extractCleanAnnotations`, `normalizeTagLemma`) مع دعم كامل للغات المتعددة (`NFKD`) وسقف 15 وسماً.
5. **تفكيك `src/modules/creators/service.mjs` (5,376 سطراً):**
   - تقسيمه إلى `competitors.repository.mjs` (< 500 سطر) و`qualification.engine.mjs` (< 350 سطر) بعد إزالة استعلامات `UNION` المعقدة مع جداول `pa_*` الملغاة.

#### المحور السادس: تفكيك الواجهة الأمامية العملاقة (`35,000+` سطر في `*-ui.mjs`)
- الإبقاء على سرعة وبساطة **Tailwind CSS (مبني محلياً بدون CDN) + Alpine.js + Lucide (محلي)**، مع إنهاء كتابة HTML وJS داخل Template Literals ضخمة:
  - فصل القوالب في `src/web/views/pages/` ومكونات HTML قابلة لإعادة الاستخدام في `src/web/views/partials/` (مثل مكون بطاقة وصف البن الموحد `pin-row.html` / `pin-card.html` المستخدم في الكلمات والفولدر والـ Pulse والدومينات والحسابات).
  - فصل منطق Alpine.js إلى ملفات `.js` حقيقية في `public/js/` قابلة للفحص بـ ESLint، مع ملف موحد `public/js/formatters.js` (لتنسيق الأرقام، السرعة، `safeUrl`, `sanitizeCsvCell`) يلغي إعادة حساب السرعة في المتصفح.

#### المحور السابع: النشر التلقائي إلى InstaBox VM (`CI/CD Auto-Deploy`) والاختبارات الحقيقية
- تحديث `.github/workflows/ci.yml` ليقوم عند كل Push ناجح إلى `main` بمزامنة `/data/app` داخل InstaBox VM عبر `POST https://api.instabox.sh/v1/machines/:id/exec` (`git pull && node scripts/migrate.mjs && graceful reload`) ونشر `workers/wake-shield`.
- حذف سكربتات الفحص النصي الهشة (`verify_regression_locks.mjs` و35 ملف `scripts/test_phase*.mjs`) واستبدالها بحزمة اختبارات تكامل ووحدات حقيقية باستخدام `node:test` في `tests/`.

---

## 👥 هيكلة السرب المطلوبة وتوزيع الملكيات (Swarm Roster & Strict Ownership Matrix)

قم بإنشاء السرب عبر `swarm{action:"add", ...}` بالوكلاء الـ 8 التاليين (6 منفذين + 2 مدققين بصلاحية النقض Veto):

| اسم الوكيل (`name`) | القناة (`channel`) | مساحة العمل (`workspace`) | الملكية الحصرية (`OWNS`) | محظور عليه لمسه (`MUST NOT TOUCH`) | المخرج المطلوب (`Deliverable`) |
|---|---|---|---|---|---|
| **`db-architect`** | `db-ssot` | `share` | `src/db/`, `scripts/migrations/`, `scripts/migrate.mjs` | `src/web/`, `src/crawler/`, `workers/` | 1. تقرير تدقيق قاعدة البيانات والـ 54 هجرة.<br>2. كتابة `001_clean_ssot_schema.sql` و`055_v4_ssot_consolidation.sql` (مخطط الـ 8 جداول + `keyword_serp_positions` + `mv_pulse_24h_summary`).<br>3. تحديث `src/db/client.mjs` (`max_parallel_workers_per_gather: 0`). |
| **`core-ingestion`** | `backend-fastify` | `share` | `src/core/`, `src/domain/`, `src/lib/`, `src/modules/pins/`, `src/modules/sharding/` (للحذف/التحويل) | `src/web/`, `workers/`, `scripts/migrations/` | 1. تقرير تدقيق الـ 6 أنابيب للكتابة وحسابات السرعة.<br>2. بناء `src/core/pin-ingestion.service.mjs` (`ingestPinsBatch` بالـ CTE الذرية وقاعدة `save_count IS NULL` vs `0`).<br>3. بناء `src/modules/pins/dossier.service.mjs` وتوحيد `src/domain/{pin-normalizer,domain-normalizer,taxonomy}.mjs` وبتر `fleet-router.mjs`. |
| **`server-modules`** | `backend-fastify` | `share` | `src/server.mjs`, `src/app.mjs`, `src/worker.mjs`, `src/routes/`, `src/modules/{keywords,creators,domains,cluster,pulse,fleet}/` | `src/db/`, `src/core/`, `src/web/` | 1. تقرير تدقيق الخادم والـ Modules.<br>2. استبدال غلاف `src/worker.mjs` بخادم Fastify/Node أصيل غير معطّل للمهام الخلفية.<br>3. دمج محرك `Crossover + Pulse`، وتفكيك `creators/service.mjs`، وإضافة نقطة `POST /api/internal/ingest`. |
| **`crawler-engine`** | `crawlers-edge` | `share` | `src/crawler/`, `scripts/lib/pinterest.mjs`, `scripts/*crawler*.mjs`, `scripts/*fleet*.mjs`, `scripts/cluster-intelligence.mjs`, `scripts/vps-scheduler.mjs` | `src/db/`, `src/modules/`, `src/web/` | 1. تقرير تدقيق الزواحف الـ 6 ومكتبة `pinterest.mjs`.<br>2. بناء `src/crawler/{pinterest-http,pinterest-parser}.mjs` (الحفاظ الصارم على `_auth=0` والـ 48 حقلاً وسقف `10M+`).<br>3. تحويل الزواحف إلى Stateless Scrapers تدفع عبر `POST /api/internal/ingest`. |
| **`edge-cicd`** | `crawlers-edge` | `share` | `workers/wake-shield/`, `wrangler.toml`, `.github/workflows/`, `src/edge-shield-client.mjs` | `src/modules/`, `src/db/`, `src/web/` | 1. تقرير تدقيق Cloudflare Worker وWake-Shield وGitHub Actions.<br>2. تصليب `workers/wake-shield/src/index.mjs` (تمييز أخطاء النفق عن أخطاء 500، وإلغاء المهلة العمياء).<br>3. تحديث `.github/workflows/` للزواحف عديمة الحالة والـ Auto-Deploy إلى InstaBox VM. |
| **`ui-architect`** | `frontend-ui` | `share` | `src/web/`, `public/`, `src/*-ui.mjs`, `src/ui/` | `src/db/`, `src/core/`, `src/crawler/`, `workers/` | 1. تقرير تدقيق ملفات الواجهة الـ 9 (`35,000+` سطر) ومخلفات `public/assets/aistudio/`.<br>2. استخراج القوالب إلى `src/web/views/` ومنطق Alpine إلى `public/js/` مع `formatters.js` موحد ومكون `pin-row` مشترك، وحذف صور `aistudio` الميتة. |
| **`verifier-backend`** | `qa-verification` | `inherit` | `tests/backend/`, فحص مخرجات `db-architect`, `core-ingestion`, `server-modules`, `crawler-engine` | يُمنع تعديل كود المصدر (يكتب تقارير الخلل ويُشغّل الاختبارات فقط) | فحص جنائي للكود والاستعلامات والرياضيات وثوابت Pinterest، وتشغيل اختبارات التكامل على `ingestPinsBatch` و`getPinDossier` والزواحف، وإرجاع أي خلل للوكيل المسؤول عبر `@name`. |
| **`verifier-e2e-edge`** | `qa-verification` | `inherit` | `tests/e2e/`, فحص مخرجات `edge-cicd`, `ui-architect`, وتجميع التقرير النهائي الموحد | يُمنع تعديل كود المصدر (يفحص فقط ويملك حق النقض Veto) | فحص geometry الواجهة في المتصفح، التحقق من عدم وجود `[SERP #null]` أو `NaN` أو تصفير سرعة، مراجعة `wake-shield` وCI/CD، وتدقيق التقرير النهائي الشامل قبل تسليمه لـ `@coordinator`. |

---

## 🚀 خطة العمل المرحلية التي ستقود بها السرب (Execution Protocol)

### المرحلة الأولى: الفحص الجنائي العميق وإصدار المخطط التنفيذي (Forensic Audit & Blueprint Phase)
- في رسالة التكليف الأولى (`brief`) لكل وكيل من الوكلاء الـ 6، اطلب منه:
  1. فحص جميع الملفات الواقعة ضمن نطاقه (`OWNS`) سطراً بسطراً.
  2. نشر تقرير تدقيق مفصل على لوحة السرب يتضمن:
     - الملفات والدوال التي سيحذفها نهائياً (مع أرقام الأسطر والسبب الهندسي).
     - الملفات والدوال التي سيدمجها، وكيف ستتصل ببقية الطبقات (Interfaces & Contracts).
     - الثغرات والأخطاء المنطقية المكتشفة في الكود الحالي ضمن نطاقه.
  3. إشعار المدقق المختص (`@verifier-backend` أو `@verifier-e2e-edge`) لمراجعة المخطط قبل كتابة الكود النهائي.

### المرحلة الثانية: التنفيذ المتوازي وإعادة الهيكلة (Parallel Implementation & Consolidation)
- بعد مصادقة المدققين على عقود الربط (Interfaces) بين `db-architect` و`core-ingestion` و`server-modules` و`crawler-engine` و`ui-architect`، يبدأ كل وكيل بتنفيذ التعديلات في مساحة عمله (`workspace:"share"`).
- يقوم `verifier-backend` و`verifier-e2e-edge` بمراجعة الـ Diffs وتشغيل الاختبارات، وإرسال أي ملاحظة مباشرة إلى المؤلف (`@core-ingestion fix ... in #12`) حتى تصبح جميع الفحوصات خضراء 100%.

### المرحلة الثالثة: الدمج والتقرير الهندسي النهائي الشامل (Final Merge & Master Report)
- بعد اعتماد المدققين، ادمج التغييرات وقدم لي في المحادثة **التقرير الهندسي الشامل والنهائي** الذي يغطي:
  1. مراجعة الكود التفصيلية (قبل وبعد) وخارطة الملفات والدوال المحذوفة والمدمجة.
  2. مراجعة وتصميم قاعدة البيانات الموحدة (الـ 8 جداول، معالجة `NULL` مقابل `0`، وجدول `keyword_serp_positions`، و`mv_pulse_24h_summary`).
  3. معمارية الزواحف عديمة الحالة (Stateless Scrapers) وثوابت Pinterest الـ 48.
  4. معمارية الخادم الجديد (Fastify بدون غلاف `src/worker.mjs`) وبوابة Cloudflare `wake-shield` والـ Auto-Deploy إلى InstaBox.
  5. معمارية الواجهة الأمامية الجديدة بعد تفكيك ملفات الـ 35,000 سطر.

ابدأ الآن بتسمية السرب، وإنشاء القنوات، وإضافة الوكلاء بملخصات تكليف (`brief`) صارمة ومفصلة، ثم اعرض لي رابط لوحة السرب (Swarm Board).
```
