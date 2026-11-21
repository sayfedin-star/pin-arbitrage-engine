/**
 * src/modules/newborn/surfaces.mjs
 *
 * Pure Barrel for 8-Surface Pinterest 2026 Harvester Clients & Strict Zero-Cookie Hydrators.
 * Strict leaf-first DAG: surface-trends / surface-search-boards / surface-social-snowball /
 * surface-hydrators -> surface-normalizers (leaf). Zero circular dependencies.
 */

export {
  decodeHtmlEntities,
  extractPinAnnotationsDetailed,
  extractUsernameFromProfileUrl,
  formatPinterestBoardUrl,
  boardMatchesSeedQuery,
  parseBoardPath,
  parseSmartHuntInput,
  normalizeSurfaceCandidatePin,
  mergeCandidatePinRecords
} from './surface-normalizers.mjs';

export {
  resolveTrendsLatestAvailableDate,
  resolveIdeaPageIntelligence,
  resolveTrendsL1InterestId,
  harvestGrowingTrendsSurface,
  harvestZeroQueryPopularSurface
} from './surface-trends.mjs';

export {
  harvestPinSerpWithCapsulesSurface,
  harvestFreshBoardsSurface,
  harvestBoardFeedSurface,
  harvestBoardMoreIdeasSurface,
  harvestIdeasHubSurface
} from './surface-search-boards.mjs';

export {
  harvestHomeFeedSurface,
  extractPinsFromRelatedModulesPayload,
  harvestRelatedPinSnowballSurface
} from './surface-social-snowball.mjs';

export {
  pretriageCandidatesWithPidgets,
  hydratePinZeroCookie,
  hydrateUserZeroCookie
} from './surface-hydrators.mjs';
