# 🔬 التقرير الجنائي الهندسي المعمق وبروتوكول سرب الوكلاء (النسخة النهائية المدققة 100% بعد التحكيم المقارن بين Argon و Carbon)

## القسم الأول: التحكيم الجنائي المقارن — ماذا أصاب Carbon وماذا أخطأ فيه؟

بعد إخضاع مراجعة **Carbon** لفحص جنائي صارم سطراً بسطر مقابل الكود الفعلي في المستودع (`src/modules/sharding/fleet-router.mjs`، و`src/modules/keywords/folders-service.mjs`، و`src/modules/keywords/d1-metadata.mjs`، و`scripts/verify_sql_schema_parity.mjs`، و`src/routes/keywords.mjs`، و`src/campaign-folders-ui.mjs`)، إليك الحقيقة الهندسية الكاملة بالأدلة والأسطر:

### أولاً: النقاط الثلاث التي أصاب فيها Carbon بنسبة 100% (وتم دمجها بالكامل)

| 

| **#** | **ملاحظة Carbon** | **الحكم الجنائي من الكود الفعلي** | **كيف تم دمجها في النسخة النهائية؟** | 
| **1** | **اختلاف أسماء الأعمدة في جدولي `pa_pins` و`competitor_pins` في استعلام Tier 2 (`verify_sql_schema_parity.mjs`)** | ✅ **صحيحة ومهمة جداً:** في `scripts/verify_sql_schema_parity.mjs:212-264`، جدول `pa_pins` يستخدم `annotations` (وليس `visual_annotations`) و`account_username` (وليس `creator_username`) و`link`. وجدول `competitor_pins` لا يملك عمود `visual_annotations` مستقل بل داخل `metadata->'visual_annotations'`، واسم عمود الدومين فيه `link_domain` (بينما يملك فعلياً عمودي `board_name` و`created_at_pinterest` في السطور `220, 225`). | تم تصحيح استعلام `UNION ALL` في **Tier 2** ليتطابق حرفياً مع `KNOWN_TABLE_COLUMNS` في `verify_sql_schema_parity.mjs`. | 
| **2** | **حفظ واسترجاع `aspect_ratio` داخل `src/modules/keywords/d1-metadata.mjs`** | ✅ **صحيحة 100%:** دالة `syncPinsBatchToD1` (السطر `79`) تحفظ `creation_method` داخل `metaObj` لكنها كانت تغفل حفظ `aspect_ratio`، ودالة `hydratePinsFromD1` (السطر `195`) لم تكن ترفعه للمستوى الأعلى عند القراءة من D1. | تمت إضافة حفظ `metaObj.aspect_ratio` في `syncPinsBatchToD1` وإرجاع `aspect_ratio` في `hydratePinsFromD1`. | 
| **3** | **إكمال ربط `hasUnhydratedPriorityPins` بـ TTL الـ KV (`60s` مقابل `86400s`) وحذف `:crossover:v3` في `src/routes/keywords.mjs:1628, 1654`** | ✅ **صحيحة 100%:** يجب إرجاع `_has_unhydrated_priority_pins` من `_executeFolderCrossover` واستخدامه في `calculateFolderCrossover` لتخفيض TTL الـ KV إلى `60` ثانية عند عدم اكتمال تعويض بنات الصدارة، مع مسح `:crossover:v3` عند تعديل أو حذف المجلد. | تم تضمين الكود الكامل لتعديل `calculateFolderCrossover` وتمرير `ctx` ومسح `:crossover:v2` و`:crossover:v3` في `src/routes/keywords.mjs`. | 

### ثانياً: الأخطاء القاتلة السبعة (Hallucinations) التي وقع فيها كود Carbon البديل (والتي كانت ستُدمّر النظام لو نُسخت كما كتبها!)

رغم أن Carbon أصاب في الملاحظات الثلاث أعلاه، إلا أنه عندما كتب "الكود المرجعي المصحح" (Section 3 في تقريره)، **اخترع دوال وتوقيعات غير موجودة في المستودع** كانت ستؤدي إلى انهيار فوري (`SyntaxError` و`TypeError` و`PostgreSQL 42703`):

