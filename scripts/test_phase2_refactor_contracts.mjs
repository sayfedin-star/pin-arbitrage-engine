/**
 * Phase 2 Refactor Contracts Verification Suite (node:test)
 * File: scripts/test_phase2_refactor_contracts.mjs
 *
 * Verifies:
 * 1. Zero reverse dependencies (no src/ module imports from scripts/) & crawler-engine.mjs removed
 * 2. Modular src/core/pinterest/* parity & zero static undici imports
 * 3. competitor_profiles.metadata->'global_qualification_rules' persistence & system profile exclusion
 * 4. Unified /api/folders* & /api/creators/* routes (and 404 eradication of legacy aliases)
 * 5. Fastify native plugin dispatch via createFastifyApp().inject()
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFastifyApp } from '../src/server.mjs';
import {
  canonicalizeArticleUrlForCount,
  formatPin,
  extractPinData,
  fetchPinFromPinterest,
  fetchPinsBatchFromPidgets,
  fetchUrlGlobalSaves,
  resolvePinterestShortlink,
  fetchCreatorLatestPinsPidgets,
  fetchBoardSectionsResource
} from '../src/core/pinterest/index.mjs';
import {
  SYSTEM_RULES_USERNAME,
  getQualificationRules,
  updateQualificationRules,
  getCompetitorsOverview,
  listCompetitors
} from '../src/modules/creators/service.mjs';

function collectMjsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMjsFiles(full));
    } else if (entry.name.endsWith('.mjs')) {
      results.push(full);
    }
  }
  return results;
}

describe('Phase 2 Architecture & Refactor Contracts', () => {
  it('eliminates crawler-engine.mjs and all reverse ES module imports from src/ to scripts/', () => {
    assert.equal(fs.existsSync(path.resolve('scripts/crawler-engine.mjs')), false, 'scripts/crawler-engine.mjs must be deleted');

    const srcFiles = collectMjsFiles(path.resolve('src'));
    for (const filePath of srcFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const importRegex = /(?:from\s+['"][^'"]*scripts\/[^'"]*['"]|import\s*\(\s*['"][^'"]*scripts\/[^'"]*['"]\s*\))/g;
      const matches = content.match(importRegex);
      assert.equal(matches, null, `Reverse dependency detected in ${filePath}: ${matches?.join(', ')}`);
    }
  });

  it('modularizes src/core/pinterest/ with zero static undici imports and intact behavioral contracts', () => {
    const pinterestFiles = collectMjsFiles(path.resolve('src/core/pinterest'));
    assert.ok(pinterestFiles.length >= 5, 'Expected modular files under src/core/pinterest/');

    for (const filePath of pinterestFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      assert.equal(
        /from\s+['"]undici['"]/.test(content),
        false,
        `Static undici import forbidden in ${filePath}`
      );
    }

    assert.equal(typeof fetchPinFromPinterest, 'function');
    assert.equal(typeof fetchPinsBatchFromPidgets, 'function');
    assert.equal(typeof fetchUrlGlobalSaves, 'function');
    assert.equal(typeof resolvePinterestShortlink, 'function');
    assert.equal(typeof fetchCreatorLatestPinsPidgets, 'function');
    assert.equal(typeof fetchBoardSectionsResource, 'function');

    const canonical = canonicalizeArticleUrlForCount('https://example.com/recipe?utm_source=pinterest&amp;id=42#top');
    assert.equal(canonical, 'https://example.com/recipe?id=42');

    const formatted = formatPin({
      id: '1098245059167667976',
      title: 'Test Affiliate Pin',
      link: 'https://shop.example.com/item?utm_source=pin&aff_id=7',
      is_carousel: true,
      repin_count: 150,
      save_count: 250,
      closeupUnifiedAttribution: { name: 'Chef', followerCount: 42000 }
    });
    assert.equal(formatted.is_carousel, true);
    assert.equal(formatted.utm_link, 'https://shop.example.com/item?utm_source=pin&aff_id=7');
    assert.equal(formatted.creator_followers, 42000);

    const relayHtml = `<script>__PWS_RELAY_REGISTER_COMPLETED_REQUEST__("k", ${JSON.stringify({
      data: {
        v3GetPinQueryv2: {
          data: {
            id: '1098245059167667976',
            entityId: '1098245059167667976',
            title: 'Relay Pin',
            link: 'https://shop.example.com/item?utm_source=pin',
            isCarousel: true
          }
        }
      }
    })});</script>`;
    const extracted = extractPinData(relayHtml, '1098245059167667976');
    assert.equal(extracted.pin_id, '1098245059167667976');
    assert.equal(extracted.is_carousel, true);
  });

  it('persists global qualification rules on competitor_profiles.metadata and filters system profiles', async () => {
    const queries = [];
    const storedRules = {
      tier1_min_saves: 150,
      tier2_min_repins: 120,
      tier2_min_velocity: 4.5,
      tier2_max_age_days: 45,
      tier3_max_age_days: 10,
      tier3_min_saves: 30,
      master_ingest_enabled: true,
      early_stop_pages: 4,
      max_batch_pins: 600,
      discovery_max_pages: 250,
      refresh_max_pins: 100,
      paused_policy: 'reject'
    };

    const mockSql = async (strings, ...values) => {
      const q = Array.isArray(strings) ? strings.join('?') : String(strings);
      queries.push({ q, values });

      if (q.includes('SELECT metadata->\'global_qualification_rules\'')) {
        return [{ rules: storedRules, updated_at: '2026-11-12T00:00:00Z' }];
      }
      if (q.includes('INSERT INTO competitor_profiles') && q.includes('global_qualification_rules')) {
        return [{ rules: JSON.parse(values[1]), updated_at: '2026-11-12T01:00:00Z' }];
      }
      if (q.includes('FROM competitor_profiles')) {
        return [];
      }
      if (q.includes('FROM competitor_pins')) {
        return [{ qualified_count: 0, total_archived: 0, archived_saves: 0 }];
      }
      return [];
    };

    const fetched = await getQualificationRules(mockSql);
    assert.equal(fetched.tier1_min_saves, 150);
    assert.equal(fetched.tier2_min_velocity, 4.5);

    const updated = await updateQualificationRules(mockSql, { tier1_min_saves: 225 });
    assert.equal(updated.tier1_min_saves, 225);
    assert.ok(queries.some(item => item.values.includes(SYSTEM_RULES_USERNAME)));

    await getCompetitorsOverview(mockSql);
    await listCompetitors(mockSql, {});

    const profileQueries = queries.filter(item => item.q.includes('FROM competitor_profiles') && !item.q.includes('global_qualification_rules'));
    assert.ok(profileQueries.length >= 2);
    for (const item of profileQueries) {
      assert.ok(
        item.q.includes("COALESCE(account_type, 'competitor') <> 'system'"),
        `Missing system profile exclusion in query: ${item.q}`
      );
    }
  });

  it('dispatches unified API routes natively via Fastify plugin and rejects legacy aliases with 404', async () => {
    const mockSql = async (strings, ...values) => {
      const q = Array.isArray(strings) ? strings.join('?') : String(strings);
      if (q.includes('SELECT 1 as alive')) return [{ alive: 1 }];
      if (q.includes('FROM keyword_folders') && q.includes('f.id =')) {
        return [{ id: Number(values.find((v) => Number.isFinite(Number(v))) || 7), name: 'Unified Folder', color: '#ec4899', icon: 'folder', description: '', is_active: true, keyword_count: 1 }];
      }
      if (q.includes('FROM keyword_folder_items')) {
        return [{ id: 101, keyword: 'sourdough bread', category: 'General', target_pin_count: 50 }];
      }
      if (q.includes('SELECT metadata->\'global_qualification_rules\'')) {
        return [{ rules: { tier1_min_saves: 175, paused_policy: 'reject' }, updated_at: '2026-11-12T00:00:00Z' }];
      }
      if (q.includes('INSERT INTO competitor_profiles') && q.includes('global_qualification_rules')) {
        return [{ rules: JSON.parse(values[1]), updated_at: '2026-11-12T01:00:00Z' }];
      }
      return [];
    };

    const app = createFastifyApp({
      SQL_CLIENT: mockSql,
      NODE_ENV: 'test',
      ENVIRONMENT: 'test'
    });

    try {
      const healthRes = await app.inject({ method: 'GET', url: '/api/health' });
      assert.equal(healthRes.statusCode, 200);
      assert.equal(healthRes.json().server, 'node_native_pae_server');

      const crawlStatusRes = await app.inject({ method: 'GET', url: '/api/crawl-status' });
      assert.equal(crawlStatusRes.statusCode, 200);
      assert.equal(crawlStatusRes.json().mode, 'github_actions_pipeline');

      const folderQueryRes = await app.inject({ method: 'GET', url: '/api/folders?id=7' });
      assert.equal(folderQueryRes.statusCode, 200);
      const folderBody = folderQueryRes.json();
      assert.equal(folderBody.success, true);
      assert.equal(folderBody.folder.name, 'Unified Folder');

      const rulesGetRes = await app.inject({ method: 'GET', url: '/api/creators/rules' });
      assert.equal(rulesGetRes.statusCode, 200);
      assert.equal(rulesGetRes.json().rules.tier1_min_saves, 175);

      const rulesPostRes = await app.inject({
        method: 'POST',
        url: '/api/creators/rules',
        payload: { scope: 'global', tier1_min_saves: 250 }
      });
      assert.equal(rulesPostRes.statusCode, 200);
      assert.equal(rulesPostRes.json().rules.tier1_min_saves, 250);

      const legacyArchiveRes = await app.inject({ method: 'GET', url: '/api/pinarchive/rules' });
      assert.equal(legacyArchiveRes.statusCode, 404);

      const legacyFolderRes = await app.inject({ method: 'GET', url: '/api/keywords/folders' });
      assert.equal(legacyFolderRes.statusCode, 404);

      const legacyCampaignRes = await app.inject({ method: 'GET', url: '/api/campaign-folders' });
      assert.equal(legacyCampaignRes.statusCode, 404);
    } finally {
      await app.close();
    }
  });
});
