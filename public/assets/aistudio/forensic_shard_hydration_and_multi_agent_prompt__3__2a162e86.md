# 🔬 التقرير الجنائي لما بعد الكوميت (`586df41`) والدستور التنفيذي الصارم (Round 12 — Zero-Improvisation Remediation)

## القسم الأول: التشريح الجنائي الدقيق للكوميت (`586df41a9fd39141e389c060649331422daafc5b`) — لماذا بقيت المشاكل بعد التنفيذ؟

بعد استخراج الملفات التسعة المعدّلة في الكوميت [586df41](https://www.google.com/search?q=https://github.com/sayfedin-star/pin-arbitrage-engine/commit/586df41a9fd39141e389c060649331422daafc5b) ومطابقتها سطراً بسطر وتشغيل محاكاة حية عليها، تبيّن أن الوكلاء التزموا حرفياً بتعديلات الملفات الخمسة التي كانت مكتوبة بالكامل في مسودة المقابلة (`fleet-router.mjs`، `d1-metadata.mjs`، `routes/keywords.mjs`، `campaign-folders-ui.mjs`، `verify_regression_locks.mjs`)، لكن لأن مسودة `teamwork_interviewer` كانت قد لخّصت التعديلات `Edit 3C–3F` في ملف `src/modules/keywords/folders-service.mjs`، قام الوكيل بارتجال كتابة منطق الاسترجاع في `folders-service.mjs` وترك **10 ثغرات هندسية قاتلة** أدت إلى استمرار المشاكل في الإنتاج:

| # | الثغرة الجنائية في الكوميت `586df41` | الموقع الدقيق (الملف والسطر) | الأثر المباشر في واجهة المجلدات (`Room 1`) |
| :--- | :--- | :--- | :--- |
| **1** | **تجويع بنات الـ Vault بسبب غياب الترتيب قبل `.slice(0, 350)` (`Vault Starvation`)** | `folders-service.mjs:2534-2540` | في المصفوفة `combinedCatalogRows = [...pinRows, ...displacedRows]`، تأتي البنات النشطة أولاً وبنات الـ Vault المُزاحة في النهاية. ولأن مئات البنات النشطة تحمل عناوين `"... Inspiration"`، فإنها تملأ أول 350 مقعداً في `priorityShardPins` (رغم أنها تملك صوراً بالفعل!)، وتطرد بنات الـ **Vault Super-Pins** إلى `tailShardPins` فتظهر بصورة فارغة (`image_url: ''`) ومربع رمادي! |
| **2** | **عدم إعادة حساب عمر البن (`p.pin_age_days`) بعد جلب `created_at_pinterest`** | `folders-service.mjs:2462, 2646` | كتب الوكيل `if (!p.created_at_pinterest && meta.created_at_pinterest) p.created_at_pinterest = meta.created_at_pinterest;` ونسِي تماماً حساب `p.pin_age_days = Math.max(0, Math.floor((nowMs - pinCreatedMs) / 86400000))`! وبما أن الواجهة (`campaign-folders-ui.mjs:425`) تعرض `formatUniversalAge(sp.pin_age_days)`، بقيت 100% من بنات الـ Vault تعرض `⏳ —`! |
| **3** | **رفض روابط المقالات ذات الطول 10–25 حرفاً في `derivePinTitle` وتجاهل `alt_text` / `description` / `seo_title`** | `folders-service.mjs:1701, 1726, 2652` | (أ) الشرط `!/^[a-zA-Z0-9_-]{10,25}$/.test(s)` في السطر 1726 يرفض كل الـ slugs الطبيعية التي يتراوح طولها بين 10 و25 حرفاً مثل `high-protein-dinner` (19 حرفاً في `eatingwell.com`) و`protein-balls-recipe` (20 حرفاً في `theproteinchef.co`) و`chicken-fajita-bowls` (20 حرفاً في `skinnytaste.com`)!<br>(ب) الدالة `derivePinTitle` لم تكن تستدعي `isSyntheticPinTitle(rawTitle)` في `isGeneric`، وعندما مرر لها الوكيل `p.title || ''` في السطر 2652 كانت تعيد العنوان المزيف فوراً!<br>(ج) البنات المرفوعة بدون رابط (`Uploaded by user` مثل `524950900340768832` و`703756189707271` والبن النشط `#13`) تعتمد على `alt_text` و`description` و`seo_title`، وهي حقول لم تكن `derivePinTitle` تفحصها أصلاً! |
| **4** | **تسميم `universal_master_pins` و`edge_pins_metadata` بالعناوين المزيفة أثناء الزحف (`Stage 0 Crawl Poisoning`)** | `service.mjs:191, 1485, 1561, 1625` & `d1-metadata.mjs:102` | في `crawlKeywordSERP` يتم توليد `finalTitle = "<Keyword> Inspiration"` في السطر 1485 **قبل** Pidgets (السطر 1561) و**قبل** `fetchPinFromPinterest` (السطر 1615). ولأن `p.title` يصبح غير فارغ، يفشل الشرط `(!p.title \|\| p.title === '')` في السطر 1561 بتحديث العنوان الحقيقي! ثم يقوم `ON CONFLICT DO UPDATE` في `service.mjs:191` و`d1-metadata.mjs:102` بالكتابة فوق العناوين الأصلية في الشاردات وD1 بالعنوان المزيف `"... Inspiration"`! |
| **5** | **إسقاط `aspect_ratio` و`creation_method` (`format`) و`seo_title` من استعلامات Tier 2 وTier 3** | `folders-service.mjs:2365, 2490, 2565, 2635` | غيّر الوكيل القيمة الافتراضية لـ `aspect_ratio` إلى `null` في السطر 2365، وحذف استخراج `(ump.metadata->>'aspect_ratio') AS aspect_ratio` و`creation_method` من استعلامات `universal_master_pins` في السطرين 2565 و2616، ولم يقم بتعيين `p.aspect_ratio` ولا `p.format` بعد الاسترجاع! |
| **6** | **فخ `LIMIT 100` القاتل في استعلام `UNION ALL` الخاص بـ Tier 2 على الـ Hub** | `folders-service.mjs:2510` | وضع الوكيل `LIMIT 100` في نهاية `UNION ALL` بين `keyword_serp_current` و`competitor_pins` و`pa_pins`. عندما يتجاوز عدد البنات المفقودة 100 بن، يستهلك الفرع الأول (`keyword_serp_current`) الـ 100 صف بالكامل، فلا يصل PostgreSQL أبداً إلى جدولي `competitor_pins` و`pa_pins`! |
| **7** | **استدعاء `resolveShardConnection(pShardId, env)` بدون `hubSql: sql` وحلقة `tailShardPins` المتسلسلة ومؤقت `setTimeout` المعلّق** | `folders-service.mjs:2557, 2584, 2607` | (أ) استدعاء `resolveShardConnection(pShardId, env)` برقم يجعل `hubSql = null` داخل `fleet-router.mjs:439` مما يكسر التوجيه في `unified_postgres` أو عند انتهاء صلاحية `globalShardMap`، كما غاب فحص `!isUnifiedPostgres(env)`.<br>(ب) مؤقت `setTimeout(resolve, 4500)` في السطر 2584 لا يتم إلغاؤه عبر `clearTimeout` في `.finally()`، مما يبقي الـ Isolate معلقاً لمدة 4.5 ثانية في كل طلب!<br>(ج) حلقة `tailShardPins` في السطر 2607 تعمل بالتسلسل (`for...of`) بدلاً من موجات متوازية من 4 شاردات! |
| **8** | **الكتابة التدميرية `enrichedMap.set(String(r.pin_id), r)` وعدم تحليل `visual_annotations` النصية** | `folders-service.mjs:2574, 2645` | في السطر 2574 يقوم `enrichedMap.set` باستبدال الكائن بالكامل بدلاً من دمج الحقول غير الفارغة عبر `mergeEnrichedRow` (فإذا كان العنوان على الشارد مزيفاً وفي `competitor_pins` أصلياً، يطمس الشارد العنوان الأصلي!). |
| **9** | **إهمال دمج `title` و`image_url` و`destination_url` و`board_name` في الفرع `else` من Pass 1** | `folders-service.mjs:2385` | عندما يظهر البن في أكثر من كلمة مفتاحية ويكون الصف الأول بدون عنوان أو صورة والصف الثاني يحتويها، يتجاهل الفرع `else` في السطر 2385 نسخ هذه الحقول! |
| **10** | **تعطيل كاش KV الدائم (60 ثانية للأبد) وبقاء الكاش المسموم القديم في `:crossover:v3`** | `folders-service.mjs:2041, 3268` | (أ) السطر 3268 يفحص `isSyntheticPinTitle(p.title)` في أول 100 بن؛ ولأن البنات التي لا تملك أي عنوان أو رابط أو وصف ستأخذ شرعاً عنوان `"... Inspiration"` في النهاية، يبقى `_has_unhydrated_priority_pins = true` للأبد!<br>(ب) عند قراءة `:crossover:v3` من KV في السطر 2041، لم يتم التحقق مما إذا كانت نسخة KV المخزنة سابقاً تحتوي على بنات بدون صور أو بدون `pin_age_days` لتجاوزها وتحديثها تلقائياً! |

---

## القسم الثاني: البرومبت التنفيذي الصارم لسرب الوكلاء (انسخه وأرسله مع `[skip-interview]` مباشرة)

```markdown
[skip-interview]
# CONSTITUTIONAL MULTI-AGENT REMEDIATION DIRECTIVE (ROUND 12): ZERO-IMPROVISATION VAULT HYDRATION, SLUG/ALT-TEXT DE-POISONING, PIN AGE RESTORATION & KV CACHE SELF-HEALING

## 0. EXECUTION MODE & STRICT ZERO-IMPROVISATION MANDATE
1. **100% Verbatim Surgical Application:** Every code block in Section 2 of this prompt has been generated directly against the exact lines of commit `586df41a9fd39141e389c060649331422daafc5b` (`HEAD`) and empirically verified against all 171 `.mjs` files.
2. **Zero Summarization / Zero Improvisation:** In Round 11 (`586df41`), improvising `folders-service.mjs` caused 10 regressions (Vault Super-Pin starvation behind active pins, `pin_age_days` remaining `null` / `⏳ —`, 10–25 char hyphenated recipe URL slugs rejected by `!/^[a-zA-Z0-9_-]{10,25}$/`, `LIMIT 100` truncating Tier 2 `UNION ALL`, missing `aspect_ratio` / `creation_method` projection on `universal_master_pins`, `resolveShardConnection(pShardId, env)` missing `hubSql: sql`, uncleared 4500ms `setTimeout`, and Stage 0 crawl poisoning of `universal_master_pins.title` / `edge_pins_metadata.title`). You MUST apply every `Find` / `Replace with` block in Section 2 **character-for-character without omitting, abbreviating, or rewriting a single line**.

---

## 1. POD STRUCTURE & PHASED EXECUTION PROTOCOL

- **`Agent-1 (Shard-Hydration-And-Crossover-Lead)`**: Applies Edits 1A–1F in `src/modules/keywords/folders-service.mjs`.
- **`Agent-2 (Crawl-And-D1-Anti-Poisoning-Lead)`**: Applies Edit 2A in `src/modules/keywords/d1-metadata.mjs` and Edits 3A–3G in `src/modules/keywords/service.mjs`.
- **`Agent-3 (Regression-Locks-And-Verification-Lead)`**: Applies Edit 4A in `scripts/verify_regression_locks.mjs` and executes all verification suites and live/empirical simulations.

---

## 2. VERBATIM SURGICAL CODE EDITS (AGAINST COMMIT `586df41`)

### File 1: `src/modules/keywords/folders-service.mjs`

#### Edit 1A — Upgrade `isSyntheticPinTitle` & `derivePinTitle` (Accepts 10–25 Char Hyphenated Slugs, Extracts `seo_title` / `alt_text` / `description`, and Never Returns Synthetic `rawTitle` Early)
**Find (Lines 1685–1765):**
```javascript
export function isSyntheticPinTitle(title) {
  if (!title || typeof title !== 'string') return true;
  const t = title.trim();
  if (!t || /^untitled(\s+pin)?$/i.test(t)) return true;
  if (/^pin(\s*#?\s*\w+)?$/i.test(t)) return true;
  if (/(^|\s+)Inspiration$/i.test(t) || t === 'Pinterest Visual Guide') return true;
  return false;
}

/**
 * Intelligent Pin Title Fallback Derivation
 * Eradicates "Untitled Pin" and empty titles by extracting clean human-readable titles from
 * destination link slugs, board names, visual annotations, or keyword context.
 */
export function derivePinTitle(title, destinationUrl = '', keyword = '', boardName = '', visualAnnotations = []) {
  const rawTitle = String(title || '').trim();
  const isGeneric = !rawTitle || 
    /^untitled(\s+pin)?$/i.test(rawTitle) || 
    /^pin\s*#?\s*\w+$/i.test(rawTitle) || 
    rawTitle.toLowerCase() === 'recipe' || 
    rawTitle.toLowerCase() === 'pin';

  if (!isGeneric) {
    return rawTitle;
  }

  // 1. Try URL slug
  if (destinationUrl) {
    try {
      const u = new URL(destinationUrl);
      const isOpaqueHost = u.hostname.includes('youtube.com') || 
                           u.hostname.includes('instagram.com') || 
                           u.hostname.includes('tiktok.com') ||
                           u.hostname.includes('pinterest.com');
      if (!isOpaqueHost) {
        const pathname = u.pathname.replace(/\/+$/, '');
        const segments = pathname.split('/').filter(Boolean);
        const meaningful = segments.reverse().find(s => 
          s.length > 3 && 
          !/^\d+$/.test(s) && 
          !/^(recipes?|blog|posts?|food|index|html|amp|p)$/i.test(s) &&
          !/^[a-zA-Z0-9_-]{10,25}$/.test(s)
        );
        if (meaningful) {
          const cleanSlug = decodeURIComponent(meaningful)
            .replace(/\.(html?|php|aspx?)$/i, '')
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (cleanSlug.length >= 3) {
            return cleanSlug
              .split(' ')
              .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
              .join(' ');
          }
        }
      }
    } catch (_) {}
  }

  // 2. Try Board Name
  if (boardName && boardName.trim().length >= 3 && !/^pins?$/i.test(boardName)) {
    return boardName.trim();
  }

  // 3. Try Visual Annotations
  if (Array.isArray(visualAnnotations) && visualAnnotations.length > 0) {
    const topVa = visualAnnotations.find(v => typeof v === 'string' && v.trim().length >= 4);
    if (topVa) {
      const formatted = topVa.trim().charAt(0).toUpperCase() + topVa.trim().slice(1);
      return keyword ? `${formatted} - ${keyword.charAt(0).toUpperCase() + keyword.slice(1)}` : formatted;
    }
  }

  // 4. Fallback to Keyword
  if (keyword) {
    return keyword.charAt(0).toUpperCase() + keyword.slice(1) + ' Inspiration';
  }

  return rawTitle || 'Pinterest Visual Guide';
}
```

**Replace with:**
```javascript
export function isSyntheticPinTitle(title) {
  if (!title || typeof title !== 'string') return true;
  const t = title.trim();
  if (!t || /^untitled(\s+pin)?$/i.test(t)) return true;
  if (/^pin(\s*#?\s*\w+)?$/i.test(t)) return true;
  if (/(^|\s+)(Inspiration|Idea)$/i.test(t) || t === 'Pinterest Visual Guide' || t === 'Pinterest Pin Idea') return true;
  return false;
}

/**
 * Intelligent Pin Title Fallback Derivation
 * Eradicates "Untitled Pin" and synthetic "<Keyword> Inspiration" titles by extracting clean human-readable
 * titles from SEO titles, destination link slugs (including 10-25 char hyphenated recipe slugs),
 * board names, visual annotations, alt text / descriptions, or keyword context.
 */
export function derivePinTitle(title, destinationUrl = '', keyword = '', boardName = '', visualAnnotations = [], description = '', altText = '', seoTitle = '') {
  const rawTitle = String(title || '').trim();
  const isGeneric = !rawTitle ||
    isSyntheticPinTitle(rawTitle) ||
    rawTitle.toLowerCase() === 'recipe' ||
    rawTitle.toLowerCase() === 'pin';

  if (!isGeneric) {
    return rawTitle;
  }

  // 0. Try explicit SEO title if authentic
  const cleanSeo = String(seoTitle || '').trim();
  if (cleanSeo && !isSyntheticPinTitle(cleanSeo) && cleanSeo.toLowerCase() !== 'recipe') {
    return cleanSeo.slice(0, 140);
  }

  // 1. Try URL slug (preserving hyphenated human-readable slugs of any length while rejecting opaque ID tokens)
  if (destinationUrl) {
    try {
      const u = new URL(destinationUrl);
      const isOpaqueHost = u.hostname.includes('youtube.com') ||
                           u.hostname.includes('instagram.com') ||
                           u.hostname.includes('tiktok.com') ||
                           u.hostname.includes('pinterest.com');
      if (!isOpaqueHost) {
        const pathname = u.pathname.replace(/\/+$/, '');
        const segments = pathname.split('/').filter(Boolean);
        const meaningful = segments.reverse().find(s =>
          s.length > 3 &&
          !/^\d+$/.test(s) &&
          !/^(recipes?|blog|posts?|food|index|html|amp|p)$/i.test(s) &&
          (/[a-zA-Z]{2,}[-_][a-zA-Z]{2,}/.test(s) || !/^[a-zA-Z0-9_-]{10,25}$/.test(s))
        );
        if (meaningful) {
          const cleanSlug = decodeURIComponent(meaningful)
            .replace(/\.(html?|php|aspx?)$/i, '')
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (cleanSlug.length >= 3) {
            return cleanSlug
              .split(' ')
              .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
              .join(' ');
          }
        }
      }
    } catch (_) {}
  }

  // 2. Try Board Name
  if (boardName && boardName.trim().length >= 3 && !/^pins?$/i.test(boardName)) {
    return boardName.trim();
  }

  // 3. Try Visual Annotations (supports string and { name } object formats)
  if (Array.isArray(visualAnnotations) && visualAnnotations.length > 0) {
    const topVaRaw = visualAnnotations
      .map(v => (typeof v === 'object' && v !== null) ? String(v.name || v.tag || v.label || '').trim() : String(v || '').trim())
      .find(v => v.length >= 4 && v !== '[object Object]');
    if (topVaRaw) {
      const formatted = topVaRaw.charAt(0).toUpperCase() + topVaRaw.slice(1);
      return keyword ? `${formatted} - ${keyword.charAt(0).toUpperCase() + keyword.slice(1)}` : formatted;
    }
  }

  // 4. Try Alt Text or Description first sentence (critical for linkless Uploaded-by-user Vacuum pins)
  for (const cand of [altText, description]) {
    const rawCand = String(cand || '').trim();
    if (!rawCand || isSyntheticPinTitle(rawCand)) continue;
    const firstSentence = rawCand.split(/[\n.!?|]/)[0].replace(/\s+/g, ' ').trim();
    if (firstSentence.length >= 5 && !isSyntheticPinTitle(firstSentence)) {
      return firstSentence.length > 95 ? firstSentence.slice(0, 92).trim() + '...' : firstSentence;
    }
  }

  // 5. Fallback to Keyword
  if (keyword) {
    return keyword.charAt(0).toUpperCase() + keyword.slice(1) + ' Inspiration';
  }

  return (!isSyntheticPinTitle(rawTitle) && rawTitle) ? rawTitle : 'Pinterest Visual Guide';
}
```

#### Edit 1B — Auto-Evict Poisoned `:crossover:v3` KV Cache Entries on Read
**Find (Lines 2040–2046):**
```javascript
        const kvKey = `fep:${epoch}:folder:${fid}:crossover:v3`;
        const kvData = await env.PIN_ENGINE_KV.get(kvKey, { type: 'json' });
        if (kvData) {
          crossoverCache.set(fid, { timestamp: now, data: kvData });
          return kvData;
        }
```

**Replace with:**
```javascript
        const kvKey = `fep:${epoch}:folder:${fid}:crossover:v3`;
        const kvData = await env.PIN_ENGINE_KV.get(kvKey, { type: 'json' });
        const isKvPoisoned = Boolean(
          kvData?._has_unhydrated_priority_pins ||
          (Array.isArray(kvData?.super_pins) && kvData.super_pins.slice(0, 25).some(p => !p.image_url || p.pin_age_days == null))
        );
        if (kvData && !isKvPoisoned) {
          crossoverCache.set(fid, { timestamp: now, ttlMs: CROSSOVER_TTL_MS, data: kvData });
          return kvData;
        }
```

#### Edit 1C — Project `seo_title`, `alt_text`, and `description` from `keyword_serp_current.metadata` in `pinRows`
**Find (Lines 2168–2170):**
```javascript
      (c.metadata->>'aspect_ratio') as aspect_ratio,
      (c.metadata->>'format') as format,
      tk.keyword as keyword_text,
```

**Replace with:**
```javascript
      (c.metadata->>'aspect_ratio') as aspect_ratio,
      (c.metadata->>'format') as format,
      (c.metadata->>'seo_title') as seo_title,
      (c.metadata->>'alt_text') as alt_text,
      (c.metadata->>'description') as description,
      tk.keyword as keyword_text,
```

#### Edit 1D — Restore `'2:3'` Default `aspect_ratio` & Multi-Keyword Metadata Merging in Pass 1
**Find (Lines 2342–2388):**
```javascript
    if (!pinMap.has(pid)) {
      const pinner = meta.pinner || {};
      const candidateRawTitle = (row.title || meta.title || '').trim();
      const hasAuthenticTitle = candidateRawTitle && !isSyntheticPinTitle(candidateRawTitle);
      const initialTitle = hasAuthenticTitle ? candidateRawTitle : '';

      pinMap.set(pid, {
        pin_id: pid,
        raw_title: candidateRawTitle,
        title: initialTitle,
        image_url: row.image_url || meta.image_url || '',
        domain: row.domain || meta.domain || '',
        destination_url: row.destination_url || meta.destination_url || '',
        domain_age_days: null,
        domain_age_years: null,
        save_count: rowSaves,
        is_vacuum_pin: (!row.domain || row.domain === 'Uploaded by user') && rowSaves >= 100,
        board_name: row.board_name || meta.board_name || '',
        visual_annotations: rowVisualAnnotations,
        dominant_color: row.dominant_color || meta.dominant_color || '#1e1e24',
        created_at_pinterest: row.created_at_pinterest || meta.created_at_pinterest || null,
        alt_text: row.alt_text || meta.alt_text || '',
        description: row.description || meta.description || '',
        aspect_ratio: row.aspect_ratio || meta.aspect_ratio || null,
        creation_method: row.creation_method || meta.creation_method || null,
        repin_count: rowRepins,
        comment_count: safeNum(row.comment_count),
        daily_save_velocity: vel,
        creator_username: row.creator_username || pinner.username || '',
        creator_name: pinner.full_name || row.creator_username || '',
        format: row.format || meta.format || (row.creation_method ? String(row.creation_method).toUpperCase() : 'ORGANIC PIN'),
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
      existingPin.save_count = Math.max(existingPin.save_count, rowSaves);
```

**Replace with:**
```javascript
    if (!pinMap.has(pid)) {
      const pinner = meta.pinner || {};
      const candidateRawTitle = String(row.title || meta.title || '').trim();
      const authenticTitle = !isSyntheticPinTitle(candidateRawTitle) ? candidateRawTitle : '';

      pinMap.set(pid, {
        pin_id: pid,
        raw_title: authenticTitle,
        title: authenticTitle,
        seo_title: row.seo_title || meta.seo_title || '',
        image_url: row.image_url || meta.image_url || '',
        domain: row.domain || meta.domain || '',
        destination_url: row.destination_url || meta.destination_url || '',
        domain_age_days: null,
        domain_age_years: null,
        save_count: rowSaves,
        is_vacuum_pin: (!row.domain || row.domain === 'Uploaded by user') && rowSaves >= 100,
        board_name: row.board_name || meta.board_name || '',
        visual_annotations: rowVisualAnnotations,
        dominant_color: row.dominant_color || meta.dominant_color || '#1e1e24',
        created_at_pinterest: row.created_at_pinterest || meta.created_at_pinterest || null,
        alt_text: row.alt_text || meta.alt_text || '',
        description: row.description || meta.description || '',
        aspect_ratio: row.aspect_ratio || meta.aspect_ratio || '2:3',
        creation_method: row.creation_method || meta.creation_method || null,
        repin_count: rowRepins,
        comment_count: safeNum(row.comment_count),
        daily_save_velocity: vel,
        creator_username: row.creator_username || pinner.username || '',
        creator_name: pinner.full_name || row.creator_username || '',
        format: row.format || meta.format || (row.creation_method ? String(row.creation_method).toUpperCase() : 'ORGANIC PIN'),
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
      if (!existingPin.seo_title && (row.seo_title || meta.seo_title)) {
        existingPin.seo_title = row.seo_title || meta.seo_title;
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
      if (!existingPin.alt_text && (row.alt_text || meta.alt_text)) {
        existingPin.alt_text = row.alt_text || meta.alt_text;
      }
      if (!existingPin.description && (row.description || meta.description)) {
        existingPin.description = row.description || meta.description;
      }
      existingPin.save_count = Math.max(existingPin.save_count, rowSaves);
```

#### Edit 1E — Replace the Flawed 4-Tier Hydration Block with Priority-Sorted Vault Hydration, Full `aspect_ratio` / `creation_method` / `seo_title` Projection, `hubSql: sql` Routing, Cleared Timers, and `pin_age_days` Recomputation
**Find (Lines 2461–2660):**
```javascript
  // 4-Tier Distributed Hydration Pipeline for Displaced Vault Pins [INVARIANT: 4-TIER-CREATIVE-HYDRATION]
  const missingMetaPins = allPins.filter(p => !p.title || !p.image_url || isSyntheticPinTitle(p.title));
  if (missingMetaPins.length > 0) {
    const missingPinIds = missingMetaPins.map(p => p.pin_id);
    const enrichedMap = new Map();

    // Tier 1: Cloudflare D1 Edge Cache Hydration
    if (env?.PIN_D1_DB) {
      try {
        const d1Map = await hydratePinsFromD1(env, missingPinIds);
        if (d1Map && typeof d1Map.get === 'function') {
          for (const pid of missingPinIds) {
            const d1Pin = d1Map.get(String(pid));
            if (d1Pin && (d1Pin.title || d1Pin.image_url)) {
              enrichedMap.set(String(pid), d1Pin);
            }
          }
        }
      } catch (_) {}
    }

    // Tier 2: Central Hub Fallback with 100% Alias-Qualified Schema Parity
    const missingAfterD1 = missingPinIds.filter(pid => {
      const e = enrichedMap.get(String(pid));
      return !e || !e.title || !e.image_url || isSyntheticPinTitle(e.title);
    });

    if (sql && missingAfterD1.length > 0) {
      try {
        const hubRows = await sql`
          SELECT ksc.pin_id, ksc.title, ksc.domain, ksc.destination_url, ksc.image_url,
                 ksc.creator_username, ksc.board_name, ksc.dominant_color, ksc.visual_annotations,
                 ksc.created_at_pinterest
          FROM keyword_serp_current ksc
          WHERE ksc.pin_id = ANY(${missingAfterD1}::text[]) AND (ksc.title <> '' OR ksc.image_url <> '')
          UNION ALL
          SELECT cp.pin_id, cp.title, cp.link_domain AS domain, cp.destination_url, cp.image_url,
                 '' AS creator_username, cp.board_name, '#888888' AS dominant_color,
                 COALESCE(cp.metadata->'visual_annotations', '[]'::jsonb) AS visual_annotations,
                 cp.created_at_pinterest
          FROM competitor_pins cp
          WHERE cp.pin_id = ANY(${missingAfterD1}::text[]) AND (cp.title <> '' OR cp.image_url <> '')
          UNION ALL
          SELECT pa.pin_id, pa.title, pa.domain, pa.link AS destination_url, pa.image_url,
                 pa.account_username AS creator_username, pa.board_name, pa.dominant_color,
                 COALESCE(pa.annotations, '[]'::jsonb) AS visual_annotations,
                 pa.created_at_pinterest
          FROM pa_pins pa
          WHERE pa.pin_id = ANY(${missingAfterD1}::text[]) AND (pa.title <> '' OR pa.image_url <> '')
          LIMIT 100;
        `.catch(() => []);

        for (const row of (hubRows || [])) {
          if (row?.pin_id) {
            const existing = enrichedMap.get(String(row.pin_id)) || {};
            enrichedMap.set(String(row.pin_id), {
              ...existing,
              title: row.title || existing.title,
              image_url: row.image_url || existing.image_url,
              destination_url: row.destination_url || existing.destination_url,
              domain: row.domain || existing.domain,
              creator_username: row.creator_username || existing.creator_username,
              board_name: row.board_name || existing.board_name,
              dominant_color: row.dominant_color || existing.dominant_color,
              visual_annotations: row.visual_annotations || existing.visual_annotations,
              created_at_pinterest: row.created_at_pinterest || existing.created_at_pinterest
            });
          }
        }
      } catch (_) {}
    }

    // Tier 3: 20-Physical-Shard Scatter-Gather Hydration with Concurrency Limit = 4 & Egress Protection
    const stillMissingForShards = missingPinIds.filter(pid => {
      const e = enrichedMap.get(String(pid));
      return !e || !e.title || !e.image_url || isSyntheticPinTitle(e.title);
    });

    const priorityShardPins = stillMissingForShards.slice(0, 350);
    const tailShardPins = stillMissingForShards.slice(350);

    if (sql && priorityShardPins.length > 0) {
      try {
        await preloadNeonRegistry(sql, env);
        const virtualGroups = batchGroupByShard(priorityShardPins, 99);
        const physicalGroups = coalesceShardGroupsByPhysical(virtualGroups);
        const physicalEntries = Array.from(physicalGroups.entries());

        const CONCURRENCY_LIMIT = 4;
        const SCATTER_GATHER_DEADLINE_MS = 4500;

        const executePhysicalHydration = async () => {
          for (let i = 0; i < physicalEntries.length; i += CONCURRENCY_LIMIT) {
            const chunk = physicalEntries.slice(i, i + CONCURRENCY_LIMIT);
            await Promise.all(chunk.map(async ([pShardId, pPins]) => {
              try {
                const shardSql = await resolveShardConnection(pShardId, env);
                if (!shardSql) return;
                const pPinIds = pPins.map(p => (typeof p === 'object' ? String(p.pin_id) : String(p)));
                const rows = await executeShardQueryWithCircuitBreaker({
                  shardId: pShardId,
                  shardSql,
                  timeoutMs: 3000,
                  queryFn: (db) => db`
                    SELECT ump.pin_id, ump.title, ump.domain, ump.destination_url, ump.image_url,
                           ump.creator_username, ump.board_name, ump.dominant_color, ump.visual_annotations,
                           ump.alt_text, ump.description, ump.created_at_pinterest
                    FROM universal_master_pins ump
                    WHERE ump.pin_id = ANY(${pPinIds}::text[])
                  `
                });
                for (const r of (rows || [])) {
                  if (r?.pin_id) {
                    enrichedMap.set(String(r.pin_id), r);
                  }
                }
              } catch (_) {}
            }));
          }
        };

        await Promise.race([
          executePhysicalHydration(),
          new Promise(resolve => setTimeout(resolve, SCATTER_GATHER_DEADLINE_MS))
        ]);
      } catch (_) {}
    }

    // Tier 4: Self-Healing Write-Back to D1 & Background Tail Warming
    const pinsToWriteToD1 = [];
    for (const pid of priorityShardPins) {
      const e = enrichedMap.get(String(pid));
      if (e && (e.title || e.image_url)) {
        pinsToWriteToD1.push(e);
      }
    }

    if (pinsToWriteToD1.length > 0 && env?.PIN_D1_DB) {
      safeWaitUntil(ctx, syncPinsBatchToD1(env, pinsToWriteToD1), 'd1_vault_writeback');
    }

    if (tailShardPins.length > 0 && sql) {
      safeWaitUntil(ctx, (async () => {
        try {
          const vGroups = batchGroupByShard(tailShardPins, 99);
          const pGroups = coalesceShardGroupsByPhysical(vGroups);
          for (const [pShardId, pPins] of pGroups.entries()) {
            const shardSql = await resolveShardConnection(pShardId, env);
            if (!shardSql) continue;
            const pIds = pPins.map(p => (typeof p === 'object' ? String(p.pin_id) : String(p)));
            const rows = await executeShardQueryWithCircuitBreaker({
              shardId: pShardId,
              shardSql,
              timeoutMs: 3000,
              queryFn: (db) => db`
                SELECT ump.pin_id, ump.title, ump.domain, ump.destination_url, ump.image_url,
                       ump.creator_username, ump.board_name, ump.dominant_color, ump.visual_annotations,
                       ump.alt_text, ump.description, ump.created_at_pinterest
                FROM universal_master_pins ump
                WHERE ump.pin_id = ANY(${pIds}::text[])
              `
            });
            if (rows?.length > 0 && env?.PIN_D1_DB) {
              await syncPinsBatchToD1(env, rows);
            }
          }
        } catch (_) {}
      })(), 'tail_vault_warming');
    }

    // Apply Enriched Metadata & Final Deferred Title Synthesis
    const primaryKeyword = folderKeywords[0]?.keyword || folder.name || 'Topic Cluster';
    for (const p of missingMetaPins) {
      const meta = enrichedMap.get(String(p.pin_id));
      if (meta) {
        if ((!p.title || isSyntheticPinTitle(p.title)) && meta.title && !isSyntheticPinTitle(meta.title)) {
          p.title = meta.title;
        }
        if (!p.image_url && meta.image_url) p.image_url = meta.image_url;
        if (!p.destination_url && meta.destination_url) p.destination_url = meta.destination_url;
        if (!p.domain && meta.domain) p.domain = meta.domain;
        if (!p.creator_username && meta.creator_username) p.creator_username = meta.creator_username;
        if (!p.board_name && meta.board_name) p.board_name = meta.board_name;
        if ((!p.dominant_color || p.dominant_color === '#1e1e24') && meta.dominant_color) p.dominant_color = meta.dominant_color;
        if ((!p.visual_annotations || p.visual_annotations.length === 0) && meta.visual_annotations) p.visual_annotations = meta.visual_annotations;
        if (!p.created_at_pinterest && meta.created_at_pinterest) p.created_at_pinterest = meta.created_at_pinterest;
      }

      // Final Pass: Only synthesize if title is still empty or synthetic after all 4 tiers
      if (!p.title || isSyntheticPinTitle(p.title)) {
        p.title = derivePinTitle(
          p.title || '',
          p.destination_url || p.domain || '',
          primaryKeyword,
          p.board_name || '',
          p.visual_annotations || []
        );
      }
    }
  }
```

**Replace with:**
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
        pin_id: pid,
        title: cleanExistingTitle || cleanIncomingTitle || '',
        seo_title: existing.seo_title || r.seo_title || '',
        image_url: existing.image_url || r.image_url || '',
        destination_url: existing.destination_url || r.destination_url || '',
        domain: existing.domain || r.domain || '',
        creator_username: existing.creator_username || r.creator_username || '',
        board_name: existing.board_name || r.board_name || '',
        dominant_color: existing.dominant_color || r.dominant_color || '#888888',
        visual_annotations: Array.isArray(parsedAnnotations) ? parsedAnnotations : [],
        alt_text: existing.alt_text || r.alt_text || '',
        description: existing.description || r.description || '',
        created_at_pinterest: existing.created_at_pinterest || r.created_at_pinterest || null,
        aspect_ratio: existing.aspect_ratio || r.aspect_ratio || null,
        creation_method: existing.creation_method || r.creation_method || null
      });
    };

    // Tier 1: Ultra-Fast Edge Hydration from Cloudflare D1 (edge_pins_metadata in < 3ms, 0 Bytes Neon Egress)
    if (env?.PIN_D1_DB) {
      try {
        const d1Map = await hydratePinsFromD1(env, missingPinIds);
        if (d1Map && typeof d1Map.get === 'function') {
          for (const pid of missingPinIds) {
            const d1Row = d1Map.get(String(pid));
            if (d1Row) mergeEnrichedRow(d1Row);
          }
        }
      } catch (_) {}
    }

    // Tier 2: Central Hub Fallback (100% Alias-Qualified Schema Parity across keyword_serp_current, competitor_pins, pa_pins)
    const stillMissingAfterD1 = missingMetaPins.filter(p => {
      const e = enrichedMap.get(p.pin_id);
      const hasTitle = Boolean(p.raw_title || (e && e.title && !isSyntheticPinTitle(e.title)));
      const hasImg = Boolean(p.image_url || (e && e.image_url));
      return !hasTitle || !hasImg;
    });

    if (sql && stillMissingAfterD1.length > 0) {
      const hubLookupIds = stillMissingAfterD1.map(p => p.pin_id);
      try {
        const hubMeta = await sql`
          SELECT ksc.pin_id, ksc.title, ksc.domain, ksc.destination_url, ksc.image_url,
                 ksc.creator_username, ksc.board_name, ksc.dominant_color, ksc.visual_annotations,
                 (ksc.metadata->>'alt_text') AS alt_text,
                 (ksc.metadata->>'description') AS description,
                 (ksc.metadata->>'seo_title') AS seo_title,
                 ksc.created_at_pinterest,
                 (ksc.metadata->>'aspect_ratio') AS aspect_ratio,
                 COALESCE(NULLIF(ksc.creation_method, ''), NULLIF(ksc.metadata->>'creation_method', ''), NULLIF(ksc.metadata->>'method', '')) AS creation_method
          FROM keyword_serp_current ksc
          WHERE ksc.pin_id = ANY(${hubLookupIds}::text[])
            AND (ksc.title <> '' OR ksc.image_url <> '')
          UNION ALL
          SELECT cp.pin_id, cp.title, cp.link_domain AS domain, cp.destination_url, cp.image_url,
                 '' AS creator_username, cp.board_name, '#888888' AS dominant_color,
                 COALESCE(cp.metadata->'visual_annotations', '[]'::jsonb) AS visual_annotations,
                 cp.alt_text,
                 cp.description,
                 (cp.metadata->>'seo_title') AS seo_title,
                 cp.created_at_pinterest,
                 (cp.metadata->>'aspect_ratio') AS aspect_ratio,
                 COALESCE(NULLIF(cp.metadata->>'creation_method', ''), NULLIF(cp.metadata->>'method', '')) AS creation_method
          FROM competitor_pins cp
          WHERE cp.pin_id = ANY(${hubLookupIds}::text[])
            AND (cp.title <> '' OR cp.image_url <> '')
          UNION ALL
          SELECT pa.pin_id, pa.title, pa.domain, pa.link AS destination_url, pa.image_url,
                 pa.account_username AS creator_username, pa.board_name, pa.dominant_color,
                 COALESCE(pa.annotations, '[]'::jsonb) AS visual_annotations,
                 pa.alt_text,
                 pa.description,
                 NULL AS seo_title,
                 pa.created_at_pinterest,
                 NULL AS aspect_ratio,
                 NULL AS creation_method
          FROM pa_pins pa
          WHERE pa.pin_id = ANY(${hubLookupIds}::text[])
            AND (pa.title <> '' OR pa.image_url <> '');
        `.catch(() => []);

        for (const row of (hubMeta || [])) {
          mergeEnrichedRow(row);
        }
      } catch (_) {}
    }

    // Tier 3: Distributed 20-Physical-Shard Hydration (universal_master_pins)
    // Strictly prioritize pins missing image_url (Vault pins) FIRST, then Super-Pins & high-velocity pins,
    // so active pins with synthetic titles never starve displaced Vault Super-Pins out of the 350 sync budget!
    const stillMissingAfterHub = missingMetaPins
      .filter(p => {
        const e = enrichedMap.get(p.pin_id);
        const hasTitle = Boolean(p.raw_title || (e && e.title && !isSyntheticPinTitle(e.title)));
        const hasImg = Boolean(p.image_url || (e && e.image_url));
        return !hasTitle || !hasImg;
      })
      .sort((a, b) => {
        const aMissingImg = !(a.image_url || enrichedMap.get(a.pin_id)?.image_url);
        const bMissingImg = !(b.image_url || enrichedMap.get(b.pin_id)?.image_url);
        if (aMissingImg !== bMissingImg) return bMissingImg ? 1 : -1;
        if (Boolean(b.is_super_pin) !== Boolean(a.is_super_pin)) return b.is_super_pin ? 1 : -1;
        if ((b.daily_save_velocity || 0) !== (a.daily_save_velocity || 0)) return (b.daily_save_velocity || 0) - (a.daily_save_velocity || 0);
        if ((b.overlap_count || 0) !== (a.overlap_count || 0)) return (b.overlap_count || 0) - (a.overlap_count || 0);
        return (b.save_count || 0) - (a.save_count || 0);
      });

    if (sql && stillMissingAfterHub.length > 0) {
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

        const hydrateShardBatch = async (entries, perShardTimeoutMs = 2500) => {
          const hydratedBatch = [];
          for (let i = 0; i < entries.length; i += CONCURRENCY_LIMIT) {
            const chunk = entries.slice(i, i + CONCURRENCY_LIMIT);
            await Promise.allSettled(
              chunk.map(async ([shardId, pins]) => {
                const pids = pins.map(p => (typeof p === 'object' ? String(p.pin_id) : String(p)));
                const shardSql = await resolveShardConnection({ hubSql: sql, shardId, env });
                if (!shardSql || (shardSql === sql && !isUnifiedPostgres(env))) return;

                const rows = await executeShardQueryWithCircuitBreaker({
                  shardId,
                  shardSql,
                  timeoutMs: perShardTimeoutMs,
                  queryFn: async (client) => {
                    // [INVARIANT: TARGETED-JSONB-PROJECTION] Project scalar fields only to protect Shard Egress
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
                        ump.alt_text,
                        ump.description,
                        (ump.metadata->>'seo_title') AS seo_title,
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
                  if (r && r.pin_id) {
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
          hydrateShardBatch(shardEntries, 2500),
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
        const pinsToWriteToD1 = [];
        for (const r of newlyHydratedFromShards) {
          const e = enrichedMap.get(String(r.pin_id));
          if (e && (e.title || e.image_url)) {
            pinsToWriteToD1.push(e);
          }
        }
        if (env?.PIN_D1_DB && pinsToWriteToD1.length > 0) {
          safeWaitUntil(ctx, syncPinsBatchToD1(env, pinsToWriteToD1), 'crossover_sync_priority_d1');
        }

        // Tier 4B: Background Tail Warming in waves of 4 for folders with > 350 displaced pins
        if (env?.PIN_D1_DB && tailShardPins.length > 0) {
          const tailGroups = coalesceShardGroupsByPhysical(batchGroupByShard(tailShardPins, 99));
          const tailEntries = Array.from(tailGroups.entries());
          safeWaitUntil(
            ctx,
            (async () => {
              const tailHydrated = await hydrateShardBatch(tailEntries, 3000);
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
      const meta = enrichedMap.get(String(p.pin_id));
      if (meta) {
        if ((!p.raw_title || isSyntheticPinTitle(p.title)) && meta.title && !isSyntheticPinTitle(meta.title)) {
          p.raw_title = String(meta.title).trim();
          p.title = p.raw_title;
        }
        if (!p.seo_title && meta.seo_title) p.seo_title = meta.seo_title;
        if (!p.image_url && meta.image_url) p.image_url = meta.image_url;
        if (!p.destination_url && meta.destination_url) p.destination_url = meta.destination_url;
        if (!p.domain && meta.domain) p.domain = meta.domain;
        if (!p.creator_username && meta.creator_username) {
          p.creator_username = meta.creator_username;
          if (!p.creator_name) p.creator_name = meta.creator_username;
        }
        if (!p.board_name && meta.board_name) p.board_name = meta.board_name;
        if ((!p.dominant_color || p.dominant_color === '#1e1e24') && meta.dominant_color) {
          p.dominant_color = meta.dominant_color;
        }
        if ((!p.visual_annotations || p.visual_annotations.length === 0) && Array.isArray(meta.visual_annotations) && meta.visual_annotations.length > 0) {
          p.visual_annotations = meta.visual_annotations;
        }
        if (!p.alt_text && meta.alt_text) p.alt_text = meta.alt_text;
        if (!p.description && meta.description) p.description = meta.description;
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

  // Final Pass: Synthesize fallback title via derivePinTitle across ALL pins ONLY if authentic title is STILL missing,
  // and recompute vacuumPinsCount + pin_age_days cleanly.
  const primaryKeyword = folderKeywords[0]?.keyword || folder.name || 'Topic Cluster';
  vacuumPinsCount = 0;
  for (const p of allPins) {
    if (p.pin_age_days == null && p.created_at_pinterest) {
      const pinCreatedMs = new Date(p.created_at_pinterest).getTime();
      if (!isNaN(pinCreatedMs)) {
        p.pin_age_days = Math.max(0, Math.floor((nowMs - pinCreatedMs) / 86400000));
      }
    }
    if (!p.aspect_ratio) p.aspect_ratio = '2:3';
    if (!p.title || isSyntheticPinTitle(p.title)) {
      const pinKw = p.rankings[0]?.keyword || primaryKeyword;
      p.title = derivePinTitle(
        p.raw_title || '',
        p.destination_url || p.domain || '',
        pinKw,
        p.board_name || '',
        p.visual_annotations || [],
        p.description || '',
        p.alt_text || '',
        p.seo_title || ''
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

#### Edit 1F — Fix `has_unhydrated_priority_pins` Return Property to Prevent Permanent 60s KV Cache Thrashing
**Find (Lines 3267–3270):**
```javascript
    topic_cluster_blueprint: topicClusterBlueprint,
    has_unhydrated_priority_pins: allPins.slice(0, 100).some(p => !p.image_url || isSyntheticPinTitle(p.title)),
    _has_unhydrated_priority_pins: allPins.slice(0, 100).some(p => !p.image_url || isSyntheticPinTitle(p.title))
  };
```

**Replace with:**
```javascript
    topic_cluster_blueprint: topicClusterBlueprint,
    has_unhydrated_priority_pins: hasUnhydratedPriorityPins,
    _has_unhydrated_priority_pins: hasUnhydratedPriorityPins
  };
```

---

### File 2: `src/modules/keywords/d1-metadata.mjs`

#### Edit 2A — Guard `edge_pins_metadata.title` in `syncPinsBatchToD1` Against Synthetic Title Overwrites
**Find (Lines 104–105):**
```javascript
          ON CONFLICT(pin_id) DO UPDATE SET
            title = CASE WHEN excluded.title <> '' THEN excluded.title ELSE edge_pins_metadata.title END,
```

**Replace with:**
```javascript
          ON CONFLICT(pin_id) DO UPDATE SET
            title = CASE
              WHEN excluded.title <> ''
               AND LOWER(TRIM(excluded.title)) NOT LIKE '% inspiration'
               AND LOWER(TRIM(excluded.title)) NOT LIKE '% idea'
               AND LOWER(TRIM(excluded.title)) NOT IN ('untitled', 'untitled pin', 'pin', 'pinterest visual guide', 'pinterest pin idea')
              THEN excluded.title
              ELSE COALESCE(NULLIF(edge_pins_metadata.title, ''), excluded.title)
            END,
```

---

### File 3: `src/modules/keywords/service.mjs`

#### Edit 3A — Import `isSyntheticPinTitle` from `./folders-service.mjs`
**Find (Line 28):**
```javascript
import { derivePinTitle, autoDiscoverFolderCreatorsForKeyword } from './folders-service.mjs';
```

**Replace with:**
```javascript
import { isSyntheticPinTitle, derivePinTitle, autoDiscoverFolderCreatorsForKeyword } from './folders-service.mjs';
```

#### Edit 3B — Guard `universal_master_pins.title` in `offloadKeywordCrawlToShards` Against Synthetic Title Overwrites
**Find (Line 191):**
```javascript
            title = COALESCE(NULLIF(EXCLUDED.title, ''), universal_master_pins.title),
```

**Replace with:**
```javascript
            title = CASE
              WHEN EXCLUDED.title <> ''
               AND EXCLUDED.title !~* '(^|\s)(Inspiration|Idea)$'
               AND EXCLUDED.title !~* '^(Untitled(\s+Pin)?|Pin(\s*#?\s*\w+)?|Pinterest\s+(Visual\s+Guide|Pin\s+Idea))$'
              THEN EXCLUDED.title
              ELSE COALESCE(NULLIF(universal_master_pins.title, ''), EXCLUDED.title)
            END,
```

#### Edit 3C — Harden `hydrateDisplacedIndexFromShards` (`needsHydration` & `missingAfterD1`) Against Synthetic Titles
**Find (Lines 297–317):**
```javascript
export async function hydrateDisplacedIndexFromShards(hubSql, indexRows = [], env = null, skipShardHydration = false, ctx = null) {
  if (!Array.isArray(indexRows) || indexRows.length === 0) return [];
  const needsHydration = indexRows.filter(r => !r.title && !r.image_url);
  if (needsHydration.length === 0) return indexRows;

  try {
    const masterMap = new Map();

    // 1. Tier-1 Ultra-Fast Edge Hydration from Cloudflare D1 (`edge_pins_metadata` in < 3ms)
    if (env?.PIN_D1_DB) {
      const d1Map = await hydratePinsFromD1(env, needsHydration.map(r => String(r.pin_id)));
      for (const [pid, d1Row] of d1Map.entries()) {
        if (d1Row.title || d1Row.image_url) {
          masterMap.set(pid, d1Row);
        }
      }
    }

    // Tier 0 (Hub Pre-Hydration): Check Central Hub tables (keyword_serp_current, competitor_pins, pa_pins) via single fast ANY($1) query
    const missingAfterD1 = needsHydration.filter(r => !masterMap.has(String(r.pin_id)));
```

**Replace with:**
```javascript
export async function hydrateDisplacedIndexFromShards(hubSql, indexRows = [], env = null, skipShardHydration = false, ctx = null) {
  if (!Array.isArray(indexRows) || indexRows.length === 0) return [];
  const needsHydration = indexRows.filter(r => !r.title || !r.image_url || isSyntheticPinTitle(r.title));
  if (needsHydration.length === 0) return indexRows;

  try {
    const masterMap = new Map();

    // 1. Tier-1 Ultra-Fast Edge Hydration from Cloudflare D1 (`edge_pins_metadata` in < 3ms)
    if (env?.PIN_D1_DB) {
      const d1Map = await hydratePinsFromD1(env, needsHydration.map(r => String(r.pin_id)));
      for (const [pid, d1Row] of d1Map.entries()) {
        if (d1Row.title || d1Row.image_url) {
          masterMap.set(pid, d1Row);
        }
      }
    }

    // Tier 0 (Hub Pre-Hydration): Check Central Hub tables (keyword_serp_current, competitor_pins, pa_pins) via single fast ANY($1) query
    const missingAfterD1 = needsHydration.filter(r => {
      const m = masterMap.get(String(r.pin_id));
      return !m || !m.title || !m.image_url || isSyntheticPinTitle(m.title);
    });
```

#### Edit 3D — Merge Non-Synthetic Hub Rows & Filter `stillMissing` in `hydrateDisplacedIndexFromShards`
**Find (Lines 334–344):**
```javascript
        for (const hr of (hubRows || [])) {
          if ((hr.title || hr.image_url) && !masterMap.has(String(hr.pin_id))) {
            masterMap.set(String(hr.pin_id), hr);
          }
        }
      } catch (_) {}
    }

    // 2. Only query Neon Shards for pins that were not found in Cloudflare D1 or Hub
    const stillMissing = needsHydration.filter(r => !masterMap.has(String(r.pin_id)));
```

**Replace with:**
```javascript
        for (const hr of (hubRows || [])) {
          if (hr && (hr.title || hr.image_url)) {
            const existing = masterMap.get(String(hr.pin_id)) || {};
            masterMap.set(String(hr.pin_id), {
              ...existing,
              ...hr,
              title: (!isSyntheticPinTitle(existing.title) ? existing.title : (!isSyntheticPinTitle(hr.title) ? hr.title : (existing.title || hr.title || ''))),
              image_url: existing.image_url || hr.image_url || ''
            });
          }
        }
      } catch (_) {}
    }

    // 2. Only query Neon Shards for pins that were not found in Cloudflare D1 or Hub
    const stillMissing = needsHydration.filter(r => {
      const m = masterMap.get(String(r.pin_id));
      return !m || !m.title || !m.image_url || isSyntheticPinTitle(m.title);
    });
```

#### Edit 3E — Pass `description`, `altText`, and `item.seo_title` into `derivePinTitle` During `crawlKeywordSERP`
**Find (Line 1485):**
```javascript
      const finalTitle = derivePinTitle(title, destinationUrl, keywordRow.keyword, boardName, visualAnnotations);
```

**Replace with:**
```javascript
      const finalTitle = derivePinTitle(title, destinationUrl, keywordRow.keyword, boardName, visualAnnotations, description, altText, item.seo_title || '');
```

#### Edit 3F — Allow Batch Pidgets Pre-Enrichment to Replace Synthetic Titles
**Find (Lines 1561–1563):**
```javascript
              if (pData.title && (!p.title || p.title === '')) {
                p.title = pData.title;
              }
```

**Replace with:**
```javascript
              if (pData.title && !isSyntheticPinTitle(pData.title) && (!p.title || isSyntheticPinTitle(p.title))) {
                p.title = pData.title;
              }
```

#### Edit 3G — Allow Deep `fetchPinFromPinterest` Enrichment to Replace Synthetic Titles
**Find (Lines 1625–1628):**
```javascript
            if (scraped.created_at_pinterest || scraped.created_at) {
              const enrichedCreated = scraped.created_at_pinterest || scraped.created_at;
              p.created_at_pinterest = enrichedCreated;
            }
```

**Replace with:**
```javascript
            const scrapedCandidateTitle = String(scraped.title || scraped.seo_title || '').trim();
            if (scrapedCandidateTitle && !isSyntheticPinTitle(scrapedCandidateTitle) && (!p.title || isSyntheticPinTitle(p.title))) {
              p.title = scrapedCandidateTitle;
            }
            if (scraped.created_at_pinterest || scraped.created_at) {
              const enrichedCreated = scraped.created_at_pinterest || scraped.created_at;
              p.created_at_pinterest = enrichedCreated;
            }
```

---

### File 4: `scripts/verify_regression_locks.mjs`

#### Edit 4A — Strengthen Lock 4D to Enforce Missing-Image Priority Sorting, `hubSql` Routing, `aspect_ratio` Projection, and `pin_age_days` Recomputation
**Find (Lines 233–240):**
```javascript
  // 4D. folders-service.mjs must hydrate displaced Vault pins from 20 physical shards via coalesceShardGroupsByPhysical & isSyntheticPinTitle
  const foldersHydratesShards = (
    foldersServiceContent.includes('coalesceShardGroupsByPhysical') &&
    foldersServiceContent.includes('FROM universal_master_pins') &&
    foldersServiceContent.includes('isSyntheticPinTitle') &&
    foldersServiceContent.includes(':crossover:v3')
  );
  check('Lock 4', foldersHydratesShards, 'src/modules/keywords/folders-service.mjs is missing 20-shard universal_master_pins hydration, isSyntheticPinTitle guard, or :crossover:v3 cache key');
```

**Replace with:**
```javascript
  // 4D. folders-service.mjs must hydrate displaced Vault pins from 20 physical shards with missing-image priority sorting, hubSql routing, aspect_ratio projection, and pin_age_days recomputation
  const foldersHydratesShards = (
    foldersServiceContent.includes('coalesceShardGroupsByPhysical') &&
    foldersServiceContent.includes('FROM universal_master_pins') &&
    foldersServiceContent.includes('isSyntheticPinTitle') &&
    foldersServiceContent.includes(':crossover:v3') &&
    foldersServiceContent.includes('resolveShardConnection({ hubSql: sql, shardId, env })') &&
    foldersServiceContent.includes('aMissingImg !== bMissingImg') &&
    foldersServiceContent.includes("(ump.metadata->>'aspect_ratio') AS aspect_ratio") &&
    /if\s*\(\s*!p\.created_at_pinterest\s*&&\s*meta\.created_at_pinterest\s*\)\s*\{[\s\S]*?p\.pin_age_days\s*=\s*Math\.max/.test(foldersServiceContent)
  );
  check('Lock 4', foldersHydratesShards, 'src/modules/keywords/folders-service.mjs is missing 20-shard hydration, missing-image priority sort, hubSql routing, aspect_ratio projection, or pin_age_days recomputation');
```

---

## 3. MANDATORY VERIFICATION GATES (PHASE 3)

After applying all edits verbatim, run every command below and verify **100% green output (exit code 0)**:
1. `node scripts/verify_all_syntax.mjs`
2. `node scripts/validate_inline_scripts.mjs`
3. `node scripts/verify_sql_schema_parity.mjs`
4. `node scripts/verify_dom_nesting.mjs`
5. `node scripts/verify_regression_locks.mjs`
6. `node scripts/test_round11_vault_hydration_simulation.mjs`
7. `node scripts/test_challenger_round11_adversarial.mjs`
8. Run an empirical simulation calling `calculateFolderCrossover` with >= 360 active pins having synthetic `"<Keyword> Inspiration"` titles ahead of displaced Vault Super-Pins (`281543727244482`, `524950900340768832`) and assert:
   - `vp.image_url` is non-empty (`https://i.pinimg.com/...`)
   - `vp.title` is non-synthetic (`!isSyntheticPinTitle(vp.title)`)
   - `vp.pin_age_days` is a positive integer (`typeof vp.pin_age_days === 'number' && vp.pin_age_days > 0`)
   - `vp.aspect_ratio` is non-null (`'2:3'` or `'9:16'`)
```
