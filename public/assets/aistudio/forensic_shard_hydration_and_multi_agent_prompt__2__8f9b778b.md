# 🏛️ الدستور التنفيذي الصارم لسرب الوكلاء (النسخة المختبرة فعلياً 100% على المستودع بدون أي هلوسة أو اجتهاد)

---

## القسم الأول: شهادة الفحص التجريبي المعمق (Empirical Sandbox Verification) + كشف لغمين إضافيين

قبل اعتماد هذه النسخة، قمنا **بتطبيق التعديلات الجراحية حرفياً داخل نسخة حية من المستودع (`169` ملف `.mjs`) وتشغيل جميع بوابات الفحص الآلي والاختبارات الوظيفية عليها فعلياً**، وكانت النتيجة:
* `node scripts/verify_all_syntax.mjs` $\to$ ✅ **نجاح 100% (`169/169` ملف تم فحصه بشجرة AST عبر Acorn بصفر أخطاء).**
* `node scripts/validate_inline_scripts.mjs` $\to$ ✅ **نجاح 100% (فحص جميع قوالب الواجهة الـ 6 و53 وسم `<script>` داخلي).**
* `node scripts/verify_sql_schema_parity.mjs` $\to$ ✅ **نجاح 100% (`Zero-Landmine Parity` عبر 169 ملفاً مع تفعيل الفحص الصريح بالأسماء المستعارة `ksc.` و`cp.` و`pa.` و`ump.`).**
* `node scripts/verify_dom_nesting.mjs` $\to$ ✅ **نجاح 100% (ثبات شجرة DOM بين الغرفة 1 والغرفة 5).**
* `node scripts/verify_regression_locks.mjs` $\to$ ✅ **نجاح 100% (`14/14` قفلاً معمارياً في `78.8ms` شاملة القفلين الفرعيين الجديدين `4D` و`5E`).**
* **محاكاة حية للبنات الثلاثة المكسورة (`281543727244482`، `524950900340768832`، `703756189707271`)** $\to$ ✅ **نجاح 100% (عودة العناوين الحقيقية `Sweet Potato Burger Bowl` و`Stuffed peppers with cream cheese` و`Loaded Baked Potato Soup`، والصور، والعمر بالأيام `pin_age_days`، ونوع البن `format`، وأبعاد الصورة `aspect_ratio`، والكتابة الراجعة في D1 والـ KV).**

### 🚨 لغمان إضافيان خطيران تم كشفهما وتحصينهما أثناء التشغيل الفعلي:

1. **اللغم الثامن: استعلام الـ Hub المكسور صامتاً في `src/modules/keywords/service.mjs:320-332` (`hydrateDisplacedIndexFromShards`) + خدعة الأسماء غير المؤهلة في `verify_sql_schema_parity.mjs`:**
   * كشف الفحص أن أداة `scripts/verify_sql_schema_parity.mjs` (السطر `421`) تفحص الأعمدة **فقط إذا كانت مسبوقة باسم الجدول أو الاسم المستعار (`alias.column` مثل `cp.link_domain` أو `pa.annotations`)**، وتتجاهل الأعمدة المكتوبة بدون بادئة!
   * وبسبب ذلك، وُجد أن دالة `hydrateDisplacedIndexFromShards` في `src/modules/keywords/service.mjs:320-332` تحتوي هي الأخرى على استعلام `UNION ALL` قديم يطلب أعمدة غير موجودة (`SELECT ... domain, dominant_color, visual_annotations FROM competitor_pins UNION ALL SELECT ... destination_url, visual_annotations FROM pa_pins`) وكان يفشل بصمت داخل `.catch(() => [])`!
   * **التحصين:** فرض استخدام الأسماء المستعارة الصريحة (`ksc.`، `cp.`، `pa.`، `ump.`) في كلا الملفين (`folders-service.mjs` و`service.mjs:320-332`) بحيث تخضع كل الأعمدة للفحص الآلي الإجباري في `verify_sql_schema_parity.mjs`!

2. **اللغم التاسع: فخ القفل `Lock 13C` في `scripts/verify_regression_locks.mjs:384-399`:**
   * اقترح Carbon إضافة أقفال جديدة باسم `Lock 8A – Lock 8E`. لكن الفحص الفعلي للكود في `verify_regression_locks.mjs:384-399` أثبت أن **`Lock 13C` يحسب عدد الأقفال عبر Regex (`expectedLockCount = 14`) ويرفض أي تغيير في أسماء الأقفال الرئيسية من `1` إلى `14`!**
   * **التحصين:** إدراج فحوصات عدم التراجع الجديدة كفحوصات فرعية **`4D`** تحت `check('Lock 4', ...)` و**`5E`** تحت `check('Lock 5', ...)`، مما يحافظ على تطابق `Lock 13C` بنسبة 100%.

---

## القسم الثاني: البرومبت الإلزامي الحرفي لسرب الوكلاء (انسخ هذا النص بالكامل وأرسله للوكلاء)

