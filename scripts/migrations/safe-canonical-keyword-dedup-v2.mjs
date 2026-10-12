/**
 * scripts/migrations/safe-canonical-keyword-dedup-v2.mjs
 * Zero-Downtime Safe Deduplication and Unique Canonical Constraint Migration (Hub)
 */
import { neon } from '@neondatabase/serverless';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is required.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function runSafeMigrationV2() {
  console.log('===============================================================');
  console.log('🚀 SAFE CANONICAL KEYWORD DEDUPLICATION & CONSTRAINT MIGRATION (v2)');
  console.log('===============================================================');

  // 1. تعريف دالة التطبيع في قاعدة البيانات
  console.log('[*] Step 1: Creating or updating normalize_canonical_kw() function...');
  await sql`
    CREATE OR REPLACE FUNCTION normalize_canonical_kw(raw_kw text)
    RETURNS text IMMUTABLE LANGUAGE sql AS $$
      SELECT lower(trim(regexp_replace(regexp_replace(COALESCE(raw_kw, ''), '[-_]+', ' ', 'g'), '\s+', ' ', 'g')));
    $$;
  `;

  // 2. كشف المجموعات المكررة
  console.log('[*] Step 2: Scanning tracked_keywords for duplicate clusters...');
  const duplicates = await sql`
    SELECT 
      normalize_canonical_kw(keyword) AS canonical,
      array_agg(id ORDER BY is_active DESC, last_crawled_at DESC NULLS LAST, id ASC) AS ids
    FROM tracked_keywords
    GROUP BY normalize_canonical_kw(keyword)
    HAVING count(*) > 1;
  `;

  console.log(`[*] Found ${duplicates.length} duplicate keyword clusters.`);

  // 3. دمج كل مجموعة بأمان مع معالجة تصادمات المفاتيح الفريدة
  for (const cluster of duplicates) {
    const survivorId = cluster.ids[0];
    const victimIds = cluster.ids.slice(1);
    console.log(`\n  [-] Merging Cluster: "${cluster.canonical}"`);
    console.log(`      Survivor ID: ${survivorId} | Victims: [${victimIds.join(', ')}]`);

    // أ. معالجة جدول keyword_serp_current
    await sql`
      UPDATE keyword_serp_current
      SET keyword_id = ${survivorId}
      WHERE keyword_id = ANY(${victimIds})
        AND NOT EXISTS (
          SELECT 1 FROM keyword_serp_current ksc2 
          WHERE ksc2.keyword_id = ${survivorId} AND ksc2.pin_id = keyword_serp_current.pin_id
        );
    `;
    await sql`DELETE FROM keyword_serp_current WHERE keyword_id = ANY(${victimIds});`;

    // ب. معالجة جدول keyword_pins_snapshots (حل تصادمات الـ Unique Constraint المحكم)
    // 1) دمج أعلى القياسات في سطر الـ Survivor عند وجود تصادم في نفس التاريخ لنفس الدبوس
    await sql`
      UPDATE keyword_pins_snapshots survivor
      SET 
        save_count = GREATEST(survivor.save_count, victim.save_count),
        repin_count = GREATEST(survivor.repin_count, victim.repin_count),
        daily_save_velocity = GREATEST(survivor.daily_save_velocity, victim.daily_save_velocity)
      FROM keyword_pins_snapshots victim
      WHERE victim.keyword_id = ANY(${victimIds})
        AND survivor.keyword_id = ${survivorId}
        AND survivor.pin_id = victim.pin_id
        AND survivor.snapshot_date = victim.snapshot_date;
    `;

    // 2) حذف أسطر الضحايا المتصادمة التي تم تفريغ بياناتها بنجاح في الـ Survivor
    await sql`
      DELETE FROM keyword_pins_snapshots victim
      WHERE victim.keyword_id = ANY(${victimIds})
        AND EXISTS (
          SELECT 1 FROM keyword_pins_snapshots survivor
          WHERE survivor.keyword_id = ${survivorId}
            AND survivor.pin_id = victim.pin_id
            AND survivor.snapshot_date = victim.snapshot_date
        );
    `;

    // 3) تحديث الأسطر المتبقية غير المتصادمة بأمان تام
    await sql`
      UPDATE keyword_pins_snapshots
      SET keyword_id = ${survivorId}
      WHERE keyword_id = ANY(${victimIds});
    `;

    // ج. معالجة جدول keyword_folder_items
    await sql`
      UPDATE keyword_folder_items
      SET keyword_id = ${survivorId}
      WHERE keyword_id = ANY(${victimIds})
        AND NOT EXISTS (
          SELECT 1 FROM keyword_folder_items kfi2 
          WHERE kfi2.keyword_id = ${survivorId} AND kfi2.folder_id = keyword_folder_items.folder_id
        );
    `;
    await sql`DELETE FROM keyword_folder_items WHERE keyword_id = ANY(${victimIds});`;

    // د. معالجة جدول keyword_ignored_pins
    await sql`
      UPDATE keyword_ignored_pins
      SET keyword_id = ${survivorId}
      WHERE keyword_id = ANY(${victimIds})
        AND NOT EXISTS (
          SELECT 1 FROM keyword_ignored_pins kip2 
          WHERE kip2.keyword_id = ${survivorId} AND kip2.pin_id = keyword_ignored_pins.pin_id
        );
    `;
    await sql`DELETE FROM keyword_ignored_pins WHERE keyword_id = ANY(${victimIds});`;

    // هـ. حذف أسطر الضحايا المشوهة نهائياً من الكتالوج
    await sql`DELETE FROM tracked_keywords WHERE id = ANY(${victimIds});`;
  }

  // 4. تطبيق العمود المحسوب والفهرس الفريد
  console.log('\n[*] Step 4: Applying Stored Generated Column & Unique Index on tracked_keywords...');
  await sql`
    ALTER TABLE tracked_keywords 
    ADD COLUMN IF NOT EXISTS canonical_keyword TEXT 
    GENERATED ALWAYS AS (normalize_canonical_kw(keyword)) STORED;
  `.catch(err => {
    if (!err.message.includes('already exists')) throw err;
  });

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_tracked_keywords 
    ON tracked_keywords (canonical_keyword);
  `;

  console.log('✅ Phase 1 Migration completed successfully with zero duplicate aborts!');
}

runSafeMigrationV2().catch(err => {
  console.error('[-] Fatal Migration Abort in Phase 1:', err);
  process.exit(1);
});