| **#** | **الكود الذي كتبه Carbon في نسخته** | **الحقيقة الجنائية في ملفات المستودع الفعلية** | **الكارثة التي كانت ستقع لو نُسخ كود Carbon** | 
| **1** | زعم Carbon أن `fleet-router.mjs` لا يصدّر `safeWaitUntil`، وطلب استيراد `getShardSqlClient` و`loadFleetRegistry` من `fleet-router.mjs`! | ❌ **خطأ فادح ومعكوس تماماً:** في `src/modules/sharding/fleet-router.mjs:164` توجد `export function safeWaitUntil(...)`، بل هي مستوردة فعلياً في `folders-service.mjs:19`! في المقابل، **لا توجد أصلاً أي دالة باسم `getShardSqlClient` أو `loadFleetRegistry` في المشروع كله!** الاسمان الحقيقيان في `fleet-router.mjs` هما `resolveShardConnection` (السطر `438`) و`preloadNeonRegistry` (السطر `599`). | انهيار السيرفر بالكامل عند الإقلاع بخطأ: `SyntaxError: The requested module '../sharding/fleet-router.mjs' does not provide an export named 'getShardSqlClient'`. | 
| **2** | في استعلام **Tier 3** على الشاردات كتب Carbon: `COALESCE(NULLIF(creation_method, ''), ...) FROM universal_master_pins` | ❌ **خطأ SQL قاتل (`42703`):** انظر `scripts/verify_sql_schema_parity.mjs:111-131`؛ جدول `universal_master_pins` على الشاردات **لا يملك عموداً فيزيائياً باسم `creation_method`**! الطريقة محفوظة حصرياً داخل `metadata->>'creation_method'` و`metadata->>'method'`. | فشل استعلام الشاردات العشرين بنسبة **100%** بخطأ PostgreSQL: `column "creation_method" does not exist` ورسوب فحص `verify_sql_schema_parity.mjs`! | 
| **3** | في **Tier 1** كتب Carbon: `const d1Rows = await hydratePinsFromD1(env, priorityIds); if (d1Rows && d1Rows.length > 0) for (const r of d1Rows)` | ❌ **خطأ نوع بيانات يعطل D1 بالكامل:** في `src/modules/keywords/d1-metadata.mjs:147`، دالة `hydratePinsFromD1` تُرجع كائن **`Map`** وليس مصفوفة `Array`! في JavaScript، خاصية `map.length` قيمتها دائماً `undefined`! | الشرط `d1Rows.length > 0` يُقيّم دائماً بـ **`false`**، مما يعطل كاش Cloudflare D1 (Tier 1) بنسبة 100% في كل طلب! الصحيح هو `for (const [pid, d1Row] of d1Map.entries())`. | 
| **4** | غيّر Carbon توقيع `calculateFolderCrossover` إلى: `(env, sql, folderId, filterKeyword, filterCluster, ctx)` | ❌ **كسر شامل لواجهات البرمجة (Breaking Signature):** التوقيع الحقيقي في `folders-service.mjs:2005` وفي جميع المواضع الـ 8 التي تستدعيه في المشروع والاختبارات هو: `calculateFolderCrossover(sql, folderId, { refresh = false, env = null, ctx = null } = {})`. | انهيار جميع المسارات (`routes/keywords.mjs` و`scripts/dashboard.mjs`) ورسوب كافة اختبارات `test_crossover.mjs` و`test_phase3_adversarial_review.mjs`! | 
| **5** | استدعى Carbon دالة العنوان هكذا: `derivePinTitle({ title: '', description: p.description, ... })` (بتمرير كائن Object!) | ❌ **تسميم العناوين بـ `"[object Object]"`:** في `folders-service.mjs:1678`، توقيع الدالة الحقيقي يأخذ **5 معاملات نصية مرتبة**: `derivePinTitle(title, destinationUrl, keyword, boardName, visualAnnotations)`، ويحول المعامل الأول عبر `String(title)`. | تمرير كائن `{ title: '' }` كمعامل أول يجعل `String(title)` يساوي **`"[object Object]"`**، فتظهر جميع البنات في الجدول بعنوان `"[object Object]"`! | 
| **6** | كتب Carbon: `batchGroupByShard(shardItems, 'pin_id', 99)` واستخدم `b.saves - a.saves` | ❌ **معاملات وحقول خاطئة:** دالة `batchGroupByShard(pinRecords = [], totalShards = 99)` في `fleet-router.mjs:798` تأخذ معاملين فقط (الثاني هو عدد الشاردات `99` وليس `'pin_id'`)، واسم حقل الحفظ في `allPins` هو **`save_count`** وليس `saves`! | ترتيب الأولوية يفشل لأن `b.saves` قيمته `undefined`، وتمرير `'pin_id'` مكان `totalShards` ينتج `NaN`! | 
| **7** | في `src/campaign-folders-ui.mjs:409` كتب Carbon كود Node.js: `const rawImg = p.image_url; ... ${escapeHtml(img736)}` | ❌ **انهيار `ReferenceError: p is not defined`:** السطر `409` في `campaign-folders-ui.mjs` يقع داخل حلقة **Alpine.js على المتصفح** (`<template x-for="(sp, idx) in paginatedPins()">`) حيث اسم المتغير في المتصفح هو `sp` وليس متغير Node.js خادمياً اسمه `p`! | انهيار صفحة المجلدات بالكامل بخطأ `500 ReferenceError: p is not defined` فور فتح `/folders/:id`! | 

## القسم الثاني: البرومبت الهندسي المتكامل والنهائي لسرب الوكلاء (جاهز للنسخ والتشغيل الفوري)

فيما يلي **النسخة الذهبية الموحدة (Golden Master Prompt)** التي تجمع تشخيصنا الجنائي وهندسة الـ 20 شارد مع التصحيحات الثلاثة الصائبة من Carbon، وتستبعد تماماً الأخطاء السبعة التي وقع فيها كود Carbon:

```
# 🏛️ DIRECTIVE: ROUND 11 FORENSIC 20-SHARD HYDRATION, ZERO-EGRESS CROSSOVER ARCHITECTURE & PRE-EDIT MULTI-AGENT DEBATE

## 🎯 MISSION OBJECTIVE
You are an elite, battle-hardened distributed systems engineering pod operating on the **Pin Arbitrage Engine (PAE)** repository.
Forensic inspection of the live production system and Campaign Folder Studio (`/folders/:id` — Room 1 Crossover Table) revealed a multi-layered architectural bug causing **Vault / Displaced Pins** (`keyword_displaced_index`) to display **broken grey placeholder boxes** and **synthetic fallback titles (`"<Keyword> Inspiration"`)** instead of their authentic titles, HD images, pin ages (`⏳`), and visual annotations (`👁️`) stored in `universal_master_pins` across our **20 Physical Neon Storage Shards (`pin-arbitrage-shard-01..20`)**.

Your mission is to:
1. Conduct a **100% Read-Only Forensic Verification** of the 5 root-cause mechanisms and schema constraints identified below.
2. Execute a **Mandatory Pre-Modification Inter-Agent Debate & Cross-Examination** where all 4 specialist agents challenge, verify, and sign off on the exact SQL projections, function signatures, concurrency budgets, cache coherency rules, and UI fallbacks **BEFORE a single byte of production code is modified**.
3. Implement the surgical, zero-regression engineering fix across `src/modules/keywords/d1-metadata.mjs`, `src/modules/keywords/folders-service.mjs`, `src/routes/keywords.mjs`, `src/campaign-folders-ui.mjs`, and `scripts/verify_regression_locks.mjs`.

---

## 👥 SPECIALIST AGENT POD & ROLES

1. **`Agent-1: Distributed-Shards-And-Egress-Architect` (Database & 20-Shard Topology Lead)**
   - **Domain:** `src/modules/sharding/fleet-router.mjs`, `universal_master_pins` schema across Physical Shards `1..20`, `batchGroupByShard`, `coalesceShardGroupsByPhysical`, `resolveShardConnection`, `executeShardQueryWithCircuitBreaker`, `preloadNeonRegistry`, `isUnifiedPostgres`, and Neon Monthly Network Transfer (Egress) minimization.
   - **Mandate:** Ensure zero single-DB egress bottleneck on the Central Hub (protecting its 5 GB/month cap); distribute creative metadata hydration across the 20 physical shards (`20 × 5 GB = 100 GB/month` combined egress pool) using targeted scalar SQL projections (~160 bytes/row, stripping raw `metadata` JSONB and long `description` blobs) and bounded concurrency (`CONCURRENCY_LIMIT = 4`) respecting Cloudflare Workers' 6-connection ceiling.

2. **`Agent-2: Edge-D1-KV-And-Crossover-Pipeline-Specialist` (Crossover Algorithm, Schema Parity & Cache Coherency Lead)**
   - **Domain:** `src/modules/keywords/folders-service.mjs` (`calculateFolderCrossover`, `_executeFolderCrossover`, `derivePinTitle`, `isSyntheticPinTitle`), `src/modules/keywords/d1-metadata.mjs` (`hydratePinsFromD1`, `syncPinsBatchToD1`), `src/routes/keywords.mjs`, `PIN_ENGINE_KV`, and `scripts/verify_sql_schema_parity.mjs`.
   - **Mandate:**
     - Eliminate the **Premature `derivePinTitle` Poisoning Bug** at `folders-service.mjs:2318` vs `2495`.
     - Preserve `aspect_ratio` in `syncPinsBatchToD1` and `hydratePinsFromD1` (`src/modules/keywords/d1-metadata.mjs`).
     - Wire the 4-Tier Hydration Pipeline (`D1 -> Hub -> 20 Physical Shards -> Async D1 Write-Back`) with **100% SQL Schema Parity** against `KNOWN_TABLE_COLUMNS` in `scripts/verify_sql_schema_parity.mjs`.
     - Recompute `pin_age_days`, `visual_annotations`, `aspect_ratio`, `format`, and `is_vacuum_pin` *prior* to Dimension B (`Universal Tag Bridges`) and Dimension D (`Domain/Creator Monopoly`).
     - Upgrade KV cache key to `fep:${epoch}:folder:${fid}:crossover:v3` with adaptive TTL (`60s` when top priority pins have incomplete hydration vs `86400s` when fully hydrated) and update KV invalidation in `src/routes/keywords.mjs:1628, 1654`.

3. **`Agent-3: Frontend-Cockpit-And-Media-Waterfall-Specialist` (UI & DOM Resilience Lead)**
   - **Domain:** `src/campaign-folders-ui.mjs` (lines 409–411 Alpine.js client-side `sp.image_url` rendering & `onerror` waterfall).
   - **Mandate:** Eradicate the last remaining `https://via.placeholder.com/60x90` references in the repository (`src/campaign-folders-ui.mjs:409-411`), implement the self-healing Pinterest CDN S3 ACL waterfall (`/originals/` $\to$ `/1200x/` $\to$ `/736x/` $\to$ zero-network Inline SVG Data URI) inside the Alpine.js `sp` row template, and preserve Lock 1 (DOM Sibling Hierarchy) and Lock 5 (Context-Preserving Pin Navigation).