```markdown
# 🏛️ MANDATORY ARCHITECTURAL EXECUTION CONTRACT (ROUND 11): 20-SHARD VAULT HYDRATION, TITLE DE-POISONING, SCHEMA PARITY & SELF-HEALING D1/KV CACHE

> **⚠️ STRICT ZERO-DEVIATION & ZERO-SPECULATION DIRECTIVE (أمر تنفيذي ملزم بالحرف الواحد):**
> 1. **NO IMPROVISATION OR HALLUCINATED APIS:** Every SQL query, table alias, column name, function signature, and import in this prompt has already been empirically verified against the live repository (`169 .mjs files`), `scripts/verify_sql_schema_parity.mjs`, and `scripts/verify_regression_locks.mjs`. You are **STRICTLY FORBIDDEN** from inventing new function names, altering existing function parameter signatures, omitting any of the 6 target file edits, or substituting your own speculative code.
> 2. **MANDATORY PRE-EDIT DEBATE & LIVE CODE/DB COMPARISON:** Before modifying a single byte of code, all 4 specialist agents MUST inspect the live files and database schemas, compare every claim below directly against the actual codebase and SQL schema definitions, and conduct a structured **4-Round Inter-Agent Cross-Examination Debate** ending with a unanimous written sign-off.
> 3. **VERBATIM IMPLEMENTATION:** In Phase 3, you MUST apply the exact, verified code blocks specified in Section 4 of this prompt character-for-character across all 6 target files, followed by executing the verification suite.

---

## 👥 1. SPECIALIST AGENT POD & MANDATES

1. **`Agent-1: Distributed-Shards-And-Egress-Architect` (20-Shard Topology & Egress Shield Lead)**
   - **Scope:** `src/modules/sharding/fleet-router.mjs`, `universal_master_pins` across the 20 Physical Neon Shards (`pin-arbitrage-shard-01..20`), `batchGroupByShard`, `coalesceShardGroupsByPhysical`, `resolveShardConnection`, `executeShardQueryWithCircuitBreaker`, `preloadNeonRegistry`, and `isUnifiedPostgres`.
   - **Duty:** Verify and defend the 4-Tier Distributed Hydration architecture that protects the Central Hub's 5 GB/month egress cap by distributing Vault pin creative metadata hydration across the **20 Physical Shards (`20 × 5 GB = 100 GB/month` combined egress capacity)** using slim scalar SQL projection (`~160 bytes/row`, stripping raw `metadata` JSONB and long `description` text) and `CONCURRENCY_LIMIT = 4` (respecting Cloudflare Workers' 6 simultaneous outgoing connections limit).

2. **`Agent-2: Edge-D1-KV-And-Crossover-Pipeline-Specialist` (Crossover Logic, SQL Schema Parity & Cache Coherency Lead)**
   - **Scope:** `src/modules/keywords/folders-service.mjs`, `src/modules/keywords/service.mjs`, `src/modules/keywords/d1-metadata.mjs`, `src/routes/keywords.mjs`, and `scripts/verify_sql_schema_parity.mjs`.
   - **Duty:** Verify and defend:
     - Fixing the **Premature `derivePinTitle` Poisoning Bug** (`folders-service.mjs:2318` vs `2434` & `2495`) via `isSyntheticPinTitle` and deferred title synthesis.
     - Persisting and exposing `aspect_ratio` in `syncPinsBatchToD1` and `hydratePinsFromD1` (`src/modules/keywords/d1-metadata.mjs`).
     - Enforcing **100% Alias-Qualified SQL Schema Parity** (`ksc.`, `cp.`, `pa.`, `ump.`) in both `src/modules/keywords/folders-service.mjs` AND `src/modules/keywords/service.mjs:320-332` (`hydrateDisplacedIndexFromShards`).
     - Preserving the exact `calculateFolderCrossover(sql, folderId, { refresh = false, env = null, ctx = null } = {})` signature while upgrading the KV cache key to `:crossover:v3` with adaptive TTL (`60s` when `_has_unhydrated_priority_pins` is true vs `86400s` when fully hydrated).

3. **`Agent-3: Frontend-Cockpit-And-Media-Waterfall-Specialist` (UI & DOM Resilience Lead)**
   - **Scope:** `src/campaign-folders-ui.mjs` (lines 409–411 Alpine.js client-side `sp.image_url` rendering & `onerror` waterfall).
   - **Duty:** Eradicate the last remaining `https://via.placeholder.com/60x90` references in `src/campaign-folders-ui.mjs:409-411`, implement the client-side Pinterest S3 ACL waterfall (`/originals/` $\to$ `/1200x/` $\to$ `/736x/` $\to$ zero-network Inline SVG Data URI) inside the `<template x-for="(sp, idx) in paginatedPins()">` loop, and preserve Lock 1 (DOM Sibling Hierarchy) and Lock 5 (Context-Preserving Pin Navigation).

