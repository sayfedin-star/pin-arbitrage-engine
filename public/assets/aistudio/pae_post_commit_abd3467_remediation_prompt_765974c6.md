# برومت التدقيق الجنائي والإصلاح الجراحي لما بعد الـ Commit `abd3467`

## المشروع: `pin-arbitrage-engine` (PAE)

## الهدف: إغلاق الثغرات السبع الحرجة المتبقية بعد مراجعة الـ Commit `abd3467a933352c59c5d0b1a0eac906c6a629747`

> **تعليمات الاستخدام:** انسخ النص الكامل داخل قسم **\[بداية البرومت الفعلي للوكلاء\]** أدناه وألصقه لوكيل البرمجة لديك.重要 جداً: إذا ظهر لك ملخص `teamwork_prompt_...md` مختصر، **ألصق هذا النص الكامل داخله قبل الضغط على Submit** حتى لا تضيع تفاصيل الأسطر والأكواد من الوكلاء الفرعيين!

# \[بداية البرومت الفعلي للوكلاء\]

أنت الآن تعمل كـ **مجلس تحقيق وإصلاح جنائي خماسي الوكلاء (5-Agent Post-Commit Forensic Remediation Council)** لمشروع `pin-arbitrage-engine`.

لقد قمنا بإجراء تدقيق جنائي مستقل سطراً بسطر على الـ Commit الأخير (`abd3467a933352c59c5d0b1a0eac906c6a629747`). ورغم أن الـ Commit نجح في وضع البنية التأسيسية، إلا أن التدقيق كشف **7 ثغرات وألغام قاتلة (7 Critical Post-Commit Landmines)** في الكود الفعلي المرفوع تسببت فيها فجوات التنفيذ الجزئي.

المطلوب من المجلس:

1. عقد **مناظرة تحقيق شاملة (Forensic Cross-Examination Debate)** بين الوكلاء الخمسة لمراجعة الثغرات السبع الموثقة أدناه سطراً بسطر في الكود الحالي.

2. تنفيذ جميع الإصلاحات الجراحية للثغرات السبع بالكامل دون ترك أي ملف منسياً.

3. تحديث اختبارات التحدي (`scripts/verify_regression_locks.mjs` و`scripts/test_wave3_adversarial_oracle.mjs` و`scripts/test_challenger_wave4_adversarial.mjs`) بحيث تفحص المسارات الحقيقية التي غفلت عنها الاختبارات السابقة.

4. إصدار تقرير هندسي مفصل يثبت إغلاق الثغرات السبع سطراً بسطر.

## الثغرات والألغام السبع المكتشفة في الـ Commit `abd3467` (يجب إغلاقها بالكامل)

### 🚨 الثغرة الأولى (CRITICAL UI & DATA BUG): دالة `readKeywordsFromD1` المكررة في `src/worker.mjs:478` تلغي فلترة المجلدات وتُرجع كل كلمات النظام!

* **الدليل الجنائي من الكود الحالي:**

  * قام الفريق في `abd3467` بكتابة فلتر `folderId` عبر `json_each(folders)` داخل دالة `readKeywordsFromD1` في الملف src/modules/keywords/d1-metadata.mjs:234.

  * **ولكن:** الملف src/worker.mjs:478 يحتوي على نسخة قديمة مكررة من `export async function readKeywordsFromD1(env, { search = '', limit = 1000, offset = 0 } = {})` **تتجاهل المعامل `folderId` تماماً**!

  * وفي src/worker.mjs:1538، يقوم الـ Worker بتمرير هذه الدالة القديمة المعيبة إلى `handleKeywordsRoutes`!

  * وفي src/routes/keywords.mjs:289، كتب المنفذ:

    ```
    const effectiveReadKeywordsFromD1 = readKeywordsFromD1 || d1ReadKeywords;
    
    ```

    وبما أن `readKeywordsFromD1` القادمة من `worker.mjs` موجودة (`truthy`)، فإن `d1ReadKeywords` المحدثة في `d1-metadata.mjs` **لا يتم استدعاؤها أبداً في بيئة الإنتاج**!

  * **النتيجة الكارثية الحالية:** عندما يفتح المستخدم أي مجلد في الواجهة (`GET /api/keywords?folder_id=5`)، يستدعي النظام دالة `worker.mjs` التي تتجاهل `folder_id` وتُرجع **جميع الـ 1000 كلمة مفتاحية في النظام** وكأنها داخل المجلد رقم 5!

