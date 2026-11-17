# 🐝 البرومبت الهندسي الهجين لإطلاق السرب وفريق العمل (`teamwork` + `swarm` — PAE v5.0 Master Audit & Clean SSOT Rebuild)

> **دليل الاستخدام:** فعّل شريحتي **`teamwork`** و**`🐝 swarm`** معاً في شريط المحادثة (كما في لقطة الشاشة الخاصة بك)، وأرفق مستودع `pin-arbitrage-engine`، ثم انسخ النص داخل القسم أدناه بالكامل والصقه مباشرة.
>
> **لماذا الإصدار الهجين `v5.0` هو الأدق؟**
> 1. **يدمج `teamwork` مع `swarm` بدون تضارب أدوات:** يوجه المنسق لاستخدام `swarm` لتوزيع وكلاء الهيكلة والتدقيق على 5 قنوات متخصصة بمساحات عمل معزولة (`workspace:"share"`)، واستغلال `teamwork` + خلية التحرير الهندسي (`chief-report-editor`) لتجميع مخرجات القنوات الخمس في **تقرير هندسي ومعماري شامل ومفصل سطراً بسطر**.
> 2. **يعالج فجوة اختلاف النسخ (`Commit 56720cc` في الملف المرفق مقابل `Commit c379443`):** بدلاً من افتراض أن إصلاحات الجولة 16 والهجرة `054` مطبقة مسبقاً وإهمال فحصها، يُلزم الوكلاء بفحص وتطبيق **كلتا المجموعتين من الإصلاحات** (إصلاحات البنية التحتية والواجهة + الألغام العميقة المكتشفة في `repository.mjs:269,303,439` و`server.mjs:33,136` و`fleet-router.mjs:2005,2014`).

---

## 📋 النص الجاهز للنسخ واللصق (مع تفعيل `teamwork` + `swarm`)

```markdown
@teamwork @swarm
أنت الآن **المنسق الهندسي الأعلى (Chief Swarm & Teamwork Coordinator)** المكلف بقيادة عملية **التدقيق الجنائي الشامل (Full Forensic Audit)، وتحرير التقرير المعماري المفصل، وتنفيذ إعادة الهيكلة الجذرية (Clean-Slate SSOT Rebuild)** لمشروع **Pin Arbitrage Engine (PAE)** الموجود في المستودع المرفق.

مهمتك تتكون من مسارين متوازيين ومتكاملين عبر استغلال خاصيتي **`swarm`** و**`teamwork`**:
1. **مسار التحقيق الميداني وإعادة الهيكلة (`swarm` Engineering & Verification Pods):** فحص كل زاوية في الكود وقاعدة البيانات والزواحف وبوابة Cloudflare والواجهة الأمامية، وبتر إرث الـ 99 شارد الوهمي، وتقليص الكود من ~104,000 سطر إلى ~18,000–22,000 سطر معياري نظيف.
2. **مسار تحرير التقرير الهندسي الشامل (`teamwork` Synthesis & Documentation Track):** تجميع كافة الكشوفات الجنائية، ومقارنات الكود (قبل/بعد)، ومخطط قاعدة البيانات الجديد، واستعلامات تطهير البيانات الحية في **تقرير هندسي ومعماري شامل ومفصل باللغة العربية**.

---

### أولاً: بروتوكول التشغيل الهجين الصارم (`Swarm` + `Teamwork` Orchestration Rules)

1. **لا تقم بالعمل التقني بنفسك في دور المنسق (Zero Inline Coding by Coordinator):** وظيفتك كـ Coordinator هي هيكلة الفريق، إطلاق الوكلاء، مراقبة اللوحة (`read_board` / `swarm_wait`)، التحكيم بين البنائين والمدققين، وتقديم التقرير النهائي الشامل للمستخدم.
2. **تسمية السرب فوراً:** استدعِ `swarm{action:"title", title:"PAE v5.0 Teamwork & Swarm Forensic Rebuild"}`.
3. **إضافة الراوي والمراقب (إن توفرت مهاراتهما):** إذا كانت مهارة `swarm_narrator` متاحة في قائمتك أضف العامل `narrator`، وإذا كانت `swarm_monitor` متاحة أضف العامل `monitor` في نفس الدورة الأولى.
4. **إنشاء 5 قنوات متخصصة (`channel`) لمنع الإيقاظ العشوائي:** إذا كانت أداة `swarm` تدعم `channel`، أنشئ القنوات الخمس التالية قبل إضافة الوكلاء، واجعل القناة `main` للقرارات العابرة للقنوات والتسليم النهائي لخلية تحرير التقرير فقط:
   - `#db-ssot`: لمخطط قاعدة البيانات الموحد (8-Table SSOT)، معادلات السرعة الذرية، وتطهير البيانات التاريخية (`Migration 055`).
   - `#runtime-infra`: لخادم التطبيق الأصيل (Fastify / Node.js)، بوابة Cloudflare (`wake-shield`)، والـ Auto-Deploy إلى InstaBox VPS.
   - `#core-crawlers`: لنواة Pinterest (`src/core/`)، محركات الزحف الموحدة، وعمال GitHub Actions عديمي الحالة.
   - `#backend-services`: لبتر `fleet-router.mjs`، توحيد `PinRepository` والدوسيه، ودمج خدمات الأعمال (`Pulse + Crossover` و`Creators`).
   - `#frontend-ui`: لتفكيك ملفات الواجهة العملاقة (`*-ui.mjs`) وتوحيد المكونات وإصلاح ثغرات العرض.