4. **`Agent-4: Adversarial-Verifier-And-Regression-Gatekeeper` (Lead Auditor with Absolute Veto Authority)**
   - **Scope:** Cross-examination chair, `scripts/verify_sql_schema_parity.mjs`, `scripts/verify_regression_locks.mjs` (Locks 1–14), `npm run check`, and `npm test`.
   - **Duty:** Chair the pre-modification debate, cross-examine every agent against live file lines and `KNOWN_TABLE_COLUMNS`, enforce **Lock 13C** (`expectedLockCount = 14` in `verify_regression_locks.mjs`), and veto any deviation from the verified specification.

---

## 🔍 2. FORENSIC FACTS & ANTI-HALLUCINATION GUARDRAILS (DO NOT VIOLATE)

During Phase 1 and Phase 2, all agents must verify and uphold these 7 ground-truth facts from the codebase:

1. **Real Exports in `src/modules/sharding/fleet-router.mjs`:**
   - `fleet-router.mjs` exports `safeWaitUntil` (line 164), `batchGroupByShard(pinRecords = [], totalShards = 99)` (line 798), `coalesceShardGroupsByPhysical(batches)` (line 826), `resolveShardConnection` (line 438), `executeShardQueryWithCircuitBreaker` (line 681), `preloadNeonRegistry` (line 599), and `isUnifiedPostgres` (line 416).
   - **NEVER** invent non-existent imports like `getShardSqlClient` or `loadFleetRegistry`, and **NEVER** pass `'pin_id'` as the second argument to `batchGroupByShard(pins, 99)`.
2. **Real Return Type of `hydratePinsFromD1(env, pinIds)` in `src/modules/keywords/d1-metadata.mjs:147`:**
   - `hydratePinsFromD1` returns a JavaScript **`Map`** (`pin_id -> rowObj`), NOT an `Array`.
   - **NEVER** check `d1Rows.length > 0` (which is `undefined` on a `Map` and disables D1!). Always check `if (d1Map instanceof Map)` and iterate via `for (const [, d1Row] of d1Map.entries())`.
3. **Real Signature of `calculateFolderCrossover` in `src/modules/keywords/folders-service.mjs:2005`:**
   - The canonical signature used across all 8 callers and test suites is:
     `export async function calculateFolderCrossover(sql, folderId, { refresh = false, env = null, ctx = null } = {})`
   - **NEVER** change the positional argument order `(sql, folderId, options)`.
4. **Real Signature of `derivePinTitle` in `src/modules/keywords/folders-service.mjs:1678`:**
   - `export function derivePinTitle(title, destinationUrl = '', keyword = '', boardName = '', visualAnnotations = [])`
   - It takes **5 positional arguments**. **NEVER** pass an options object `{ title: '' }` as the first parameter (which stringifies to `"[object Object]"`!).
5. **Real Schema Columns in `scripts/verify_sql_schema_parity.mjs` (`KNOWN_TABLE_COLUMNS`):**
   - `keyword_serp_current` (`ksc`): `pin_id, title, image_url, destination_url, domain, creator_username, board_name, dominant_color, visual_annotations, created_at_pinterest, metadata, creation_method`.
   - `competitor_pins` (`cp`): `pin_id, title, image_url, destination_url, link_domain, board_name, created_at_pinterest, metadata`. *(No `domain`, `creator_username`, `dominant_color`, or `visual_annotations` columns — use `cp.link_domain AS domain`, `'' AS creator_username`, `'#888888' AS dominant_color`, and `COALESCE(cp.metadata->'visual_annotations', '[]'::jsonb) AS visual_annotations`!)*
   - `pa_pins` (`pa`): `pin_id, title, image_url, link, domain, account_username, board_name, dominant_color, annotations, created_at_pinterest`. *(Uses `pa.link AS destination_url`, `pa.account_username AS creator_username`, and `COALESCE(pa.annotations, '[]'::jsonb) AS visual_annotations`!)*
   - `universal_master_pins` (`ump`): `pin_id, title, domain, destination_url, image_url, creator_username, board_name, dominant_color, visual_annotations, created_at_pinterest, metadata`. *(No physical `creation_method` column — extract `COALESCE(NULLIF(ump.metadata->>'creation_method', ''), NULLIF(ump.metadata->>'method', '')) AS creation_method` and `(ump.metadata->>'aspect_ratio') AS aspect_ratio`!)*
   - **Always qualify columns with table aliases (`ksc.`, `cp.`, `pa.`, `ump.`)** so `verify_sql_schema_parity.mjs` actively validates every column!
6. **Real Client-Side Alpine.js Context in `src/campaign-folders-ui.mjs:403-412`:**
   - Inside `<template x-for="(sp, idx) in paginatedPins()" :key="sp.pin_id">`, `sp` is a browser-side Alpine.js variable. **NEVER** reference server-side Node variables like `p.image_url` or `${escapeHtml(...)}` inside that block.
