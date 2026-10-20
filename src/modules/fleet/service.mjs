/**
 * Neon Multi-Project Fleet Service
 * Provides project registry querying and metrics aggregation.
 */

import { neon } from '@neondatabase/serverless';
import { getCompetitorsOverview, listCompetitors, formatMetric } from '../competitors/service.mjs';
import { getShardNumberForEntity, enforceNeonPoolerUrl } from '../sharding/fleet-router.mjs';
import { maskDatabaseUrl } from '../../utils.mjs';
export { enforceNeonPoolerUrl, maskDatabaseUrl };

export async function getFleetProjects(sql) {
  const rows = await sql`
    SELECT 
      id,
      project_id,
      project_name,
      region_id,
      database_url,
      status,
      is_hub,
      assigned_shards,
      stats,
      created_at,
      updated_at
    FROM neon_projects_registry
    ORDER BY is_hub DESC, id ASC;
  `;

  return rows.map(r => {
    const masked = maskDatabaseUrl(r.database_url);
    return {
      id: r.id,
      project_id: r.project_id,
      project_name: r.project_name,
      region_id: r.region_id,
      database_url: masked,
      masked_url: masked,
      status: r.status,
      is_hub: r.is_hub,
      assigned_shards: r.assigned_shards,
      stats: r.stats,
      created_at: r.created_at,
      updated_at: r.updated_at
    };
  });
}

export async function registerNewProject(sql, { project_id, project_name, database_url, region_id = 'aws-us-east-2', assigned_shards = [] }) {
  if (!project_id || !database_url) {
    throw new Error('project_id and database_url are required.');
  }
  let parsedDsn;
  try {
    parsedDsn = new URL(database_url);
  } catch (_) {
    throw new Error('Invalid database_url format.');
  }
  if (!/^postgres(?:ql)?:$/i.test(parsedDsn.protocol) || !parsedDsn.hostname.endsWith('.neon.tech')) {
    throw new Error('Security Policy Violation: Only *.neon.tech PostgreSQL endpoints are permitted.');
  }
  const pooledUrl = enforceNeonPoolerUrl(database_url.trim());
  const [row] = await sql`
    INSERT INTO neon_projects_registry (
      project_id,
      project_name,
      region_id,
      database_url,
      status,
      is_hub,
      assigned_shards,
      stats,
      updated_at
    ) VALUES (
      ${project_id},
      ${project_name || project_id},
      ${region_id},
      ${pooledUrl},
      'active',
      FALSE,
      ${assigned_shards},
      '{"seeds": 0, "candidates": 0, "storage_mb": 0}'::jsonb,
      NOW()
    )
    ON CONFLICT (project_id) DO UPDATE SET
      database_url = EXCLUDED.database_url,
      project_name = EXCLUDED.project_name,
      status = 'active',
      updated_at = NOW()
    RETURNING id, project_id, project_name, region_id, status, is_hub, assigned_shards, stats, created_at, updated_at;
  `;
  const masked = maskDatabaseUrl(pooledUrl);
  return { ...row, database_url: masked, masked_url: masked };
}

/**
 * Aggregates competitor intelligence KPIs and lists across all active fleet projects
 */