* **الإصلاح الجراحي الإلزامي:**

  1. في `src/worker.mjs`: احذف التعريفات المكررة للدوال `ensureEdgeKeywordsCatalogTable` و`readKeywordsFromD1` و`evictKeywordsCatalogFromD1` (السطور `435–565` و`674–693`)، واستوردها وأعد تصديرها مباشرة من `./modules/keywords/d1-metadata.mjs` ليكون `d1-metadata.mjs` هو المصدر الوحيد للحقيقة (`SSOT`)!

  2. في `src/routes/keywords.mjs:289`: استخدم `d1ReadKeywords` مباشرة أو تأكد من أن الدالة الممررة من `worker.mjs` هي نفسها دالة `d1-metadata.mjs` التي تدعم `folderId`.

  3. في `scripts/test_wave3_adversarial_oracle.mjs`: أضف اختباراً يمر عبر `worker.fetch(new Request('https://worker.test/api/keywords?folder_id=10'), env)` للتأكد من أن مسار HTTP الفعلي للـ Worker يفلتر بـ `folder_id` عبر D1 ولا يُرجع كل الكلمات!

### 🚨 الثغرة الثانية (CRITICAL 5x DUPLICATE TRANSACTIONS): دالة `coalesceShardGroupsByPhysical` لم تُستدعَ إلا في مكان واحد فقط وتُركت 7 ملفات تفتح 5 معاملات مكررة لنفس الشارد الفيزيائي!

* **الدليل الجنائي من الكود الحالي:**
  قام الفريق في `abd3467` باستدعاء `coalesceShardGroupsByPhysical` فقط داخل `writeBatchToDeterministicShards` (`src/modules/sharding/fleet-router.mjs:3408`) فقط لإرضاء الفحص `Lock 3G`، بينما **نسي استدعاءها في جميع الزواحف والخدمات الفعلية التي تعمل يومياً**!
  في الأماكن السبعة التالية، لا يزال الكود يستدعي `batchGroupByShard(..., 99)` ويدور على 99 مجموعة افتراضية، مما يجعل كل آلة زحف تفتح **5 معاملات `BEGIN...COMMIT` متزامنة ضد نفس الشارد الفيزيائي**:

  1. scripts/keyword-velocity-crawler.mjs:948 داخل `flushToStorageShards`:
     `const shardGroups = batchGroupByShard(enrichedPins, 99);` — لم يتم تمريرها على `coalesceShardGroupsByPhysical`!

  2. scripts/keyword-velocity-crawler.mjs:33, 1192, 1228 داخل `registerTargetShards` و`jitPrewarmFired` و`crawlerKeepAlive`:
     تخزن أرقام الشاردات الافتراضية (`1, 21, 41, 61, 81`) وترسل 5 استعلامات `SELECT 1;` متزامنة لنفس القاعدة الفيزيائية! يجب تحويلها عبر `getPhysicalShardId(sid)`.

  3. src/modules/keywords/service.mjs:144 داخل `offloadKeywordCrawlToShards`:
     `const shardGroups = batchGroupByShard(combined, 99);` — بدون `coalesceShardGroupsByPhysical`!

  4. src/modules/keywords/service.mjs:344 داخل `hydrateDisplacedIndexFromShards`:
     `const shardGroups = batchGroupByShard(stillMissing, 99);` — بدون `coalesceShardGroupsByPhysical`! (وهذا خطير جداً في Cloudflare Workers لأنه يستهلك سقف الـ 6 اتصالات متزامنة!).

  5. scripts/creator-velocity-crawler.mjs:159, 222 داخل `commitSnapshotsToStorageShards` و`syncPinsToMasterShards`:
     كلاهما يستخدم `batchGroupByShard(..., 99)` بدون `coalesceShardGroupsByPhysical`!

  6. scripts/backfill_rolling_window_gains.mjs:184:
     يقسم الدبابيس إلى 99 مجموعة افتراضية (`getPinShardId(pin_id, 99)`) بدلاً من تجميعها حسب الشارد الفيزيائي `getPhysicalShardId(getPinShardId(pin_id, 99))`!

  7. scripts/crawler-engine.mjs:213, 271 وscripts/optimize_hub_storage.mjs:118, 418:
     تستخدم `batchGroupByShard(..., 99)` بدون `coalesceShardGroupsByPhysical`!