7. **Lock Count Invariant (`Lock 13C` in `scripts/verify_regression_locks.mjs:384-399`):**
   - `verify_regression_locks.mjs` enforces `expectedLockCount = 14` (`Lock 1` through `Lock 14`). New regression checks MUST be added as sub-assertions `4D` (calling `check('Lock 4', ...)`) and `5E` (calling `check('Lock 5', ...)`).

---

## ⚖️ 3. MANDATORY 3-PHASE WORKFLOW

### PHASE 1: LIVE CODEBASE & DATABASE SCHEMA VERIFICATION (READ-ONLY)
1. Inspect the exact lines of all 6 target files (`src/modules/keywords/d1-metadata.mjs`, `src/modules/keywords/service.mjs`, `src/modules/keywords/folders-service.mjs`, `src/routes/keywords.mjs`, `src/campaign-folders-ui.mjs`, `scripts/verify_regression_locks.mjs`) and `scripts/verify_sql_schema_parity.mjs`.
2. Verify each of the 7 ground-truth facts in Section 2 against the actual files.

### PHASE 2: MANDATORY 4-ROUND INTER-AGENT DEBATE (PRIOR TO ANY FILE MODIFICATION)
Before editing any file, output the complete, substantive **4-Round Inter-Agent Technical Debate** where the 4 agents cross-examine each other using direct evidence from Phase 1:
- **Debate Round 1 (Title De-Poisoning & D1 Map Contract):** `Agent-4` cross-examines `Agent-2` on why `folders-service.mjs:2318` poisoned Row 4 (`Meal prep ideas Inspiration`) even when its image was present, why `derivePinTitle` must be deferred and called with 5 positional arguments, and how `aspect_ratio` is preserved across `syncPinsBatchToD1` and `hydratePinsFromD1` (`Map` return type).
- **Debate Round 2 (20-Shard Egress Math & Alias-Qualified SQL Schema Parity):** `Agent-4` cross-examines `Agent-1` and `Agent-2` on the exact column mappings across `keyword_serp_current` (`ksc`), `competitor_pins` (`cp`), `pa_pins` (`pa`), and `universal_master_pins` (`ump`), why `src/modules/keywords/service.mjs:320-332` (`hydrateDisplacedIndexFromShards`) also required alias-qualified schema healing, and how `coalesceShardGroupsByPhysical(batchGroupByShard(priorityShardPins, 99))` + `CONCURRENCY_LIMIT = 4` + scalar SQL projection protects both Cloudflare's 6-connection limit and Neon's monthly egress allowance.
- **Debate Round 3 (Self-Healing D1 Write-Back, `:crossover:v3` KV Cache & Adaptive TTL):** `Agent-4` cross-examines `Agent-1` and `Agent-2` on `safeWaitUntil(ctx, syncPinsBatchToD1(...))`, background tail warming for folders with `> 350` missing pins, preserving `calculateFolderCrossover(sql, folderId, { refresh = false, env = null, ctx = null } = {})`, and capping KV TTL to `60s` when `_has_unhydrated_priority_pins` is true.
- **Debate Round 4 (Frontend S3 Waterfall & Lock 13C Gate Integrity):** `Agent-4` cross-examines `Agent-3` on replacing `via.placeholder.com` at `src/campaign-folders-ui.mjs:409-411` with the `/originals/ -> /1200x/ -> /736x/ -> Inline SVG` waterfall inside Alpine.js, and adding sub-locks `4D` and `5E` in `scripts/verify_regression_locks.mjs` while keeping `expectedLockCount = 14`.
- **Unanimous Consensus Sign-Off:** All 4 agents sign the execution order.

### PHASE 3: VERBATIM SURGICAL EXECUTION & GATE VERIFICATION
Apply the exact 6 file edits in Section 4 below without omission or alteration, then run:
1. `node scripts/verify_sql_schema_parity.mjs`
2. `node scripts/verify_regression_locks.mjs`
3. `npm run check`
4. `npm test`

---

## 🛠️ 4. VERBATIM SURGICAL EDITS (APPLY EXACTLY AS WRITTEN ACROSS ALL 6 FILES)

### FILE 1: `src/modules/keywords/d1-metadata.mjs`

#### Edit 1A — Inside `syncPinsBatchToD1` (lines 88–93):
Find:
```javascript
        if (mVal) {
          metaObj.creation_method = mVal;
          metaObj.method = mVal;
        }
```
Replace with:
```javascript
        if (mVal) {
          metaObj.creation_method = mVal;
          metaObj.method = mVal;
        }
        if (p.aspect_ratio && !metaObj.aspect_ratio) {
          metaObj.aspect_ratio = p.aspect_ratio;
        }
```