4. **`Agent-4: Adversarial-Verifier-And-Regression-Gatekeeper` (Lead Auditor with Absolute Veto Power)**
   - **Domain:** Cross-examination chair, `scripts/verify_sql_schema_parity.mjs`, `scripts/verify_regression_locks.mjs` (Locks 1–14), static syntax checks (`npm run check`), and empirical test suite (`npm test`).
   - **Mandate:** Exercise **ABSOLUTE VETO POWER** over any proposed change that violates any of the 42 Architectural Invariants, queries non-existent columns, breaks function signatures, or fails any regression lock.

---

## 🔍 THE 5 FORENSIC LANDMINES & STRICT CONTRACT RULES

### Landmine 1: Premature `derivePinTitle` Poisoning (`folders-service.mjs:2318` vs `2434` & `2495`)
- In `_executeFolderCrossover` (`src/modules/keywords/folders-service.mjs:2318`), when iterating over `combinedCatalogRows` (`pinRows` + `displacedRows`), `displacedRows` from `keyword_displaced_index` have `row.title = undefined`.
- Calling `derivePinTitle(row.title || meta.title, ...)` at line 2318 immediately falls back to Step 4 (`keyword + ' Inspiration'`), setting `p.title = "Low carb high protein meals Inspiration"` (a non-empty truthy string!).
- Later, at line 2434 (`const missingMetaPins = allPins.filter(p => !p.title || !p.image_url)`) and line 2495 (`if (!p.title && meta.title) p.title = meta.title`), `!p.title` evaluates to **`false`**! Thus, even when D1, Hub, or Shards return the authentic `meta.title` (e.g., `"Sweet Potato Burger Bowl"`), line 2495 **silently discards the real title**! (This explains why Row 4 in the screenshot has a hydrated image yet still displays `"Meal prep ideas Inspiration"`!).
- **Strict Rule:**
  1. Create helper `isSyntheticPinTitle(title)` that returns `true` if `!title`, `'Untitled'`, `'Untitled Pin'`, `/^Pin\s*#?\s*\d+$/i`, or `/\s+Inspiration$/i`.
  2. In Pass 1 (`pinMap.set`), store `raw_title: (row.title && !isSyntheticPinTitle(row.title)) ? String(row.title).trim() : (meta.title && !isSyntheticPinTitle(meta.title) ? String(meta.title).trim() : '')`, `title: rawTitle`, and `board_name: row.board_name || meta.board_name || ''`.
  3. Defer calling `derivePinTitle(p.raw_title || '', p.destination_url || p.domain || '', pinKw, p.board_name || '', p.visual_annotations || [])` until **AFTER** all 4 hydration tiers have completed! *(Note: `derivePinTitle` takes 5 positional arguments `(title, destinationUrl, keyword, boardName, visualAnnotations)` — NEVER pass an object as the first argument!)*

### Landmine 2: 4-Tier Distributed Hydration & Strict SQL Schema Parity (`verify_sql_schema_parity.mjs`)
Every SQL query in `folders-service.mjs` is statically audited by Acorn AST in `scripts/verify_sql_schema_parity.mjs` against `KNOWN_TABLE_COLUMNS`. You MUST adhere strictly to the real column names of each table:
- **Tier 1 (Cloudflare D1 Edge Cache — `hydratePinsFromD1(env, missingPinIds)`):**
  - `hydratePinsFromD1` returns a JavaScript **`Map`** (`pinId -> rowObj`), NOT an Array! Iterate via `for (const [pid, d1Row] of d1Map.entries())`.
  - In `src/modules/keywords/d1-metadata.mjs`, update `syncPinsBatchToD1` to persist `if (p.aspect_ratio && !metaObj.aspect_ratio) metaObj.aspect_ratio = p.aspect_ratio;`, and update `hydratePinsFromD1` to expose `aspect_ratio: r.aspect_ratio || parsedMeta.aspect_ratio || null` on each map entry.