* **الإصلاح الجراحي الإلزامي:**

  * استيراد واستدعاء `coalesceShardGroupsByPhysical(batchGroupByShard(..., 99))` في جميع الملفات السبعة المذكورة أعلاه، وتحديث `Lock 3G` في `scripts/verify_regression_locks.mjs` ليتحقق من استدعاء `coalesceShardGroupsByPhysical` في `fleet-router.mjs` و`keyword-velocity-crawler.mjs` و`creator-velocity-crawler.mjs` و`src/modules/keywords/service.mjs`!

### 🚨 الثغرة الثالثة (CRITICAL TELEMETRY FREEZE): توقف تحديث مكاسب النوافذ الزمنية (`gains_5d, gains_7d, gains_10d, gains_15d`) نهائياً بسبب شرط خاطئ في `backfill_rolling_window_gains.mjs`!

* **الدليل الجنائي من الكود الحالي:**

  1. لم يقم الفريق في `abd3467` بحساب `gains_5d, gains_7d, gains_10d, gains_15d` داخل `scripts/keyword-velocity-crawler.mjs`، بل ترك `flushBatchToHub` تحدّث `keyword_serp_current` وتضع **`updated_at = NOW()`** لكل دبوس تم زحفه.

  2. ثم يعمل `scripts/backfill_rolling_window_gains.mjs` (السطور `146–175`) بالشرط التالي:

     ```
     WHERE pin_id IS NOT NULL AND pin_id <> ''
       AND (gains_7d IS NULL OR updated_at < NOW() - INTERVAL '24 hours')
     LIMIT 500;
     
     ```

  3. **لماذا يفشل هذا الشرط دائماً (0 صفوف)؟**

     * أولاً: في الهجرة `039_keyword_serp_rolling_gains.sql`، تم تعريف العمود بـ `ADD COLUMN IF NOT EXISTS gains_7d INT DEFAULT 0;` — أي أن القيمة الافتراضية هي **`0` وليست `NULL`**!

     * ثانياً: الزاحف `keyword-velocity-crawler.mjs` انتهى للتو (قبل دقيقتين) من تحديث الجدول ووضع `updated_at = NOW()`! وبالتالي فإن `updated_at < NOW() - INTERVAL '24 hours'` يكون **`FALSE` دائماً** لكل الدبابيس النشطة!

     * ثالثاً: الاستعلام وضع `LIMIT 500` وتجاهل جدول `keyword_displaced_index` بالكامل!

* **الإصلاح الجراحي الإلزامي:**

  1. **في `scripts/keyword-velocity-crawler.mjs` داخل `flushToStorageShards` (أو عقبها مباشرة لكل شارد فيزيائي):**
     بما أن كل آلة زحف تتصل بالفعل بشاردها الفيزيائي الوحيد (`shardSql`) وتحدّث جدول `pins_daily_metrics`، قم داخل نفس الاتصال بسحب لقطات آخر 16 يوماً للدبابيس التي تم زحفها في هذه الموجة (`SELECT pin_id, snapshot_date, save_count, repin_count, daily_save_velocity FROM pins_daily_metrics WHERE pin_id = ANY(${pinIds}::text[]) AND snapshot_date >= CURRENT_DATE - INTERVAL '16 days'`)، واحسب لها محلياً `delta_repins_24h, gains_5d, gains_7d, gains_10d, gains_15d` عبر `calculateRollingGainsFromSnapshots`، واكتبها في `keyword_serp_current` و`keyword_displaced_index`!

  2. **في `scripts/backfill_rolling_window_gains.mjs`:**

     * إصلاح شرط الاستعلام ليفحص الدبابيس التي لم تُحسَب مكاسبها (`COALESCE(ksc.gains_7d, 0) = 0 AND ksc.save_count > 0`) أو التي تغيرت حفظاتها مقارنةً بـ `baseline_day_saves`، مع تجميع الدبابيس حسب الشارد الفيزيائي `getPhysicalShardId(getPinShardId(pin_id, 99))` (20 شارداً بدلاً من 99).

     * الحفاظ الصارم على سطور `COALESCE(NULLIF(u.gains_7d, 0), ksc.gains_7d)` و`COALESCE(NULLIF(u.gains_7d, 0), kdi.gains_7d)` لإرضاء `Lock 14C`.