5. **عزل مساحات العمل ومنع تصادم الملفات (Strict Ownership & Zero File Collision):**
   - كل وكيل بناء (Author) يُضاف بخاصية `workspace:"share"` ويمتلك حصرياً مجلداته المحددة أدناه (يُمنع منعاً باتاً أن يعدل وكيلان نفس الملف).
   - المدققان (`verifier-backend` و`verifier-ui-e2e`) ومحررو التقرير (`chief-report-editor`) يُضافون بوضع `workspace:"inherit"` لمراجعة الفروقات (`git diff`) وتشغيل الاختبارات والإحالة بأرقام الرسائل (`#seq`) دون نسخ التقارير يدوياً.
   - استخدم `@name` كجرس إيقاظ فقط لمن عليه الدور التالي، ولا تستخدم `@all` إلا للقرارات المعمارية العامة.
6. **اعرض رابط اللوحة للمستخدم** في نهاية دور الإنشاء الأول كما تعيده أداة `swarm`.

---

### ثانياً: قائمة الألغام الجنائية الـ 12 التي يجب فحصها وإصلاحها وتوثيقها (Ground-Truth Forensic Checklist)

نظراً لأن المستودع قد يكون على لقطة الأرشيف (`Commit 56720cc`) أو فرع التعديلات الجزئية (`Commit c379443`)، **يُحظر افتراض أن أي إصلاح مطبق مسبقاً دون فحص الملف فعلياً**؛ يجب على كل وكيل التحقق من البنود التالية وتطبيقها وتوثيق حالتها في تقريره:

1. **لغم `src/server.mjs` المزدوج (السطر 33 والسطر 126–136):**
   - السطر 33 يستورد `createUniversalSqlClient` من `fleet-router.mjs` متجاوزاً `getSqlClient` في `src/db/client.mjs`، مما يحرم خادم التطبيق من إعدادات الحماية (`max_parallel_workers_per_gather: 0`).
   - السطور 126–136 تنفذ `await Promise.allSettled(bgPromises)` **قبل** إرسال `res.statusCode` و`res.end()` للمتصفح، مما يحوّل كل مهمة خلفية (`ctx.waitUntil`) إلى عملية معطّلة للاستجابة (Blocking HTTP I/O)!