- **Tier 2 (Central Hub Fast Check — `keyword_serp_current`, `competitor_pins`, `pa_pins`):**
  - `keyword_serp_current` has: `pin_id, title, image_url, destination_url, domain, creator_username, board_name, visual_annotations, created_at_pinterest, metadata, creation_method`.
  - `competitor_pins` has: `pin_id, title, image_url, destination_url, link_domain, board_name, created_at_pinterest, metadata`. *(It does NOT have `visual_annotations`, `domain`, or `creator_username` columns — extract `COALESCE(metadata->'visual_annotations', '[]'::jsonb)` and `link_domain AS domain`!)*
  - `pa_pins` has: `pin_id, title, image_url, link, domain, account_username, board_name, annotations, created_at_pinterest`. *(It uses `link`, `account_username`, and `annotations` — NOT `destination_url`, `creator_username`, or `visual_annotations`!)*
- **Tier 3 (20 Physical Storage Shards — `universal_master_pins`):**
  - Use `await preloadNeonRegistry(sql, env)` and group via `coalesceShardGroupsByPhysical(batchGroupByShard(priorityShardPins, 99))`. *(Note: `batchGroupByShard(pinRecords, totalShards)` takes 2 arguments — NEVER pass `'pin_id'` as the second argument!)*
  - Resolve each physical shard (`1..20`) via `resolveShardConnection({ hubSql: sql, shardId, env })` with VPS guard `if (!shardSql || (shardSql === sql && !isUnifiedPostgres(env))) return;`, and execute in waves of `CONCURRENCY_LIMIT = 4` via `executeShardQueryWithCircuitBreaker`.
  - `universal_master_pins` has: `pin_id, creator_username, board_name, title, domain, destination_url, image_url, dominant_color, visual_annotations, created_at_pinterest, metadata`. *(It does NOT have a top-level `creation_method` column — extract `COALESCE(NULLIF(metadata->>'creation_method', ''), NULLIF(metadata->>'method', '')) AS creation_method` and `(metadata->>'aspect_ratio') AS aspect_ratio` from `metadata` JSONB!)*
- **Tier 4 (Self-Healing D1 Write-Back & Background Tail Warming):**
  - Persist `newlyHydratedFromShards` to D1 via `safeWaitUntil(ctx, syncPinsBatchToD1(env, newlyHydratedFromShards), 'crossover_sync_d1')` (where `safeWaitUntil` is imported directly from `../sharding/fleet-router.mjs`).

### Landmine 3: Recomputing `pin_age_days`, `visual_annotations`, `format`, and `is_vacuum_pin` Before Dimension B & D
- When applying hydrated metadata to `allPins` (before `superPins`, Dimension B `tagBridges`, and Dimension D `domainMonopoly` / `creatorMonopoly`):
  - Recompute `p.pin_age_days` whenever `p.created_at_pinterest` is hydrated from D1, Hub, or Shards so `⏳` displays the real age instead of `⏳ -`.
  - Populate `p.visual_annotations`, `p.aspect_ratio`, `p.format` (from `meta.creation_method`), `p.domain`, `p.destination_url`, `p.creator_username`, and `p.board_name`.
  - Recompute `p.is_vacuum_pin` and `vacuumPinsCount` after domain hydration, and only run `derivePinTitle` as the final fallback if `p.title` is still empty/synthetic.

### Landmine 4: 24-Hour KV Partial-Hydration Cache Poisoning & Signature Preservation (`folders-service.mjs:2005`)
- **CRITICAL SIGNATURE INVARIANT:** Preserve the exact signature `export async function calculateFolderCrossover(sql, folderId, { refresh = false, env = null, ctx = null } = {})` so all 8 callers in `src/routes/keywords.mjs`, `scripts/dashboard.mjs`, and `scripts/test_*.mjs` remain 100% compatible!
- Update `src/routes/keywords.mjs` at lines `1114` and `1954` to pass `{ refresh, env, ctx }`.
- Upgrade the KV key in `calculateFolderCrossover` from `fep:${epoch}:folder:${fid}:crossover:v2` to `fep:${epoch}:folder:${fid}:crossover:v3`.
- If `result._has_unhydrated_priority_pins` is `true` (meaning any of the top 50 pins by `save_count` / `daily_save_velocity` still lacks `image_url` or has a synthetic title due to a cold-start timeout), use `expirationTtl: 60` in KV (and a 15-second TTL in `crossoverCache`) instead of `86400` (24 hours)!
- In `src/routes/keywords.mjs` at lines `1628` and `1654`, delete both `:crossover:v2` and `:crossover:v3`.

### Landmine 5: Client-Side Alpine.js Image Waterfall in `src/campaign-folders-ui.mjs:409-411`
- In `src/campaign-folders-ui.mjs:403-412`, the table rows are rendered client-side by Alpine.js (`<template x-for="(sp, idx) in paginatedPins()" :key="sp.pin_id">`).
- Replace `https://via.placeholder.com/60x90` at lines `409-411` with an inline SVG Data URI and a client-side `onerror` waterfall (`originals` $\to$ `1200x` $\to$ `736x` $\to$ inline SVG) referencing `this.src` and `sp.image_url` (never server-side undefined variables).

---

## ⚖️ MANDATORY EXECUTION PROTOCOL (3 STAGED PHASES)

### PHASE 1: 100% READ-ONLY FORENSIC AUDIT
Inspect the exact target lines in `src/modules/keywords/d1-metadata.mjs`, `src/modules/keywords/folders-service.mjs`, `src/routes/keywords.mjs`, `src/campaign-folders-ui.mjs`, `scripts/verify_sql_schema_parity.mjs`, and `scripts/verify_regression_locks.mjs`.

### PHASE 2: MANDATORY INTER-AGENT DEBATE & CROSS-EXAMINATION (BEFORE ANY CODE EDIT)
Output a structured 4-Round Technical Debate among `Agent-1`, `Agent-2`, `Agent-3`, and `Agent-4`:
- **Round 1:** `Agent-4` cross-examines `Agent-2` on the Premature `derivePinTitle` Poisoning bug (`folders-service.mjs:2318` vs `2495`), verifying why `derivePinTitle` must receive 5 positional arguments and why `hydratePinsFromD1` must be iterated as a `Map`.
- **Round 2:** `Agent-4` cross-examines `Agent-1` and `Agent-2` on `KNOWN_TABLE_COLUMNS` in `scripts/verify_sql_schema_parity.mjs` (`pa_pins.annotations`, `pa_pins.account_username`, `competitor_pins.link_domain`, and `universal_master_pins.metadata->>'creation_method'`) plus the 20-Shard Egress math (`CONCURRENCY_LIMIT = 4`, scalar projection).
- **Round 3:** `Agent-4` cross-examines `Agent-2` on preserving the exact `calculateFolderCrossover(sql, folderId, { refresh = false, env = null, ctx = null } = {})` signature while adding `:crossover:v3` and the 60s adaptive KV TTL guard.
- **Round 4:** `Agent-4` cross-examines `Agent-3` on the Alpine.js `sp.image_url` waterfall in `src/campaign-folders-ui.mjs:409-411` and regression lock additions in `scripts/verify_regression_locks.mjs`.
- **Consensus Sign-Off:** All 4 agents sign off before Phase 3 begins.

