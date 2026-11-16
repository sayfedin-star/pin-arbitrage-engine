# 🏛️ دستور المنظومة المعماري والميثاق الهندسي الدائم (Project Charter & Core Directives)
## مشروع محرك استخبارات وأربتراج بينتريست | Pin Arbitrage Engine (PAE)

> **الحالة:** وثيقة معمارية ملزمة (Unified SSOT Architectural Contract — Post-Migration 060).  
> **البنية المعتمدة:** Fastify v5 (Node.js 22) + Native PostgreSQL 16 (`pae-postgres` على InstaBox VM) + جدول أساسي موحد من 4 جداول (`4-Table SSOT Core`).  
> **الهدف:** توثيق رؤية المشروع والثوابت التقنية الفعلية لمنع فقدان السياق أو إعادة إدخال طبقات متقادمة.

---

## 🎯 1. الرؤية الاستثمارية والأعمدة التشغيلية (Core Vision & Pillars)

محرك **Pin Arbitrage Engine** هو منصة استخبارات وتحليل بيانات مصممة لأصحاب مواقع الأربتراج وناشري المحتوى عبر 4 أعمدة رئيسية:

1. **عمود المنافسين وديناميكية المنصة (`Creator Hub`):**
   * مراقبة الحسابات الصاعدة والمنهارة عبر الفوارق الزمنية (`reach_delta_7d`، `views_delta_7d`، `delta_reach_24h`).
   * التمييز الدقيق بين **Total audience** (`monthly_reach`) و **Impressions** (`profile_views`) والتعامل مع سقف بينترست العام (`10,000,001` / `10M+`).
   * تتبع اللوحات وعلاقة الحسابات بالدبابيس عبر `competitor_profiles`، `competitor_boards`، و `competitor_board_pins`.

2. **عمود الكلمات المفتاحية والسيرب (`Keywords & SERP Velocity`):**
   * تتبع ترتيب الدبابيس النشطة والمزاحة ضمن `keyword_serp_positions` (`is_displaced = FALSE | TRUE`) وحساب سرعة الحفظ الحقيقية `daily_save_velocity` عبر `pins_daily_metrics`.
   * رصد الدبابيس المزاحة (Displaced Vault) وفحص فرص الاستحواذ (`vacuum_opportunity_score`).

3. **عمود العناقيد والتقاطعات (`Campaign Folders & Cluster Graph`):**
   * تجميع الكلمات في مجلدات حملات (`keyword_folders`) وكشف احتكار النطاقات والحسابات والدبابيس المشتركة عبر `keyword_serp_positions` + `universal_master_pins`.
   * دعم خريطة العنقود الموجهة (`candidate_graph_nodes` و `cluster-intelligence.mjs`).

4. **عمود النطاقات وشبكات الإعلانات (`Domains & Ad Arbitrage`):**
   * فحص النطاقات عبر `domain_intelligence_rollup`، كشف `ads.txt`، شبكات الإعلانات، وعمر النطاق.

---

## 🏗️ 2. البنية المعمارية الموحدة (Live SSOT Architecture)

* **خادم التطبيق (`src/server.mjs`):** خادم **Fastify v5** على Node.js 22 يقدم واجهات SSR + Alpine.js (`src/*-ui.mjs`، `src/ui/*`) ومسارات API عبر `src/plugins/api-routes.mjs` مع طابور مهام خلفية غير حاجز (`serverBackgroundTaskQueue`).
* **بوابة الحافة (`workers/wake-shield/`):** وكيل Cloudflare خفيف مخصص فقط لإيقاظ بيئة InstaBox VM عند الخمول (Scale-to-Zero) وتوجيه الطلبات عبر Cloudflare Zero Trust Tunnel.
* **قاعدة البيانات الموحدة (`src/db/client.mjs` + PostgreSQL 16):**
  * اتصال مباشر عبر `postgres.js` (`getSqlClient` / `createSqlClient`) مع إعادة محاولة لخطأ `53300` ومهلة استعلام مضبوطة (`statement_timeout`).
  * **النواة الموحدة ذات الجداول الأربعة (Clean-Slate 4-Table SSOT — Migrations `060`–`064`):**
    1. **`universal_master_pins`**: السجل الموحد للدبوس (البيانات الإبداعية، الحقول الخوارزمية الـ 48، `clean_domain` المطبيع عبر تريجر `pae_sync_clean_domain()`، آخر العدادات، والسرعات التراكمية والنافذية `gains_1d..30d`).
    2. **`pins_daily_metrics`**: لقطات السلاسل الزمنية اليومية `(pin_id, recorded_date)` لـ `save_count`، `repin_count`، `comment_count`، `share_count`، `reaction_count`، `daily_save_velocity`، و `daily_repin_velocity`.
    3. **`keyword_serp_positions`**: مواقع السيرب النشطة والمزاحة `(keyword_id, pin_id)` مع `rank_position`، `is_displaced`، `last_known_rank`، و `vacuum_opportunity_score`.
    4. **`competitor_board_pins`**: جدول الربط الخفيف `(competitor_id, board_id, pin_id)` الذي يربط الحسابات واللوحات بـ `universal_master_pins`.