2. **لغم انفجار `/dev/shm` وإعدادات الاتصال في `src/db/client.mjs` (الأسطر 70–100):**
   - التأكد من فرض `connection: { max_parallel_workers_per_gather: 0 }` في `src/db/client.mjs` لمنع خطأ PostgreSQL القاتل (`code 53100: could not resize shared memory segment "/PostgreSQL.*" to 16777216 bytes: No space left on device`) عند تشغيل استعلامات `/pulse` المتوازية.
   - التأكد من وجود `max_lifetime: 300` (5 دقائق)، و`keep_alive: 30`، و`onnotice: () => {}`، وخفض `max` في بيئة `GITHUB_ACTIONS` إلى `3` اتصالات لكل عامل بدلاً من `15` (`20 × 15 = 300` اتصال يستنزف قاعدة البيانات ونفق `cloudflared`).
3. **ألغام `src/modules/pins/repository.mjs` الثلاثة القاتلة (السطور 90 و269 و303 و439):**
   - في `insertNewPinsBatch` (السطر 90): يحول `save_count` غير المفحوص إلى `0` بدلاً من `NULL`، ويقبل `daily_save_velocity` في اليوم الأول بدلاً من تصفيرها.
   - في `resavePinsMetricsBatch` (السطر 269): الشرط `WHEN rb.daily_save_velocity IS NOT NULL` يثق بالسرعة الممررة من الخارج ويتجاوز حساب الفارق من `pins_daily_metrics`!
   - في `resavePinsMetricsBatch` (السطر 303): يكتب `delta_saves_24h = cb.effective_velocity` (يكتب معدل السرعة العشري المقسوم على الأيام داخل عمود الفارق الصحيح `delta_saves_24h`!).
   - في `getPinDossier` (السطر 439): يعيد كائناً ناقصاً `{ pin_id, creative, daily_trajectory, serp_positions }` يفتقر إلى `algorithmic_intelligence` و`pillar_1_creator_context` و`pillar_2_keywords_context` و`snapshots` التي تتوقعها واجهة `pin-details-ui.mjs`.
4. **ألغام `src/modules/sharding/fleet-router.mjs` في الدوسيه والسرعة (السطور 898–930 و1874 و1918–2014):**
   - في `sanitizeDossierTrajectory` (السطر 898): الحلقة تبدأ من `i = 1` فتتجاهل تصفير سرعة البن الذي يملك نقطة رصد واحدة فقط (`chrono.length === 1`)، وفي السطر `906–909` عندما يوجد رصدان في نفس اليوم (`Intraday checkpoint` الساعة 00:19 والساعة 07:44) تكتب فرق الخطوة الجزئية (`+99/d`) فوق السرعة اليومية الحقيقية (`+262.5/d`)، وفي السطر `926` تخزن `window_24h_delta = calDiff` (`+525`) دون قسمته على `calElapsed` (`2 يوم`) أو توضيح فترة القياس.
   - في السطر `1874`: يقرأ `boardName` من `masterRecord?.board_name` فقط ويتجاهل `hubSerpRows[0]?.board_name` و`snapMeta.board_name` (مما يظهر `Board: --` لـ 1,120 بن).
   - في السطور `1961–2014`: يحسب `is_repin` من `snapMeta.is_repin` فقط متجاهلاً `masterRecord.is_repin` ومتجاهلاً أن اختلاف `canonical_pin_id` عن `pin_id` يعني أن البن ليس أصلياً بالكامل، ويحسب `is_go_linkless` دون فحص `destination_url` الفارغ أو دومين `'Uploaded by user'`، ولا يمرر `reaction_count` داخل `dossier.creative`.
5. **لغم بوابة `workers/wake-shield/src/index.mjs` (السطور 354–380 و405–424):**
   - التأكد من فصل مسارات `/api/*` (`isApiDataRequest` بمهلة `15000ms`) عن طلبات التصفح `GET` (`3500ms`).
   - معالجة لغم السطور `371–376` (`catch (_) { isDown = true; }`): عند حدوث `TimeoutError` على استعلام API بطيء بينما الخادم مستيقظ، لا يجوز افتراض أن الخادم نائم وإرجاع `503 PAE dedicated instance is waking up`؛ بل يجب فحص `/api/health` بمهلة سريعة (`1500ms`) وإرجاع `504 Gateway Timeout` إذا كان الخادم مستيقظاً.