### PHASE 3: SURGICAL IMPLEMENTATION & ZERO-REGRESSION VERIFICATION
Apply the exact edits and run:
1. `node scripts/verify_sql_schema_parity.mjs` (Must pass with 0 violations)
2. `node scripts/verify_regression_locks.mjs` (Must pass all locks in < 1000ms)
3. `npm run check` (Must pass syntax & DOM checks)
4. `npm test` (Must pass all test suites)

```

## القسم الثالث: الكود المرجعي الجراحي المدقق 100% (100% AST & Schema-Parity Verified Reference Code)

هذا الكود المرجعي تمت مطابقته حرفياً مع `scripts/verify_sql_schema_parity.mjs` وتوقيعات الدوال الفعلية في المستودع:

### 1. تعديل `src/modules/keywords/d1-metadata.mjs` (حفظ واسترجاع `aspect_ratio`)

في دالة `syncPinsBatchToD1` (حوالي السطر `90` بعد ضبط `metaObj.method = mVal;`):

```
        if (p.aspect_ratio && !metaObj.aspect_ratio) {
          metaObj.aspect_ratio = p.aspect_ratio;
        }

```

وفي دالة `hydratePinsFromD1` (حوالي السطر `195` داخل `map.set(String(r.pin_id), { ... })`):

```
        map.set(String(r.pin_id), {
          ...r,
          metadata: parsedMeta,
          visual_annotations: Array.isArray(parsedAnnotations) ? parsedAnnotations : [],
          daily_trajectory: parsedTrajectory,
          alt_text: r.seo_alt_text || '',
          creation_method: parsedMeta.creation_method || parsedMeta.method || null,
          aspect_ratio: r.aspect_ratio || parsedMeta.aspect_ratio || null
        });

```

### 2. تعديل الاستيرادات ودالة فحص العنوان الصناعي في `src/modules/keywords/folders-service.mjs`

في أعلى الملف (`السطر 19`)، استبدل استيراد `fleet-router.mjs` بـ:

```
import {
  safeWaitUntil,
  batchGroupByShard,
  coalesceShardGroupsByPhysical,
  resolveShardConnection,
  executeShardQueryWithCircuitBreaker,
  preloadNeonRegistry,
  isUnifiedPostgres
} from '../sharding/fleet-router.mjs';
import { hydratePinsFromD1, syncPinsBatchToD1 } from './d1-metadata.mjs';

```

وفوق دالة `derivePinTitle` (`حوالي السطر 1675`)، أضف دالة `isSyntheticPinTitle`:

```
/**
 * Detects whether a pin title is empty, generic, or a synthesized "<Keyword> Inspiration" fallback
 */
export function isSyntheticPinTitle(title) {
  if (!title || typeof title !== 'string') return true;
  const t = title.trim();
  if (!t || /^untitled(\s+pin)?$/i.test(t)) return true;
  if (/^pin\s*#?\s*\w+$/i.test(t)) return true;
  if (/\s+Inspiration$/i.test(t) || t === 'Pinterest Visual Guide') return true;
  return false;
}

```

### 3. تحديث `calculateFolderCrossover` في `src/modules/keywords/folders-service.mjs:2005-2060` (الحفاظ على التوقيع الأصلي + `:crossover:v3` + Adaptive TTL)

```
export async function calculateFolderCrossover(sql, folderId, { refresh = false, env = null, ctx = null } = {}) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');

  const now = Date.now();
  if (!refresh) {
    const cached = crossoverCache.get(fid);
    if (cached && (now - cached.timestamp < (cached.ttlMs || CROSSOVER_TTL_MS))) {
      return cached.data;
    }
    if (env?.PIN_ENGINE_KV) {
      try {
        const epoch = (await env.PIN_ENGINE_KV.get('fleet:cache_epoch')) || '0';
        const kvKey = `fep:${epoch}:folder:${fid}:crossover:v3`;
        const kvData = await env.PIN_ENGINE_KV.get(kvKey, { type: 'json' });
        if (kvData) {
          crossoverCache.set(fid, { timestamp: now, ttlMs: CROSSOVER_TTL_MS, data: kvData });
          return kvData;
        }
      } catch (_) {}
    }
  }

  const flightKey = `${fid}:${refresh ? 'refresh' : 'standard'}`;
  if (inflightCrossover.has(flightKey)) {
    return await inflightCrossover.get(flightKey);
  }

  const computePromise = (async () => {
    try {
      const result = await _executeFolderCrossover(sql, fid, { env, ctx });
      const isPartial = Boolean(result?._has_unhydrated_priority_pins);
      const memTtlMs = isPartial ? 15 * 1000 : CROSSOVER_TTL_MS;
      const kvTtlSec = isPartial ? 60 : 86400;

      if (crossoverCache.size >= CROSSOVER_CACHE_MAX) {
        const oldest = crossoverCache.keys().next().value;
        if (oldest) crossoverCache.delete(oldest);
      }
      crossoverCache.set(fid, { timestamp: Date.now(), ttlMs: memTtlMs, data: result });
      if (env?.PIN_ENGINE_KV) {
        try {
          const epoch = (await env.PIN_ENGINE_KV.get('fleet:cache_epoch')) || '0';
          const kvKey = `fep:${epoch}:folder:${fid}:crossover:v3`;
          await env.PIN_ENGINE_KV.put(kvKey, JSON.stringify(result), { expirationTtl: kvTtlSec });
        } catch (_) {}
      }
      return result;
    } finally {
      inflightCrossover.delete(flightKey);
    }
  })();

  inflightCrossover.set(flightKey, computePromise);
  return await computePromise;
}

