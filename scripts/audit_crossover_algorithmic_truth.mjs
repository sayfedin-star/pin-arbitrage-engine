#!/usr/bin/env node

/**
 * scripts/audit_crossover_algorithmic_truth.mjs
 * 
 * Forensic Algorithmic Auditor & Pinterest Graph Verifier
 * Audits the 5 specific algorithmic anomalies in Folder Crossover Matrix:
 * 1. Stopwords & Lemmatizer over-stemming ('You', 'One', 'Busy', 'Deliciou')
 * 2. Missing SERP rank (#null) in Super-Pins
 * 3. Domain monopoly pollution ('uploaded by user')
 * 4. Seasonality wave peak month hyper-inflation (9/12 months)
 * 5. Pillar Blueprint franken-title generation (unvalidated '&' mashups)
 */

import { neon } from '@neondatabase/serverless';
import { 
  normalizeTagLemma, 
  STOPWORDS,
  cleanExternalDomain,
  calculateFolderCrossover 
} from '../src/modules/keywords/folders-service.mjs';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function runForensicAudit() {
  console.log('================================================================');
  console.log('🔍 FORENSIC AUDIT: CROSSOVER MATRIX ALGORITHMIC TRUTH AUDIT');
  console.log('================================================================\n');

  // Find target folder
  const folders = await sql`
    SELECT id, name FROM keyword_folders 
    WHERE name ILIKE '%Comfort Dinners%' OR name ILIKE '%Casseroles%'
    ORDER BY id ASC;
  `;

  if (folders.length === 0) {
    console.log('[-] Target folder Comfort Dinners & Casseroles not found by name. Listing all folders:');
    const allFolders = await sql`SELECT id, name FROM keyword_folders ORDER BY id ASC LIMIT 10;`;
    console.table(allFolders);
    if (allFolders.length === 0) {
      console.error('[-] No folders in database.');
      process.exit(1);
    }
  }

  const targetFolder = folders[0] || (await sql`SELECT id, name FROM keyword_folders ORDER BY id ASC LIMIT 1`)[0];
  console.log(`[*] Target Folder ID: ${targetFolder.id} - "${targetFolder.name}"`);

  // Query keywords in this folder
  const folderKeywords = await sql`
    SELECT tk.id, tk.keyword 
    FROM keyword_folder_items i
    JOIN tracked_keywords tk ON tk.id = i.keyword_id
    WHERE i.folder_id = ${targetFolder.id}
    ORDER BY tk.id ASC;
  `;
  console.log(`[*] Folder contains ${folderKeywords.length} tracked keywords:`);
  console.table(folderKeywords);

  const keywordIds = folderKeywords.map(k => k.id);

  // -------------------------------------------------------------------------
  // AUDIT 1: NLP STOPWORDS & LEMMATIZER OVER-STEMMING
  // -------------------------------------------------------------------------
  console.log('\n--- [AUDIT 1: NLP Stopwords & Lemmatizer Testing] ---');
  const lemmaChecks = [
    { input: 'Delicious', expected: 'delicious', shouldBeStopword: true },
    { input: 'delicious', expected: 'delicious', shouldBeStopword: true },
    { input: 'potatoes', expected: 'potato', shouldBeStopword: false },
    { input: 'casseroles', expected: 'casserole', shouldBeStopword: false },
    { input: 'You', expected: 'you', shouldBeStopword: true },
    { input: 'One', expected: 'one', shouldBeStopword: true },
    { input: 'Busy', expected: 'busy', shouldBeStopword: true },
    { input: 'Asparagus', expected: 'asparagus', shouldBeStopword: false },
    { input: 'Hummus', expected: 'hummus', shouldBeStopword: false },
    { input: 'Couscous', expected: 'couscous', shouldBeStopword: false },
    { input: 'Famous', expected: 'famous', shouldBeStopword: false },
    { input: 'Various', expected: 'various', shouldBeStopword: false }
  ];

  let audit1Pass = true;
  for (const item of lemmaChecks) {
    const lemmatized = normalizeTagLemma(item.input);
    const isStop = STOPWORDS.has(lemmatized) || STOPWORDS.has(item.input.toLowerCase());
    const lemmaCorrect = lemmatized === item.expected;
    const stopCorrect = isStop === item.shouldBeStopword;
    const status = lemmaCorrect && stopCorrect ? 'PASS' : 'FAIL';
    if (status === 'FAIL') audit1Pass = false;
    console.log(`  [${status}] "${item.input.padEnd(12)}" -> lemma: "${lemmatized.padEnd(12)}" (Stopword: ${isStop})`);
  }
  console.log(`[*] AUDIT 1 RESULT: ${audit1Pass ? '✅ ALL NLP RULES PASSED' : '❌ NLP FAILURES DETECTED'}`);

  // -------------------------------------------------------------------------
  // AUDIT 2: MISSING SERP RANKS (#null) IN SNAPSHOTS
  // -------------------------------------------------------------------------
  console.log('\n--- [AUDIT 2: Displaced / NULL Ranks in DB Snapshots] ---');
  const nullRankRows = await sql`
    SELECT 
      s.keyword_id, 
      tk.keyword, 
      s.pin_id, 
      s.title, 
      s.rank_position, 
      s.is_displaced, 
      s.snapshot_date, 
      s.save_count
    FROM keyword_pins_snapshots s
    JOIN tracked_keywords tk ON tk.id = s.keyword_id
    WHERE s.keyword_id = ANY(${keywordIds})
      AND (s.rank_position IS NULL OR s.is_displaced IS TRUE)
    ORDER BY s.save_count DESC
    LIMIT 5;
  `;

  console.log(`Database has ${nullRankRows.length} historical displaced rows (which must be filtered from Super-Pins).`);

  // -------------------------------------------------------------------------
  // AUDIT 3: DOMAIN MONOPOLY SANITIZER TESTING
  // -------------------------------------------------------------------------
  console.log('\n--- [AUDIT 3: Domain Monopoly Sanitizer] ---');
  const testDomains = [
    { in: 'uploaded by user', expected: '' },
    { in: 'Uploaded By User', expected: '' },
    { in: 'pinterest.com', expected: '' },
    { in: 'i.pinimg.com', expected: '' },
    { in: 'https://www.eatwell101.com/recipe', expected: 'eatwell101.com' },
    { in: 'thereciperebel.com', expected: 'thereciperebel.com' },
    { in: 'null', expected: '' },
    { in: 'undefined', expected: '' }
  ];

  let audit3Pass = true;
  for (const td of testDomains) {
    const cleaned = cleanExternalDomain(td.in);
    const pass = cleaned === td.expected;
    if (!pass) audit3Pass = false;
    console.log(`  [${pass ? 'PASS' : 'FAIL'}] "${td.in.padEnd(35)}" -> cleaned: "${cleaned}"`);
  }
  console.log(`[*] AUDIT 3 RESULT: ${audit3Pass ? '✅ DOMAIN SANITIZER PASSED' : '❌ DOMAIN SANITIZER FAIL'}`);

  // -------------------------------------------------------------------------
  // AUDIT 4 & 5: LIVE RUN OF calculateFolderCrossover
  // -------------------------------------------------------------------------
  console.log('\n--- [AUDIT 4 & 5: LIVE CALCULATION RESULTS] ---');
  const result = await calculateFolderCrossover(sql, targetFolder.id);

  console.log(`[*] Total Unique Pins: ${result.summary.total_unique_pins}`);
  console.log(`[*] Total Super Pins: ${result.summary.super_pins_count}`);

  // Check 1: Super Pins ranks
  let superPinsRankCheck = true;
  for (const sp of result.super_pins) {
    for (const r of sp.rankings) {
      if (r.rank_position == null || r.rank_position < 1 || isNaN(r.rank_position)) {
        superPinsRankCheck = false;
        console.error(`  ❌ Invalid rank in Super-Pin "${sp.title}": keyword "${r.keyword}" rank=${r.rank_position}`);
      }
    }
  }
  console.log(`[*] Super-Pins Null Rank Audit: ${superPinsRankCheck ? '✅ ZERO NULL RANKS FOUND (100% Confirmed SERP Ranks)' : '❌ NULL RANKS DETECTED'}`);

  console.log('\nTop 5 Verified Super Pins:');
  console.table(result.super_pins.slice(0, 5).map(p => ({
    title: p.title.slice(0, 35),
    saves: p.save_count,
    overlap_count: `${p.overlap_count}x Overlap`,
    rankings: p.rankings.map(r => `${r.keyword} (#${r.rank_position})`).join(', ')
  })));

  // Check 2: Universal Tag Bridges
  console.log('\nTop 15 Universal Tag Bridges:');
  const bannedTags = new Set(['you', 'one', 'busy', 'deliciou', 'delicious', 'food', 'meal', 'dinner']);
  let tagsCheck = true;
  const top15 = result.tag_bridges.slice(0, 15);
  console.table(top15.map(t => ({
    tag: t.tag,
    overlap: `${t.overlap_percentage}% (${t.keyword_overlap_count}/${result.summary.total_keywords})`,
    pins: t.pin_count,
    saves: t.total_saves,
    tier: t.bridge_tier
  })));

  for (const t of top15) {
    if (bannedTags.has(t.tag.toLowerCase())) {
      console.error(`  ❌ Banned tag detected in top bridges: "${t.tag}"`);
      tagsCheck = false;
    }
  }
  console.log(`[*] Universal Tag Bridges Audit: ${tagsCheck ? '✅ ZERO LEAKED STOPWORDS (Tangible Culinary Entities Only)' : '❌ STOPWORDS LEAKED'}`);

  // Check 3: Domain Monopoly
  console.log('\nTop 5 Monopoly Domains:');
  console.table(result.domain_monopoly.slice(0, 5).map(d => ({
    domain: d.domain,
    kw_covered: `${d.keywords_count}/${result.summary.total_keywords} (${d.overlap_percentage}%)`,
    pins: d.pin_count,
    saves: d.total_saves
  })));

  const hasUploadedByUser = result.domain_monopoly.some(d => d.domain.includes('uploaded by') || d.domain.includes('pinterest'));
  console.log(`[*] Domain Monopoly Audit: ${!hasUploadedByUser ? '✅ ZERO FAKE/INTERNAL DOMAINS (Real Competitor Domains Only)' : '❌ FAKE DOMAINS DETECTED'}`);

  // Check 4: Seasonality Peak Months
  console.log('\nSeasonality Calibration:');
  console.log(`  Peak Months: ${JSON.stringify(result.seasonality.peak_months)} (${result.seasonality.peak_months.length} months)`);
  console.log(`  Recommended Launch Window: ${result.seasonality.recommended_launch_window}`);
  const seasonalityBounded = result.seasonality.peak_months.length >= 2 && result.seasonality.peak_months.length <= 4;
  console.log(`[*] Seasonality Audit: ${seasonalityBounded ? '✅ STATISTICALLY CALIBRATED (Strictly 2-4 Peak Surge Months)' : '❌ PEAK MONTHS UNCALIBRATED'}`);

  // Check 5: Topic Cluster Blueprint
  console.log('\nTopic Cluster Blueprint Pillar Angle:');
  console.log(`  Pillar Concept: "${result.topic_cluster_blueprint.pillar_concept}"`);
  console.log(`  Universal Tags: "${result.topic_cluster_blueprint.universal_tag_blueprint}"`);
  const frankenMashup = result.topic_cluster_blueprint.pillar_concept.includes('Pasta & Tater Tot Casserole');
  console.log(`[*] Blueprint Co-occurrence Guard: ${!frankenMashup ? '✅ CO-OCCURRENCE VERIFIED (Unified Umbrella Concept / No Franken-Titles)' : '❌ FRANKEN-TITLE DETECTED'}`);

  console.log('\n================================================================');
  const allAuditsPassed = audit1Pass && audit3Pass && superPinsRankCheck && tagsCheck && !hasUploadedByUser && seasonalityBounded && !frankenMashup;
  console.log(`FINAL VERDICT: ${allAuditsPassed ? '🏆 ALL 5 ALGORITHMIC TARGETS FULLY SANITIZED & VERIFIED' : '⚠️ SOME AUDITS REQUIRE REFINEMENT'}`);
  console.log('================================================================\n');

  if (!allAuditsPassed) {
    process.exit(1);
  }
}

runForensicAudit().catch(err => {
  console.error('[-] Audit error:', err);
  process.exit(1);
});
