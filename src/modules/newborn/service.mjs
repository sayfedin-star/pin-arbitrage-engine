/**
 * src/modules/newborn/service.mjs
 *
 * Pure Barrel for `/newborn` Domain Services.
 * Strict one-way DAG: run-queue -> orchestrator -> promotions; queries & launchpad independent.
 * Preserves single-instance reference identity for `newbornBackgroundQueue` and exact public exports.
 */

export {
  SURFACES_CATALOG, VALID_UPLOAD_PROVENANCE, OFFICIAL_L1_INTERESTS,
  SUPPORTED_TREND_TYPES, SUPPORTED_TREND_COUNTRIES,
  getNewbornSettings, updateNewbornSettings, patchNewbornSettings, resetNewbornSettings,
  evaluateAutomationSchedule,
  listNewbornRuleProfiles, getNewbornRuleProfile, createNewbornRuleProfile,
  updateNewbornRuleProfile, deleteNewbornRuleProfile, resolveEffectiveNewbornSettings,
  getNewbornCookieStatus, saveNewbornCookie, clearNewbornCookie
} from './settings.mjs';

export {
  decodeHtmlEntities,
  extractPinAnnotationsDetailed,
  parseSmartHuntInput,
  resolveIdeaPageIntelligence
} from './surfaces.mjs';

export {
  buildNewbornKeywordCluster,
  enrichClusterRemainingVolumes,
  listNewbornKeywordClusters,
  getNewbornKeywordClusterById
} from './cluster-builder.mjs';

export {
  promoteNewbornCandidates,
  promoteNewbornRookies
} from './promotions.mjs';

export {
  runNewbornDiscovery,
  runNewbornSnowball,
  pollNewbornWatchlist,
  runNewbornAutoCycle
} from './orchestrator.mjs';

export {
  newbornBackgroundQueue,
  clearNewbornInflightRunsForTest,
  buildNewbornDedupeKey,
  getInMemoryRunProgress,
  getNewbornRunById,
  enqueueNewbornRun,
  cancelNewbornRun,
  createFleetBackedNewbornRun
} from './run-queue.mjs';

export {
  getNewbornOverview, listNewbornCandidates, getNewbornCandidateDossier,
  updateNewbornCandidateStage, deleteNewbornCandidate,
  listNewbornRookies, listNewbornRuns, listNewbornDailyAnchors,
  getNewbornCrossoverReport
} from './queries.mjs';

export {
  getNewbornLaunchpadFeed,
  refreshNewbornLaunchpadFeed,
  getNewbornIdeaPageIntelligence,
  fetchNewbornCandidateAccounts
} from './launchpad.mjs';