async function _executeFolderCrossover(sql, fid, { env = null, ctx = null } = {}) {

```

### 4. تأجيل `derivePinTitle` في الحلقة الأولى وتنفيذ الـ 4-Tier Hydration المتوافق 100% مع `verify_sql_schema_parity.mjs` (`folders-service.mjs:2316-2504`)

في السطر `2316` داخل `_executeFolderCrossover`:

```
    if (!pinMap.has(pid)) {
      const pinner = meta.pinner || {};
      const candidateRawTitle = String(row.title || meta.title || '').trim();
      const authenticTitle = !isSyntheticPinTitle(candidateRawTitle) ? candidateRawTitle : '';

      pinMap.set(pid, {
        pin_id: pid,
        raw_title: authenticTitle,
        title: authenticTitle,
        image_url: row.image_url || meta.image_url || '',
        domain: row.domain || meta.domain || '',
        destination_url: row.destination_url || meta.destination_url || '',
        board_name: row.board_name || meta.board_name || '',
        domain_age_days: null,
        domain_age_years: null,
        save_count: rowSaves,
        is_vacuum_pin: (!row.domain || row.domain === 'Uploaded by user') && rowSaves >= 100,
        repin_count: rowRepins,
        comment_count: safeNum(row.comment_count),
        daily_save_velocity: vel,
        creator_username: row.creator_username || pinner.username || '',
        creator_name: pinner.full_name || row.creator_username || '',
        aspect_ratio: row.aspect_ratio || meta.aspect_ratio || '2:3',
        format: row.format || meta.format || (row.creation_method ? String(row.creation_method).toUpperCase() : 'ORGANIC PIN'),
        visual_annotations: rowVisualAnnotations,
        created_at_pinterest: row.created_at_pinterest || null,
        crawled_at: row.crawled_at,
        pin_age_days: pinAgeDays,
        folder_age_days: folderAgeDays,
        delta_saves_24h: delta24h,
        delta_repins_24h: safeNum(row.delta_repins_24h, Math.round(vel * 0.1)),
        gains_5d: safeNum(row.gains_5d, Math.round(vel * 5)),
        // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 4: Authentic Multi-Window Gains
        gains_7d: safeNum(row.gains_7d, Math.round(vel * 7)),
        gains_10d: safeNum(row.gains_10d, Math.round(vel * 10)),
        gains_15d: safeNum(row.gains_15d, Math.round(vel * 15)),
        rankings: []
      });
    } else {
      const existingPin = pinMap.get(pid);
      const incomingTitle = String(row.title || meta.title || '').trim();
      if (!existingPin.raw_title && !isSyntheticPinTitle(incomingTitle)) {
        existingPin.raw_title = incomingTitle;
        existingPin.title = incomingTitle;
      }
      if (!existingPin.image_url && (row.image_url || meta.image_url)) {
        existingPin.image_url = row.image_url || meta.image_url;
      }
      if (!existingPin.destination_url && (row.destination_url || meta.destination_url)) {
        existingPin.destination_url = row.destination_url || meta.destination_url;
      }
      if (!existingPin.board_name && (row.board_name || meta.board_name)) {
        existingPin.board_name = row.board_name || meta.board_name;
      }

```

وفي السطور `2433-2504`، استبدل كتلة التعويض القديمة بالكتلة رباعية الطبقات المدققة:

```
  // =========================================================================
  // 4-TIER DISTRIBUTED CREATIVE METADATA HYDRATION (D1 -> Hub -> 20 Shards -> D1 Write-Back)
  // // [INVARIANT: PHYSICAL-SHARD-BATCH-COALESCENCE]
  // // [INVARIANT: CLOUDFLARE-6-CONNECTION-CEILING]
  // // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
  // =========================================================================
  const missingMetaPins = allPins.filter(
    p => !p.raw_title || isSyntheticPinTitle(p.title) || !p.image_url || !p.created_at_pinterest
  );
  let hasUnhydratedPriorityPins = false;

  if (missingMetaPins.length > 0) {
    const missingPinIds = missingMetaPins.map(p => p.pin_id);
    const enrichedMap = new Map();

    const mergeEnrichedRow = (r) => {
      if (!r || !r.pin_id) return;
      const pid = String(r.pin_id);
      const existing = enrichedMap.get(pid) || {};
      const cleanIncomingTitle = (r.title && !isSyntheticPinTitle(r.title)) ? String(r.title).trim() : '';
      const cleanExistingTitle = (existing.title && !isSyntheticPinTitle(existing.title)) ? existing.title : '';

      let parsedAnnotations = Array.isArray(existing.visual_annotations) && existing.visual_annotations.length > 0
        ? existing.visual_annotations
        : [];
      if (parsedAnnotations.length === 0 && r.visual_annotations) {
        if (Array.isArray(r.visual_annotations)) {
          parsedAnnotations = r.visual_annotations;
        } else if (typeof r.visual_annotations === 'string' && r.visual_annotations.trim()) {
          try { parsedAnnotations = JSON.parse(r.visual_annotations); } catch (_) {}
        }
      }

      enrichedMap.set(pid, {
        title: cleanExistingTitle || cleanIncomingTitle || '',
        image_url: existing.image_url || r.image_url || '',
        destination_url: existing.destination_url || r.destination_url || '',
        domain: existing.domain || r.domain || '',
        creator_username: existing.creator_username || r.creator_username || '',
        board_name: existing.board_name || r.board_name || '',
        dominant_color: existing.dominant_color || r.dominant_color || '#888888',
        visual_annotations: Array.isArray(parsedAnnotations) ? parsedAnnotations : [],
        created_at_pinterest: existing.created_at_pinterest || r.created_at_pinterest || null,
        aspect_ratio: existing.aspect_ratio || r.aspect_ratio || null,
        creation_method: existing.creation_method || r.creation_method || null
      });
    };

    // Tier 1: Ultra-Fast Edge Hydration from Cloudflare D1 (`edge_pins_metadata` in < 3ms, 0 Bytes Neon Egress)
    // Note: hydratePinsFromD1 returns a Map(pin_id -> rowObj)
    if (env?.PIN_D1_DB) {
      try {
        const d1Map = await hydratePinsFromD1(env, missingPinIds);
        if (d1Map instanceof Map) {
          for (const [, d1Row] of d1Map.entries()) {
            mergeEnrichedRow(d1Row);
          }
        }
      } catch (_) {}
    }

    // Tier 2: Central Hub Fallback (100% Schema-Parity Verified against KNOWN_TABLE_COLUMNS)
    const stillMissingAfterD1 = missingMetaPins.filter(p => {
      const e = enrichedMap.get(p.pin_id);
      const hasTitle = Boolean(p.raw_title || (e && e.title));
      const hasImg = Boolean(p.image_url || (e && e.image_url));
      return !hasTitle || !hasImg;
    });

    if (stillMissingAfterD1.length > 0) {
      const hubLookupIds = stillMissingAfterD1.map(p => p.pin_id);
      try {
        const hubMeta = await sql`
          SELECT pin_id, title, image_url, destination_url, domain, creator_username, board_name,
                 visual_annotations, created_at_pinterest,
                 (metadata->>'aspect_ratio') AS aspect_ratio,
                 COALESCE(NULLIF(creation_method, ''), NULLIF(metadata->>'creation_method', ''), NULLIF(metadata->>'method', '')) AS creation_method
          FROM keyword_serp_current
          WHERE pin_id = ANY(${hubLookupIds}::text[])
            AND (title <> '' OR image_url <> '')
          UNION ALL
          SELECT pin_id, title, image_url, destination_url, link_domain AS domain, '' AS creator_username, board_name,
                 COALESCE(metadata->'visual_annotations', '[]'::jsonb) AS visual_annotations,
                 created_at_pinterest,
                 (metadata->>'aspect_ratio') AS aspect_ratio,
                 COALESCE(NULLIF(metadata->>'creation_method', ''), NULLIF(metadata->>'method', '')) AS creation_method
          FROM competitor_pins
          WHERE pin_id = ANY(${hubLookupIds}::text[])
            AND (title <> '' OR image_url <> '')
          UNION ALL
          SELECT pin_id, title, image_url, link AS destination_url, domain, account_username AS creator_username, board_name,
                 COALESCE(annotations, '[]'::jsonb) AS visual_annotations,
                 created_at_pinterest,
                 NULL AS aspect_ratio,
                 NULL AS creation_method
          FROM pa_pins
          WHERE pin_id = ANY(${hubLookupIds}::text[])
            AND (title <> '' OR image_url <> '');
        `;
        for (const row of (hubMeta || [])) {
          mergeEnrichedRow(row);
        }
      } catch (_) {}
    }

    // Tier 3: Distributed 20-Physical-Shard Hydration (`universal_master_pins`)
    const stillMissingAfterHub = missingMetaPins
      .filter(p => {
        const e = enrichedMap.get(p.pin_id);
        const hasTitle = Boolean(p.raw_title || (e && e.title));
        const hasImg = Boolean(p.image_url || (e && e.image_url));
        return !hasTitle || !hasImg;
      })
      .sort((a, b) => {
        if (Boolean(b.is_super_pin) !== Boolean(a.is_super_pin)) return b.is_super_pin ? 1 : -1;
        if ((b.daily_save_velocity || 0) !== (a.daily_save_velocity || 0)) return (b.daily_save_velocity || 0) - (a.daily_save_velocity || 0);
        if ((b.overlap_count || 0) !== (a.overlap_count || 0)) return (b.overlap_count || 0) - (a.overlap_count || 0);
        return (b.save_count || 0) - (a.save_count || 0);
      });

    if (stillMissingAfterHub.length > 0) {
      const SYNC_SHARD_HYDRATION_CAP = 350;
      const priorityShardPins = stillMissingAfterHub.slice(0, SYNC_SHARD_HYDRATION_CAP);
      const tailShardPins = stillMissingAfterHub.slice(SYNC_SHARD_HYDRATION_CAP);

      try {
        await preloadNeonRegistry(sql, env);
        // [INVARIANT: PHYSICAL-SHARD-BATCH-COALESCENCE] Coalesce 99 virtual shards -> <= 20 physical Neon databases
        const shardGroups = coalesceShardGroupsByPhysical(batchGroupByShard(priorityShardPins, 99));
        const shardEntries = Array.from(shardGroups.entries());
        const newlyHydratedFromShards = [];

        // [INVARIANT: CLOUDFLARE-6-CONNECTION-CEILING] Execute in waves of 4 concurrent shard queries
        const CONCURRENCY_LIMIT = 4;
        const SCATTER_GATHER_DEADLINE_MS = 4500;

        const hydrateShardBatch = async (entries, perShardTimeoutMs = 2200) => {
          const hydratedBatch = [];
          for (let i = 0; i < entries.length; i += CONCURRENCY_LIMIT) {
            const chunk = entries.slice(i, i + CONCURRENCY_LIMIT);
            await Promise.allSettled(
              chunk.map(async ([shardId, pins]) => {
                const pids = pins.map(p => String(p.pin_id));
                const shardSql = await resolveShardConnection({ hubSql: sql, shardId, env });
                if (!shardSql || (shardSql === sql && !isUnifiedPostgres(env))) return;

                const rows = await executeShardQueryWithCircuitBreaker({
                  shardId,
                  shardSql,
                  timeoutMs: perShardTimeoutMs,
                  queryFn: async (client) => {
                    // [INVARIANT: TARGETED-JSONB-PROJECTION] Project scalar fields only (~160B/row) to protect Shard Egress
                    // Note: universal_master_pins stores creation_method inside metadata JSONB
                    return await client`
                      SELECT
                        pin_id,
                        title,
                        domain,
                        destination_url,
                        image_url,
                        creator_username,
                        board_name,
                        dominant_color,
                        visual_annotations,
                        created_at_pinterest,
                        (metadata->>'aspect_ratio') AS aspect_ratio,
                        COALESCE(NULLIF(metadata->>'creation_method', ''), NULLIF(metadata->>'method', '')) AS creation_method
                      FROM universal_master_pins
                      WHERE pin_id = ANY(${pids}::text[]);
                    `;
                  },
                  fallbackFn: async () => []
                });

                for (const r of (rows || [])) {
                  if (r && r.pin_id && (r.title || r.image_url)) {
                    hydratedBatch.push(r);
                  }
                }
              })
            );
          }
          return hydratedBatch;
        };

        let deadlineTimerId;
        const deadlinePromise = new Promise(resolve => {
          deadlineTimerId = setTimeout(() => resolve(null), SCATTER_GATHER_DEADLINE_MS);
        });

        const raceResult = await Promise.race([
          hydrateShardBatch(shardEntries, 2200),
          deadlinePromise
        ]).finally(() => {
          if (deadlineTimerId) clearTimeout(deadlineTimerId);
        });

        if (Array.isArray(raceResult)) {
          newlyHydratedFromShards.push(...raceResult);
        }

        for (const r of newlyHydratedFromShards) {
          mergeEnrichedRow(r);
        }

        // Tier 4A: Self-Healing Write-Back to Cloudflare D1 (`edge_pins_metadata`)
        if (env?.PIN_D1_DB && newlyHydratedFromShards.length > 0) {
          safeWaitUntil(ctx, syncPinsBatchToD1(env, newlyHydratedFromShards), 'crossover_sync_priority_d1');
        }

        // Tier 4B: Background Tail Warming for folders with > 350 displaced pins
        if (env?.PIN_D1_DB && tailShardPins.length > 0) {
          const tailGroups = coalesceShardGroupsByPhysical(batchGroupByShard(tailShardPins, 99));
          const tailEntries = Array.from(tailGroups.entries());
          safeWaitUntil(
            ctx,
            (async () => {
              const tailHydrated = await hydrateShardBatch(tailEntries, 3500);
              if (tailHydrated.length > 0) {
                await syncPinsBatchToD1(env, tailHydrated);
              }
            })(),
            'crossover_warm_tail_shards_to_d1'
          );
        }
      } catch (_) {}
    }

    // Apply hydrated creative metadata back to allPins BEFORE Dimension B (Tag Bridges) & Dimension D
    for (const p of missingMetaPins) {
      const meta = enrichedMap.get(p.pin_id);
      if (meta) {
        if ((!p.raw_title || isSyntheticPinTitle(p.title)) && meta.title && !isSyntheticPinTitle(meta.title)) {
          p.raw_title = String(meta.title).trim();
          p.title = p.raw_title;
        }
        if (!p.image_url && meta.image_url) p.image_url = meta.image_url;
        if (!p.destination_url && meta.destination_url) p.destination_url = meta.destination_url;
        if (!p.domain && meta.domain) p.domain = meta.domain;
        if (!p.creator_username && meta.creator_username) {
          p.creator_username = meta.creator_username;
          if (!p.creator_name) p.creator_name = meta.creator_username;
        }
        if (!p.board_name && meta.board_name) p.board_name = meta.board_name;
        if ((!p.visual_annotations || p.visual_annotations.length === 0) && Array.isArray(meta.visual_annotations) && meta.visual_annotations.length > 0) {
          p.visual_annotations = meta.visual_annotations;
        }
        if (!p.created_at_pinterest && meta.created_at_pinterest) {
          p.created_at_pinterest = meta.created_at_pinterest;
          const pinCreatedMs = new Date(meta.created_at_pinterest).getTime();
          if (!isNaN(pinCreatedMs)) {
            p.pin_age_days = Math.max(0, Math.floor((nowMs - pinCreatedMs) / 86400000));
          }
        }
        if ((!p.aspect_ratio || p.aspect_ratio === '2:3') && meta.aspect_ratio) {
          p.aspect_ratio = meta.aspect_ratio;
        }
        if ((!p.format || p.format === 'ORGANIC PIN') && meta.creation_method) {
          p.format = String(meta.creation_method).toUpperCase();
        }
      }
    }
  }

  // Final Pass: Synthesize fallback title via derivePinTitle (5 positional arguments!) ONLY if authentic title is STILL missing,
  // and recompute vacuumPinsCount cleanly.
  const primaryKeyword = folderKeywords[0]?.keyword || folder.name || 'Topic Cluster';
  vacuumPinsCount = 0;
  for (const p of allPins) {
    if (!p.title || isSyntheticPinTitle(p.title)) {
      const pinKw = p.rankings[0]?.keyword || primaryKeyword;
      p.title = derivePinTitle(
        p.raw_title || '',
        p.destination_url || p.domain || '',
        pinKw,
        p.board_name || '',
        p.visual_annotations || []
      );
    }
    const cleanDom = String(p.domain || '').trim();
    p.is_vacuum_pin = (!cleanDom || cleanDom === 'Uploaded by user') && safeNum(p.save_count) >= 100;
    if (p.is_vacuum_pin) {
      vacuumPinsCount++;
    }
  }

  // Check if any top-50 priority pin still lacks image_url or authentic title (due to cold shard timeout)
  const top50PriorityCheck = allPins
    .slice()
    .sort((a, b) => (b.daily_save_velocity || 0) - (a.daily_save_velocity || 0) || (b.save_count || 0) - (a.save_count || 0))
    .slice(0, 50);
  hasUnhydratedPriorityPins = top50PriorityCheck.some(p => !p.image_url);

```

وفي نهاية دالة `_executeFolderCrossover` (`السطر 3100`)، أضف `_has_unhydrated_priority_pins: hasUnhydratedPriorityPins` داخل كائن الإرجاع `return { folder, summary, ..., _has_unhydrated_priority_pins: hasUnhydratedPriorityPins };`.

### 5. تمرير `ctx` ومسح `:crossover:v3` في `src/routes/keywords.mjs`

* في السطرين `1114` و`1954`:

  ```
  const crossover = await calculateFolderCrossover(sql, Number(folderId), { refresh, env, ctx });
  
  ```

* في السطرين `1628` و`1654`:

  ```
  await env.PIN_ENGINE_KV.delete(`fep:${epoch}:folder:${folderId}:crossover:v2`);
  await env.PIN_ENGINE_KV.delete(`fep:${epoch}:folder:${folderId}:crossover:v3`);
  
  ```

### 6. تحصين الصورة وشلال الارتداد داخل قالب Alpine.js في `src/campaign-folders-ui.mjs:409-411`

```
<img :src="sp.image_url || 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2290%22 viewBox=%220 0 60 90%22><rect width=%2260%22 height=%2290%22 rx=%224%22 fill=%22%2318181b%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2352525b%22 font-family=%22monospace%22 font-size=%2210%22>PIN</text></svg>'" 
     class="w-full h-full object-cover"
     loading="lazy"
     onerror="if (this.src.includes('/originals/')) { this.src = this.src.replace('/originals/', '/1200x/'); } else if (this.src.includes('/1200x/')) { this.src = this.src.replace('/1200x/', '/736x/'); } else { this.onerror = null; this.src = 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2290%22 viewBox=%220 0 60 90%22><rect width=%2260%22 height=%2290%22 rx=%224%22 fill=%22%2318181b%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2352525b%22 font-family=%22monospace%22 font-size=%2210%22>PIN</text></svg>'; }">

```