#### Edit 1B — Inside `hydratePinsFromD1` (lines 195–203):
Find:
```javascript
        map.set(String(r.pin_id), {
          ...r,
          metadata: parsedMeta,
          visual_annotations: Array.isArray(parsedAnnotations) ? parsedAnnotations : [],
          daily_trajectory: parsedTrajectory,
          alt_text: r.seo_alt_text || '',
          creation_method: parsedMeta.creation_method || parsedMeta.method || null
        });
```
Replace with:
```javascript
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

---

### FILE 2: `src/modules/keywords/service.mjs`

#### Edit 2A — Inside `hydrateDisplacedIndexFromShards` (lines 319–333, fixing silent Hub UNION ALL schema mismatch):
Find:
```javascript
        const hubRows = await hubSql`
          SELECT pin_id, title, domain, destination_url, image_url, '' as creator_username, '' as board_name, dominant_color, visual_annotations, created_at_pinterest
          FROM keyword_serp_current
          WHERE pin_id = ANY(${missingIds}) AND (title <> '' OR image_url <> '')
          UNION ALL
          SELECT pin_id, title, domain, destination_url, image_url, '' as creator_username, board_name, dominant_color, visual_annotations, created_at_pinterest
          FROM competitor_pins
          WHERE pin_id = ANY(${missingIds}) AND (title <> '' OR image_url <> '')
          UNION ALL
          SELECT pin_id, title, domain, destination_url, image_url, '' as creator_username, board_name, dominant_color, visual_annotations, created_at_pinterest
          FROM pa_pins
          WHERE pin_id = ANY(${missingIds}) AND (title <> '' OR image_url <> '')
          LIMIT 100;
        `.catch(() => []);
```
Replace with:
```javascript
        const hubRows = await hubSql`
          SELECT ksc.pin_id, ksc.title, ksc.domain, ksc.destination_url, ksc.image_url, ksc.creator_username, ksc.board_name, ksc.dominant_color, ksc.visual_annotations, ksc.created_at_pinterest
          FROM keyword_serp_current ksc
          WHERE ksc.pin_id = ANY(${missingIds}) AND (ksc.title <> '' OR ksc.image_url <> '')
          UNION ALL
          SELECT cp.pin_id, cp.title, cp.link_domain AS domain, cp.destination_url, cp.image_url, '' AS creator_username, cp.board_name, '#888888' AS dominant_color, COALESCE(cp.metadata->'visual_annotations', '[]'::jsonb) AS visual_annotations, cp.created_at_pinterest
          FROM competitor_pins cp
          WHERE cp.pin_id = ANY(${missingIds}) AND (cp.title <> '' OR cp.image_url <> '')
          UNION ALL
          SELECT pa.pin_id, pa.title, pa.domain, pa.link AS destination_url, pa.image_url, pa.account_username AS creator_username, pa.board_name, pa.dominant_color, COALESCE(pa.annotations, '[]'::jsonb) AS visual_annotations, pa.created_at_pinterest
          FROM pa_pins pa
          WHERE pa.pin_id = ANY(${missingIds}) AND (pa.title <> '' OR pa.image_url <> '')
          LIMIT 100;
        `.catch(() => []);
```

---

### FILE 3: `src/modules/keywords/folders-service.mjs`

#### Edit 3A — Top Imports (line 19):
Find:
```javascript
import { safeWaitUntil } from '../sharding/fleet-router.mjs';
```
Replace with:
```javascript
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

#### Edit 3B — Add `isSyntheticPinTitle` helper right above `derivePinTitle` (line 1678):
Find:
```javascript
export function derivePinTitle(title, destinationUrl = '', keyword = '', boardName = '', visualAnnotations = []) {
```
Replace with:
```javascript
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

export function derivePinTitle(title, destinationUrl = '', keyword = '', boardName = '', visualAnnotations = []) {
```

