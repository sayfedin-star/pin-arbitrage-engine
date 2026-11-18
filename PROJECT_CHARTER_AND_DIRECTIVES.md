# 🏛️ دستور المنظومة المعماري والميثاق الهندسي الدائم (Project Charter & Core Directives)
## مشروع محرك استخبارات وأربتراج بينتريست | Pin Arbitrage Engine (PAE)

> **الحالة:** وثيقة معمارية ملزمة (Unified SSOT Architectural Contract — Post-Wave 5 Final Architecture).  
> **البنية المعتمدة:** Fastify v5 (Node.js 22) + Native PostgreSQL 16 (`pae-postgres` على InstaBox VM) + نواة موحدة من 4 جداول أساسية (`4-Table SSOT Core`) + عميل متصفح موحد (`/pae-shell.js`).  
> **الهدف:** توثيق رؤية المشروع والثوابت التقنية الفعلية بعد اكتمال الموجات الخمس (Waves 1–5) لمنع فقدان السياق أو إعادة إدخال طبقات متقادمة.

---

## 🎯 1. الرؤية الاستثمارية والأعمدة التشغيلية (Core Vision & Pillars)

محرك **Pin Arbitrage Engine** هو منصة استخبارات وتحليل بيانات مصممة لأصحاب مواقع الأربتراج وناشري المحتوى عبر 4 أعمدة رئيسية:

1. **عمود المنافسين وديناميكية المنصة (`Creator Hub` — `/api/creators/*`):**
   * مراقبة الحسابات الصاعدة والمنهارة عبر الفوارق الزمنية الفعلية من جدول `competitor_snapshots` (`reach_delta_7d`، `views_delta_7d`، `delta_reach_24h`).
   * التمييز الدقيق بين **Total audience** (`monthly_reach`) و **Impressions** (`profile_views`) والحفاظ على سقف بينترست العام (`10,000,001` / `10M+`).
   * فصل تام بين حذف لقطات الحساب (`DELETE /api/creators/snapshot`) وحذف لقطات الدبوس اليومية (`DELETE /api/pins/:pin_id/snapshots/:target` / `daily-metrics/:date`)، مع دعم قواعد التأهيل الخاصة بكل صانع محتوى (`GET`/`POST /api/creators/rules?id=...`) إلى جانب القواعد العامة في `app_settings`.

2. **عمود الكلمات المفتاحية والسيرب (`Keywords & SERP Velocity`):**
   * تتبع ترتيب الدبابيس النشطة والمزاحة ضمن `keyword_serp_positions` (`is_displaced = FALSE | TRUE`) وحساب سرعة الحفظ الحقيقية `daily_save_velocity` عبر `pins_daily_metrics`.
   * رصد الدبابيس المزاحة (Displaced Vault) وفحص فرص الاستحواذ (`vacuum_opportunity_score`) ونبض الـ 24 ساعة الشامل (`/api/pulse/24h` بحمولة مضبوطة `< 900 KB` مع الحفاظ على دقة مؤشرات KPI بنسبة 100%).

3. **عمود العناقيد والتقاطعات (`Campaign Folders & Cluster Graph`):**
   * تجميع الكلمات في مجلدات حملات (`keyword_folders`) وكشف احتكار النطاقات والحسابات والدبابيس المشتركة عبر `/folders/:id` وخريطة العنقود الموجهة (`candidate_graph_nodes` و `cluster-intelligence.mjs`).

4. **عمود النطاقات وشبكات الإعلانات (`Domains & Ad Arbitrage`):**
   * فحص النطاقات عبر الجدول الموحد `domain_intelligence_rollup`، كشف `ads.txt`، شبكات الإعلانات، وعمر النطاق مع حماية SSRF وتثبيت عناوين IP (`src/lib/net-guard.mjs`).

---

## 🏗️ 2. البنية المعمارية الموحدة (Live SSOT Architecture)