### 🚨 الثغرة الرابعة (HIGH — 99-SHARD BROADCAST STORMS): بقاء حلقات الـ 99 شارد في `runShardJanitorGC` و`prewarmFleetShards` و`/api/fleet/warm`!

* **الدليل الجنائي من الكود الحالي:**

  1. في scripts/keyword-fleet-consolidator.mjs:445 داخل `runShardJanitorGC`:
     لا يزال السطر مكتوباً: `const shardIds = Array.from({ length: 99 }, (_, i) => i + 1);` — مما يرسل استعلام الحذف 5 مرات مكررة لكل شارد فيزيائي! يجب تغييره إلى `Array.from({ length: 20 }, (_, i) => i + 1)`.

  2. في src/modules/sharding/fleet-router.mjs:866 داخل `prewarmFleetShards`:
     `const uniqueIds = [...new Set(shardIds)].filter(id => id >= 1 && id <= 99);` — لا يوحد الأرقام عبر `getPhysicalShardId(id)`! يجب تحويلها إلى `const uniqueIds = [...new Set(shardIds.map(id => getPhysicalShardId(id)))].filter(id => id >= 1 && id <= 20);`.

  3. في src/routes/fleet.mjs:256-358 داخل `/api/fleet/warm` (Predictive Hover JIT Warming):
     المتغير `targetShardId` يُحسَب من `getPinShardId(pinIdParam, 99)` (أي من 1 إلى 99) ويُحفَظ في `recentWarmedShards` و`inFlightWarms` دون تحويله إلى الشارد الفيزيائي `getPhysicalShardId(targetShardId)`! مما يجعل تمرير الماوس على دبابيس من الغرف `1, 21, 41, 61` يوقظ نفس الشارد الفيزيائي `shard-01` أربع مرات متزامنة! يجب تحويل `targetShardId = getPhysicalShardId(targetShardId)` فور حسابه.

### 🚨 الثغرة الخامسة (HIGH — MIGRATION & CONSOLIDATION RUNNER TRAPS): أخطاء في `scripts/consolidate_99_to_20_shards.mjs` وترتيب التشغيل الحي!