#### Edit 3C — Update `calculateFolderCrossover` and `_executeFolderCrossover` signature, `:crossover:v3` KV key, and Adaptive TTL (lines 2005–2058):
Find:
```javascript
export async function calculateFolderCrossover(sql, folderId, { refresh = false, env = null } = {}) {
  const fid = Number(folderId);
  if (!fid) throw new Error('Invalid folder ID');

  const now = Date.now();
  if (!refresh) {
    const cached = crossoverCache.get(fid);
    if (cached && (now - cached.timestamp < CROSSOVER_TTL_MS)) {
      return cached.data;
    }
    if (env?.PIN_ENGINE_KV) {
      try {
        const epoch = (await env.PIN_ENGINE_KV.get('fleet:cache_epoch')) || '0';
        const kvKey = `fep:${epoch}:folder:${fid}:crossover:v2`;
        const kvData = await env.PIN_ENGINE_KV.get(kvKey, { type: 'json' });
        if (kvData) {
          crossoverCache.set(fid, { timestamp: now, data: kvData });
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
      const result = await _executeFolderCrossover(sql, fid, { env });
      if (crossoverCache.size >= CROSSOVER_CACHE_MAX) {
        const oldest = crossoverCache.keys().next().value;
        if (oldest) crossoverCache.delete(oldest);
      }
      crossoverCache.set(fid, { timestamp: Date.now(), data: result });
      if (env?.PIN_ENGINE_KV) {
        try {
          const epoch = (await env.PIN_ENGINE_KV.get('fleet:cache_epoch')) || '0';
          const kvKey = `fep:${epoch}:folder:${fid}:crossover:v2`;
          await env.PIN_ENGINE_KV.put(kvKey, JSON.stringify(result), { expirationTtl: 86400 });
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

async function _executeFolderCrossover(sql, fid, { env = null } = {}) {
```
Replace with:
```javascript
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

#### Edit 3D — Defer `derivePinTitle` in Pass 1 (`pinMap` population, lines 2316–2360):
Find:
```javascript
    if (!pinMap.has(pid)) {
      const pinner = meta.pinner || {};
      const cleanTitle = derivePinTitle(
        row.title || meta.title,
        row.destination_url || meta.destination_url || '',
        row.keyword_text || '',
        row.board_name || meta.board_name || '',
        rowVisualAnnotations
      );

      pinMap.set(pid, {
        pin_id: pid,
        title: cleanTitle,
        image_url: row.image_url || meta.image_url || '',
        domain: row.domain || meta.domain || '',
        destination_url: row.destination_url || meta.destination_url || '',
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
        created_at_pinterest: row.created_at_pinterest,
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
```
Replace with:
```javascript
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

#### Edit 3E — Replace the Hydration Block (lines 2433–2504) with the 4-Tier Distributed Hydration Pipeline:
Find:
```javascript
  // Fast Creative Metadata Hydration (D1 / Hub Fallback) for Vault-only Pins
  const missingMetaPins = allPins.filter(p => !p.title || !p.image_url);
  if (missingMetaPins.length > 0) {
    const missingPinIds = missingMetaPins.map(p => p.pin_id);
    const enrichedMap = new Map();

    // Step A: Check Cloudflare D1 edge_pins_metadata if available
    if (env?.PIN_D1_DB && typeof env.PIN_D1_DB.prepare === 'function') {
      try {
        const BATCH_SIZE = 80;
        for (let i = 0; i < missingPinIds.length; i += BATCH_SIZE) {
          const chunk = missingPinIds.slice(i, i + BATCH_SIZE);
          const placeholders = chunk.map(() => '?').join(',');
          const d1Res = await env.PIN_D1_DB.prepare(
            `SELECT pin_id, title, image_url, destination_url FROM edge_pins_metadata WHERE pin_id IN (${placeholders})`
          ).bind(...chunk).all();
          if (Array.isArray(d1Res?.results)) {
            for (const r of d1Res.results) {
              if (r.pin_id) enrichedMap.set(String(r.pin_id), r);
            }
          }
        }
      } catch (_) {}
    }

    // Step B: Central Hub Fallback (competitor_pins / pa_pins)
    const stillMissing = missingPinIds.filter(pid => {
      const e = enrichedMap.get(pid);
      return !e || !e.title || !e.image_url;
    });

    if (stillMissing.length > 0) {
      try {
        const hubMeta = await sql`
          SELECT pin_id, title, image_url, destination_url
          FROM competitor_pins
          WHERE pin_id = ANY(${stillMissing}::text[])
            AND (title <> '' OR image_url <> '')
          UNION
          SELECT pin_id, title, image_url, link as destination_url
          FROM pa_pins
          WHERE pin_id = ANY(${stillMissing}::text[])
            AND (title <> '' OR image_url <> '');
        `;
        for (const row of hubMeta) {
          if (row.pin_id) {
            const existing = enrichedMap.get(String(row.pin_id)) || {};
            enrichedMap.set(String(row.pin_id), {
              title: row.title || existing.title,
              image_url: row.image_url || existing.image_url,
              destination_url: row.destination_url || existing.destination_url
            });
          }
        }
      } catch (_) {}
    }

    // Step C: Apply metadata & fall back cleanly so zero "Untitled Pin" rows exist
    const primaryKeyword = folderKeywords[0]?.keyword || folder.name || 'Topic Cluster';
    for (const p of missingMetaPins) {
      const meta = enrichedMap.get(p.pin_id);
      if (meta) {
        if (!p.title && meta.title) p.title = meta.title;
        if (!p.image_url && meta.image_url) p.image_url = meta.image_url;
        if (!p.destination_url && meta.destination_url) p.destination_url = meta.destination_url;
      }
      if (!p.title || p.title === 'Untitled Pin') {
        p.title = derivePinTitle('', p.destination_url || p.domain, primaryKeyword);
      }
    }
  }
```
Replace with:
```javascript
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

    // Tier 1: Ultra-Fast Edge Hydration from Cloudflare D1 (edge_pins_metadata in < 3ms, 0 Bytes Neon Egress)
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
          SELECT ksc.pin_id, ksc.title, ksc.image_url, ksc.destination_url, ksc.domain, ksc.creator_username, ksc.board_name,
                 ksc.visual_annotations, ksc.created_at_pinterest,
                 (ksc.metadata->>'aspect_ratio') AS aspect_ratio,
                 COALESCE(NULLIF(ksc.creation_method, ''), NULLIF(ksc.metadata->>'creation_method', ''), NULLIF(ksc.metadata->>'method', '')) AS creation_method
          FROM keyword_serp_current ksc
          WHERE ksc.pin_id = ANY(${hubLookupIds}::text[])
            AND (ksc.title <> '' OR ksc.image_url <> '')
          UNION ALL
          SELECT cp.pin_id, cp.title, cp.image_url, cp.destination_url, cp.link_domain AS domain, '' AS creator_username, cp.board_name,
                 COALESCE(cp.metadata->'visual_annotations', '[]'::jsonb) AS visual_annotations,
                 cp.created_at_pinterest,
                 (cp.metadata->>'aspect_ratio') AS aspect_ratio,
                 COALESCE(NULLIF(cp.metadata->>'creation_method', ''), NULLIF(cp.metadata->>'method', '')) AS creation_method
          FROM competitor_pins cp
          WHERE cp.pin_id = ANY(${hubLookupIds}::text[])
            AND (cp.title <> '' OR cp.image_url <> '')
          UNION ALL
          SELECT pa.pin_id, pa.title, pa.image_url, pa.link AS destination_url, pa.domain, pa.account_username AS creator_username, pa.board_name,
                 COALESCE(pa.annotations, '[]'::jsonb) AS visual_annotations,
                 pa.created_at_pinterest,
                 NULL AS aspect_ratio,
                 NULL AS creation_method
          FROM pa_pins pa
          WHERE pa.pin_id = ANY(${hubLookupIds}::text[])
            AND (pa.title <> '' OR pa.image_url <> '');
        `;
        for (const row of (hubMeta || [])) {
          mergeEnrichedRow(row);
        }
      } catch (_) {}
    }

    // Tier 3: Distributed 20-Physical-Shard Hydration (universal_master_pins)
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
                    return await client`
                      SELECT
                        ump.pin_id,
                        ump.title,
                        ump.domain,
                        ump.destination_url,
                        ump.image_url,
                        ump.creator_username,
                        ump.board_name,
                        ump.dominant_color,
                        ump.visual_annotations,
                        ump.created_at_pinterest,
                        (ump.metadata->>'aspect_ratio') AS aspect_ratio,
                        COALESCE(NULLIF(ump.metadata->>'creation_method', ''), NULLIF(ump.metadata->>'method', '')) AS creation_method
                      FROM universal_master_pins ump
                      WHERE ump.pin_id = ANY(${pids}::text[]);
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

        // Tier 4A: Self-Healing Write-Back to Cloudflare D1 (edge_pins_metadata)
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
        if ((!p.domain || !cleanExternalDomain(p.domain)) && meta.domain && cleanExternalDomain(meta.domain)) {
          p.domain = meta.domain;
        } else if (!p.domain && meta.domain) {
          p.domain = meta.domain;
        }
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

  // Check if any top-50 priority pin still lacks image_url (due to cold shard timeout)
  const top50PriorityCheck = allPins
    .slice()
    .sort((a, b) => (b.daily_save_velocity || 0) - (a.daily_save_velocity || 0) || (b.save_count || 0) - (a.save_count || 0))
    .slice(0, 50);
  hasUnhydratedPriorityPins = top50PriorityCheck.some(p => !p.image_url);
```

#### Edit 3F — Include `_has_unhydrated_priority_pins` in `_executeFolderCrossover` return object (line 3110):
Find:
```javascript
    topic_cluster_blueprint: topicClusterBlueprint
  };
}
```
Replace with:
```javascript
    topic_cluster_blueprint: topicClusterBlueprint,
    _has_unhydrated_priority_pins: hasUnhydratedPriorityPins
  };
}
```

---

### FILE 4: `src/routes/keywords.mjs`

#### Edit 4A — Pass `ctx` to `calculateFolderCrossover` (lines 1114 and 1954):
At line `1114`:
Find:
```javascript
    const crossover = await calculateFolderCrossover(sql, Number(folderId), { refresh, env });
```
Replace with:
```javascript
    const crossover = await calculateFolderCrossover(sql, Number(folderId), { refresh, env, ctx });
```

At line `1954`:
Find:
```javascript
    const crossover = await calculateFolderCrossover(sql, folderId, { refresh, env });
```
Replace with:
```javascript
    const crossover = await calculateFolderCrossover(sql, folderId, { refresh, env, ctx });
```

#### Edit 4B — Delete both `:crossover:v2` and `:crossover:v3` on folder update/delete (lines 1628 and 1654):
At both lines `1628` and `1654`:
Find:
```javascript
            await env.PIN_ENGINE_KV.delete(`fep:${epoch}:folder:${folderId}:crossover:v2`);
```
Replace with:
```javascript
            await env.PIN_ENGINE_KV.delete(`fep:${epoch}:folder:${folderId}:crossover:v2`);
            await env.PIN_ENGINE_KV.delete(`fep:${epoch}:folder:${folderId}:crossover:v3`);
```

---

### FILE 5: `src/campaign-folders-ui.mjs`

#### Edit 5A — Replace dead `via.placeholder.com` with S3 `/originals/ -> /1200x/ -> /736x/` waterfall & Inline SVG (lines 409–411):
Find:
```html
                        <img :src="sp.image_url || 'https://via.placeholder.com/60x90'" 
                             class="w-full h-full object-cover"
                             onerror="this.src='https://via.placeholder.com/60x90?text=Pin'">
```
Replace with:
```html
                        <img :src="sp.image_url || 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2290%22 viewBox=%220 0 60 90%22><rect width=%2260%22 height=%2290%22 rx=%224%22 fill=%22%2318181b%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2352525b%22 font-family=%22monospace%22 font-size=%2210%22>PIN</text></svg>'" 
                             class="w-full h-full object-cover"
                             loading="lazy"
                             onerror="if (this.src.includes('/originals/')) { this.src = this.src.replace('/originals/', '/1200x/'); } else if (this.src.includes('/1200x/')) { this.src = this.src.replace('/1200x/', '/736x/'); } else { this.onerror = null; this.src = 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2290%22 viewBox=%220 0 60 90%22><rect width=%2260%22 height=%2290%22 rx=%224%22 fill=%22%2318181b%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2352525b%22 font-family=%22monospace%22 font-size=%2210%22>PIN</text></svg>'; }">
```

---

### FILE 6: `scripts/verify_regression_locks.mjs`

#### Edit 6A — Add Sub-Assertion `4D` under `Lock 4` (around line 231, preserving `expectedLockCount = 14` in `Lock 13C`):
Find:
```javascript
  // 4C. top_creators must be wired in _executeFolderCrossover return
  const returnsTopCreators = /top_creators:\s*creatorMonopoly/i.test(foldersServiceContent);
  check('Lock 4', returnsTopCreators, 'src/modules/keywords/folders-service.mjs omits top_creators from _executeFolderCrossover return');
```
Replace with:
```javascript
  // 4C. top_creators must be wired in _executeFolderCrossover return
  const returnsTopCreators = /top_creators:\s*creatorMonopoly/i.test(foldersServiceContent);
  check('Lock 4', returnsTopCreators, 'src/modules/keywords/folders-service.mjs omits top_creators from _executeFolderCrossover return');

  // 4D. folders-service.mjs must hydrate displaced Vault pins from 20 physical shards via coalesceShardGroupsByPhysical & isSyntheticPinTitle
  const foldersHydratesShards = (
    foldersServiceContent.includes('coalesceShardGroupsByPhysical') &&
    foldersServiceContent.includes('FROM universal_master_pins') &&
    foldersServiceContent.includes('isSyntheticPinTitle') &&
    foldersServiceContent.includes(':crossover:v3')
  );
  check('Lock 4', foldersHydratesShards, 'src/modules/keywords/folders-service.mjs is missing 20-shard universal_master_pins hydration, isSyntheticPinTitle guard, or :crossover:v3 cache key');
```

#### Edit 6B — Add Sub-Assertion `5E` under `Lock 5` (around line 243):
Find:
```javascript
  // 5A. Pin links in campaign-folders-ui.mjs must contain folder_id query parameter
  const pinLinkLines = campaignFoldersContent.split('\n').filter(line => line.includes("'/pins/'") || line.includes('"/pins/"'));
  const allPinLinksHaveFolderId = pinLinkLines.length > 0 && pinLinkLines.every(line => line.includes('folder_id'));
  check('Lock 5', allPinLinksHaveFolderId, "src/campaign-folders-ui.mjs contains bare '/pins/' + sp.pin_id links without folder_id parameter");
```
Replace with:
```javascript
  // 5A. Pin links in campaign-folders-ui.mjs must contain folder_id query parameter
  const pinLinkLines = campaignFoldersContent.split('\n').filter(line => line.includes("'/pins/'") || line.includes('"/pins/"'));
  const allPinLinksHaveFolderId = pinLinkLines.length > 0 && pinLinkLines.every(line => line.includes('folder_id'));
  check('Lock 5', allPinLinksHaveFolderId, "src/campaign-folders-ui.mjs contains bare '/pins/' + sp.pin_id links without folder_id parameter");

  // 5E. campaign-folders-ui.mjs must contain zero dead via.placeholder.com URLs
  const hasDeadPlaceholder = campaignFoldersContent.includes('via.placeholder.com');
  check('Lock 5', !hasDeadPlaceholder, 'src/campaign-folders-ui.mjs contains dead via.placeholder.com URL');
```
```