export async function getFleetCompetitors(sql, { account_type = 'all', search = '', limit = 50, offset = 0 } = {}) {
  const activeProjects = await sql`
    SELECT project_id, project_name, database_url, is_hub, stats
    FROM neon_projects_registry
    WHERE status = 'active' AND (
      is_hub = TRUE 
      OR stats IS NULL 
      OR (stats->>'competitors')::int > 0
    )
    ORDER BY is_hub DESC, id ASC;
  `;

  const CHUNK_SIZE = 5;
  const results = [];
  for (let i = 0; i < activeProjects.length; i += CHUNK_SIZE) {
    const chunk = activeProjects.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.allSettled(chunk.map(async (p) => {
      const pSql = p.is_hub ? sql : neon(enforceNeonPoolerUrl(p.database_url));
      const overview = await getCompetitorsOverview(pSql);
      let list = [];
      if (overview.tracked_profiles > 0) {
        list = await listCompetitors(pSql, { account_type, search, limit: 100, offset: 0 });
        list = list.map(item => ({
          ...item,
          _shard_name: p.project_name,
          _project_id: p.project_id
        }));
      }
      return { project: p, overview, list };
    }));
    results.push(...chunkResults);
  }

  let total_profiles = 0;
  let competitor_count = 0;
  let own_count = 0;
  let combined_reach = 0;
  let total_audience = 0;
  let pins_tracked = 0;
  let allCompetitors = [];
  let topCompetitor = null;
  let maxReach = -1;

  for (const res of results) {
    if (res.status === 'fulfilled') {
      const { overview, list } = res.value;
      total_profiles += overview.tracked_profiles || 0;
      competitor_count += overview.competitor_count || 0;
      own_count += overview.own_count || 0;
      combined_reach += overview.combined_reach || 0;
      total_audience += overview.total_audience || 0;
      pins_tracked += overview.pins_tracked || 0;
      allCompetitors.push(...list);
      for (const c of list) {
        if (Number(c.monthly_reach || 0) > maxReach) {
          maxReach = Number(c.monthly_reach || 0);
          topCompetitor = {
            handle: c.handle || `@${c.username}`,
            reach: formatMetric(c.monthly_reach, true)
          };
        }
      }
    }
  }

  allCompetitors.sort((a, b) => Number(b.monthly_reach || 0) - Number(a.monthly_reach || 0));

  const lim = Math.max(1, Math.min(isNaN(Number(limit)) ? 50 : Number(limit), 200));
  const off = Math.max(0, isNaN(Number(offset)) ? 0 : Number(offset));

  return {
    overview: {
      tracked_profiles: total_profiles,
      competitor_count,
      own_count,
      combined_reach,
      total_audience,
      pins_tracked,
      top_competitor: topCompetitor
    },
    competitors: allCompetitors.slice(off, off + lim)
  };
}

/**
 * Synchronizes competitor counts in neon_projects_registry stats for a specific project
 */
export async function syncProjectCompetitorStats(sql, targetSql, projectId) {
  if (!projectId) return;
  try {
    const [cnt] = await targetSql`SELECT COUNT(*)::int as c FROM competitor_profiles;`;
    if (projectId === 'hub' || projectId === 'weathered-band-34334459') {
      await sql`
        UPDATE neon_projects_registry 
        SET stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{competitors}', ${JSON.stringify(cnt.c)}::jsonb),
            updated_at = NOW()
        WHERE is_hub = TRUE;
      `;
    } else {
      await sql`
        UPDATE neon_projects_registry 
        SET stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{competitors}', ${JSON.stringify(cnt.c)}::jsonb),
            updated_at = NOW()
        WHERE project_id = ${projectId};
      `;
    }
  } catch (_) {}
}

/**
 * Synchronize a single competitor and its boards to its assigned fleet shard (or all shards if requested)
 * Hardened with:
 * - Single pa_pins pre-fetch (eliminates 99 redundant queries to Hub)
 * - Targeted Shard Replication: routes strictly to getShardNumberForEntity(username, 99) by default (1 shard connection)
 * - Safe fallback to replicateToAll when explicitly configured
 */