* **الدليل الجنائي من الكود الحالي (`scripts/consolidate_99_to_20_shards.mjs`):**

  1. **تشغيل `VACUUM ANALYZE` 79 مرة داخل الحلقة (السطر 501):**
     السطر `await runOutOfTransactionVacuum(destSql);` موضوع **داخل** حلقة `for (let virtualId = 21; virtualId <= 99; virtualId++)`! هذا يعني أنه يشغل `VACUUM ANALYZE` على الجداول الثلاثة في الشارد الفيزيائي بعد كل غرفة افتراضية (أي 79 مرة بدلاً من 20 مرة)! يجب نقل `runOutOfTransactionVacuum` ليُنفَّذ **مرة واحدة فقط لكل شارد فيزيائي (`1..20`) بعد اكتمال نسخ جميع الغرف الافتراضية التابعة له**.

  2. **عدم تنظيف الفهارس والجداول الميتة وعدم تطبيق `fillfactor = 80` على الشاردات الفيزيائية `01..20`:**
     ملف الهجرة `047_consolidate_99_to_20_virtual_shards.sql` يُشغَّل على الـ Hub فقط في دليل المشغل، وبالتالي لم يتم تطبيق `fillfactor = 80` ولا حذف الفهارس غير المستخدمة (`DROP INDEX IF EXISTS idx_ump_metadata_gin, idx_ump_domain, idx_ump_creator, idx_ump_updated`) ولا حذف الجداول الموروثة الميتة (`competitor_pins, pa_pins, pa_pin_metrics, competitor_boards, competitor_profiles, competitor_history_snapshots, keyword_serp_current, keyword_displaced_index`) على الشاردات الفيزيائية الـ 20 (`pin-arbitrage-shard-01..20`)! يجب إضافة دالة `preparePhysicalShardSchema(destSql)` داخل `consolidate_99_to_20_shards.mjs` تنفذ هذا التنظيف وضبط `fillfactor = 80` على كل شارد فيزيائي `1..20` قبل بدء النسخ.

  3. **قاعدة `ON CONFLICT` في `migratePinSerpPositions` (السطر 344):**
     استخدم الكود `COALESCE(EXCLUDED.rank_position, pin_serp_positions.rank_position)` بدلاً من `LEAST`! يجب استخدام:

     ```
     ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE SET
       rank_position = CASE
         WHEN EXCLUDED.is_displaced = TRUE AND pin_serp_positions.is_displaced = TRUE THEN NULL
         ELSE LEAST(pin_serp_positions.rank_position, EXCLUDED.rank_position)
       END,
       is_displaced = (COALESCE(pin_serp_positions.is_displaced, FALSE) AND COALESCE(EXCLUDED.is_displaced, FALSE)),
       last_known_rank = LEAST(pin_serp_positions.last_known_rank, EXCLUDED.last_known_rank),
       catalog_rank = LEAST(pin_serp_positions.catalog_rank, EXCLUDED.catalog_rank),
       updated_at = NOW();
     
     ```

  4. **الترتيب الصحيح في دليل المشغل (`Operator Runbook`) وداخلياً في `consolidate_99_to_20_shards.mjs`:**
     لو شغّل المشغل الهجرة `047` **قبل** نسخ البيانات، فسيتم تحويل `status = 'retired'` للشاردات `21..99` وتوجيه القراءات الحية إلى `01..20` قبل نسخ البيانات!
     لذلك يجب أن يقوم `consolidate_99_to_20_shards.mjs` بنفسه بـ:

     * **(أ)** قراءة عناوين الشاردات `1..99` من `neon_projects_registry` على الـ Hub.

     * **(ب)** تهيئة المخطط (`preparePhysicalShardSchema`) ونسخ البيانات من `21..99` إلى `01..20` والتحقق من تطابق الأعداد (`Checksum Gate`).

     * **(ج)** تشغيل `VACUUM ANALYZE` مرة واحدة على كل شارد فيزيائي `01..20`.

     * **(د)** بعد نجاح التحقق 100%، تطبيق تحديث `neon_projects_registry` (تعيين `assigned_shards` على `01..20` وتحويل `21..99` إلى `retired`) وتنفيذ `TRUNCATE` اختياري على `21..99`!

### 🚨 الثغرة السادسة (MEDIUM-HIGH): غياب إبطال كاش D1 (`evictKeywordsCatalogFromD1`) في المسار البديل `/api/folders` داخل `src/routes/keywords.mjs`!

* **الدليل الجنائي من الكود الحالي:**
  في src/routes/keywords.mjs، أضاف الفريق استدعاء `evictKeywordsCatalogFromD1(env)` في المسارات `#30` إلى `#34` (`/api/keywords/folders` في السطور `1765–1860`)، لكنه **نسي إضافتها في المسار رقم `#26` (`/api/folders` و`/api/campaign-folders` في السطور `1540–1625`)**!
  واجهة المستخدم (`campaign-folders-ui.mjs`) تستدعي `POST /api/folders` و`PUT /api/folders/:id` و`DELETE /api/folders/:id`!