6. **لغم `src/modules/pulse/service.mjs` (السطران 299 و375):**
   - خفض `LIMIT 15000` المفرط في كل من `queryActiveSerp` (السطر 299) و`queryVaultAndVacuum` (السطر 375) إلى `LIMIT 2500`، وتوحيد منطق التجميع المشترك بين `getGlobal24hPulseService` و`calculateFolderCrossover` في `folders-service.mjs`.
7. **لغم الزواحف في `scripts/keyword-velocity-crawler.mjs` (السطور 353 و1120 و2172):**
   - إزالة جملتي `ALTER TABLE tracked_keywords ADD COLUMN IF NOT EXISTS crawl_lease_token...` (السطر 2172) إن وجدتا لمنع تنافس الأقفال `AccessExclusiveLock` بين الـ 20 عاملاً.
   - منع طرح `save_count` من لقطة سابقة غير مفحوصة (`todayPrevSnap.save_count === 0` من Phase 1A) في السطر 1120 (`444 - 0 = +444/d`).
8. **لغم البيانات التاريخية متعددة الأيام (ما فاته `Migration 054`):**
   - تصفير القفزات الوهمية ليس فقط للبنات ذات اليوم الواحد (`COUNT <= 1`)، بل أيضاً للبنات التي تملك لقطتين كانت أولاهما سطحية غير مفحوصة (`save_count = 0` من Phase 1A) والثانية مفحوصة في اليوم التالي (`save_count = 64,970` من Phase 1B).

---

### ثالثاً: هيكلة وكلاء السرب وفريق العمل (8 Specialized Agents Roster)

أنشئ الوكلاء الثمانية التاليين في الدورة الأولى وحدد لكل واحد منهم نطاق ملكيته ومهامه بدقة:

#### 1. الوكيل `db-architect` (القناة: `#db-ssot` | `workspace:"share"`)
* **الملكية الحصرية (`OWNS`):** `src/db/**`، `scripts/migrations/**`، `scripts/migrate.mjs`، و`src/lib/math.mjs`.
* **المهام الهندسية (تقرير + تنفيذ):**
  1. **بناء المخطط التأسيسي الموحد النظيف (`001_clean_ssot_schema.sql`) وهجرة التطهير الشاملة (`055_v5_ssot_and_velocity_truth.sql`):**
     - تصميم مخطط الـ **8 جداول القياسية (8-Table Clean SSOT Schema)** بدون تكرار لبيانات البن، وحذف الجداول الميتة (`pa_pins`, `pa_boards`, `pa_accounts`, `neon_projects_registry`).
     - جعل `universal_master_pins` (مع View `pins`) المصدر الأوحد لحقيقة البن (`save_count BIGINT NULL` لتمييز غير المفحوص عن الصفر الحقيقي، `saves_hydrated_at`, `baseline_saves`, `baseline_date`, `delta_saves_24h INT`, `daily_save_velocity NUMERIC(12,2)`, `step_save_delta INT`, `is_canonical_root BOOLEAN GENERATED ALWAYS AS (canonical_pin_id IS NULL OR canonical_pin_id = pin_id) STORED`).
  2. **دمج جداول الـ SERP والـ Vault الثلاثة في جدول علاقة واحد (`keyword_serp_positions`):**
     - جدول واحد مفتاحه `(keyword_id, pin_id)` بعمود `rank_position SMALLINT NULL` (`NOT NULL` = Active SERP، `NULL` = Displaced Vault) وعمود مولّد `is_displaced BOOLEAN GENERATED ALWAYS AS (rank_position IS NULL) STORED` مع Partial Indexes وViews توافقية (`keyword_serp_current` و`keyword_displaced_index`) تقرأ عبر `JOIN universal_master_pins USING (pin_id)`.
  3. **تطهير البيانات التاريخية في الهجرة `055` وضبط `src/db/client.mjs`:**
     - كتابة استعلامات SQL لتصفير قفزات السرعة الكاذبة (ليوم واحد أو ليومين بعد لقطة سطحية `save_count = 0`)، وتعبئة `board_name` من جدول السيرب، وتصحيح `is_repin` من `metadata`، وإنشاء `mv_pulse_24h_summary`.
     - تثبيت `max_parallel_workers_per_gather: 0` و`max_lifetime: 300` و`keep_alive: 30` و`onnotice: () => {}` في `src/db/client.mjs`.