export async function syncCompetitorAcrossFleet(hubSql, competitorUsernameOrId, options = {}) {
  if (!competitorUsernameOrId) return { ok: false, error: 'competitor identifier required' };
  try {
    const cleanUser = String(competitorUsernameOrId).replace(/^@+/, '').trim().toLowerCase();
    const [p] = await hubSql`
      SELECT * FROM competitor_profiles 
      WHERE LOWER(username) = ${cleanUser} OR id::text = ${String(competitorUsernameOrId)} 
      LIMIT 1;
    `;
    if (!p) return { ok: false, error: 'Competitor profile not found on Hub' };

    const boards = await hubSql`
      SELECT * FROM competitor_boards WHERE competitor_id = ${p.id};
    `;

    // [INVARIANT: PA-PINS-CENTRAL-HUB-ONLY] pa_pins is exclusively maintained on Central Hub; zero shard replication.

    const tagsArray = Array.isArray(p.tags) ? p.tags : [];

    // 2. Resolve target shards: Targeted Shard Replication (Default) vs Fleet Replicate-All
    const replicateToAll = options.replicateToAll === true;
    let targetShards = [];

    if (replicateToAll) {
      targetShards = await hubSql`
        SELECT project_id, project_name, database_url
        FROM neon_projects_registry
        WHERE NOT is_hub AND status = 'active' AND database_url IS NOT NULL;
      `;
    } else {
      const assignedShardNum = options.targetShardId
        ? parseInt(options.targetShardId, 10)
        : getShardNumberForEntity(p.username, 99);
      const shardName = `pin-arbitrage-shard-${String(assignedShardNum).padStart(2, '0')}`;
      
      targetShards = await hubSql`
        SELECT project_id, project_name, database_url
        FROM neon_projects_registry
        WHERE project_name = ${shardName} AND status = 'active' AND database_url IS NOT NULL
        LIMIT 1;
      `;

      if (targetShards.length === 0) {
        targetShards = await hubSql`
          SELECT project_id, project_name, database_url
          FROM neon_projects_registry
          WHERE assigned_shards @> ARRAY[${assignedShardNum}]::int[] AND status = 'active' AND database_url IS NOT NULL
          LIMIT 1;
        `;
      }
    }

    if (targetShards.length === 0) {
      return { ok: true, username: p.username, synced_shards: 0, boards_count: boards.length, message: 'No target shard configured' };
    }

    let syncedShards = 0;

    const syncToShard = async (shard) => {
      try {
        const sSql = neon(enforceNeonPoolerUrl(shard.database_url));
        const [insertedP] = await sSql`
          INSERT INTO competitor_profiles (
            username, display_name, avatar_url, bio, website_url,
            account_type, monthly_reach, reach_delta_7d, profile_views,
            views_delta_7d, total_pins, total_boards, follower_count,
            following_count, activity_status, is_active, tags,
            metadata, last_harvest_metadata, last_synced_at, updated_at
          ) VALUES (
            ${p.username}, ${p.display_name}, ${p.avatar_url}, ${p.bio}, ${p.website_url},
            ${p.account_type || 'competitor'}, ${p.monthly_reach || 0}, ${p.reach_delta_7d || 0},
            ${p.profile_views || 0}, ${p.views_delta_7d || 0}, ${p.total_pins || 0},
            ${p.total_boards || 0}, ${p.follower_count || 0}, ${p.following_count || 0},
            ${p.activity_status || 'active'}, ${p.is_active},
            ${tagsArray},
            ${JSON.stringify(p.metadata || {})}::jsonb,
            ${JSON.stringify(p.last_harvest_metadata || {})}::jsonb,
            ${p.last_synced_at}, NOW()
          )
          ON CONFLICT (username) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            avatar_url = COALESCE(EXCLUDED.avatar_url, competitor_profiles.avatar_url),
            bio = COALESCE(EXCLUDED.bio, competitor_profiles.bio),
            website_url = COALESCE(EXCLUDED.website_url, competitor_profiles.website_url),
            monthly_reach = CASE WHEN EXCLUDED.monthly_reach > 0 THEN EXCLUDED.monthly_reach ELSE competitor_profiles.monthly_reach END,
            reach_delta_7d = CASE WHEN EXCLUDED.monthly_reach > 0 THEN EXCLUDED.reach_delta_7d ELSE competitor_profiles.reach_delta_7d END,
            profile_views = CASE WHEN EXCLUDED.profile_views > 0 THEN EXCLUDED.profile_views ELSE competitor_profiles.profile_views END,
            views_delta_7d = CASE WHEN EXCLUDED.profile_views > 0 THEN EXCLUDED.views_delta_7d ELSE competitor_profiles.views_delta_7d END,
            total_pins = EXCLUDED.total_pins,
            total_boards = EXCLUDED.total_boards,
            follower_count = EXCLUDED.follower_count,
            following_count = EXCLUDED.following_count,
            activity_status = EXCLUDED.activity_status,
            is_active = EXCLUDED.is_active,
            tags = EXCLUDED.tags,
            metadata = EXCLUDED.metadata,
            last_harvest_metadata = EXCLUDED.last_harvest_metadata,
            last_synced_at = EXCLUDED.last_synced_at,
            updated_at = NOW()
          RETURNING id;
        `;

        const targetCompId = insertedP?.id;
        if (targetCompId && boards.length > 0) {
          const boardRecords = boards.map(b => ({
            competitor_id: targetCompId,
            board_id: String(b.board_id),
            name: b.name || 'Untitled Board',
            url: b.url || '',
            pin_count: Number(b.pin_count || 0),
            follower_count: Number(b.follower_count || 0),
            last_pinned_at: b.last_pinned_at ? new Date(b.last_pinned_at).toISOString() : null,
            metadata: b.metadata || {}
          }));

          await sSql`
            INSERT INTO competitor_boards (
              competitor_id, board_id, name, url, pin_count, follower_count,
              last_pinned_at, metadata, updated_at
            )
            SELECT
              x.competitor_id,
              x.board_id,
              x.name,
              x.url,
              x.pin_count,
              x.follower_count,
              x.last_pinned_at::timestamptz,
              x.metadata,
              NOW()
            FROM jsonb_to_recordset(${JSON.stringify(boardRecords)}::jsonb) AS x(
              competitor_id int,
              board_id varchar,
              name text,
              url text,
              pin_count int,
              follower_count int,
              last_pinned_at text,
              metadata jsonb
            )
            ON CONFLICT (competitor_id, board_id) DO UPDATE SET
              name = EXCLUDED.name,
              url = EXCLUDED.url,
              pin_count = EXCLUDED.pin_count,
              follower_count = EXCLUDED.follower_count,
              last_pinned_at = EXCLUDED.last_pinned_at,
              metadata = EXCLUDED.metadata,
              updated_at = NOW();
          `;

          // Purge any synthetic duplicate boards on shard
          await sSql`
            DELETE FROM competitor_boards
            WHERE competitor_id = ${targetCompId}
              AND board_id LIKE 'cb-%'
              AND EXISTS (
                SELECT 1 FROM competitor_boards auth
                WHERE auth.competitor_id = competitor_boards.competitor_id
                  AND auth.board_id NOT LIKE 'cb-%'
                  AND LOWER(TRIM(auth.name)) = LOWER(TRIM(competitor_boards.name))
              );
          `.catch(() => {});
        }

        // [INVARIANT: PA-PINS-CENTRAL-HUB-ONLY] pa_pins is maintained exclusively on Central Hub; zero shard replication.

        syncedShards++;
      } catch (sErr) {
        console.warn(`[syncCompetitorAcrossFleet] Warning on shard ${shard.project_name}:`, sErr.message);
      }
    };

    // Run across target shards with bounded concurrency
    const BATCH = 5;
    for (let i = 0; i < targetShards.length; i += BATCH) {
      const chunk = targetShards.slice(i, i + BATCH);
      await Promise.allSettled(chunk.map(syncToShard));
    }

    return {
      ok: true,
      username: p.username,
      synced_shards: syncedShards,
      boards_count: boards.length,
      mode: replicateToAll ? 'replicate_all' : 'targeted_shard'
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Full fleet synchronization: synchronizes all competitor profiles, boards,
 * archived pins, metrics, qualification rules, and topic cluster RPC across all active Neon shards.
 */
export async function syncFleetDatabases(hubSql, { targetProjectId = null } = {}) {
  const profiles = await hubSql`SELECT * FROM competitor_profiles WHERE is_active = TRUE;`;
  const boards = await hubSql`SELECT * FROM competitor_boards;`;
  const [rules] = await hubSql`SELECT * FROM pa_qualification_rules WHERE id = 1;`;
  const [{ count: pinsCount }] = await hubSql`SELECT COUNT(*)::int AS count FROM pa_pins;`.catch(() => [{ count: 0 }]);
  // [INVARIANT: ZERO-HUB-SNAPSHOTS] pa_pin_metrics is eradicated from Hub.
  const metricsCount = 0;

  let query = hubSql`
    SELECT project_id, project_name, database_url
    FROM neon_projects_registry
    WHERE NOT is_hub AND status = 'active' AND database_url IS NOT NULL
  `;
  if (targetProjectId) {
    query = hubSql`
      SELECT project_id, project_name, database_url
      FROM neon_projects_registry
      WHERE NOT is_hub AND (project_id = ${targetProjectId} OR project_name = ${targetProjectId}) AND database_url IS NOT NULL
    `;
  }
  const shards = await query;
  let successfulShards = 0;
  const SHARD_BATCH = 5;

  for (let sIdx = 0; sIdx < shards.length; sIdx += SHARD_BATCH) {
    const shardChunk = shards.slice(sIdx, sIdx + SHARD_BATCH);
    await Promise.allSettled(shardChunk.map(async (shard) => {
      try {
        const sSql = neon(enforceNeonPoolerUrl(shard.database_url));

        // 0. Ensure schema compatibility on target shard
        await sSql`ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS is_product BOOLEAN DEFAULT FALSE;`.catch(() => {});
        await sSql`ALTER TABLE competitor_pins ADD COLUMN IF NOT EXISTS alt_text TEXT;`.catch(() => {});
        await sSql`ALTER TABLE pa_pins ADD COLUMN IF NOT EXISTS alt_text TEXT;`.catch(() => {});

        // 1. Sync Profiles in batch via jsonb_to_recordset
        if (profiles.length > 0) {
          const profilePayload = profiles.map(p => ({
            username: p.username,
            display_name: p.display_name || '',
            avatar_url: p.avatar_url || '',
            bio: p.bio || '',
            website_url: p.website_url || '',
            account_type: p.account_type || 'competitor',
            monthly_reach: Number(p.monthly_reach || 0),
            reach_delta_7d: Number(p.reach_delta_7d || 0),
            profile_views: Number(p.profile_views || 0),
            views_delta_7d: Number(p.views_delta_7d || 0),
            total_pins: Number(p.total_pins || 0),
            total_boards: Number(p.total_boards || 0),
            follower_count: Number(p.follower_count || 0),
            following_count: Number(p.following_count || 0),
            activity_status: p.activity_status || 'active',
            is_active: Boolean(p.is_active),
            tags: Array.isArray(p.tags) ? p.tags : [],
            metadata: JSON.stringify(p.metadata || {}),
            last_harvest_metadata: JSON.stringify(p.last_harvest_metadata || {}),
            last_synced_at: p.last_synced_at ? new Date(p.last_synced_at).toISOString() : null
          }));

          await sSql`
            INSERT INTO competitor_profiles (
              username, display_name, avatar_url, bio, website_url,
              account_type, monthly_reach, reach_delta_7d, profile_views,
              views_delta_7d, total_pins, total_boards, follower_count,
              following_count, activity_status, is_active, tags,
              metadata, last_harvest_metadata, last_synced_at, updated_at
            )
            SELECT
              x.username, x.display_name, x.avatar_url, x.bio, x.website_url,
              x.account_type, x.monthly_reach, x.reach_delta_7d, x.profile_views,
              x.views_delta_7d, x.total_pins, x.total_boards, x.follower_count,
              x.following_count, x.activity_status, x.is_active, x.tags,
              x.metadata::jsonb, x.last_harvest_metadata::jsonb, x.last_synced_at::timestamptz, NOW()
            FROM jsonb_to_recordset(${JSON.stringify(profilePayload)}::jsonb) AS x(
              username text, display_name text, avatar_url text, bio text, website_url text,
              account_type text, monthly_reach bigint, reach_delta_7d bigint, profile_views bigint,
              views_delta_7d bigint, total_pins int, total_boards int, follower_count int,
              following_count int, activity_status text, is_active boolean, tags text[],
              metadata text, last_harvest_metadata text, last_synced_at text
            )
            ON CONFLICT (username) DO UPDATE SET
              display_name = EXCLUDED.display_name,
              avatar_url = COALESCE(EXCLUDED.avatar_url, competitor_profiles.avatar_url),
              bio = COALESCE(EXCLUDED.bio, competitor_profiles.bio),
              website_url = COALESCE(EXCLUDED.website_url, competitor_profiles.website_url),
              monthly_reach = CASE WHEN EXCLUDED.monthly_reach > 0 THEN EXCLUDED.monthly_reach ELSE competitor_profiles.monthly_reach END,
              reach_delta_7d = CASE WHEN EXCLUDED.monthly_reach > 0 THEN EXCLUDED.reach_delta_7d ELSE competitor_profiles.reach_delta_7d END,
              profile_views = CASE WHEN EXCLUDED.profile_views > 0 THEN EXCLUDED.profile_views ELSE competitor_profiles.profile_views END,
              views_delta_7d = CASE WHEN EXCLUDED.profile_views > 0 THEN EXCLUDED.views_delta_7d ELSE competitor_profiles.views_delta_7d END,
              total_pins = EXCLUDED.total_pins,
              total_boards = EXCLUDED.total_boards,
              follower_count = EXCLUDED.follower_count,
              following_count = EXCLUDED.following_count,
              activity_status = EXCLUDED.activity_status,
              is_active = EXCLUDED.is_active,
              tags = EXCLUDED.tags,
              metadata = EXCLUDED.metadata,
              last_harvest_metadata = EXCLUDED.last_harvest_metadata,
              last_synced_at = EXCLUDED.last_synced_at,
              updated_at = NOW();
          `;
        }

        // 2. Map Profile IDs
        const shardProfiles = await sSql`SELECT id, username FROM competitor_profiles;`;
        const userToId = new Map(shardProfiles.map(sp => [sp.username.toLowerCase(), sp.id]));
        const hubProfileById = new Map(profiles.map(p => [p.id, p]));

        // 3. Prepare Boards
        const validBoardItems = [];
        for (const b of boards) {
          if (!b.board_id) continue;
          const hubP = hubProfileById.get(b.competitor_id);
          const targetCompId = hubP ? userToId.get(hubP.username.toLowerCase()) : null;
          if (!targetCompId) continue;
          validBoardItems.push({
            competitor_id: targetCompId,
            board_id: b.board_id,
            name: b.name || '',
            url: b.url || '',
            pin_count: b.pin_count || 0,
            follower_count: b.follower_count || 0,
            last_pinned_at: b.last_pinned_at ? new Date(b.last_pinned_at).toISOString() : null,
            metadata: JSON.stringify(b.metadata || {})
          });
        }

        // 4. Batch Sync Boards via jsonb_to_recordset
        if (validBoardItems.length > 0) {
          const CHUNK_SIZE = 100;
          for (let i = 0; i < validBoardItems.length; i += CHUNK_SIZE) {
            const chunk = validBoardItems.slice(i, i + CHUNK_SIZE);
            await sSql`
              INSERT INTO competitor_boards (
                competitor_id, board_id, name, url, pin_count, follower_count,
                last_pinned_at, metadata, updated_at
              )
              SELECT
                x.competitor_id, x.board_id, x.name, x.url, x.pin_count, x.follower_count,
                x.last_pinned_at::timestamptz, x.metadata::jsonb, NOW()
              FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS x(
                competitor_id int, board_id text, name text, url text, pin_count int, follower_count int,
                last_pinned_at text, metadata text
              )
              ON CONFLICT (competitor_id, board_id) DO UPDATE SET
                name = EXCLUDED.name,
                url = EXCLUDED.url,
                pin_count = EXCLUDED.pin_count,
                follower_count = EXCLUDED.follower_count,
                last_pinned_at = EXCLUDED.last_pinned_at,
                metadata = EXCLUDED.metadata,
                updated_at = NOW();
            `;
          }
        }

        // Purge any synthetic duplicate boards on shard and recount distinct boards
        await sSql`
          DELETE FROM competitor_boards
          WHERE board_id LIKE 'cb-%'
            AND EXISTS (
              SELECT 1 FROM competitor_boards auth
              WHERE auth.competitor_id = competitor_boards.competitor_id
                AND auth.board_id NOT LIKE 'cb-%'
                AND LOWER(TRIM(auth.name)) = LOWER(TRIM(competitor_boards.name))
            );
        `.catch(() => {});

        await sSql`
          UPDATE competitor_profiles cp
          SET total_boards = (
            SELECT count(DISTINCT LOWER(TRIM(name)))::int 
            FROM competitor_boards cb 
            WHERE cb.competitor_id = cp.id
          ),
          updated_at = NOW()
          WHERE EXISTS (SELECT 1 FROM competitor_boards WHERE competitor_id = cp.id);
        `.catch(() => {});

        // 5. Ensure Topic Clusters RPC function
        await sSql`
          CREATE OR REPLACE FUNCTION pa_topic_clusters_page(
            p_min_pins INT DEFAULT 1,
            p_search TEXT DEFAULT NULL,
            p_limit INT DEFAULT 50,
            p_offset INT DEFAULT 0
          )
          RETURNS TABLE (
            topic_name TEXT,
            pins_count BIGINT,
            total_saves NUMERIC,
            avg_saves BIGINT,
            avg_velocity NUMERIC
          )
          LANGUAGE plpgsql AS $$
          BEGIN
            RETURN QUERY
            WITH extracted AS (
              SELECT
                CASE
                  WHEN jsonb_typeof(ann) = 'object' THEN trim(ann->>'name')
                  WHEN jsonb_typeof(ann) = 'string' THEN trim(ann #>> '{}')
                  ELSE NULL
                END AS raw_topic,
                p.pin_id,
                p.saves,
                p.velocity
              FROM pa_pins p,
              LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.annotations) = 'array' THEN p.annotations ELSE '[]'::jsonb END) AS ann
              WHERE (
                (jsonb_typeof(ann) = 'object' AND ann->>'name' IS NOT NULL AND trim(ann->>'name') <> '')
                OR
                (jsonb_typeof(ann) = 'string' AND trim(ann #>> '{}') <> '')
              )
            ),
            aggregated AS (
              SELECT
                e.raw_topic AS t_name,
                count(DISTINCT e.pin_id)::BIGINT AS p_count,
                coalesce(sum(e.saves), 0)::NUMERIC AS s_saves,
                CASE WHEN count(DISTINCT e.pin_id) > 0 THEN (coalesce(sum(e.saves), 0) / count(DISTINCT e.pin_id))::BIGINT ELSE 0::BIGINT END AS a_saves,
                round(avg(e.velocity), 2) AS a_velocity
              FROM extracted e
              WHERE (p_search IS NULL OR p_search = '' OR e.raw_topic ILIKE '%' || p_search || '%')
              GROUP BY e.raw_topic
              HAVING count(DISTINCT e.pin_id) >= coalesce(p_min_pins, 1)
            )
            SELECT
              a.t_name AS topic_name,
              a.p_count AS pins_count,
              a.s_saves AS total_saves,
              a.a_saves AS avg_saves,
              a.a_velocity AS avg_velocity
            FROM aggregated a
            ORDER BY a.s_saves DESC
            LIMIT coalesce(p_limit, 50)
            OFFSET coalesce(p_offset, 0);
          END;
          $$;
        `;

        // 6. Sync Qualification Rules
        if (rules) {
          await sSql`
            INSERT INTO pa_qualification_rules (
              id, tier1_min_saves, tier2_min_repins, tier3_max_age_days, tier3_min_saves,
              master_ingest_enabled, early_stop_pages, max_batch_pins, discovery_max_pages, refresh_max_pins, paused_policy, updated_at
            ) VALUES (
              1, ${rules.tier1_min_saves}, ${rules.tier2_min_repins}, ${rules.tier3_max_age_days}, ${rules.tier3_min_saves},
              ${rules.master_ingest_enabled}, ${rules.early_stop_pages}, ${rules.max_batch_pins}, ${rules.discovery_max_pages},
              ${rules.refresh_max_pins || 0}, ${rules.paused_policy || 'reject'}, NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
              tier1_min_saves = EXCLUDED.tier1_min_saves,
              tier2_min_repins = EXCLUDED.tier2_min_repins,
              tier3_max_age_days = EXCLUDED.tier3_max_age_days,
              tier3_min_saves = EXCLUDED.tier3_min_saves,
              master_ingest_enabled = EXCLUDED.master_ingest_enabled,
              updated_at = NOW();
          `;
        }

        // [INVARIANT: PA-PINS-CENTRAL-HUB-ONLY] pa_pins is maintained exclusively on Central Hub; zero shard replication.

        // 9. Update stats in neon_projects_registry on Hub
        const [cnt] = await sSql`SELECT COUNT(*)::int as c FROM competitor_profiles;`;
        const [bCnt] = await sSql`SELECT COUNT(*)::int as c FROM competitor_boards;`;
        const [pCnt] = await sSql`SELECT COUNT(*)::int as c FROM universal_master_pins;`.catch(() => [{ c: 0 }]);
        await hubSql`
          UPDATE neon_projects_registry
          SET stats = jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(COALESCE(stats, '{}'::jsonb), '{competitors}', ${JSON.stringify(cnt.c)}::jsonb),
                '{boards}', ${JSON.stringify(bCnt.c)}::jsonb
              ),
              '{pins}', ${JSON.stringify(pCnt.c)}::jsonb
            ),
            '{last_fleet_sync}', ${JSON.stringify(new Date().toISOString())}::jsonb
          ),
          updated_at = NOW()
          WHERE project_id = ${shard.project_id};
        `;

        successfulShards++;
      } catch (err) {
        console.warn(`[syncFleetDatabases] Error syncing shard ${shard.project_name}:`, err.message);
      }
    }));
  }

  return {
    ok: true,
    total_shards: shards.length,
    successful_shards: successfulShards,
    profiles_count: profiles.length,
    boards_count: boards.length,
    pins_count: Number(pinsCount || 0),
    metrics_count: Number(metricsCount || 0)
  };
}

/**
 * Ping a specific fleet shard to measure live roundtrip database latency.
 */
export async function pingFleetProject(hubSql, projectId) {
  if (!projectId) throw new Error('project_id is required.');
  const [proj] = await hubSql`
    SELECT id, project_id, project_name, database_url, status
    FROM neon_projects_registry
    WHERE project_id = ${projectId}
    LIMIT 1;
  `;
  if (!proj) {
    throw new Error(`Project ${projectId} not found in fleet registry.`);
  }

  const start = performance.now();
  const shardSql = neon(enforceNeonPoolerUrl(proj.database_url));
  await shardSql`SELECT 1;`;
  const latencyMs = Math.round(performance.now() - start);

  return {
    ok: true,
    project_id: proj.project_id,
    project_name: proj.project_name,
    latency_ms: latencyMs,
    status: 'active'
  };
}

/**
 * Retrieve clean database connection URL for authorized fleet administration.
 */
export async function getFleetProjectUrl(hubSql, projectId, { allowUnmasked = false } = {}) {
  if (!projectId) throw new Error('project_id is required.');
  const [proj] = await hubSql`
    SELECT id, project_id, project_name, database_url
    FROM neon_projects_registry
    WHERE project_id = ${projectId} OR id::text = ${String(projectId)}
    LIMIT 1;
  `;
  if (!proj) {
    throw new Error(`Project ${projectId} not found in fleet registry.`);
  }
  const maskedUrl = maskDatabaseUrl(proj.database_url);
  return {
    ok: true,
    project_id: proj.project_id,
    project_name: proj.project_name,
    database_url: allowUnmasked ? proj.database_url : maskedUrl,
    database_url_masked: maskedUrl
  };
}