* **الإصلاح الجراحي الإلزامي:**
  إضافة `await evictKeywordsCatalogFromD1(env);` في معالجات `POST` و`PUT/PATCH` و`DELETE` داخل كتلة `if (isFoldersRoute)` (السطور `1540–1625` في `src/routes/keywords.mjs`).

### 🚨 الثغرة السابعة (MEDIUM-HIGH — DISPLACED VAULT EGRESS): غياب فلتر العينات الطبقية (`Tiered Sampling`) على `keyword_displaced_index` وحارس `creation_method` في `keyword-velocity-crawler.mjs`!

* **الدليل الجنائي من الكود الحالي:**

  1. في `scripts/keyword-velocity-crawler.mjs` (السطور `1590, 1865, 2150`)، استعلام `keyword_displaced_index kdi` يسحب **كل الـ 62,000 صف** في الأرشيف كلما مضت 4 ساعات (`kdi.updated_at < NOW() - INTERVAL '4 hours'`) دون تطبيق فلتر العينات الطبقية!

  2. في استعلام `keyword_serp_current ksc` (السطور `1515, 1571, 1810, 1843, 2063, 2124`)، سقط شرط الإصلاح الذاتي `OR COALESCE(NULLIF(ksc.creation_method, ''), 'pinterest_platform') = 'pinterest_platform'` الموجود في `evaluateHydrationGuard` (السطر 212).

* **الإصلاح الجراحي الإلزامي:**

  * إضافة `OR COALESCE(NULLIF(ksc.creation_method, ''), 'pinterest_platform') = 'pinterest_platform'` إلى شرط التهدئة في `keyword_serp_current`.

  * إضافة شرط العينات الطبقية إلى `keyword_displaced_index kdi` في `Mode A` و`Mode C`:

    ```
    AND (
      COALESCE(kdi.last_known_rank, 999) <= 50
      OR COALESCE(kdi.daily_save_velocity, 0) >= 5
      OR kdi.updated_at >= NOW() - INTERVAL '3 days'
      OR MOD(EXTRACT(DOY FROM CURRENT_DATE)::int + kdi.keyword_id, 5) = 0
    )
    
    ```

## خطة العمل الإلزامية للمجلس (Mandatory Execution Plan)

1. **المرحلة 1 (جلسة التحقيق والمناظرة):** يناقش الوكلاء الخمسة الثغرات السبع أعلاه ويتحققون من أرقام الأسطر في المستودع ويوقعون عقد الإصلاح.

2. **المرحلة 2 (التنفيذ الجراحي الشامل):** تطبيق الإصلاحات السبع في جميع الملفات المتأثرة (`src/worker.mjs`, `src/routes/keywords.mjs`, `src/routes/fleet.mjs`, `src/modules/sharding/fleet-router.mjs`, `src/modules/keywords/service.mjs`, `scripts/keyword-velocity-crawler.mjs`, `scripts/creator-velocity-crawler.mjs`, `scripts/crawler-engine.mjs`, `scripts/optimize_hub_storage.mjs`, `scripts/keyword-fleet-consolidator.mjs`, `scripts/backfill_rolling_window_gains.mjs`, `scripts/consolidate_99_to_20_shards.mjs`).

3. **المرحلة 3 (ترقية الأقفال والاختبارات):**

   * تحديث `Lock 3G` في `scripts/verify_regression_locks.mjs` ليتحقق من استدعاء `coalesceShardGroupsByPhysical` في جميع ملفات الزواحف والخدمات وليس في `fleet-router.mjs` فقط!

   * إضافة اختبار HTTP كامل لـ `GET /api/keywords?folder_id=10` عبر `worker.fetch` داخل `scripts/test_wave3_adversarial_oracle.mjs`.

   * تشغيل `node scripts/verify_regression_locks.mjs` و`node scripts/verify_sql_schema_parity.mjs` و`npm test` و`npm run check`.

4. **المرحلة 4 (التقرير النهائي):** تقديم تقرير مفصل يوضح كيف تم إغلاق كل ثغرة من الثغرات السبع مع دليل التشغيل المحدث.

# \[نهاية البرومت الفعلي للوكلاء\]