#### 2. الوكيل `runtime-architect` (القناة: `#runtime-infra` | `workspace:"share"`)
* **الملكية الحصرية (`OWNS`):** `src/server.mjs`، `src/worker.mjs`، `workers/wake-shield/**`، `wrangler.toml`، و`.github/workflows/**`.
* **المهام الهندسية (تقرير + تنفيذ):**
  1. **تطوير خادم التطبيق الأصيل (Fastify / Node-Native Architecture) وإصلاح `src/server.mjs`:**
     - ربط `src/server.mjs` بـ `getSqlClient` من `src/db/client.mjs` بدلاً من `createUniversalSqlClient` في `fleet-router.mjs`.
     - **فك حظر `bgPromises` (السطر 126–136):** إرسال `res.statusCode` والـ Body وإنهاء `res.end()` فوراً للمتصفح، وتشغيل مهام `waitUntil` في طابور خلفي غير معطّل (`concurrency = 4`).
     - تقديم التصميم والتنفيذ للاستغناء عن غلاف Cloudflare Worker (`src/worker.mjs`) لصالح خادم Fastify/Node مباشر على InstaBox VPS، مع نقطة نهاية محمية `POST /api/internal/ingest` لاستقبال دفعات الزواحف.
  2. **تصليب `workers/wake-shield/src/index.mjs` وأتمتة النشر إلى InstaBox (`ci.yml`):**
     - فصل مهلة `/api/*` (`15000ms`) عن التصفح (`3500ms`)، وعند حدوث Timeout على `/api/*` التحقق من `/api/health` (`1500ms`) لإرجاع `504 Gateway Timeout` إذا كان الخادم مستيقظاً بدلاً من رسالة الاستيقاظ الكاذبة `503`.
     - إضافة خطوة Auto-Deploy في `.github/workflows/ci.yml` لتحديث `/data/app` داخل InstaBox VM تلقائياً عند كل Push إلى `main`.

#### 3. الوكيل `crawler-architect` (القناة: `#core-crawlers` | `workspace:"share"`)
* **الملكية الحصرية (`OWNS`):** `src/core/**` (جديد)، `scripts/lib/pinterest.mjs`، `src/modules/shared/pinterest-headers.mjs`، `src/modules/keywords/typeahead.mjs`، `src/modules/keywords/trends-service.mjs`، وجميع ملفات الزواحف في `scripts/*crawler*.mjs` و`scripts/*fleet*.mjs` و`scripts/cluster-intelligence.mjs`.
* **المهام الهندسية (تقرير + تنفيذ):**
  1. **توحيد نواة Pinterest في `src/core/pinterest-client.mjs` و`src/core/pinterest-parser.mjs`:**
     - فصل طبقة الشبكة (Circuit Breaker + ترويسات الضيف المجهول `_auth=0`) عن طبقة التفكيك (`__PWS_DATA__` + `PinResource` + `Pidgets` + الـ 48 حقلاً الخوارزمياً + معالجة سقف `10M+`) وإنتاج كائن قياسي `NormalizedPinDTO` يضع `save_count = null` عند غياب الرصيد الحقيقي بدلاً من `0`.
     - إبقاء Re-exports في `scripts/lib/pinterest.mjs` للتوافق العكسي وإنهاء الاستيرادات العكسية الخاطئة.
  2. **دمج الزواحف الخمسة وإنهاء انهيارات الـ 31 دقيقة في GitHub Actions:**
     - حذف `ALTER TABLE` من بداية تشغيل الزاحف، وإزالة دوال الشاردات الوهمية (`flushToStorageShards`, `registerTargetShards`, `commitSnapshotsToStorageShards`, `bulkSyncPinsToDeterministicShards`)، وإصلاح طرح `save_count` من صفر في `keyword-velocity-crawler.mjs:1120`.
     - تحويل العمال إلى إرسال الدفعات عبر `POST /api/internal/ingest` أو عبر `PinRepository.ingestPinsBatch` باتصال قصير العمر (`max: 3, max_lifetime: 300`).