* **طبقة المستودع (`src/modules/pins/repository.mjs`):** المصدر الوحيد (`PinRepository`) لعمليات الإدخال والتحديث الذرية (`insertNewPinsBatch`، `resavePinsMetricsBatch`، `ingestPinsBatch`، و `getPinDossier`).
* **توزيع الزواحف على 20 عاملاً (`20-Worker Partitioning`):**
  ```sql
  ABS(hashtext(pin_id::text)::bigint) % 20 = $workerIndex
  ```
  مع فهارس تعبيرية مخصصة على الجداول الأساسية (`idx_ump_hashtext_mod20`، `idx_ksp_hashtext_mod20`، `idx_cbp_hashtext_mod20`).

---

## 🚫 3. الخطوط الحمراء المعمارية (Untouchable Invariants)

1. **الزحف المجهول الصارم (`_auth=0`):** يُمنع منعاً باتاً إرسال كوكيز مستخدم مسجل عند جلب عدادات الدبابيس العامة من بينترست؛ الكوكيز المسجلة تصفّر العدادات العامة. تُستخلص البيانات من `__PWS_DATA__` مع ارتداد `PinResource/get` و `Pidgets` وترويسات متصفح حقيقية (`Chrome/131`).
2. **استقلالية العدادات (`save_count` مقابل `repin_count`):** يُحظر تماماً استبدال `save_count` بقيمة `repin_count` عند غياب الحفظ الصريح (`has_explicit_saves === false` يجب أن يترك `save_count = NULL` و `is_hydrated = FALSE`).
3. **حظر طفرة التهيئة الأولية (`Anti-Hydration Spike`):** عند الانتقال من حالة غير مهيأة (`prevSaves <= 0` أو `NULL`) إلى رقم حفظ تراكمي كبير، يجب قمع السرعة اليومية إلى `0` حتى يتوفر فارق يومي حقيقي في اليوم التالي.
4. **ترتيب التحديث لمنع الجمود (`ORDER BY pin_id ASC` & `DISTINCT ON`):** جميع عمليات الدفعات عبر `jsonb_to_recordset` يجب أن تُفرز تصاعدياً وتُصفّى من التكرار عبر `Map` لمنع `SQLSTATE 21000` و `40P01`.
5. **أمان التوقيتات والواجهة والأمان (`Security & SQL Hygiene`):**
   * استخدام `safeIsoDate()` ومنع تمرير `""` إلى `::timestamptz` (`SQLSTATE 22007`).
   * حظر ابتلاع أخطاء SQL (`.catch(() => {})` ممنوعة على استعلامات قاعدة البيانات).
   * عدم كشف أي جزء من `pinterest_cookie` في استجابات `/api/settings*` وتمرير `Cache-Control: no-store`.
   * تطويق طلبات `fetch()` في الواجهة بـ `AbortSignal.timeout(15000)` وفحص `res.ok` والالتزام بتنسيق Rule 31 الزمني (`11.2y` / `145d`).

---

## 📋 4. بروتوكول التحقق قبل الاعتماد (Pre-Commit Verification)

قبل اعتماد أي تعديل أو دفعه:
1. `npm run check` (توافق الصياغة، فحص السكربتات المضمنة، المسارات، توافق المخطط SQL، ESLint `--max-warnings=0`، تداخل DOM).
2. `node scripts/audit_ui.mjs` (تثبيت الإصدارات، `safeUrl`، حماية CSV، الترويسات الأمنية، وصلاحيات Workflows).
3. `npm test` و `node --test tests/*.mjs` (جميع الاختبارات 100% محلية دون الحاجة لاتصال خارجي).
