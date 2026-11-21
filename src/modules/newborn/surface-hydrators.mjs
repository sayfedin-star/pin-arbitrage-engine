/**
 * src/modules/newborn/surface-hydrators.mjs
 *
 * Strict Zero-Cookie Pidgets Pre-Triage, PinResource Hydrator, and UserResource Hydrator.
 */

import { Semaphore, chunkArray } from '../../utils.mjs';
import {
  parseCleanMetric,
  safeString,
  sanitizeDestinationUrl,
  normalizeDomain,
  findPinInTree
} from '../../core/pinterest/pins.mjs';
import { isValidPinId } from '../../http/security-and-response.mjs';
import { extractPwsInitialProps } from './cookie-router.mjs';
import {
  extractUsernameFromProfileUrl,
  formatPinterestBoardUrl,
  normalizeSurfaceCandidatePin
} from './surface-normalizers.mjs';

/**
 * 50x Batch Pre-Triage via `widgets.pinterest.com/v3/pidgets/pins/info/` (STRICT ZERO-COOKIE,
 * parallelized with Semaphore(6) so 5,000 pins finish in ~3.5s!).
 * Extracts `repin_count`, explicit `saves` (keeping `save_count = null` when omitted),
 * board context, and `pinner.username` via `pinner.profile_url`.
 */
