/**
 * Neon Multi-Project Fleet Service
 * Provides project registry querying and metrics aggregation.
 */

import { neon } from '@neondatabase/serverless';
import { getCompetitorsOverview, listCompetitors, formatMetric } from '../competitors/service.mjs';

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
    const masked = r.database_url ? r.database_url.replace(/:([^:@]+)@/, ':••••••••@') : '';
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
      ${database_url},
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
    RETURNING *;
  `;
  return row;
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

  const results = await Promise.allSettled(activeProjects.map(async (p) => {
    const pSql = p.is_hub ? sql : neon(p.database_url);
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
 * Synchronize a single competitor and its boards across all active fleet shards
 */
export async function syncCompetitorAcrossFleet(hubSql, competitorUsernameOrId) {
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

    const activeShards = await hubSql`
      SELECT project_id, project_name, database_url
      FROM neon_projects_registry
      WHERE NOT is_hub AND status = 'active' AND database_url IS NOT NULL;
    `;

    const tagsArray = Array.isArray(p.tags) ? p.tags : [];
    let syncedShards = 0;

    // Run across shards with bounded concurrency
    const BATCH = 5;
    for (let i = 0; i < activeShards.length; i += BATCH) {
      const chunk = activeShards.slice(i, i + BATCH);
      await Promise.allSettled(chunk.map(async (shard) => {
        try {
          const sSql = neon(shard.database_url);
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
              monthly_reach = EXCLUDED.monthly_reach,
              reach_delta_7d = EXCLUDED.reach_delta_7d,
              profile_views = EXCLUDED.profile_views,
              views_delta_7d = EXCLUDED.views_delta_7d,
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
            for (let bIdx = 0; bIdx < boards.length; bIdx += 25) {
              const bChunk = boards.slice(bIdx, bIdx + 25);
              await Promise.all(bChunk.map(b => sSql`
                INSERT INTO competitor_boards (
                  competitor_id, board_id, name, url, pin_count, follower_count,
                  last_pinned_at, metadata, updated_at
                ) VALUES (
                  ${targetCompId}, ${b.board_id}, ${b.name}, ${b.url},
                  ${b.pin_count || 0}, ${b.follower_count || 0},
                  ${b.last_pinned_at}, ${JSON.stringify(b.metadata || {})}::jsonb,
                  NOW()
                )
                ON CONFLICT (competitor_id, board_id) DO UPDATE SET
                  name = EXCLUDED.name,
                  url = EXCLUDED.url,
                  pin_count = EXCLUDED.pin_count,
                  follower_count = EXCLUDED.follower_count,
                  last_pinned_at = EXCLUDED.last_pinned_at,
                  metadata = EXCLUDED.metadata,
                  updated_at = NOW();
              `));
            }
          }
          syncedShards++;
        } catch (_) {}
      }));
    }

    return { ok: true, username: p.username, synced_shards: syncedShards, boards_count: boards.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Full fleet synchronization: synchronizes all competitor profiles and boards across all active Neon shards.
 */
export async function syncFleetDatabases(hubSql, { targetProjectId = null } = {}) {
  const profiles = await hubSql`SELECT * FROM competitor_profiles WHERE is_active = TRUE;`;
  const boards = await hubSql`SELECT * FROM competitor_boards;`;

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
        const sSql = neon(shard.database_url);

        // 1. Sync Profiles
        await Promise.all(profiles.map(p => {
          const tagsArray = Array.isArray(p.tags) ? p.tags : [];
          return sSql`
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
              monthly_reach = EXCLUDED.monthly_reach,
              reach_delta_7d = EXCLUDED.reach_delta_7d,
              profile_views = EXCLUDED.profile_views,
              views_delta_7d = EXCLUDED.views_delta_7d,
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
        }));

        // 2. Map Profile IDs
        const shardProfiles = await sSql`SELECT id, username FROM competitor_profiles;`;
        const userToId = new Map(shardProfiles.map(sp => [sp.username.toLowerCase(), sp.id]));

        // 3. Prepare Boards
        const validBoardItems = [];
        for (const b of boards) {
          if (!b.board_id) continue;
          const [hubP] = profiles.filter(p => p.id === b.competitor_id);
          const targetCompId = hubP ? userToId.get(hubP.username.toLowerCase()) : null;
          if (!targetCompId) continue;
          validBoardItems.push({
            competitor_id: targetCompId,
            board_id: b.board_id,
            name: b.name,
            url: b.url,
            pin_count: b.pin_count || 0,
            follower_count: b.follower_count || 0,
            last_pinned_at: b.last_pinned_at,
            metadata: JSON.stringify(b.metadata || {})
          });
        }

        // 4. Batch Sync Boards
        const CHUNK_SIZE = 25;
        for (let i = 0; i < validBoardItems.length; i += CHUNK_SIZE) {
          const chunk = validBoardItems.slice(i, i + CHUNK_SIZE);
          await Promise.all(chunk.map(item => sSql`
            INSERT INTO competitor_boards (
              competitor_id, board_id, name, url, pin_count, follower_count,
              last_pinned_at, metadata, updated_at
            ) VALUES (
              ${item.competitor_id}, ${item.board_id}, ${item.name}, ${item.url},
              ${item.pin_count}, ${item.follower_count},
              ${item.last_pinned_at}, ${item.metadata}::jsonb,
              NOW()
            )
            ON CONFLICT (competitor_id, board_id) DO UPDATE SET
              name = EXCLUDED.name,
              url = EXCLUDED.url,
              pin_count = EXCLUDED.pin_count,
              follower_count = EXCLUDED.follower_count,
              last_pinned_at = EXCLUDED.last_pinned_at,
              metadata = EXCLUDED.metadata,
              updated_at = NOW();
          `));
        }

        // 5. Update stats in neon_projects_registry on Hub
        const [cnt] = await sSql`SELECT COUNT(*)::int as c FROM competitor_profiles;`;
        const [bCnt] = await sSql`SELECT COUNT(*)::int as c FROM competitor_boards;`;
        await hubSql`
          UPDATE neon_projects_registry
          SET stats = jsonb_set(
            jsonb_set(
              jsonb_set(COALESCE(stats, '{}'::jsonb), '{competitors}', ${JSON.stringify(cnt.c)}::jsonb),
              '{boards}', ${JSON.stringify(bCnt.c)}::jsonb
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
    boards_count: boards.length
  };
}