#### 4. الوكيل `services-architect` (القناة: `#backend-services` | `workspace:"share"`)
* **الملكية الحصرية (`OWNS`):** `src/modules/**` (باستثناء `shared` و`typeahead`/`trends-service`)، `src/domain/**`، `src/routes/**`، و`src/utils.mjs`.
* **المهام الهندسية (تقرير + تنفيذ):**
  1. **بتر طبقة الـ Sharding (`fleet-router.mjs`) وتوحيد بوابة الكتابة الذرية `ingestPinsBatch`:**
     - إلغاء منطق الـ 99 شارد الوهمي في `src/modules/sharding/fleet-router.mjs` (3,187 سطراً) و`src/modules/fleet/` و`src/routes/fleet.mjs`.
     - بناء الدالة الذرية الوحيدة `ingestPinsBatch(sql, scrapedPins, context)` في `src/modules/pins/repository.mjs` وإصلاح أخطاء السطور `90` و`269` و`303`:
       - داخل CTE ذرية واحدة في PostgreSQL، تقارن `incoming.save_count` بآخر لقطة موثقة قبل اليوم (`snapshot_date < CURRENT_DATE AND save_count IS NOT NULL`):
         - **اليوم الأول للفحص العميق (`prev.save_count IS NULL`):** `is_baseline_day = TRUE`، و`delta_saves_24h = 0`، و`daily_save_velocity = 0` قطعياً.
         - **وجود لقطة موثقة في يوم تقويمي سابق:** `days_elapsed = CURRENT_DATE - prev.snapshot_date`، و`delta_saves_24h = GREATEST(0, incoming.save_count - prev.save_count)` (كعدد صحيح `INT`!)، و`daily_save_velocity = ROUND(delta_saves_24h::numeric / days_elapsed, 1)`.
         - **تحديث ثانٍ في نفس اليوم (`Intraday`):** يُحفظ الفارق الجزئي في `step_save_delta` فقط، وتظل `daily_save_velocity` محسوبة مقابل `prev.snapshot_date < CURRENT_DATE`.
  2. **توحيد دوال الدوسيه الخمس في `getPinDossier` وإصلاح ثغرات الحقول:**
     - دمج `fetchUniversalPinDossier` + `getPinDossier` + `getPinDeepDossier` + `getPinDetailWithMetrics` + `getFastEdgeDossier` في دالة واحدة تعيد العقد الكامل للواجهة.
     - إصلاح استرجاع `board_name` عبر `COALESCE(NULLIF(BTRIM(master.board_name), ''), NULLIF(BTRIM(serp.board_name), ''), NULLIF(BTRIM(meta->>'board_name'), ''))`.
     - إصلاح `is_repin` و`is_canonical_root` و`is_go_linkless` وتمرير `reaction_count` داخل `dossier.creative`.
  3. **دمج محرك `/pulse` مع `Folder Crossover` وتفكيك الملفات المتضخمة:**
     - خفض `LIMIT 15000` في `pulse/service.mjs` (السطران 299 و375) إلى `LIMIT 2500`، وتوحيد منطق التجميع مع `calculateFolderCrossover`.
     - توحيد دوال `normalizeCleanDomain` (4 نسخ) و`resolveCanonicalPinTitle` (4 نسخ) و`extractCanonicalAnnotations` (3 نسخ)، وتفكيك `creators/service.mjs` (5,376 سطراً).