export async function pretriageCandidatesWithPidgets(
  pinIds,
  router,
  { concurrency = 6, onBatchProgress = null, signal = null } = {}
) {
  const uniqueIds = Array.from(new Set((pinIds || []).map((id) => String(id || '').trim()).filter(isValidPinId)));
  const enrichmentMap = new Map();
  if (uniqueIds.length === 0) return enrichmentMap;

  const slices = chunkArray(uniqueIds, 50);
  const sem = new Semaphore(Math.max(1, Math.min(8, Number(concurrency) || 6)));
  let completedBatches = 0;

  await Promise.all(
    slices.map((slice) => sem.run(async () => {
      if (signal?.aborted) return;
      const requestedSliceSet = new Set(slice);
      const url = `https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${slice.join(',')}`;
      const res = await router.requestJson(url, {
        endpointKey: 'pidgets',
        referer: 'https://www.pinterest.com/',
        signal
      });

      completedBatches++;
      if (!res.ok || !res.data) {
        if (typeof onBatchProgress === 'function' && (completedBatches % 5 === 0 || completedBatches === slices.length)) {
          await onBatchProgress({ completedBatches, totalBatches: slices.length, enrichedCount: enrichmentMap.size });
        }
        return;
      }

      const rawList = Array.isArray(res.data?.data) ? res.data.data : (res.data?.data?.pins || []);

      for (const p of rawList) {
        const pid = String(p?.id || '').trim();
        if (!isValidPinId(pid) || !requestedSliceSet.has(pid)) continue;

        const pinnerUsername = extractUsernameFromProfileUrl(p.pinner?.profile_url || '', p.pinner?.username || '');
        const nativeCreatorUsername = extractUsernameFromProfileUrl(p.native_creator?.profile_url || '', p.native_creator?.username || '');
        const rawSaves =
          p.aggregated_pin_data?.aggregated_stats?.saves ??
          p.aggregated_stats?.saves ??
          p.save_count ??
          null;
        const saveCount = rawSaves !== null && rawSaves !== undefined
          ? parseCleanMetric(rawSaves, null, { preserveCeiling: true })
          : null;

        const rawRepins = p.repin_count ?? p.repins ?? null;
        const repinCount = rawRepins !== null && rawRepins !== undefined
          ? parseCleanMetric(rawRepins, null, { preserveCeiling: true })
          : null;

        const rawLink = safeString(p.link || p.rich_metadata?.url || '');
        const destUrl = sanitizeDestinationUrl(rawLink);
        const dom = normalizeDomain(p.domain || '', destUrl);
        const isLinkless = Boolean(
          !destUrl ||
          !dom ||
          ['uploaded by user', 'uploaded by pinner', 'pinterest.com', 'www.pinterest.com', 'pin.it'].includes(dom.toLowerCase())
        );

        const standardImg =
          p.images?.['736x']?.url ||
          p.images?.['564x']?.url ||
          p.images?.['236x']?.url ||
          '';

        const effectiveCreator = nativeCreatorUsername || pinnerUsername || null;
        const originPinRaw = String(p.origin_pin?.id ?? p.originPin?.id ?? '').trim();
        const originPinId = isValidPinId(originPinRaw) ? originPinRaw : null;

        enrichmentMap.set(pid, {
          pin_id: pid,
          origin_pin_id: originPinId,
          title: safeString(p.title || p.rich_metadata?.title || ''),
          description: safeString(p.description || ''),
          image_url: standardImg,
          dominant_color: p.dominant_color || '#888888',
          destination_url: destUrl || null,
          clean_domain: isLinkless ? null : dom,
          is_linkless: isLinkless,
          pinner_username: pinnerUsername || null,
          pinner_full_name: safeString(p.pinner?.full_name || '') || null,
          pinner_followers: p.pinner?.follower_count !== undefined && p.pinner?.follower_count !== null
            ? parseCleanMetric(p.pinner.follower_count, null, { preserveCeiling: true, cap: 0 })
            : null,
          origin_creator_username: nativeCreatorUsername || null,
          effective_creator_username: effectiveCreator,
          effective_creator_followers: p.pinner?.follower_count !== undefined && p.pinner?.follower_count !== null
            ? parseCleanMetric(p.pinner.follower_count, null, { preserveCeiling: true, cap: 0 })
            : null,
          is_repin: Boolean(
            (originPinId && originPinId !== pid) ||
            (nativeCreatorUsername && pinnerUsername && nativeCreatorUsername !== pinnerUsername)
          ),
          board_id: safeString(p.board?.id || '') || null,
          board_name: safeString(p.board?.name || '') || null,
          board_url: formatPinterestBoardUrl(p.board?.url || ''),
          board_pin_count: p.board?.pin_count !== undefined && p.board?.pin_count !== null
            ? parseCleanMetric(p.board.pin_count, null, { preserveCeiling: true, cap: 0 })
            : null,
          board_follower_count: p.board?.follower_count !== undefined && p.board?.follower_count !== null
            ? parseCleanMetric(p.board.follower_count, null, { preserveCeiling: true, cap: 0 })
            : null,
          save_count: saveCount,
          has_explicit_saves: saveCount !== null,
          repin_count: repinCount,
          has_explicit_repins: repinCount !== null,
          is_video: Boolean(p.is_video || p.videos),
          // CRITICAL: Pidgets lacks `created_at` and root canonical check — NEVER mark is_hydrated = true!
          is_hydrated: false
        });
      }

      if (typeof onBatchProgress === 'function' && (completedBatches % 5 === 0 || completedBatches === slices.length)) {
        await onBatchProgress({ completedBatches, totalBatches: slices.length, enrichedCount: enrichmentMap.size });
      }
    }))
  );

  return enrichmentMap;
}

/**
 * Strict Zero-Cookie `PinResource/get` Hydrator (`hydratePinZeroCookie`).
 * NEVER sends `_auth=1` — preserves `pin_join.visual_annotation` & `annotations_with_links`,
 * authentic root `created_at` (defeating the Child Repin fake-age trap by hydrating
 * `canonical_pin_id` whenever `is_repin === true` or canonical differs from `pin_id`),
 * upload provenance, and `pinner` vs `origin_pinner` separation.
 */