* **خادم التطبيق (`src/server.mjs` + `src/utils.mjs` فقط في جذر `src/`):** خادم **Fastify v5** على Node.js 22 يقدم واجهات SSR + Alpine.js (`src/ui/{dashboard,keywords,domains,folders,discovery,pulse,pin-details}/index.mjs`) والملف الثابت الموحد `public/pae-shell.js` (مخدوم من الذاكرة مع `ETag` قوي `SHA-256`) ومسارات API عبر `src/plugins/api-routes.mjs` (مع تحويل توافقي تلقائي من `/api/competitors/*` إلى `/api/creators/*` دون أي خطأ `404`).
* **بوابة الحافة (`workers/wake-shield/`):** وكيل Cloudflare Zero-Trust يتحقق من الكوكيز الموقعة بـ `HMAC-SHA256` وحماية CSRF ويوقظ آلة InstaBox تلقائياً عند الطلب.
* **قاعدة البيانات الموحدة (`src/db/client.mjs` + PostgreSQL 16 — Baseline Migrations `001`–`002`):**
  1. **`universal_master_pins`**: السجل الموحد للدبوس (`clean_domain`، الحقول الخوارزمية، آخر العدادات، ومكاسب النوافذ `gains_1d..30d`).
  2. **`pins_daily_metrics`**: لقطات السلاسل الزمنية اليومية `(pin_id, recorded_date)`.
  3. **`keyword_serp_positions`**: مواقع السيرب النشطة والمزاحة `(keyword_id, pin_id)`.
  4. **`competitor_board_pins`**: جدول الربط الخفيف `(competitor_id, board_id, pin_id)`.
* **طبقة المستودع (`src/modules/pins/repository.mjs`):** المصدر الوحيد (`PinRepository`) لعمليات الإدخال والتحديث الذرية (`insertNewPinsBatch`، `resavePinsMetricsBatch`، `ingestPinsBatch`، و `getPinDossier`).
* **منصة الزواحف الموحدة (`scripts/lib/fleet-runner.mjs`):** إدارة موحدة لدورة حياة أساطيل الـ 20 عاملاً (`ABS(hashtext(pin_id::text)::bigint) % 20 = $workerIndex`) وعقود إيجار النشاط الرسمية لـ InstaBox (`activity-leases`) وإغلاق اتصالات `sql.end()` بأمان داخل `finally`.

---

## 🚫 3. الخطوط الحمراء المعمارية (Untouchable Invariants)

1. **الزحف المجهول الصارم (`_auth=0`):** يُمنع إرسال كوكيز مستخدم مسجل أو قراءة `process.env.PINTEREST_COOKIE` ضمنياً عند جلب عدادات الدبابيس العامة؛ ويُحظر نسخ `LikeAction` أو `repin_count` إلى `save_count` (`has_explicit_saves === false` يترك `save_count = NULL` و `is_hydrated = FALSE`).
2. **حظر طفرة التهيئة الأولية وتآكل الفجوات (`Anti-Hydration Spike & Gap Decay`):** قمع السرعة اليومية إلى `0` عند أول قفزة تهيئة، وحساب سرعة متضائلة للفجوات الأكبر من 7 أيام دون تصفير قسري أو قفل أبدي عبر `GREATEST()`.
3. **ترتيب التحديث لمنع الجمود (`ORDER BY pin_id ASC`):** جميع عمليات الدفعات عبر `jsonb_to_recordset` تُصفّى عبر `Map` وتُفرز تصاعدياً لمنع `SQLSTATE 21000` و `40P01`.
4. **أمان الواجهة والشبكة (`UI & Network Hygiene`):**
   * جميع طلبات الواجهة تمر عبر `window.apiFetch` (`public/pae-shell.js`) بمهلة `15s` وإشارة `AbortSignal` متجددة لكل محاولة وفحص `res.ok` وتنسيق Rule 31 الزمني (`11.2y` / `145d`).
   * ترويسة علوية لاصقة واحدة موحدة في صفحة `/pin/:id` تحفظ مسارات العودة السياقية (`getBackUrl()`) وأزرار `Live Deep Sync` و `Purge Pin`.

---

## 📋 4. بروتوكول التحقق قبل الاعتماد (Pre-Commit Verification)

قبل اعتماد أي تعديل أو مزامنته:
1. `npm run check` (`node scripts/check-syntax-and-templates.mjs && npm run lint` — فحص الصياغة عبر Acorn، ترجمة السكربتات المضمنة و `public/pae-shell.js` عبر `vm.Script`، توازن DOM وجذور `<template x-if>` الفردية، و ESLint `--max-warnings=0`).
2. `DATABASE_URL="" npm test` (تشغيل كافة الحزم السلوكية `tests/01..09-*.test.mjs` محلياً بنسبة 100% دون أي اتصال بقاعدة بيانات خارجية، مع حظر تام لاختبارات مطابقة النصوص المصدرية عبر `fs.readFileSync`).