#### 5. الوكيل `ui-architect` (القناة: `#frontend-ui` | `workspace:"share"`)
* **الملكية الحصرية (`OWNS`):** `src/*-ui.mjs`، `src/ui/**`، `src/edge-shield-client.mjs`، و`public/**`.
* **المهام الهندسية (تقرير + تنفيذ):**
  1. **تفكيك ملفات الواجهة العملاقة (`35,000+` سطر) وتوحيد المكونات:**
     - حذف المخلفات القديمة في `public/assets/aistudio/`، واستخراج وحدة تنسيق ومعادلات عرض موحدة (`src/ui/shared-formatters.mjs`) ومكون `PinCard` / `PinRow` المشترك لتقليص حجم `dashboard-ui.mjs` و`keywords-ui.mjs`.
  2. **إصلاح وتصليب ثغرات العرض في `pulse-ui.mjs` و`pin-details-ui.mjs`:**
     - في `src/pulse-ui.mjs` (الأسطر 1536–1555): زيادة محاولات إعادة الجلب عند `502/503/504` إلى 4 محاولات بفاصل `3000ms` مع عدم تصفير البطاقات السبع.
     - في `src/pin-details-ui.mjs`: التأكد من فحص `!is_repin && is_canonical_root !== false` لشارة `100% Original Creator Upload`، وإظهار `reactions` بجانب `comments` و`shares` تحت بطاقة `TOTAL ENGAGEMENT`، وعرض عدد الأيام التقويمية الفريدة مقابل اللقطات (`5 days / 6 snapshots`)، وتوضيح فترة قياس الفارق عندما يكون `calElapsed > 1` (`+525 (2d)`).

#### 6. المدقق الأول `verifier-backend` (القنوات: `#db-ssot`, `#runtime-infra`, `#core-crawlers`, `#backend-services` | `workspace:"inherit"`)
* **المهمة:** يفحص عبر `git diff` وأرقام الرسائل (`#seq`) مخرجات وكلاء الخلفية الأربعة، ويتحقق من سلامة SQL في الهجرة `055` و`001`، وإصلاح `repository.mjs:303` و`server.mjs:33,136`، والتزام الزواحف بـ `_auth=0`، ونجاح `npm run check`، ويرسل أي ملاحظة تصحيح مباشرة بالاسم (`@name`).

#### 7. المدقق الثاني `verifier-ui-e2e` (القنوات: `#frontend-ui`, `#runtime-infra` | `workspace:"inherit"`)
* **المهمة:** يفحص مخرجات `ui-architect` و`runtime-architect` (`wake-shield` و`ci.yml`)، ويشغل فحوصات سلامة الواجهة (`verify_dom_nesting.mjs`, `validate_inline_scripts.mjs`, `verify_real_browser_e2e.mjs`)، ويصادق على خلو الواجهات من أي خطأ قبل إبلاغ `@chief-report-editor` و`@coordinator`.

#### 8. خلية تحرير التقرير الهندسي `chief-report-editor` (عبر `teamwork` + القنوات الخمس | `workspace:"inherit"`)
* **المهمة:** قراءة كافة تقارير الوكلاء الخمسة ومصادقات المدققين عبر اللوحة (`read_board{channel:"*"}`) وتحرير **التقرير الهندسي والمعماري الشامل (Master Engineering Blueprint & Forensic Audit Report)** بأعلى معايير التوثيق الهندسي باللغة العربية، شاملاً:
  1. **التشريح الجنائي الكامل للمستودع (قبل وبعد):** جدول تفصيلي لكل ملف ودالة وسطر برمجي تم حذفه أو دمجه أو تطويره في الزوايا الخمس.
  2. **وثيقة معمارية قاعدة البيانات الجديدة (The 8-Table SSOT Schema) واستعلامات تطهير البيانات الحية (`Migration 055`):** مكتوبة بالكامل وجاهزة للتشغيل الفوري.
  3. **دراسة وهندسة خادم التطبيق (Fastify/Node مقابل Cloudflare Worker) وبوابة `wake-shield` وهيكلة الزواحف عديمة الحالة.**
  4. **خطة الانتقال والنشر التلقائي الآمن (Zero-Downtime Rollout Plan) على خادم InstaBox VPS.**

---

### رابعاً: ما أنتظره منك كمنسق في ردك النهائي

بعد اكتمال عمل السرب وفريق العمل ومصادقة المدققين، قدم لي التقرير الهندسي والمعماري المفصل الذي أعدته خلية التحرير بالكامل، مرفقاً بملخص الفروقات البرمجية المنفذة واستعلامات SQL الجاهزة للتطبيق.
```