export async function hydratePinZeroCookie(
  pinId,
  router,
  { _depth = 0, rootPinCache = null, nowMs = Date.now(), resolveRootPin = false, signal = null } = {}
) {
  const cleanId = String(pinId || '').trim();
  if (!isValidPinId(cleanId)) return { ok: false, pin_id: cleanId, pin: null, error: 'invalid_pin_id' };

  const sourceUrl = `/pin/${cleanId}/`;
  const dataParam = encodeURIComponent(JSON.stringify({
    options: {
      id: cleanId,
      field_set_key: 'detailed',
      fetch_visual_search_objects: false
    },
    context: {}
  }));
  const url = `https://www.pinterest.com/resource/PinResource/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${dataParam}`;

  const res = await router.requestJson(url, {
    endpointKey: 'pin_resource',
    sourceUrl,
    handler: 'www/pin/[id].js',
    signal
  });

  let rawPin = res.data?.resource_response?.data || res.data?.data || null;

  // Fallback to zero-cookie SSR __PWS_INITIAL_PROPS__ if PinResource failed
  if ((!rawPin || typeof rawPin !== 'object') && !signal?.aborted) {
    const ssrRes = await router.requestJson(`https://www.pinterest.com/pin/${cleanId}/`, {
      endpointKey: 'ssr_page_zero_cookie',
      isDocumentHtml: true,
      referer: 'https://www.pinterest.com/',
      signal
    });
    if (ssrRes.ok && typeof ssrRes.data === 'string') {
      const props = extractPwsInitialProps(ssrRes.data);
      rawPin = findPinInTree(props, cleanId);
    }
  }

  if (!rawPin || typeof rawPin !== 'object') {
    return {
      ok: false,
      status: res.status || 404,
      pin_id: cleanId,
      pin: null,
      error: res.error || 'pin_not_found'
    };
  }

  const normalized = normalizeSurfaceCandidatePin(
    { ...rawPin, id: cleanId },
    { surface: 'pin_resource', is_hydrated: true }
  );

  if (!normalized) {
    return { ok: false, status: 422, pin_id: cleanId, pin: null, error: 'invalid_pin_payload' };
  }

  // Wave 6E Direct Age Mode (default `resolveRootPin === false`):
  // Trust the pin's own `created_at_pinterest` and `repin_count` directly without extra `PinResource/get`
  // root-unwrapping calls. Opt-in legacy root unwrapping runs ONLY when `resolveRootPin === true`.
  if (_depth === 0 && resolveRootPin === true) {
    const explicitOrigin = (normalized.origin_pin_id && normalized.origin_pin_id !== cleanId)
      ? normalized.origin_pin_id
      : null;
    const needsRootUnwrap = Boolean(normalized.is_repin || explicitOrigin);
    const explicitCanonical = (needsRootUnwrap && normalized.canonical_pin_id && normalized.canonical_pin_id !== cleanId)
      ? normalized.canonical_pin_id
      : null;
    const repinFallbackCanonical = (needsRootUnwrap && !explicitOrigin && !explicitCanonical && normalized.aggregated_pin_data_id && normalized.aggregated_pin_data_id !== cleanId)
      ? normalized.aggregated_pin_data_id
      : null;
    const rootTargetId = explicitOrigin || explicitCanonical || repinFallbackCanonical;

    if (needsRootUnwrap && rootTargetId) {
      let rootRes = rootPinCache?.get?.(rootTargetId) || null;
      if (!rootRes) {
        rootRes = await hydratePinZeroCookie(rootTargetId, router, {
          _depth: 1,
          rootPinCache,
          nowMs,
          resolveRootPin: false,
          signal
        });
        if (rootPinCache && typeof rootPinCache.set === 'function') {
          rootPinCache.set(rootTargetId, rootRes);
        }
      }

      const rootPin = rootRes?.ok ? rootRes.pin : null;
      if (rootPin && rootPin.created_at_pinterest) {
        const childMs = normalized.created_at_pinterest ? Date.parse(normalized.created_at_pinterest) : NaN;
        const rootMs = Date.parse(rootPin.created_at_pinterest);
        const trueCreatedMs = Number.isFinite(childMs) && Number.isFinite(rootMs)
          ? Math.min(childMs, rootMs)
          : rootMs;
        if (Number.isFinite(trueCreatedMs)) {
          normalized.created_at_pinterest = new Date(trueCreatedMs).toISOString();
          normalized.age_days = Math.max(0.05, Math.round(((nowMs - trueCreatedMs) / 86_400_000) * 10) / 10);
          normalized.root_pin_id = rootTargetId;
          normalized.canonical_pin_id = rootTargetId;
          normalized.root_age_verified = true;
          normalized.is_repin = true;

          // Unwrap root pin metrics, annotations, and metadata so board repin gems never lose root Re-pins or annotations!
          if (rootPin.repin_count !== null && rootPin.repin_count !== undefined) {
            normalized.repin_count = normalized.repin_count !== null && normalized.repin_count !== undefined
              ? Math.max(Number(normalized.repin_count), Number(rootPin.repin_count))
              : Number(rootPin.repin_count);
            normalized.has_explicit_repins = true;
          }
          if (rootPin.save_count !== null && rootPin.save_count !== undefined) {
            normalized.save_count = normalized.save_count !== null && normalized.save_count !== undefined
              ? Math.max(Number(normalized.save_count), Number(rootPin.save_count))
              : Number(rootPin.save_count);
            normalized.has_explicit_saves = true;
          }
          if (Array.isArray(rootPin.visual_annotations) && rootPin.visual_annotations.length > 0) {
            const mergedAnns = new Map();
            for (const a of [...(normalized.visual_annotations || []), ...rootPin.visual_annotations]) {
              const name = String(typeof a === 'string' ? a : (a?.name || '')).trim();
              if (!name) continue;
              const k = name.toLowerCase();
              if (!mergedAnns.has(k)) mergedAnns.set(k, typeof a === 'string' ? { name, url: null, idea_id: null } : { ...a });
            }
            normalized.visual_annotations = Array.from(mergedAnns.values()).slice(0, 25);
          }
          if (!normalized.title && rootPin.title) normalized.title = rootPin.title;
          if (!normalized.image_url && rootPin.image_url) normalized.image_url = rootPin.image_url;
          if (!normalized.destination_url && rootPin.destination_url) {
            normalized.destination_url = rootPin.destination_url;
            normalized.clean_domain = rootPin.clean_domain;
            normalized.is_linkless = rootPin.is_linkless;
          }
          if (!normalized.origin_creator_username && (rootPin.origin_creator_username || rootPin.pinner_username)) {
            normalized.origin_creator_username = rootPin.origin_creator_username || rootPin.pinner_username;
            normalized.origin_creator_full_name = rootPin.origin_creator_full_name || rootPin.pinner_full_name || normalized.origin_creator_full_name;
            normalized.origin_creator_followers = rootPin.origin_creator_followers ?? rootPin.pinner_followers ?? normalized.origin_creator_followers;
            normalized.effective_creator_username = normalized.origin_creator_username;
            normalized.effective_creator_followers = normalized.origin_creator_followers ?? normalized.effective_creator_followers;
          }
        } else {
          normalized.root_age_verified = false;
          normalized.created_at_pinterest = null;
          normalized.age_days = null;
          normalized.repin_root_unverified = true;
        }
      } else {
        // Root creation date could NOT be verified — invalidate fake child repin timestamp!
        normalized.root_age_verified = false;
        normalized.created_at_pinterest = null;
        normalized.age_days = null;
        normalized.repin_root_unverified = true;
      }
    } else if (needsRootUnwrap) {
      // Child repin with no canonical/origin root pin ID — cannot verify original root creation date!
      normalized.root_age_verified = false;
      normalized.created_at_pinterest = null;
      normalized.age_days = null;
      normalized.repin_root_unverified = true;
    } else {
      normalized.root_pin_id = cleanId;
      normalized.root_age_verified = Boolean(normalized.created_at_pinterest);
    }
  } else {
    normalized.root_pin_id = cleanId;
    normalized.root_age_verified = Boolean(normalized.created_at_pinterest);
    normalized.repin_root_unverified = false;
  }

  // Mark hydrated after PinResource/get completed
  normalized.is_hydrated = true;

  return {
    ok: true,
    status: 200,
    pin_id: cleanId,
    pin: normalized
  };
}

