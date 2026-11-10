# 🏛️ تقرير التدقيق الجنائي الهندسي الشامل لمستودع Pin Arbitrage Engine
> **وضع التحقيق:** قراءة فقط بنسبة 100% (STRICT READ-ONLY FORENSIC AUDIT — ZERO CODE MUTATIONS)  
> **التاريخ:** 2026-11-10  
> **نطاق التحقيق:** كشف وتوثيق كافة بقايا معمارية الشاردات الـ 99، وقواعد بيانات Neon الـ 20، وكاش الذاكرة والحافة، وثغرات الزواحف وسرعات الحساب، وخريطة فك الارتباط مع أقفال الاختبارات تمهيداً للتحول إلى Single Native VPS PostgreSQL SSOT.

---

## الفهرس العام
1. [المحور الأول: بقايا الشاردات الـ 99 وقواعد Neon الـ 20 وجدول neon_projects_registry](#1)
2. [المحور الثاني: بقايا الكاش والتخزين المؤقت (In-Memory, Edge, Prefetch, Storage)](#2)
3. [المحور الثالث: ثغرات وحالات حدية في الزواحف وحسابات السرعة واللقطات اليومية](#3)
4. [المحور الرابع: خريطة فك الارتباط مع أقفال الفحص ومجموعات الاختبارات](#4)
5. [المحور الخامس: خطة التطهير والتحول النهائي المقترحة](#5)

---

<a name="1"></a>
## 1. بقايا الشاردات الـ 99 وقواعد Neon الـ 20 وجدول `neon_projects_registry`

### 1.1 ملفات التوجيه والأسطول المركزية
#### `src/modules/fleet/guardrails.mjs`
- **[Lines 43–48]**: دالة `auditFleetSchemaVersions(hubSql)` تنفذ استعلاماً مباشراً:
  ```sql
  SELECT project_id, project_name, database_url, assigned_shards, is_hub 
  FROM neon_projects_registry WHERE status = 'active'
  ```
  بدون أي فحص لـ `isUnifiedPostgres(env)` أو التحقق من وجود الجدول. تتسبب في انهيار فوري إذا تم إسقاط الجدول، وتنشئ عملاء SQL وهميين لكل شارد عبر `createUniversalSqlClient(s.database_url)`.

#### `src/modules/fleet/service.mjs`
- **[Lines 22–37] (`getFleetProjects`)**: استعلام مباشر `SELECT ... FROM neon_projects_registry ORDER BY is_hub DESC, id ASC` بدون وجود مسار بديل للـ Single-DB.
- **[Lines 69–71] (`registerNewProject`)**: بوابة قسرية تفرض نطاق `*.neon.tech`:
  ```javascript
  if (!/^postgres(?:ql)?:$/i.test(parsedDsn.protocol) || !parsedDsn.hostname.endsWith('.neon.tech'))
  ```
  ترفض أي قاعدة بيانات محلية، VPS، Docker، أو Supabase.
- **[Lines 73–101]**: إدخال مباشر في `neon_projects_registry`.
- **[Lines 131–135, 138–142]**: تحديثات مباشرة لـ `neon_projects_registry` (مبتلعة داخل `catch` فارغ).
- **[Lines 191–215] (`syncFleetDatabases`)**: استعلام وتحديث على الشاردات في `neon_projects_registry`.
- **[Lines 233–238, 262–267]**: دوال `pingFleetProject` و `getFleetProjectUrl` تستعلم مباشرة عن `project_id`.

#### `src/routes/fleet.mjs`
- **[Lines 49–55]**: مسارات `GET /api/fleet/projects` و `GET /api/fleet/shards` تستعلم مباشرة عن جدول `neon_projects_registry`.

#### `src/worker.mjs`
- **[Line 48]**: تعبير نمطي ثابت لاصطياد عناوين Neon: `/ep-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech/gi`.
- **[Lines 887–891]**: استعلام ديناميكي من `neon_projects_registry` في حال تمرير `project_id` أو `shard`.

#### `src/modules/sharding/fleet-router.mjs`
- **[Lines 350–351]**: فحص `/\.neon\.tech\b/i` لتحديد استخدام مكتبة `@neondatabase/serverless` أو مشغل TCP `postgres.js`.
- **[Lines 484–485]**: فحص `.neon.tech` في دالة `enforceNeonPoolerUrl`.
- **[Lines 572–634]**: مسار الـ Fallback الكامل في `resolveShardConnection` الموجه لـ KV وجدول السجل في حال تعطيل Unified Mode.
- **[Lines 648–652]**: استعلام مباشر في `getFleetShardsMap`.
- **[Lines 671, 683–688]**: استعلام `preloadNeonRegistry` المباشر.
- **[Lines 1205–1246 & 1336–1384]**: كود ميت محنط بنسبة 100%:
  - السطر 1205 يثبت: `const d1Record = null;`.
  - السطور 1221-1246: شروط `hasValidD1` و `hasValidTrajectoryFromD1` تعود دائماً بـ `false`.
  - السطور 1336-1384: 49 سطراً كاملة لمعالجة وتوسيع بيانات D1 لا يمكن أن تُنفذ إطلاقاً!
  - السطر 1395: فرع الشرط الثلاثي `hasValidD1 ? ...` ميت.
  - السطر 1464 و 1882: مراجع ميتة لـ `d1Record`.
- **[Lines 1476–1479, 1529, 1634–1659, 1980–2143]**: مسار لقطات Hub الميت:
  - السطر 1476 يثبت `const hubSnapshots = [];`.
  - السطور 1634-1659: كتلة دمج اللقطات التاريخية (26 سطراً) غير قابلة للوصول.
  - السطور 2028-2143: **116 سطراً** كاملة مخصصة لترميم قراءة الشاردات (`Two-Tier Shard Read-Repair`) ميتة تماماً لأن `hubSnapshots` فارغة دائماً!
- **[Lines 998–1007]**: دوال وهمية متقاعدة (`storeFolderCrossoverSynopsis` / `getFolderCrossoverSynopsis`).
- **[Lines 2741–2752]**: دالة `getFastEdgeDossier` الوهمية التي تعيد `{ not_cached: true }`.
- **[Lines 3553–3820] (انفصام معمارية الإدخال المجمع - Architectural Divergence)**:
  - في نمط **Unified Postgres Mode (السطور 3553–3743)**: يتم عمل `LATERAL JOIN` مع `pins_daily_metrics` لحساب السرعة وفوارق 24 ساعة، وتحديث `save_count` و `repin_count` و `daily_save_velocity` في `universal_master_pins`.
  - في نمط **Sharded Mode (السطور 3778–3820)**: **تسقط تماماً** أعمدة `save_count` و `repin_count` و `daily_save_velocity` من استعلام الإدخال وجملة `ON CONFLICT DO UPDATE`! مما يجعل الدبابيس في نمط الشاردات تفتقر للمقاييس الحية.

---

### 1.2 خدمات الواجهة الخلفية (Backend Services)
#### `src/modules/keywords/folders-service.mjs`
- **[Lines 2670–2760]**: كتلة كود ميتة مكونة من **90 سطراً** مغلفة بشرط:
  ```javascript
  if (sql && stillMissingAfterHub.length > 0 && !isUnifiedPostgres(env))
  ```
  تحتوي على `preloadNeonRegistry`، و `coalesceShardGroupsByPhysical`، و `resolveShardConnection`، و `executeShardQueryWithCircuitBreaker`.

#### `src/modules/keywords/service.mjs`
- **[Lines 374–438]**: كتلة ميتة مكونة من **65 سطراً** في `hydrateDisplacedIndexFromShards`:
  ```javascript
  if (!skipShardHydration && stillMissing.length > 0 && (!isUnifiedPostgres(env) || globalShardMap.size > 0))
  ```
- **[Lines 131–158] (`offloadKeywordCrawlToShards`)**:
  - استدعاء مزدوج مكرر لـ `await preloadNeonRegistry(hubSql, env);` (في السطر 132 ثم 148 في نفس المسار).
  - تقسيم الشاردات `batchGroupByShard` في السطر 138 يتم التخلص منه فوراً في السطر 139 عبر `shardEntries = isUnifiedPostgres ? [[1, combined]] : ...`.

#### `src/routes/keywords.mjs` و `src/routes/pins.mjs`
- **`keywords.mjs` [Lines 567–575]**: عند حذف دبوس فردي، يتم استدعاء `getPinShardId` و `resolveShardConnection` ثم حذف السجلات عبر 3 استعلامات منفصلة خارج أي معاملة متسلسلة (Transaction).
- **`pins.mjs` [Lines 244–245, 355–356, 414–415, 573–586]**: استدعاءات متكررة لـ `getPinShardId` دون حاجة، وتنفيذ 7 استعلامات حذف متتالية غير موحدة لكل من `universal_master_pins`, `pins_daily_metrics`, `pin_serp_positions`, `keyword_serp_current`, `keyword_displaced_index`, `competitor_pins`, `pa_pins`.

---

<a name="2"></a>
## 2. بقايا الكاش والتخزين المؤقت (In-Memory, Edge, Prefetch, Storage)

### 2.1 كاش الحافة والبريفيتش على جانب العميل
#### `src/edge-shield-client.mjs`
- **[Lines 286–339]**: مستمع حركة الفأرة `mouseover` يستدعي:
  ```javascript
  fetch('/api/pins/' + pid + '?prefetch=true', { method: 'GET' })
  ```
- **[Line 292]**: كاش دائم في الذاكرة `var prefetchCache = new Set();` لا يتم مسحه أو تدويره مطلقاً.
- **[Line 293]**: كائن ميت `var warmCache = new Set();` محجوز في الذاكرة رغم تعطيل شبكة الإحماء.
- **فقدان حقن الاسكربت في صفحة الدبوس**: يتم استيراد `getEdgeShieldClientScript` في `src/pin-details-ui.mjs` (السطر 18) ولكن **لا يتم حقنه نهائياً** في قالب HTML! مما يحرم الصفحة من `window.safeApiFetch` ومستمعي البريفيتش.

### 2.2 كاش الذاكرة في خادم Worker و Fleet Router
#### `src/worker.mjs`
- **[Line 467]**: `edgeCache = new Map()` (بسعة 512 عنصراً، إخلاء FIFO).
- **[Line 468]**: `inflightPromises = new Map()` لتوحيد الطلبات المتزامنة.
- **[Lines 637–665] (`invalidateEdgeCache`)**: خلل معمارية الكاش: يقوم بمسح L0 `edgeCache.keys()`، ولكن كاش Cloudflare Cache API (L1 `caches.default`) **لا يمتلك واجهة مسح بالبادئة (Prefix Deletion API)**! مما يترك الاستجابات القديمة في L1 حتى انتهاء زمن Cache-Control.

#### `src/modules/sharding/fleet-router.mjs`
- **[Line 157]**: `globalShardMap = new Map()` (صلاحية 10 دقائق).
- **[Line 244]**: `shardSqlClients = new Map()` (مجمع عملاء SQL حتى 48 عميلاً).
- **[Line 409]**: `circuitBreakers = new Map()` (قواطع دارة تتوقف 6 ثوانٍ).
- **[Lines 1842–1864] (كارثة التواريخ الصلبة وتسميم البيانات - Hardcoded Date Poisoning)**:
  يقوم الكود بفحص التواريخ الثابتة `'2026-11-10'` و `'2026-11-09'`! فإذا تطابقت حفظات الدبوس بين هذين التاريخين، يعتبر تاريخ اليوم تكراراً تالفاً (Corrupted Echo)، وينفذ:
  ```sql
  DELETE FROM pins_daily_metrics WHERE pin_id = ${pinId} AND snapshot_date = '2026-11-10'
  DELETE FROM pin_serp_positions WHERE pin_id = ${pinId} AND snapshot_date = '2026-11-10'
  ```
  ثم يعيد ضبط السرعة إلى سرعة الأمس! هذا السلوك يحذف لقطات شرعية حقيقية ذات فارق صفري وينتهك قاعدة تناظر السرعة (Rule 5).

#### `src/routes/pins.mjs`
- **[Line 625]**: تغليف `getCachedOrFetch` لمسار المسار الزمني `/api/pins/:id/trajectory` بـ TTL مدته 60 ثانية، مما يعرض مسارات زمنية قديمة حتى بعد نجاح المزامنة الحية.

#### `src/modules/keywords/visual-lens-cache.mjs`
- **[Lines 3–15]**: `lensCache = new Map()` يخزن 1000 عنصر لمدة 24 ساعة بدون آلية إخلاء مرتبطة بزحف الكلمات.

#### `src/modules/keywords/folders-service.mjs`
- **[Lines 22–33]**: `folderCrossoverCache = new Map()` لمدة 5 دقائق.
- **[Lines 39–53]**: مسار إضافة العناصر للمجلد `POST /api/folders/:id/items` لا يستدعي `invalidateFolderCache` مطلقاً، مما يؤخر ظهور العناصر المضافة.

#### `src/dashboard-ui.mjs`
- **[Lines 1630–1668]**: كاش دائم `_clientCache.boards = new Map()` لا يتم تنظيفه عند الزحف، مما يعرض لوحات قديمة حتى إعادة تحميل الصفحة بالكامل.

### 2.3 تدقيق أمني ومعماري لـ Wake-Shield و Wrangler
#### `workers/wake-shield/src/index.mjs`
- **[ثغرة أمنية حرجة - SEC-WAKE-01] تجاوز المصادقة برمز ثابت**:
  في السطور 18، 178، 215–216، 223، 246:
  ```javascript
  const DEFAULT_PIN = 'pae2026';
  const expectedTokens = await Promise.all([
    computeExpectedToken(configuredPin),
    computeExpectedToken(fallbackPin),
    computeExpectedToken(DEFAULT_PIN) // يتم قبوله دائماً!
  ]);
  ```
  حتى لو قام المشغل بتعيين رمز سري معقد في الإنتاج، فإن أي شخص يرسل `pae2026` في الرأس `x-api-key` أو `Authorization: Bearer pae2026` أو عبر واجهة الدخول يتم منحه صلاحيات الإدارة الكاملة فوراً!
- **[ثغرة أمنية عالية - SEC-WAKE-02]**: كشف معرف الآلة الثابت `m_agq2t32m5xv5joj67rqoze5h4u` في السطر 17.
- **[ثغرة أمنية عالية - SEC-WAKE-03]**: ملح تشفير ثابت `:pae_access_salt_2026` في السطر 31.
- **[ثغرة متوسطة - SEC-WAKE-04]**: قبول الرمز في URL Query String (`?pin=` و `?key=`) مما يعرضه للتسجيل في السجلات والبروكسي (مخالفة لـ Rule 24 و CWE-598).

#### ملفات `wrangler.toml`
- ملف `wrangler.toml` في الجذر يحدد `DATABASE_TOPOLOGY = "unified_postgres"` لكنه **يفتقر تماماً** لأي ربط لقواعد D1 أو مساحات KV أو Hyperdrive، مما يجعل أي كود يستند إليها في Worker يفشل مباشرة.

---

<a name="3"></a>
## 3. ثغرات وحالات حدية في الزواحف وحسابات السرعة واللقطات اليومية

### 3.1 الكوارث الحسابية في الزواحف المجدولة
#### مصيدة فقدان 95% من الدبابيس على خادم VPS (CRITICAL BUG)
- في `scripts/keyword-velocity-crawler.mjs` (السطر 91):
  ```javascript
  const assignedShards = [];
  for (let s = 1; s <= 99; s++) {
    if (((s - 1) % 20) === workerIndex) { // <--- خطأ قاتل: تثبيت الرقم 20 وتجاهل workerTotal!
      assignedShards.push(s);
    }
  }
  ```
  عند تشغيل الزاحف عبر المجدول المحلي VPS (`scripts/vps-scheduler.mjs`) حيث `WORKER_TOTAL=1` و `WORKER_INDEX=0`، يقوم الزاحف بمعالجة **5 شاردات فقط من أصل 99** (الشاردات: 1، 21، 41، 61، 81)، بينما يتم **إسقاط 94 شاردة بالكامل (فقدان 95% من دبابيس النظام)**!

#### إسقاط الدبابيس ذات الـ `shard_id = NULL`
- في `scripts/keyword-velocity-crawler.mjs` النمط B (السطور 1989، 2015، 2035) والنمط C (السطور 1706، 1749، 1770)، وفي `scripts/creator-velocity-crawler.mjs` (السطور 808، 1588):
  الاستعلام يفلتر بـ:
  ```sql
  AND shard_id = ANY(${assignedShards}::smallint[])
  ```
  دون وجود الشرط البديل `OR shard_id IS NULL` الموجود في النمط A، مما يتسبب في تجاهل وإسقاط أي دبوس لا يمتلك قيمة `shard_id` محسوبة مسبقاً في قاعدة البيانات.

### 3.2 تجميد السرعات ومخالفة قواعد التناظر (Rules 5 & 28)
#### تجميد السرعات الموجبة إلى الأبد عند توقف الحفظات
- في `scripts/backfill_rolling_window_gains.mjs` (السطور 434، 457، 480):
  ```sql
  daily_save_velocity = CASE WHEN u.daily_save_velocity > 0 THEN u.daily_save_velocity ELSE ksc.daily_save_velocity END,
  delta_repins_24h = COALESCE(NULLIF(u.delta_repins_24h, 0), ksc.delta_repins_24h),
  gains_5d = COALESCE(NULLIF(u.gains_5d, 0), ksc.gains_5d),
  gains_7d = COALESCE(NULLIF(u.gains_7d, 0), ksc.gains_7d),
  gains_10d = COALESCE(NULLIF(u.gains_10d, 0), ksc.gains_10d),
  gains_15d = COALESCE(NULLIF(u.gains_15d, 0), ksc.gains_15d)
  ```
  **الأثر الجنائي**: إذا كان للدبوس سرعة 200 حفظة/يوم ثم توقف النشاط تماماً وأصبحت السرعة 0، فإن هذا الاستعلام **يرفض كتابة الصفر** ويحتفظ بالقيمة القديمة 200 إلى الأبد! وبالمثل، دالة `NULLIF(..., 0)` تمنع أرباح الفترات (5d, 7d, 10d, 15d) من العودة إلى الصفر عند ركود الدبوس.

### 3.3 خلط المفاهيم وتضارب السرعات بين واجهات النظام
تظهر نفس الدبوس بمقاييس سرعة متضاربة في نفس اللحظة عبر شاشات المنصة المختلفة:
1. **في شاشة النبض `/pulse` (`src/modules/pulse/service.mjs:587–588`)**:
   ```sql
   GREATEST(COALESCE(ksc.daily_save_velocity, 0), COALESCE(ksc.delta_repins_24h, 0))::numeric AS delta_saves_24h,
   GREATEST(COALESCE(ksc.daily_save_velocity, 0), COALESCE(ksc.delta_repins_24h, 0))::numeric AS daily_save_velocity
   ```
   يتم دمج السرعة وفارق الحفظات مع فارق **إعادة النشر (Repins)**! إذا حقق الدبوس 0 حفظة و 100 إعادة نشر، تبلغ الشاشة عن سرعة 100 حفظة في اليوم!
2. **في مجلدات الحملات `/folders/:id` (`folders-service.mjs:2496–2498`)**:
   تستخدم `effective_velocity` الذي يستبدل سرعة الحفظات بفارق إعادة النشر إذا كانت سرعة الحفظات 0.
3. **في النطاقات `/domains` (`domains/service.mjs:867`)**:
   تعتمد حصرياً على سرعة الحفظات وتتجاهل إعادة النشر.
4. **في الحسابات `/accounts` (`creators/service.mjs:2418`)**:
   تفصل بدقة بين سرعة الحفظات، وفارق الحفظات 24h، وفارق إعادة النشر 24h.
5. **في صفحة تفاصيل الدبوس `/pin/:id`**:
   تحسب السرعة استناداً إلى جدول `pins_daily_metrics.save_count` فقط.

---

<a name="4"></a>
## 4. خريطة فك الارتباط مع أقفال الفحص ومجموعات الاختبارات

### 4.1 خريطة أقفال الانحدار في `scripts/verify_regression_locks.mjs`

| رقم القفل | اسم القفل ونطاقه | الرموز والوظائف القديمة المفروضة حالياً | إجراء التعديل المطلوب عند إزالة الكود القديم |
| :--- | :--- | :--- | :--- |
| **Lock 1** | DOM Hierarchy & Header Dropdown | لا يوجد ارتباط بالشاردات. | الإبقاء عليه دون تغيير. |
| **Lock 2** | Pin Dossier Timeframe & SERP Badge | **2E**: يفرض تصدير `sanitizeDossierTrajectory` في `fleet-router.mjs`. | الإبقاء على تصدير الدالة. |
| **Lock 3** | Universal Shard-Affine SQL Pushdown | **3A/3B**: يفرض وجود `shard_id = ANY` في استعلامات `creator-velocity-crawler.mjs`.<br>**3C/3D**: يفرض `pae_crc32_shard_id` في `keyword-velocity-crawler.mjs`.<br>**3E/3F**: يفرض تصدير وعقد الحساب لـ `getPhysicalShardId` و `coalesceShardGroupsByPhysical`.<br>**3G**: يفرض استيراد واستدعاء `coalesceShardGroupsByPhysical` عبر 6 ملفات. | **عالي الأهمية**: تحديث القفل 3 ليتحقق من معمارية قاعدة البيانات الموحدة Single-DB، أو الإبقاء على الدوال كمعالجات تمرير شفاف (Transparent Pass-Through). |
| **Lock 4** | Multi-Window Gains vs Fake Multiplier | **4D**: يفرض أن يحتوي `folders-service.mjs` على `coalesceShardGroupsByPhysical` و `resolveShardConnection`. | تعديل القفل 4D ليتحقق من الاستعلام المباشر على `universal_master_pins` بدلاً من حلقة الـ 20 شاردة. |
| **Lock 5** | Context-Preserving Pin Navigation | لا يوجد ارتباط بالشاردات. | الإبقاء عليه دون تغيير. |
| **Lock 6** | Pure Neon Architecture & Zero Cloudflare Footprint | **6A**: يمنع وجود ملف `d1-metadata.mjs`.<br>**6B**: يفرض غياب مصطلحات Cloudflare مثل `PIN_ENGINE_KV` و `PIN_D1_DB` و `createHyperdriveClient`. | **قفل ذهبي للحماية**: يُبقى عليه لمنع عودة بقايا Cloudflare. |
| **Lock 7** | Room 3 Creator Hub & Lightweight Pulse | **7C**: يفرض وجود `!isUnifiedPostgres(env)` في `offloadKeywordCrawlToShards`. | تحديث القفل 7C عند حذف مسار الـ offload الميت. |
| **Lock 8–11** | Rolling Gains, SERP Track, BigInt Parity | مقاييس عمل وعمليات BigInt. | الإبقاء عليها دون تغيير. |
| **Lock 12** | Auto-Promote Pulse Breakout & Migration 041 | يفرض وجود ملف الهجرة `041_composite_shard_indexes.sql`. | الإبقاء على ملف الهجرة في المسار. |
| **Lock 13** | Invariant & Memory Documentation Gate | **13C**: يفرض أن يكون عدد الأقفال الإجمالي مساوياً لـ `14`. | الحفاظ على تزامن العداد مع أي قفل يتم تعديله. |
| **Lock 14** | Hidden Endpoints & Media Waterfall | حماية واجهات الكاش ونقاط النهاية المخفية. | الإبقاء عليه دون تغيير. |

### 4.2 الدليل القاطع في ملفات الاختبار (The Smoking Gun)
- **`scripts/test_phase3_write_and_crawlers.mjs` (الاختبار 11 - السطور 476–498)**:
  يقوم الاختبار بفحص نصوص ملف `src/modules/sharding/fleet-router.mjs` حرفياً للتحقق من وجود السلاسل التالية:
  - `const hasValidD1 = Boolean(`
  - `d1Record && d1Record.pin_id`
  - `const d1CreatedMs = parseD1DateMs(`
  **هذا الاختبار وحده هو السبب التاريخي الذي منع المطورين والوكلاء السابقين من حذف كود D1 الميت في السطور 1205–1384 من `fleet-router.mjs`!**

### 4.3 ملفات الاختبار الـ 16 المرتبطة بالشاردات و Neon
1. `test_phase3_write_and_crawlers.mjs`: الاختبار 11 يتطلب التحديث لحذف سلاسل D1 الميتة.
2. `test_p1_consolidation.mjs`: يتحقق من عدم استعلام جداول Hub القديمة.
3. `test_p2_dossier.mjs` و `test_p2_read_parity.mjs` و `test_p2_dossier_contract.mjs`: تفحص محاكاة التوجيه للشاردات.
4. `test_phase2_read_acceleration.mjs`: يختبر `globalShardMap` و `resolveShardConnection`.
5. `test_phase4_live_explain.mjs`: يستورد `preloadNeonRegistry` ويستعلم شارد 1.
6. `test_phase4_full_adversarial.mjs`: يفحص نص الزر `Retry Shard Fetch`.
7. `test_phase7_production_audit.mjs`: يحاكي استعلامات `FROM neon_projects_registry`.
8. `test_route_manifest.mjs`: يحتوي على محاكاة لـ `PIN_ENGINE_KV` و `PIN_D1_DB`.
9. `test_unified_phase1_phase2_adversarial.mjs`: يختبر قواطع الدارة للشارد 77 واستعلامات السجل.
10. `test_forensic_dossier_cache_sync.mjs`: يختبر جداول القياسات الموحدة.

---

<a name="5"></a>
## 5. توصيات خطة التطهير والتحول النهائي المقترحة

1. **إسقاط جدول `neon_projects_registry` نهائياً**:
   - إنشاء ملف هجرة جديد `050_purge_neon_registry_and_legacy_snapshots.sql`.
   - تنفيذ `DROP TABLE IF EXISTS neon_projects_registry CASCADE;`.
   - تنفيذ `DROP TABLE IF EXISTS pa_pin_metrics CASCADE;` على Hub المركزي.
   - تحديث `verify_sql_schema_parity.mjs` لإزالة الجدول من `KNOWN_TABLE_COLUMNS`.
2. **استئصال الأكواد الميتة من `fleet-router.mjs`**:
   - إزالة كود D1 الميت (السطور 1205–1246، 1336–1384).
   - إزالة مسار ترميم القراءة للشاردات الميت المكون من 116 سطراً (السطور 2028–2143).
   - إزالة فحص التواريخ الثابتة المدمر في السطور 1842–1864 (`'2026-11-10'`).
   - توحيد معمارية `writeBatchToDeterministicShards` بحيث تستخدم المنطق الموحد دائماً.
3. **تصحيح خطأ زاحف VPS القاتل**:
   - في `scripts/keyword-velocity-crawler.mjs` (السطر 91)، تعديل التقسيم ليعتمد على `workerTotal` الحقيقي:
     ```javascript
     const totalWorkers = Math.max(1, parseInt(process.env.WORKER_TOTAL || '1', 10));
     if (((s - 1) % totalWorkers) === workerIndex)
     ```
4. **إصلاح معادلات السرعة المتجمدة وتناغم المفاهيم**:
   - في `scripts/backfill_rolling_window_gains.mjs`، إزالة شرط `CASE WHEN u.daily_save_velocity > 0` وكتابة القيمة المحسوبة مباشرة بما يسمح بعودة السرعة للصفر.
   - في `src/modules/pulse/service.mjs`، فصل `delta_repins_24h` عن `daily_save_velocity` وعدم دمجهما عبر `GREATEST`.
5. **إغلاق ثغرات `wake-shield` الأمنية**:
   - إزالة الرمز الثابت `'pae2026'` فوراً وحصر المصادقة بالرمز المولد والبيئة المشفرة.
   - حظر تمرير المفاتيح عبر URL Query Parameters.
6. **تحديث أقفال الانحدار المتزامنة**:
   - تحديث القفل 3 والقفل 4D والاختبار 11 في `test_phase3_write_and_crawlers.mjs` بشكل متزامن لضمان استمرار نجاح `npm run check` و `npm test` بنسبة 100%.

---
**نهاية تقرير التدقيق الجنائي الهندسي الشامل**