/**
 * Strict Zero-Cookie `UserResource/get` Hydrator (`hydrateUserZeroCookie`).
 * Maps `profile_reach` -> `monthly_reach` (`total_audience`) and `profile_views` -> `profile_views` (`impressions`),
 * preserving `10,000,001` (`10M+` ceiling indicator).
 */
export async function hydrateUserZeroCookie(username, router, { signal = null } = {}) {
  const cleanUser = extractUsernameFromProfileUrl('', username);
  if (!cleanUser) {
    return { ok: false, username: '', user: null, error: 'invalid_username' };
  }

  const sourceUrl = `/${cleanUser}/`;
  const dataParam = encodeURIComponent(JSON.stringify({
    options: { username: cleanUser, field_set_key: 'profile' },
    context: {}
  }));
  const url = `https://www.pinterest.com/resource/UserResource/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${dataParam}`;

  const res = await router.requestJson(url, {
    endpointKey: 'user_resource',
    sourceUrl,
    handler: 'www/[username]/index.js',
    signal
  });

  let data = res.data?.resource_response?.data || res.data?.data || null;

  if ((!data || typeof data !== 'object') && !signal?.aborted) {
    const ssrRes = await router.requestJson(`https://www.pinterest.com/${cleanUser}/`, {
      endpointKey: 'ssr_page_zero_cookie',
      isDocumentHtml: true,
      referer: 'https://www.pinterest.com/',
      signal
    });
    if (ssrRes.ok && typeof ssrRes.data === 'string') {
      const props = extractPwsInitialProps(ssrRes.data);
      const usersMap = props?.initialReduxState?.users || props?.props?.initialReduxState?.users || {};
      for (const u of Object.values(usersMap)) {
        if (u && typeof u === 'object' && String(u.username || '').toLowerCase() === cleanUser) {
          data = u;
          break;
        }
      }
    }
  }

  if (!data || typeof data !== 'object') {
    return { ok: false, status: res.status || 404, username: cleanUser, user: null, error: res.error || 'user_not_found' };
  }

  const followerCount = parseCleanMetric(data.follower_count ?? 0, 0, { preserveCeiling: true, cap: 0 });
  const monthlyReach = parseCleanMetric(data.profile_reach ?? data.monthly_reach ?? data.reach ?? 0, 0, { preserveCeiling: true, cap: 0 });
  const profileViews = parseCleanMetric(data.profile_views ?? data.monthly_views ?? 0, 0, { preserveCeiling: true, cap: 0 });
  const pinCount = parseCleanMetric(data.pin_count ?? data.total_pins ?? 0, 0, { preserveCeiling: true, cap: 0 });
  const boardCount = parseCleanMetric(data.board_count ?? data.total_boards ?? 0, 0, { preserveCeiling: true, cap: 0 });
  const websiteUrl = sanitizeDestinationUrl(data.website_url || data.domain_url || '') || null;
  const rawDom = websiteUrl ? normalizeDomain('', websiteUrl) : '';
  const cleanDomain = (rawDom && !['uploaded by user', 'pinterest.com', 'www.pinterest.com'].includes(rawDom.toLowerCase()))
    ? rawDom
    : null;

  let accountCreatedAt = null;
  if (data.created_at) {
    const d = new Date(data.created_at);
    if (!Number.isNaN(d.getTime())) accountCreatedAt = d.toISOString();
  }

  return {
    ok: true,
    status: 200,
    username: cleanUser,
    user: {
      username: cleanUser,
      display_name: safeString(data.full_name || cleanUser),
      avatar_url: data.image_xlarge_url || data.image_large_url || data.image_medium_url || null,
      website_url: websiteUrl,
      clean_domain: cleanDomain,
      follower_count: followerCount,
      monthly_reach: monthlyReach,
      total_audience: monthlyReach,
      profile_views: profileViews,
      impressions: profileViews,
      pin_count: pinCount,
      board_count: boardCount,
      account_created_at: accountCreatedAt,
      is_verified_merchant: Boolean(data.is_verified_merchant)
    }
  };
}
