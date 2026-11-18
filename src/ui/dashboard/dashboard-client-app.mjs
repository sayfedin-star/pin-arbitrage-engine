/**
 * Alpine Application Data Store (dashboardApp)
 * Composed incrementally with specialized client subsystems:
 * - dashboard-client-intersections.mjs: Candidate filtering, Pixie resonance & lightbox
 * - dashboard-client-archive-rules.mjs: Fleet views, PinArchive & qualification rules
 * - dashboard-client-seeds.mjs: Seed selection, bulk ingestion, crawl & workflow dispatch
 */

import { getDashboardIntersectionsMethods } from './dashboard-client-intersections.mjs';
import { getDashboardArchiveRulesMethods } from './dashboard-client-archive-rules.mjs';
import { getDashboardSeedComputedProperties, getDashboardSeedActionMethods } from './dashboard-client-seeds.mjs';

import { getDashboardCreatorsFleetMethods, getDashboardCreatorsDossierMethods } from './dashboard-client-creators.mjs';
import { getDashboardBoardsAndPinMethods } from './dashboard-client-boards.mjs';
export function getDashboardClientAppScript({ safeFolderId = '' } = {}) {
  return `  <script>
    function dashboardApp() {
      return {
        _hasInitialized: false,
        creatorDiscoveryFilter: 'all',
        isDark: (() => {
          try {
            return typeof localStorage !== 'undefined' ? (localStorage.getItem('pa_theme') || localStorage.getItem('pin_theme')) === 'dark' : false;
          } catch (_) { return false; }
        })(),
        darkMode: (() => {
          try {
            return typeof localStorage !== 'undefined' ? (localStorage.getItem('pa_theme') || localStorage.getItem('pin_theme')) === 'dark' : false;
          } catch (_) { return false; }
        })(),
        toggleTheme() {
          this.isDark = !this.isDark;
          this.darkMode = this.isDark;
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('pa_theme', this.isDark ? 'dark' : 'light');
              localStorage.setItem('pin_theme', this.isDark ? 'dark' : 'light');
            }
          } catch (_) {}
          if (typeof document !== 'undefined' && document.documentElement) {
            if (this.isDark) {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
          }
        },
        isAssignExistingCreatorModalOpen: false,
        assignCreatorSearch: '',
        openAssignExistingCreatorModal() {
          this.assignCreatorSearch = '';
          this.isAssignExistingCreatorModalOpen = true;
          this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
        },
        closeAssignExistingCreatorModal() {
          this.isAssignExistingCreatorModalOpen = false;
        },
        isSidebarCollapsed: (() => {
          try {
            return typeof localStorage !== 'undefined' ? localStorage.getItem('pae_sidebar_collapsed') === 'true' : false;
          } catch (_) { return false; }
        })(),
        toggleSidebar() {
          this.isSidebarCollapsed = !this.isSidebarCollapsed;
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('pae_sidebar_collapsed', this.isSidebarCollapsed ? 'true' : 'false');
            }
          } catch (_) {}
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },
        currentTab: (() => {
          if (typeof window !== 'undefined') {
            const segs = (window.location.pathname || '').split('/').filter(Boolean);
            const f = (segs[0] || '').toLowerCase();
            if (f === 'accounts' || f === 'creators' || f === 'pinarchive' || (f === 'folders' && (segs[2] || '').toLowerCase() === 'creators')) return 'creators_archive';
            if (f === 'related-pins' || f === 'related_pins' || f === 'seeds' || f === 'intersections') return 'related_pins';
            if (f === 'fleet') return 'overview';
            if (f && !['api', 'fleet', 'settings', 'admin', 'health', 'favicon.ico', 'robots.txt', 'index.html', 'assets', 'static', 'pin', 'related_pins', 'related-pins', 'intersections', 'archive', 'explorer', 'accounts', 'creators', 'pinarchive', 'board-idea', 'board-ideas', 'keywords', 'overview', 'home', 'dashboard', 'domains'].includes(f)) {
              return 'creators_archive';
            }
          }
          return '${safeFolderId}' ? 'creators_archive' : 'overview';
        })(),
        scopedFolderId: '${safeFolderId}',
        activeFolderId: '${safeFolderId}',
        activeFolder: null,
        crossoverData: null,
        folderFilter: '${safeFolderId}',
        vaultScope: 'high_signal',
        foldersList: [],
        folderCreatorMap: {},
        scopedFolderCreatorIds: null,
        openFolderMenuId: null,
        isMobileMenuOpen: false,
        isLoading: false,
        isAddSeedOpen: false,
        isDossierOpen: false,
        copiedField: null,
        toastMessage: null,
        toastType: 'success',
        _toastTimer: null,
        isOverviewLoaded: false,

        // Related Pins Hub Sub-Tab State
        relatedSubTab: 'seeds',

        // Dedicated Pin Detail Page State (Route: /pin/:id)
        activePinId: null,
        activePinDossier: null,
        isLoadingPinDossier: false,
        pinDossierTimeframe: '7d',
        pinDossierSnapshots: [],
        previousPinPath: null,
        isPinDossierOpen: false,

        // Dedicated Board Detail Page State (Route: /:username/:board)
        activeBoardName: null,
        activeBoard: null,
        activeBoardCreator: null,
        boardPins: [],
        boardWinningPins: [],
        boardPinsTotal: 0,
        boardPinsSearch: '',
        boardPinsFilter: 'all',
        boardPinsSort: 'saves_desc',
        boardPinsViewMode: 'grid',
        boardPinsPage: 1,
        boardPinsPageSize: 24,
        isLoadingBoardPins: false,

        // Unified Creator Intelligence & PinArchive State
        creatorSubTab: 'creators',
        isCreatorDossierOpen: false,
        activeCreator: null,
        activeCreatorTab: 'overview',
        activeCreatorDetail: null,
        activeCreatorSnapshots: [],
        activeCreatorBoards: [],
        activeCreatorPins: [],
        activeCreatorTopics: [],
        activeCreatorSelectedTopic: '',
        creatorTopicSearch: '',
        isCreatorLoading: false,
        isLoadingBoards: false,

        // All Account Pins State (Raw Inventory)
        activeCreatorAllPins: [],
        activeCreatorAllPinsTotal: 0,
        activeCreatorCatalogTotal: 0,
        activeCreatorExternalPinsTotal: 0,
        activeCreatorCuratorPinsTotal: 0,
        activeCreatorEcosystemTotal: 0,
        activeCreatorWinningPinsTotal: 0,
        activeCreatorRankedTotal: 0,
        activeCreatorHighVelocityTotal: 0,
        activeCreatorAllPinsPage: 1,
        activeCreatorAllPinsTotalPages: 1,
        activeCreatorAllPinsBoards: [],
        creatorAllPinsLimit: 100,
        _creatorsReqSeq: 0,
        creatorAllPinSearch: '',
        creatorAllPinBoard: '',
        creatorAllPinMinSaves: 0,
        creatorAllPinSort: 'saves_desc',
        creatorAllPinQualifiedOnly: false,
        creatorAllPinArticlesOnly: false,
        creatorAllPinRankedOnly: false,
        creatorAllPinStage: '',
        creatorAllPinHighVelocity: false,
        creatorAllPinChangedOnly: false,
        creatorAllPinScope: 'official',
        creatorTopUrlScope: 'ecosystem',
        isLoadingAllPins: false,
        isHarvestingAllPins: false,
        isDispatchingGitHubCrawl: false,

        // Master Pin Ledger Columns Customization State
        masterColumnDefinitions: [
          { key: 'media', label: 'Media / Thumbnail', required: false },
          { key: 'title', label: 'Pin Title & Destination', required: true },
          { key: 'board', label: 'Board', required: false },
          { key: 'saves', label: 'Saves (with 24h Δ)', required: false },
          { key: 'repins', label: 'Repins (with 24h Δ)', required: false },
          { key: 'status', label: 'Status Badges', required: false },
          { key: 'created_at', label: 'Created / Discovered', required: false },
          { key: 'actions', label: 'Actions', required: false }
        ],
        visibleMasterColumns: {
          media: true,
          title: true,
          board: true,
          saves: true,
          repins: true,
          status: true,
          created_at: true,
          actions: true
        },
        toggleMasterColumn(key) {
          if (key === 'title') return;
          this.visibleMasterColumns[key] = !this.visibleMasterColumns[key];
          try {
            localStorage.setItem('creator_master_visible_columns', JSON.stringify(this.visibleMasterColumns));
          } catch (_) {}
        },
        resetMasterColumns() {
          this.visibleMasterColumns = {
            media: true,
            title: true,
            board: true,
            saves: true,
            repins: true,
            status: true,
            created_at: true,
            actions: true
          };
          try {
            localStorage.removeItem('creator_master_visible_columns');
          } catch (_) {}
        },

        // Top Destination URLs State
        activeCreatorTopUrls: [],
        creatorTopUrlsTotal: 0,
        creatorTopUrlsPage: 1,
        creatorTopUrlsTotalPages: 1,
        creatorTopUrlSearch: '',
        creatorTopUrlSort: 'saves_desc',
        creatorTopUrlFilterType: 'all',
        isLoadingTopUrls: false,

        // Account-Scoped Related Pins & Intersections Radar State
        creatorRelatedSeeds: [],
        creatorRelatedIntersections: [],
        creatorRelatedStats: {
          total_seeds: 0,
          total_nodes: 0,
          unique_candidates: 0,
          self_retention_nodes: 0,
          rival_leakage_nodes: 0,
          retention_rate_pct: 0,
          leakage_rate_pct: 0,
          total_intersections: 0
        },
        isLoadingRelatedGraph: false,
        creatorRelatedMinOverlap: 2,
        creatorRelatedFilter: 'all',
        creatorRelatedPage: 1,
        creatorRelatedTotalPages: 1,
        creatorRelatedLimit: 25,
        creatorRelatedSearch: '',
        isBulkAddSeedsModalOpen: false,
        bulkAddSeedsInput: '',
        isAddingSeeds: false,
        isHarvestingRelated: false,

        // Per-Account Qualification Rules State
        creatorRules: {
          tier1_min_saves: 100,
          tier2_min_repins: 100,
          tier3_fresh_days: 14,
          tier3_min_saves: 25,
          articles_only: true,
          auto_pipeline: true,
          max_pages: 500,
          early_stop_pages: 3
        },
        isSavingCreatorRules: false,
        isReEvaluatingCreatorPins: false,
        reEvaluateMessage: '',

        // Time Range & Performance Trend
        creatorTimeRange: '7D',
        creatorSelectedMonth: 'all',
        creatorMoMMode: false,
        creatorMoMBaseMonth: '',
        creatorMoMTargetMonth: '',
        creatorChartMode: 'reach',
        selectedCreatorPinIds: [],
        isPinSelected(pinId) {
          if (!pinId) return false;
          return this.selectedCreatorPinIds.includes(String(pinId));
        },
        togglePinSelection(pinId) {
          if (!pinId) return;
          const s = String(pinId);
          const idx = this.selectedCreatorPinIds.indexOf(s);
          if (idx >= 0) {
            this.selectedCreatorPinIds.splice(idx, 1);
          } else {
            this.selectedCreatorPinIds.push(s);
          }
        },
        selectAllCurrentPins(pinsList) {
          if (!Array.isArray(pinsList)) return;
          for (const p of pinsList) {
            const pid = String(p.pin_id || p.id || '');
            if (pid && !this.selectedCreatorPinIds.includes(pid)) {
              this.selectedCreatorPinIds.push(pid);
            }
          }
        },
        clearSelectedCreatorPins() {
          this.selectedCreatorPinIds = [];
        },

        // Snapshot Log Table State
        creatorSnapNumFmt: 'full',
        creatorSnapDensity: 'compact',
        creatorSnapTimeframe: '7',
        creatorSnapPage: 1,
        creatorSnapColVisible: { reach: true, views: true, pins: true },
        isSnapColsOpen: false,

        // Board Strategy Table & Grid State
        creatorBoardSearch: '',
        creatorBoardSort: 'most_pins',
        creatorBoardPage: 1,
        creatorBoardsViewMode: 'grid',
        creatorBoardSelectedTopic: '',
        creatorBoardPageSize: 12,

        // All Pins Archive Section State (Image 3)
        creatorPinViewMode: 'table',
        creatorPinPace: '24h',
        creatorPinSearch: '',
        creatorPinBoard: '',
        creatorPinStage: '',
        creatorPinSavesFilter: '',
        creatorPinSort: 'delta_saves',
        creatorPinChangedOnly: false,
        creatorPinLimit: 25,
        creatorPinPage: 1,
        creatorPinColVisible: { board: true, saves: true, repins: true, velocity: true },
        isPinColsOpen: false,
        isGasDataEnabled: true,

        // Cookie & Session State
        isCookieModalOpen: false,
        cookieInput: '',
        isSavingCookie: false,
        cookieStatus: { has_cookie: false, preview: null },

        // Auto-Promote & Breakout Rules State
        isAutoPromoteModalOpen: false,
        isSavingAutoPromote: false,
        autoPromoteForm: {
          auto_promote_enabled: true,
          auto_promote_delta_24h: 25000,
          auto_promote_delta_7d: 100000,
          auto_harvest_pins: true,
          max_pins_harvest: 25,
          qualification_rules: {
            min_saves: 500,
            min_velocity: 10.0
          }
        },

        // Raw JSON Ingestion Modal State
        isRawJsonModalOpen: false,
        rawJsonTargetPin: '',
        rawJsonInput: '',
        isSubmittingRawJson: false,
        rawJsonStatusMsg: '',
        rawJsonIsError: false,

        // Data Stores
        overview: {},
        seeds: [],
        intersections: [],

        // Tab 4: Competitor Intelligence State
        competitorsOverview: { tracked_profiles: 0, combined_reach: 0, total_audience: 0, pins_tracked: 0 },
        competitors: [],
        competitorFilter: 'all',
        competitorSearch: '',
        competitorPage: 1,
        competitorPageSize: 50,
        competitorSort: 'audience_desc',
        _competitorsCacheKey: '',
        _cachedFilteredCompetitors: null,
        _loadingFolderCreatorsKey: null,
        _loadingFolderCreatorsPromise: null,

        // Visual Feed & Board Sections Modals
        isVisualFeedModalOpen: false,
        visualFeedUser: null,
        visualFeedUsername: '',
        visualFeedPins: [],
        isVisualFeedLoading: false,

        isBoardSectionsModalOpen: false,
        boardSectionsTitle: '',
        boardSectionsBoardId: '',
        isLoadingBoardSections: false,
        boardSectionsList: [],

        _creatorAllPinsAbortController: null,
        _creatorAllPinsReqSeq: 0,
        bulkPulseCustomLabel: '',
        isBulkPulseTracking: false,
        folderCompetitorTotalsData: null,
        selectedCompetitorIds: [],
        isBulkFastRefreshing: false,
        isBulkDiscoveringCatalog: false,
        isBulkAuditSweeping: false,
        fastRefreshingCompetitorId: null,
        discoveringCatalogCompetitorId: null,
        auditSweepingCompetitorId: null,
        pulsingCreatorId: null,
        harvestingCreatorId: null,
        isAddCompetitorModalOpen: false,
        newCompetitorHandle: '',
        newCompetitorAlsoTrack: true,
        newCompetitorDiscoverPins: true,
        newCompetitorDiscoverMode: 'deep',
        newCompetitorMaxPages: 500,
        newCompetitorAutoArchiveWinning: true,
        newCompetitorInterval: 'daily',
        isSubmittingCreator: false,

        // Tab 5: Keyword Velocity State
        keywords: [],
        keywordSearch: '',
        isAddKeywordModalOpen: false,
        newKeywordText: '',
        newKeywordCategory: 'General',
        isKeywordPinsOpen: false,
        activeKeyword: null,
        activeKeywordPins: [],
        isLoadingKeywordPins: false,

        get filteredKeywords() {
          let list = this.keywords || [];
          if (this.keywordSearch) {
            const q = this.keywordSearch.toLowerCase().trim();
            list = list.filter(k => (k.keyword && k.keyword.toLowerCase().includes(q)) || (k.category && k.category.toLowerCase().includes(q)));
          }
          return list;
        },

        _clientCache: {
          creators: new Map(),
          boards: new Map(),
          pins: new Map()
        },

        // Tab 6: PinArchive & Topic Clusters State
        pinarchiveOverview: { total_pins: 0, total_saves: 0, total_repins: 0, avg_velocity: 0, tracked_accounts: 0, top_cluster: null },
        pinarchiveTopics: [],
        pinarchivePins: [],
        pinarchiveTopicSearch: '',
        pinarchiveSearch: '',
        pinarchiveMinSaves: 0,
        pinarchiveSort: 'saves',
        pinarchiveSelectedTopic: '',
        pinarchiveSelectedAccount: '',
        pinarchiveViewMode: 'grid',
        isLoadingPinArchive: false,

        // Pin Qualification & Ingest Rules State
        qualificationRules: {
          tier1_min_saves: 100,
          tier2_min_repins: 100,
          tier3_max_age_days: 14,
          tier3_min_saves: 25,
          cron_enabled: true,
          early_stop_pages: 3,
          discovery_max_pages: 500
        },
        isRulesCollapsed: false,
        isSavingRules: false,
        isReEvaluating: false,
        harvestingCompetitorId: null,

        // Competitor Boards Modal State
        isBoardsModalOpen: false,
        activeBoardsCompetitor: null,
        competitorBoardsList: [],
        isSyncingBoards: false,

        // GitHub Actions 20-Runner Crawler & Board Partitioning Modal State
        isGhaCrawlerModalOpen: false,
        ghaTargetAccount: '',
        ghaCrawlMode: 'discovery',
        ghaMaxPages: '500',
        ghaBoardScope: 'all',
        ghaTargetBoards: [],
        ghaBoardSearch: '',

        get filteredGhaBoards() {
          const boards = this.activeCreatorBoards || [];
          if (!this.ghaBoardSearch.trim()) return boards;
          const q = this.ghaBoardSearch.toLowerCase().trim();
          return boards.filter(b => (b.name || '').toLowerCase().includes(q) || String(b.board_id || '').includes(q));
        },

        get filteredCompetitors() {
          const rawList = this.competitors || [];
          const fid = String(this.scopedFolderId || this.folderFilter || '').trim();
          const linkedSize = fid ? ((this.scopedFolderId ? this.scopedFolderCreatorIds?.size : this.folderCreatorMap[fid]?.size) || 0) : 0;
          const firstId = rawList.length > 0 ? (rawList[0].id || rawList[0].username || '') : '';
          const firstReach = rawList.length > 0 ? (rawList[0].monthly_reach || 0) : 0;
          const lastId = rawList.length > 1 ? (rawList[rawList.length - 1].id || rawList[rawList.length - 1].username || '') : '';
          const cacheKey = [rawList.length, firstId, firstReach, lastId, this.competitorFilter, fid, linkedSize, this.creatorDiscoveryFilter, this.vaultScope, (this.competitorSearch || '').trim().toLowerCase(), this.competitorSort].join(':');
          if (this._competitorsCacheKey === cacheKey && Array.isArray(this._cachedFilteredCompetitors)) {
            return this._cachedFilteredCompetitors;
          }

          let list = rawList;
          if (this.competitorFilter && this.competitorFilter !== 'all') {
            if (this.competitorFilter === 'paused') {
              list = list.filter(c => c.is_active === false);
            } else if (this.competitorFilter === 'active') {
              list = list.filter(c => c.is_active !== false);
            } else {
              list = list.filter(c => c.account_type === this.competitorFilter);
            }
          }
          if (this.scopedFolderId || this.folderFilter) {
            const linkedSet = (this.scopedFolderId ? this.scopedFolderCreatorIds : this.folderCreatorMap[fid]) || new Set();
            // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 7: Room 3 Creator Hub Discovery Filter
            if (this.creatorDiscoveryFilter === 'tracked') {
              list = list.filter(c => c.is_linked || c.is_tracked || linkedSet.has(Number(c.id || c.competitor_id)));
            } else if (this.creatorDiscoveryFilter === 'discovered' || this.creatorDiscoveryFilter === 'auto_discovered') {
              list = list.filter(c => !c.is_linked && !c.is_tracked && !linkedSet.has(Number(c.id || c.competitor_id)));
            }
          }
          if (this.competitorSearch) {
            const q = this.competitorSearch.toLowerCase().replace('@', '').trim();
            if (q) {
              list = list.filter(c => (c.username && c.username.toLowerCase().includes(q)) || (c.display_name && c.display_name.toLowerCase().includes(q)) || (c.custom_label && c.custom_label.toLowerCase().includes(q)));
            }
          }

          const sortMode = this.competitorSort || 'audience_desc';
          const tieBreak = (a, b) => {
            const pDiff = (Number(b.pin_count) || 0) - (Number(a.pin_count) || 0);
            if (pDiff !== 0) return pDiff;
            const sDiff = (Number(b.top_pin_saves) || 0) - (Number(a.top_pin_saves) || 0);
            if (sDiff !== 0) return sDiff;
            return (Number(b.follower_count) || 0) - (Number(a.follower_count) || 0);
          };
          list = [...list].sort((a, b) => {
            if (sortMode === 'gain_24h_desc') {
              const dA = Number(a.delta_reach_24h ?? a.delta_24h ?? 0);
              const dB = Number(b.delta_reach_24h ?? b.delta_24h ?? 0);
              if (dB !== dA) return dB - dA;
              const rDiff = (Number(b.monthly_reach) || 0) - (Number(a.monthly_reach) || 0);
              return rDiff !== 0 ? rDiff : tieBreak(a, b);
            }
            if (sortMode === 'gain_7d_desc') {
              const dA = Number(a.reach_delta_7d ?? 0);
              const dB = Number(b.reach_delta_7d ?? 0);
              if (dB !== dA) return dB - dA;
              const rDiff = (Number(b.monthly_reach) || 0) - (Number(a.monthly_reach) || 0);
              return rDiff !== 0 ? rDiff : tieBreak(a, b);
            }
            if (sortMode === 'impressions_desc') {
              const vDiff = (Number(b.profile_views) || 0) - (Number(a.profile_views) || 0);
              return vDiff !== 0 ? vDiff : tieBreak(a, b);
            }
            if (sortMode === 'impressions_24h_desc') {
              const vA = Number(a.delta_views_24h ?? 0);
              const vB = Number(b.delta_views_24h ?? 0);
              if (vB !== vA) return vB - vA;
              const vDiff = (Number(b.profile_views) || 0) - (Number(a.profile_views) || 0);
              return vDiff !== 0 ? vDiff : tieBreak(a, b);
            }
            if (sortMode === 'impressions_7d_desc') {
              const vA = Number(a.views_delta_7d ?? 0);
              const vB = Number(b.views_delta_7d ?? 0);
              if (vB !== vA) return vB - vA;
              const vDiff = (Number(b.profile_views) || 0) - (Number(a.profile_views) || 0);
              return vDiff !== 0 ? vDiff : tieBreak(a, b);
            }
            if (sortMode === 'pins_desc') {
              return (Number(b.total_pins) || 0) - (Number(a.total_pins) || 0);
            }
            const rDiff = (Number(b.monthly_reach) || 0) - (Number(a.monthly_reach) || 0);
            return rDiff !== 0 ? rDiff : tieBreak(a, b);
          });

          this._competitorsCacheKey = cacheKey;
          this._cachedFilteredCompetitors = list;
          return list;
        },

        get totalCompetitorPages() {
          const list = this.filteredCompetitors || [];
          const size = this.competitorPageSize || 25;
          return Math.max(1, Math.ceil(list.length / size));
        },

        get paginatedCompetitors() {
          const list = this.filteredCompetitors || [];
          const size = this.competitorPageSize || 25;
          const page = Math.min(Math.max(1, this.competitorPage || 1), this.totalCompetitorPages);
          const start = (page - 1) * size;
          return list.slice(start, start + size);
        },

        get filteredCompetitorsReach() {
          return (this.filteredCompetitors || []).reduce((acc, c) => acc + (Number(c.monthly_reach) || 0), 0);
        },

        get filteredCompetitorsAudience() {
          return (this.filteredCompetitors || []).reduce((acc, c) => acc + (Number(c.profile_views) || 0), 0);
        },

        get filteredCompetitorsPins() {
          return (this.filteredCompetitors || []).reduce((acc, c) => acc + (Number(c.total_pins) || 0), 0);
        },

        get totalAudienceSum() {
          return (this.filteredCompetitors || []).reduce((acc, c) => acc + (Number(c.monthly_reach) || 0), 0);
        },

        get folderCompetitorTotals() {
          const list = (this.filteredCompetitors && this.filteredCompetitors.length > 0)
            ? this.filteredCompetitors
            : (this.competitors || []);
          if (list.length > 0) {
            const combinedAudience = list.reduce((sum, c) => sum + (Number(c.monthly_reach) || 0), 0);
            const combinedImpressions = list.reduce((sum, c) => sum + (Number(c.profile_views) || 0), 0);
            const combinedPins = list.reduce((sum, c) => sum + (Number(c.total_pins) || 0), 0);
            const delta24h = list.reduce((sum, c) => sum + Math.max(0, Number(c.delta_reach_24h || c.delta_24h || 0)), 0);
            const nonAggregatorList = list.filter(c => Number(c.total_pins || 0) < 1000000);
            const cadencePool = nonAggregatorList.length > 0 ? nonAggregatorList : list;
            const avgCadence = cadencePool.length > 0
              ? Number((cadencePool.reduce((sum, c) => sum + (Number(c.total_pins || 0) / 365), 0) / cadencePool.length).toFixed(1))
              : 0;
            return {
              combined_audience: combinedAudience,
              combined_impressions: combinedImpressions,
              combined_pins: combinedPins,
              total_creators: list.length,
              delta_24h: delta24h,
              avg_pinning_cadence: avgCadence
            };
          }
          if (this.folderCompetitorTotalsData) return this.folderCompetitorTotalsData;
          return {
            combined_audience: 0,
            combined_impressions: 0,
            combined_pins: 0,
            total_creators: 0,
            delta_24h: 0,
            avg_pinning_cadence: 0
          };
        },

        async toggleCreatorTracking(c) {
          if (!c) return;
          const wasTracked = c.is_tracked !== false;
          c.is_tracked = !wasTracked;
          try {
            const fid = this.scopedFolderId || this.folderFilter;
            if (fid) {
              const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/folders/' + encodeURIComponent(fid) + '/creators'), {
                method: wasTracked ? 'DELETE' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ competitor_id: c.competitor_id || c.id, username: c.username })
              });
              if (res.ok) {
                await this.loadFolderCreators(fid);
              }
            }
            if (typeof this.showToast === 'function') {
              this.showToast(c.is_tracked ? 'Tracking @' + c.username : 'Untracked @' + c.username, 'success');
            }
          } catch (_) {
            c.is_tracked = wasTracked;
          }
        },

        get availableCreatorMonths() {
          const set = new Set();
          for (const s of (this.activeCreatorSnapshots || [])) {
            const d = s.recorded_date || s.created_at;
            if (d) {
              const dt = new Date(d);
              if (!isNaN(dt.getTime())) {
                const key = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
                set.add(key);
              }
            }
          }
          return Array.from(set).sort().reverse();
        },

        get filteredCreatorSnapshots() {
          const snaps = this.activeCreatorSnapshots || [];
          if (!snaps.length) return [];
          const now = Date.now();
          let filtered = [...snaps].sort((a, b) => new Date(a.recorded_date || a.created_at) - new Date(b.recorded_date || b.created_at));
          
          if (this.creatorTimeRange === '7D') {
            filtered = filtered.filter(s => now - new Date(s.recorded_date || s.created_at).getTime() <= 7 * 86400000);
          } else if (this.creatorTimeRange === '30D') {
            filtered = filtered.filter(s => now - new Date(s.recorded_date || s.created_at).getTime() <= 30 * 86400000);
          } else if (this.creatorTimeRange === '90D') {
            filtered = filtered.filter(s => now - new Date(s.recorded_date || s.created_at).getTime() <= 90 * 86400000);
          } else if (this.creatorTimeRange === 'YTD') {
            const yr = new Date(new Date().getFullYear(), 0, 1).getTime();
            filtered = filtered.filter(s => new Date(s.recorded_date || s.created_at).getTime() >= yr);
          }

          if (this.creatorSelectedMonth !== 'all') {
            filtered = filtered.filter(s => {
              const d = new Date(s.recorded_date || s.created_at);
              const mKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
              return mKey === this.creatorSelectedMonth;
            });
          }

          return filtered.length > 0 ? filtered : snaps;
        },

        get creatorMoMStats() {
          const snaps = this.activeCreatorSnapshots || [];
          const months = this.availableCreatorMonths;
          const baseMonth = this.creatorMoMBaseMonth || (months.length > 1 ? months[0] : (months[0] || ''));
          const targetMonth = this.creatorMoMTargetMonth || (months.length > 1 ? months[months.length - 1] : (months[0] || ''));

          const getMonthAgg = (m) => {
            if (!m) return null;
            const filtered = snaps.filter(s => {
              const d = new Date(s.recorded_date || s.created_at);
              const mKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
              return mKey === m;
            });
            if (!filtered.length) return null;
            const last = filtered[filtered.length - 1];
            return {
              reach: Number(last.monthly_reach || 0),
              views: Number(last.profile_views || 0),
              followers: Number(last.follower_count || 0),
              pins: Number(last.total_pins || 0)
            };
          };

          const aggA = getMonthAgg(baseMonth);
          const aggB = getMonthAgg(targetMonth);

          const calc = (key) => {
            if (!aggA || !aggB) return { diff: 0, pct: 0 };
            const vA = aggA[key] || 0;
            const vB = aggB[key] || 0;
            const diff = vB - vA;
            const pct = vA > 0 ? Number(((diff / vA) * 100).toFixed(1)) : 0;
            return { diff, pct };
          };

          return {
            reach: calc('reach'),
            views: calc('views'),
            followers: calc('followers'),
            pins: calc('pins')
          };
        },

        get creatorSnapshotsWithDeltas() {
          const list = [...(this.activeCreatorSnapshots || [])].sort((a, b) => new Date(a.recorded_date || a.created_at || 0) - new Date(b.recorded_date || b.created_at || 0));
          return list.map((s, idx) => {
            const prev = idx > 0 ? list[idx - 1] : null;
            const delta_pins = prev ? (Number(s.total_pins || 0) - Number(prev.total_pins || 0)) : 0;
            const delta_reach = prev ? (Number(s.monthly_reach || 0) - Number(prev.monthly_reach || 0)) : 0;
            const delta_views = prev ? (Number(s.profile_views || 0) - Number(prev.profile_views || 0)) : 0;
            return {
              ...s,
              delta_pins,
              delta_reach,
              delta_views
            };
          });
        },

        get paginatedCreatorSnapshots() {
          let list = [...this.creatorSnapshotsWithDeltas];
          if (this.creatorSelectedMonth !== 'all') {
            list = list.filter(s => {
              const d = new Date(s.recorded_date || s.created_at);
              const mKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
              return mKey === this.creatorSelectedMonth;
            });
          }
          list.reverse();
          if (this.creatorSnapTimeframe === 'all') return list;
          const sz = Number(this.creatorSnapTimeframe) || 7;
          const start = (this.creatorSnapPage - 1) * sz;
          return list.slice(start, start + sz);
        },

        get creatorSnapshotsNetChange() {
          const slice = this.paginatedCreatorSnapshots;
          if (!slice || slice.length < 2) {
            return { reach: '—', views: '—', pins: '(+0)' };
          }
          const latest = slice[0];
          const earliest = slice[slice.length - 1];
          const pinsDiff = (Number(latest.total_pins || 0) - Number(earliest.total_pins || 0));
          const reachDiff = (Number(latest.monthly_reach || 0) - Number(earliest.monthly_reach || 0));
          const viewsDiff = (Number(latest.profile_views || 0) - Number(earliest.profile_views || 0));
          return {
            reach: (reachDiff > 0 ? '+' : '') + this.formatNumber(reachDiff),
            views: (viewsDiff > 0 ? '+' : '') + this.formatNumber(viewsDiff),
            pins: (pinsDiff > 0 ? '(+' + pinsDiff + ')' : (pinsDiff < 0 ? '(' + pinsDiff + ')' : '(+0)'))
          };
        },

        get isAllCreatorPinsSelected() {
          const pins = this.paginatedCreatorPins;
          if (!pins || !pins.length) return false;
          return pins.every(p => this.isPinSelected(p.pin_id));
        },

        get creatorChartData() {
          const snaps = this.filteredCreatorSnapshots;
          if (!snaps || !snaps.length) {
            return { min: 0, max: 0, latest: 0, points: [], strokePath: '', areaPath: '', dual: false, pointsA: [], pointsB: [], strokePathA: '', strokePathB: '', areaPathA: '' };
          }
          const width = 800;
          const height = 220;
          const padL = 50, padR = 30, padT = 20, padB = 40;
          const cW = width - padL - padR;
          const cH = height - padT - padB;

          if (this.creatorChartMode === 'dual') {
            const valsReach = snaps.map(s => Number(s.monthly_reach || 0));
            const valsViews = snaps.map(s => Number(s.profile_views || 0));
            const allVals = [...valsReach, ...valsViews];
            const min = Math.min(...allVals);
            const max = Math.max(...allVals);
            const range = (max - min) || 1;

            const mapSeries = (vals) => snaps.map((s, idx) => {
              const x = padL + (snaps.length === 1 ? cW / 2 : (idx / Math.max(1, snaps.length - 1)) * cW);
              const y = padT + cH - ((vals[idx] - min) / range) * cH;
              const dt = new Date(s.recorded_date || s.created_at);
              const label = !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Day ' + (idx + 1);
              return { x, y, val: vals[idx], label };
            });

            const ptsReach = mapSeries(valsReach);
            const ptsViews = mapSeries(valsViews);

            const buildSpline = (pts) => {
              if (pts.length <= 1) return pts.length === 1 ? 'M ' + pts[0].x + ' ' + pts[0].y + ' L ' + (pts[0].x + 1) + ' ' + pts[0].y : '';
              let d = 'M ' + pts[0].x + ' ' + pts[0].y;
              for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[i];
                const p1 = pts[i + 1];
                const mx = (p0.x + p1.x) / 2;
                d += ' C ' + mx + ' ' + p0.y + ', ' + mx + ' ' + p1.y + ', ' + p1.x + ' ' + p1.y;
              }
              return d;
            };

            const strokeReach = buildSpline(ptsReach);
            const strokeViews = buildSpline(ptsViews);
            const lastReach = ptsReach[ptsReach.length - 1] || { x: padL + cW, y: padT + cH };
            const firstReach = ptsReach[0] || { x: padL, y: padT + cH };
            const areaReach = strokeReach ? (strokeReach + ' L ' + lastReach.x + ' ' + (padT + cH) + ' L ' + firstReach.x + ' ' + (padT + cH) + ' Z') : '';

            const svgPointsDualHtml = ptsReach.map(p => '<circle cx="' + p.x + '" cy="' + p.y + '" r="3.5" fill="white" stroke="#f43f5e" stroke-width="2" /><text x="' + p.x + '" y="210" text-anchor="middle" class="text-[10px] fill-slate-400 font-mono">' + p.label + '</text>').join('') + ptsViews.map(p => '<circle cx="' + p.x + '" cy="' + p.y + '" r="3.5" fill="white" stroke="#0ea5e9" stroke-width="2" />').join('');

            return {
              dual: true,
              min,
              max,
              latest: valsReach[valsReach.length - 1] || 0,
              points: ptsReach,
              pointsA: ptsReach,
              pointsB: ptsViews,
              strokePath: strokeReach,
              strokePathA: strokeReach,
              strokePathB: strokeViews,
              areaPath: areaReach,
              areaPathA: areaReach,
              svgPointsDualHtml
            };
          }

          let vals = [];
          if (this.creatorChartMode === 'views') {
            vals = snaps.map(s => Number(s.profile_views || 0));
          } else if (this.creatorChartMode === 'followers') {
            vals = snaps.map(s => Number(s.follower_count || 0));
          } else if (this.creatorChartMode === 'pins') {
            vals = snaps.map(s => Number(s.total_pins || 0));
          } else {
            vals = snaps.map(s => Number(s.monthly_reach || 0));
          }

          const min = Math.min(...vals);
          const max = Math.max(...vals);
          const latest = vals[vals.length - 1] || 0;
          const range = (max - min) || 1;

          const pts = snaps.map((s, idx) => {
            const x = padL + (snaps.length === 1 ? cW / 2 : (idx / Math.max(1, snaps.length - 1)) * cW);
            const y = padT + cH - ((vals[idx] - min) / range) * cH;
            const dt = new Date(s.recorded_date || s.created_at);
            const label = !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Day ' + (idx + 1);
            return { x, y, val: vals[idx], label };
          });

          let strokePath = '';
          if (pts.length === 1) {
            strokePath = 'M ' + pts[0].x + ' ' + pts[0].y + ' L ' + (pts[0].x + 1) + ' ' + pts[0].y;
          } else if (pts.length > 1) {
            strokePath = 'M ' + pts[0].x + ' ' + pts[0].y;
            for (let i = 0; i < pts.length - 1; i++) {
              const p0 = pts[i];
              const p1 = pts[i + 1];
              const mx = (p0.x + p1.x) / 2;
              strokePath += ' C ' + mx + ' ' + p0.y + ', ' + mx + ' ' + p1.y + ', ' + p1.x + ' ' + p1.y;
            }
          }

          const lastPt = pts[pts.length - 1] || { x: padL + cW, y: padT + cH };
          const firstPt = pts[0] || { x: padL, y: padT + cH };
          const areaPath = strokePath ? (strokePath + ' L ' + lastPt.x + ' ' + (padT + cH) + ' L ' + firstPt.x + ' ' + (padT + cH) + ' Z') : '';

          const strokeColor = this.creatorChartMode === 'views' ? '#0ea5e9' : (this.creatorChartMode === 'followers' ? '#a855f7' : (this.creatorChartMode === 'pins' ? '#10b981' : '#f43f5e'));
          const svgPointsHtml = pts.map(p => '<circle cx="' + p.x + '" cy="' + p.y + '" r="4" fill="white" stroke="' + strokeColor + '" stroke-width="2" class="cursor-pointer hover:r-6 transition-all" /><text x="' + p.x + '" y="210" text-anchor="middle" class="text-[10px] fill-slate-400 font-mono">' + p.label + '</text>').join('');

          return { dual: false, min, max, latest, points: pts, strokePath, areaPath, svgPointsHtml };
        },

        get filteredCreatorBoards() {
          let list = this.activeCreatorBoards || [];
          if (this.creatorBoardSelectedTopic) {
            const topic = this.creatorBoardSelectedTopic.toLowerCase().trim();
            list = list.filter(b => {
              const vase = Array.isArray(b.board_vase) ? b.board_vase : (b.metadata?.board_vase || []);
              return vase.some(v => (v?.text || v || '').toLowerCase().includes(topic));
            });
          }
          if (this.creatorBoardSearch) {
            const q = this.creatorBoardSearch.toLowerCase().trim();
            list = list.filter(b => {
              if (b.name && b.name.toLowerCase().includes(q)) return true;
              if (b.description && b.description.toLowerCase().includes(q)) return true;
              const vase = Array.isArray(b.board_vase) ? b.board_vase : (b.metadata?.board_vase || []);
              return vase.some(v => (v?.text || v || '').toLowerCase().includes(q));
            });
          }
          if (this.creatorBoardSort === 'most_pins') {
            list = [...list].sort((a, b) => (b.pin_count || 0) - (a.pin_count || 0));
          } else if (this.creatorBoardSort === 'most_followers') {
            list = [...list].sort((a, b) => (b.follower_count || 0) - (a.follower_count || 0));
          } else if (this.creatorBoardSort === 'recent_activity') {
            list = [...list].sort((a, b) => new Date(b.last_pinned_at || 0) - new Date(a.last_pinned_at || 0));
          } else if (this.creatorBoardSort === 'creation_date') {
            list = [...list].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
          } else if (this.creatorBoardSort === 'name_asc') {
            list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          }
          return list;
        },

        get paginatedCreatorBoards() {
          const list = this.filteredCreatorBoards;
          const sz = this.creatorBoardPageSize || 12;
          const start = (this.creatorBoardPage - 1) * sz;
          return list.slice(start, start + sz);
        },

        get creatorBoardsTotalPins() {
          return (this.activeCreatorBoards || []).reduce((acc, b) => acc + (Number(b.pin_count) || 0), 0);
        },

        get creatorBoardsTotalFollowers() {
          const accountFollowers = Number(this.activeCreator?.follower_count || 0);
          const maxBoardFollowers = Math.max(0, ...(this.activeCreatorBoards || []).map(b => Number(b.follower_count) || 0));
          return accountFollowers > 0 ? accountFollowers : maxBoardFollowers;
        },

        get creatorBoardsMaxPins() {
          const max = Math.max(1, ...(this.activeCreatorBoards || []).map(b => Number(b.pin_count) || 0));
          return max > 0 ? max : 1;
        },

        get creatorBoardsTopicsList() {
          const countMap = new Map();
          for (const b of (this.activeCreatorBoards || [])) {
            const vase = Array.isArray(b.board_vase) ? b.board_vase : (b.metadata?.board_vase || []);
            for (const v of vase) {
              const text = (typeof v === 'string' ? v : v?.text || '').trim();
              if (text) {
                countMap.set(text, (countMap.get(text) || 0) + 1);
              }
            }
          }
          return Array.from(countMap.entries())
            .map(([text, count]) => ({ text, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 30);
        },

        get filteredBoardPins() {
          let list = this.boardPins || [];
          if (this.boardPinsFilter === 'qualified') {
            list = list.filter(p => p.is_qualified);
          } else if (this.boardPinsFilter === 'product') {
            list = list.filter(p => p.is_product);
          }
          if (this.boardPinsSearch) {
            const q = this.boardPinsSearch.toLowerCase().trim();
            list = list.filter(p => 
              (p.title && p.title.toLowerCase().includes(q)) || 
              (p.description && p.description.toLowerCase().includes(q)) ||
              (p.domain && p.domain.toLowerCase().includes(q)) ||
              (p.link_domain && p.link_domain.toLowerCase().includes(q))
            );
          }
          if (this.boardPinsSort === 'saves_desc') {
            list = [...list].sort((a, b) => (Number(b.saves ?? b.save_count) || 0) - (Number(a.saves ?? a.save_count) || 0));
          } else if (this.boardPinsSort === 'repins_desc') {
            list = [...list].sort((a, b) => (Number(b.repins ?? b.repin_count) || 0) - (Number(a.repins ?? a.repin_count) || 0));
          } else if (this.boardPinsSort === 'velocity') {
            list = [...list].sort((a, b) => (Number(b.velocity) || 0) - (Number(a.velocity) || 0));
          } else if (this.boardPinsSort === 'newest') {
            list = [...list].sort((a, b) => new Date(b.created_at_pinterest || 0) - new Date(a.created_at_pinterest || 0));
          }
          return list;
        },

        get paginatedBoardPins() {
          const list = this.filteredBoardPins;
          const sz = this.boardPinsPageSize || 24;
          const start = (this.boardPinsPage - 1) * sz;
          return list.slice(start, start + sz);
        },

        get boardProductPinsCount() {
          return (this.boardPins || []).filter(p => p.is_product).length;
        },

        get boardWinningPinsCount() {
          return (this.boardPins || []).filter(p => p.is_qualified).length;
        },

        get boardPinsTotalPages() {
          return Math.max(1, Math.ceil((this.filteredBoardPins.length || 0) / (this.boardPinsPageSize || 24)));
        },

        get boardTotalSaves() {
          return (this.boardPins || []).reduce((acc, p) => acc + (Number(p.saves ?? p.save_count) || 0), 0);
        },

        get filteredCreatorPins() {
          let list = this.activeCreatorPins || [];
          if (this.creatorPinMinSaves > 0) {
            list = list.filter(p => Number(p.saves || 0) >= this.creatorPinMinSaves);
          }
          if (this.creatorPinSearch) {
            const q = this.creatorPinSearch.toLowerCase().trim();
            list = list.filter(p => 
              (p.title && p.title.toLowerCase().includes(q)) || 
              (p.board_name && p.board_name.toLowerCase().includes(q)) ||
              (p.description && p.description.toLowerCase().includes(q)) ||
              (p.pin_id && p.pin_id.includes(q))
            );
          }
          if (this.creatorPinBoard) {
            const b = this.creatorPinBoard.toLowerCase().trim();
            list = list.filter(p => p.board_name && p.board_name.toLowerCase() === b);
          }
          if (this.creatorPinStage) {
            list = list.filter(p => p.stage === this.creatorPinStage);
          }
          if (this.creatorPinSavesFilter === 'gte_100') {
            list = list.filter(p => (p.saves || 0) >= 100);
          } else if (this.creatorPinSavesFilter === 'gte_500') {
            list = list.filter(p => (p.saves || 0) >= 500);
          } else if (this.creatorPinSavesFilter === 'lte_50') {
            list = list.filter(p => (p.saves || 0) <= 50);
          }
          if (this.creatorPinChangedOnly) {
            list = list.filter(p => (p.delta_saves || 0) > 0 || (p.delta_repins || 0) > 0);
          }
          if (this.activeCreatorSelectedTopic) {
            const top = this.activeCreatorSelectedTopic.toLowerCase().trim();
            list = list.filter(p => {
              if (p.board_name && p.board_name.toLowerCase().includes(top)) return true;
              if (p.title && p.title.toLowerCase().includes(top)) return true;
              if (p.annotations) {
                const anns = Array.isArray(p.annotations) ? p.annotations : [];
                return anns.some(a => {
                  const name = (typeof a === 'string' ? a : (a && a.name)) || '';
                  return name.toLowerCase().includes(top);
                });
              }
              return false;
            });
          }

          // Sorting
          if (this.creatorPinSort === 'delta_saves') {
            list = [...list].sort((a, b) => (b.delta_saves || 0) - (a.delta_saves || 0));
          } else if (this.creatorPinSort === 'delta_3d') {
            list = [...list].sort((a, b) => (b.delta_saves_3d || 0) - (a.delta_saves_3d || 0));
          } else if (this.creatorPinSort === 'delta_7d') {
            list = [...list].sort((a, b) => (b.delta_saves_7d || 0) - (a.delta_saves_7d || 0));
          } else if (this.creatorPinSort === 'repins') {
            list = [...list].sort((a, b) => (b.repins || 0) - (a.repins || 0));
          } else if (this.creatorPinSort === 'velocity') {
            list = [...list].sort((a, b) => (b.velocity || 0) - (a.velocity || 0));
          } else if (this.creatorPinSort === 'shares') {
            list = [...list].sort((a, b) => (b.share_count || 0) - (a.share_count || 0));
          } else if (this.creatorPinSort === 'newest') {
            list = [...list].sort((a, b) => new Date(b.created_at_pinterest || 0) - new Date(a.created_at_pinterest || 0));
          } else {
            list = [...list].sort((a, b) => (b.saves || 0) - (a.saves || 0));
          }

          return list;
        },

        get paginatedCreatorPins() {
          const list = this.filteredCreatorPins;
          const sz = Number(this.creatorPinLimit) || 25;
          const start = (this.creatorPinPage - 1) * sz;
          return list.slice(start, start + sz);
        },

        get filteredCreatorTopics() {
          let list = this.activeCreatorTopics || [];
          if (this.creatorTopicSearch) {
            const q = this.creatorTopicSearch.toLowerCase().trim();
            list = list.filter(t => t.name && t.name.toLowerCase().includes(q));
          }
          return list;
        },

        // Pin Detail Dossier Stubs (V5 Dedicated Page Architecture /pin/:id)
        // Tab 2: Global Intersections State
        intersectionViewMode: (typeof localStorage !== 'undefined' && localStorage.getItem('pin_hub_view_mode')) || 'grid',
        isHubDrawerOpen: false,
        selectedHub: null,
        intersectionPage: 1,
        intersectionPageSize: 24,
        intersectionSort: 'pixie',
        intersectionExpandedHubs: {},
        intersectionFilters: {
          search: '',
          minOverlap: 'all',
          seedId: 'all',
          format: 'all',
          market: 'all',
          engine: 'all'
        },

        // Lightbox Modal State
        isLightboxOpen: false,
        lightboxIndex: 0,

        // Tab 1: Seed Dossier State
        activeDossierSeed: null,
        dossierCandidates: [],
        dossierTelemetry: {},
        dossierGuidedCapsules: [],
        dossierSearchQuery: '',
        dossierTab: 'table',
        dossierSort: 'saves',
        recgptPlaybook: null,
        dossierFilters: {
          search: '',
          engine: 'all',
          velocity: 'all',
          market: 'all',
          sequence: 'all'
        },

        // Tab 3: Master Explorer State
        explorerSeedId: 'all',
        explorerCandidates: [],
        explorerSort: 'saves',
        explorerFilters: {
          search: '',
          engine: 'all',
          velocity: 'all',
          market: 'all',
          sequence: 'all'
        },

        selectedCandidate: null,

        crawlStatus: { is_crawling: false },
        crawlElapsed: 0,
        crawlTimer: null,

        newSeed: {
          pin_id: '',
          label: '',
          is_competitor: true,
          auto_crawl: true
        },

        // Seeds Selection & Controls State
        selectedSeedIds: [],
        seedViewMode: (typeof localStorage !== 'undefined' && localStorage.getItem('pin_seed_view_mode')) || 'grid',
        seedSearch: '',
        seedFilterStatus: 'all',
        seedFilterType: 'all',
        seedSort: 'crawled_desc',

        // Bulk / Add Seed Modal State
        addSeedTab: 'bulk',
        bulkPinsInput: '',
        bulkLabelPrefix: 'Tracked Seed',
        bulkIsCompetitor: true,
        bulkAutoCrawl: true,
        bulkCrawlEngine: 'workflow',
        isSubmittingBulk: false,

        // Crawl Controller Modal State
        isCrawlModalOpen: false,
        crawlModalTab: 'launch',
        crawlTargetScope: 'queued',
        crawlCustomPinId: '',
        crawlEngine: 'workflow',
        crawlMaxPages: '60',
        workflowRuns: [],
        isLoadingWorkflowRuns: false,
        isTriggeringWorkflow: false,

        // Delete Modal State
        isDeleteModalOpen: false,
        deleteTarget: null,
        deletePurgeDatabase: true,
        isDeleting: false,

        normalizeBoardSlug(str) {
          if (!str) return '';
          return String(str).toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, '-').replace(/^-|-$/g, '');
        },

        formatNumber(num, abbrev = false) {
          if (typeof window !== 'undefined' && window.PAEFormatters && typeof window.PAEFormatters.formatNumber === 'function') {
            return window.PAEFormatters.formatNumber(num, { compact: Boolean(abbrev) });
          }
          // @deprecated VM fallback when shared-head formatters are absent
          if (num === null || num === undefined) return '0';
          const val = Number(num);
          if (isNaN(val)) return '0';
          if (abbrev) {
            if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
            if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
            return String(val);
          }
          return val.toLocaleString();
        },

        switchTab(tab) {
          if (this.activePinId) {
            this.closePinPage(false);
          }
          if (this.activeBoardName) {
            this.closeBoardPage(false);
          }
          if (tab === 'overview' || tab === 'home') {
            if (this.activeCreator) this.closeCreatorProfile(false);
            this.currentTab = 'overview';
            if (typeof window !== 'undefined' && window.location.pathname !== '/') {
              window.history.pushState(null, '', '/');
            }
          } else if (tab === 'related_pins' || tab === 'seeds' || tab === 'intersections' || tab === 'explorer') {
            if (this.activeCreator) this.closeCreatorProfile(false);
            this.currentTab = 'related_pins';
            if (tab === 'seeds' || tab === 'intersections' || tab === 'explorer') {
              this.relatedSubTab = tab;
            }
            if (this.seeds.length === 0) this.fetchSeeds();
            if (this.intersections.length === 0) this.fetchIntersections();
            if (this.explorerCandidates.length === 0) this.loadExplorerData();
            if (typeof window !== 'undefined' && window.location.pathname !== '/related-pins') {
              window.history.pushState(null, '', '/related-pins');
            }
          } else if (tab === 'creators_archive' || tab === 'competitors' || tab === 'pinarchive' || tab === 'creators' || tab === 'accounts') {
            if (this.activeCreator) this.closeCreatorProfile(false);
            this.currentTab = 'creators_archive';
            if (this.competitors.length === 0) this.fetchCompetitors();
            if (typeof window !== 'undefined' && window.location.pathname !== '/accounts') {
              window.history.pushState(null, '', '/accounts');
            }
          } else if (tab === 'fleet') {
            this.switchTab('overview');
          } else {
            this.currentTab = tab;
          }
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

${getDashboardIntersectionsMethods()}

${getDashboardSeedComputedProperties()}


        get cleanRecipeTitle() {
          if (!this.selectedCandidate) return 'Recipe';
          let title = this.selectedCandidate.title || '';
          if (!title || title.startsWith('[')) {
            title = 'Gourmet Culinary Dish';
          } else {
            title = title.replace(/\\s*\\|.*$/g, '');
            title = title.replace(/\\s*-\\s*.*recipe.*$/i, '');
            title = title.replace(/^Easy\\s+/i, '');
          }
          return title.trim();
        },

        get blueprintSeoTitle() {
          return 'Easy ' + this.cleanRecipeTitle + ' Recipe (Quick & Delicious) | Zizeeba';
        },

        get blueprintMidjourney() {
          const title = this.cleanRecipeTitle;
          const color = this.selectedCandidate?.winning_color || this.selectedCandidate?.dominant_color || '#824d30';
          return 'A high-end commercial food photography shot of ' + title + ', styled for a gourmet cookbook, vibrant textures, natural daylight, shallow depth of field, warm cozy aesthetic, color palette accented by ' + color + ', shot on Hasselblad 50mm f/1.8 --ar 9:16 --v 6.1 --style raw --q 2';
        },

        get blueprintJsonLd() {
          if (!this.selectedCandidate) return '{}';
          const title = this.cleanRecipeTitle;
          const pinId = this.selectedCandidate.candidate_pin_id;
          const schema = {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Product",
                "name": title + " - Printable Recipe Card PDF",
                "image": "https://zizeeba.com/images/recipes/" + pinId + ".jpg",
                "description": "Comprehensive printable digital recipe card for " + title + " featuring step-by-step instructions, ingredients breakdown, and chef tips.",
                "brand": { "@type": "Brand", "name": "Zizeeba" },
                "offers": {
                  "@type": "Offer",
                  "url": "https://zizeeba.com/recipe/" + pinId,
                  "priceCurrency": "USD",
                  "price": "1.99",
                  "availability": "https://schema.org/InStock",
                  "priceValidUntil": "2027-12-31"
                }
              },
              {
                "@type": "Recipe",
                "name": title,
                "image": ["https://zizeeba.com/images/recipes/" + pinId + ".jpg"],
                "author": { "@type": "Organization", "name": "Zizeeba Culinary Kitchen" },
                "description": "Delicious homemade " + title + " crafted with simple ingredients and optimal kitchen workflow.",
                "prepTime": "PT15M",
                "cookTime": "PT30M",
                "totalTime": "PT45M",
                "recipeYield": "4 servings",
                "recipeCategory": "Main Course"
              }
            ]
          };
          return JSON.stringify(schema, null, 2);
        },

        get candidateTrajectory() {
          const defaultAnchor = this.recgptPlaybook?.dinner_anchor || {
            title: 'Slow Cooker Garlic Herb Butter Chicken & Red Potatoes',
            save_rate: 94.2,
            recgpt_transition_score: 98.5,
            prep_time: '15m'
          };
          const defaultCoVisitor = this.recgptPlaybook?.navboost_co_visitor || {
            title: 'Cast Iron Skillet Garlic Cheddar Honey Biscuits',
            save_rate: 88.7,
            recgpt_transition_score: 92.1,
            prep_time: '20m'
          };
          const defaultFinisher = this.recgptPlaybook?.session_finisher || {
            title: 'Warm Skillet Salted Caramel Chocolate Chip Cookie with Vanilla Ice Cream',
            save_rate: 96.8,
            recgpt_transition_score: 97.4,
            prep_time: '10m'
          };

          if (!this.selectedCandidate) {
            return { anchor: defaultAnchor, co_visitor: defaultCoVisitor, finisher: defaultFinisher };
          }

          const x = this.selectedCandidate;
          const role = x.sequence_role || 'DINNER_ANCHOR';
          const pool = (this.dossierCandidates && this.dossierCandidates.length > 0)
            ? this.dossierCandidates
            : (this.explorerCandidates || []);

          const findBest = (targetRole, fallback) => {
            const match = pool
              .filter(c => c.candidate_pin_id !== x.candidate_pin_id && c.sequence_role === targetRole)
              .sort((a, b) => Number(b.saves || b.total_saves || 0) - Number(a.saves || a.total_saves || 0))[0];
            return match || fallback;
          };

          if (role === 'DINNER_ANCHOR') {
            return {
              anchor: { ...x, is_active_candidate: true },
              co_visitor: findBest('NAVBOOST_CO_VISITOR', defaultCoVisitor),
              finisher: findBest('SESSION_FINISHER', defaultFinisher)
            };
          } else if (role === 'NAVBOOST_CO_VISITOR') {
            return {
              anchor: findBest('DINNER_ANCHOR', defaultAnchor),
              co_visitor: { ...x, is_active_candidate: true },
              finisher: findBest('SESSION_FINISHER', defaultFinisher)
            };
          } else if (role === 'SESSION_FINISHER') {
            return {
              anchor: findBest('DINNER_ANCHOR', defaultAnchor),
              co_visitor: findBest('NAVBOOST_CO_VISITOR', defaultCoVisitor),
              finisher: { ...x, is_active_candidate: true }
            };
          } else {
            return {
              anchor: { ...x, is_active_candidate: true },
              co_visitor: findBest('NAVBOOST_CO_VISITOR', defaultCoVisitor),
              finisher: findBest('SESSION_FINISHER', defaultFinisher)
            };
          }
        },

        async openSeedDossier(seed) {
          this.activeDossierSeed = seed;
          this.dossierCandidates = [];
          this.dossierTelemetry = {};
          this.dossierGuidedCapsules = [];
          this.dossierSearchQuery = '';
          this.dossierTab = 'table';
          this.recgptPlaybook = null;
          this.isLightboxOpen = false;

          try {
            const [candRes, telRes, pbRes, capRes] = await Promise.all([
              window.apiFetch(this.getApiUrl('/api/candidates?seed_pin_id=' + seed.pin_id + '&sort=' + this.dossierSort + '&limit=1000')),
              window.apiFetch(this.getApiUrl('/api/cluster-telemetry?seed_pin_id=' + seed.pin_id)),
              window.apiFetch(this.getApiUrl('/api/recgpt-playbook?seed_pin_id=' + seed.pin_id)),
              window.apiFetch(this.getApiUrl('/api/guided-search?seed_pin_id=' + seed.pin_id))
            ]);
            if (candRes.ok) this.dossierCandidates = await candRes.json();
            if (telRes.ok) this.dossierTelemetry = await telRes.json();
            if (pbRes.ok) this.recgptPlaybook = await pbRes.json();
            if (capRes.ok) this.dossierGuidedCapsules = await capRes.json();
          } catch (e) {
            console.error(e);
          }

          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        async reloadDossierCandidates() {
          if (!this.activeDossierSeed) return;
          try {
            const [candRes, capRes] = await Promise.all([
              window.apiFetch(this.getApiUrl('/api/candidates?seed_pin_id=' + this.activeDossierSeed.pin_id + '&sort=' + this.dossierSort + '&limit=1000')),
              window.apiFetch(this.getApiUrl('/api/guided-search?seed_pin_id=' + this.activeDossierSeed.pin_id))
            ]);
            if (candRes.ok) this.dossierCandidates = await candRes.json();
            if (capRes.ok) this.dossierGuidedCapsules = await capRes.json();
          } catch (e) {}
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        closeSeedDossier() {
          this.activeDossierSeed = null;
          this.dossierCandidates = [];
          this.dossierTelemetry = {};
          this.dossierGuidedCapsules = [];
          this.recgptPlaybook = null;
          this.isLightboxOpen = false;
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        async inspectCandidate(item) {
          this.selectedCandidate = item;
          this.isDossierOpen = true;
          if (!this.recgptPlaybook || (item?.seed_pin_id && this.recgptPlaybook.seed_pin_id !== item.seed_pin_id)) {
            try {
              const res = await window.apiFetch(this.getApiUrl('/api/recgpt-playbook' + (item?.seed_pin_id ? '?seed_pin_id=' + item.seed_pin_id : '')));
              if (res.ok) this.recgptPlaybook = await res.json();
            } catch (e) {}
          }
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        copyPromptForPairing(type) {
          const title = this.cleanRecipeTitle;
          const prompt = 'Gourmet commercial cookbook photography of ' + type + ' paired with ' + title + ', warm rustic kitchen lighting, shallow depth of field, fresh garnish, vibrant textures, shot on Hasselblad 50mm f/1.8 --ar 9:16 --v 6.1 --style raw';
          navigator.clipboard.writeText(prompt);
          this.showToast('Generated & Copied ' + type + ' Prompt!');
        },

        copyGuidedPrompt(query) {
          const prompt = 'Gourmet editorial food photography of ' + query + ', styled for a high-end culinary magazine, warm appetizing lighting, shallow depth of field, vibrant fresh textures, shot on Hasselblad 50mm f/1.8 --ar 9:16 --v 6.1 --style raw';
          navigator.clipboard.writeText(prompt);
          this.showToast('Copied Prompt for "' + query + '"!');
        },

        copyToClipboard(text, field) {
          navigator.clipboard.writeText(text);
          this.copiedField = field;
          this.showToast('Copied to Clipboard!');
          setTimeout(() => { this.copiedField = null; }, 2000);
        },

        showToast(msg, type = 'success') {
          this.toastMessage = msg;
          this.toastType = type || 'success';
          if (this._toastTimer) clearTimeout(this._toastTimer);
          this._toastTimer = setTimeout(() => { this.toastMessage = null; }, type === 'error' ? 4000 : 2500);
          this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
        },

        async init() {
          return this.initDashboard();
        },

        async initDashboard() {
          if (this._hasInitialized) return;
          this._hasInitialized = true;
          try {
            const savedTheme = typeof localStorage !== 'undefined' ? (localStorage.getItem('pa_theme') || localStorage.getItem('pin_theme')) : null;
            if (savedTheme) {
              this.isDark = savedTheme === 'dark';
              this.darkMode = this.isDark;
            } else {
              this.isDark = false;
              this.darkMode = false;
            }
            if (typeof document !== 'undefined' && document.documentElement) {
              if (this.isDark) {
                document.documentElement.classList.add('dark');
              } else {
                document.documentElement.classList.remove('dark');
              }
            }
          } catch (_) {}
          try {
            const savedSidebar = typeof localStorage !== 'undefined' ? localStorage.getItem('pae_sidebar_collapsed') : null;
            if (savedSidebar !== null) {
              this.isSidebarCollapsed = savedSidebar === 'true';
            }
          } catch (_) {}
          if (typeof window !== 'undefined') {
            window.addEventListener('keydown', (e) => {
              if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
                e.preventDefault();
                this.toggleSidebar();
              }
            });
          }
          try {
            const savedCols = typeof localStorage !== 'undefined' ? localStorage.getItem('creator_master_visible_columns') : null;
            if (savedCols) {
              const parsed = JSON.parse(savedCols);
              this.visibleMasterColumns = { ...this.visibleMasterColumns, ...parsed, title: true };
            }
          } catch (_) {}
          this.$watch('creatorSubTab', (val) => {
            if (val === 'archive' && (!this.pinarchivePins || this.pinarchivePins.length === 0)) {
              this.fetchPinArchivePins();
            }
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          });
          this.$watch('activeCreatorTab', (val) => {
            if (val === 'pins' || val === 'topics') {
              this.activeCreatorTab = 'all_pins';
              if (val === 'pins') this.creatorAllPinQualifiedOnly = true;
              this.fetchCreatorAllPins();
            }
          });
          this.$watch('competitorFilter', () => { this.competitorPage = 1; });
          this.$watch('creatorDiscoveryFilter', () => { this.competitorPage = 1; });
          this.$watch('competitorSearch', () => { this.competitorPage = 1; });
          this.$watch('competitorPageSize', () => { this.competitorPage = 1; });
          this.$watch('competitorSort', () => {
            this.competitorPage = 1;
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          });
          this.loadFolders();
          // Immediate Deep Link URL Hydration (e.g. /freshmancook, /freshmancook/links, /freshmancook/related-pins)
          if (typeof window !== 'undefined') {
            const RESERVED_SYSTEM_SLUGS = new Set([
              'api', 'fleet', 'settings', 'admin', 'health', 'favicon.ico', 
              'robots.txt', 'index.html', 'assets', 'static', 'pin', 'related_pins', 'related-pins', 'relatedpins', 'intersections', 'archive', 'explorer',
              'accounts', 'creators', 'creator', 'pinarchive', 'keywords', 'keyword', 'board-idea', 'board-ideas', 'overview', 'home', 'dashboard', 'domains',
              'folders', 'folder', 'campaign-folders', 'discovery', 'board', 'boards', 'feed', 'search'
            ]);
            const CREATOR_SUB_TABS = {
              'links': 'top_urls',
              'link': 'top_urls',
              'top-urls': 'top_urls',
              'related-pins': 'related_pins',
              'related': 'related_pins',
              'all-pins': 'all_pins',
              'winning-pins': 'all_pins',
              'pins': 'all_pins',
              'topics': 'all_pins',
              'boards': 'boards',
              'overview': 'overview'
            };

            const segments = (window.location.pathname || '').split('/').filter(Boolean);
            const first = segments[0] || '';
            const second = segments[1] || '';
            const third = segments[2] || '';
            const cleanFirst = first.toLowerCase();

            if (cleanFirst === 'pin' && second) {
              this.openPinPage(second, false);
            } else if (cleanFirst === 'fleet') {
              this.currentTab = 'overview';
              if (typeof window !== 'undefined' && window.location.pathname !== '/') {
                window.history.replaceState(null, '', '/');
              }
            } else if (cleanFirst === 'accounts' || cleanFirst === 'creators' || cleanFirst === 'pinarchive') {
              this.currentTab = 'creators_archive';
              if (second && CREATOR_SUB_TABS[second.toLowerCase()]) {
                this.creatorSubTab = CREATOR_SUB_TABS[second.toLowerCase()];
              }
              const searchStr = (typeof window !== 'undefined' && window.location.search) ? window.location.search : '';
              if (searchStr) {
                const params = new URLSearchParams(window.location.search || '');
                const targetCreator = (params.get('creator') || params.get('competitor') || '').replace(/^@+/, '').trim();
                const searchFilter = (params.get('search') || params.get('q') || '').trim();
                const action = (params.get('action') || '').trim().toLowerCase();
                if (action === 'track' || action === 'new') {
                  this.openAddCompetitorModal();
                  if (targetCreator) {
                    this.newCompetitorHandle = targetCreator;
                  }
                } else if (targetCreator) {
                  this.openCreatorByHandle(targetCreator, 'overview', false);
                } else if (searchFilter) {
                  this.competitorSearch = searchFilter;
                }
              }
            } else if (cleanFirst === 'related-pins' || cleanFirst === 'related_pins' || cleanFirst === 'seeds' || cleanFirst === 'intersections') {
              this.currentTab = 'related_pins';
              if (cleanFirst === 'seeds' || cleanFirst === 'intersections') {
                this.relatedSubTab = cleanFirst;
              }
            } else if (cleanFirst === '' || cleanFirst === 'overview' || cleanFirst === 'home' || cleanFirst === 'dashboard') {
              this.currentTab = 'overview';
            } else if (first && !RESERVED_SYSTEM_SLUGS.has(cleanFirst)) {
              this.currentTab = 'creators_archive';
              if ((second === 'pin' || second === 'pins') && third) {
                const cleanU = first.replace(/^@+/, '').trim().toLowerCase();
                window.location.href = '/pin/' + encodeURIComponent(third) + '?creator=' + encodeURIComponent(cleanU);
                return;
              } else if (second && CREATOR_SUB_TABS[second.toLowerCase()]) {
                const targetTab = CREATOR_SUB_TABS[second.toLowerCase()];
                if (second.toLowerCase() === 'winning-pins' || second.toLowerCase() === 'pins') {
                  this.creatorAllPinQualifiedOnly = true;
                }
                this.openCreatorByHandle(first, targetTab);
              } else if (second) {
                this.openCreatorByHandle(first, 'overview', false).then(() => {
                  // [INVARIANT-LOCK: DO NOT REMOVE - ENFORCED BY verify_regression_locks.mjs] Lock 5: Ghost Board Shield for Untracked Creators
                  if (!this.activeCreator) return;
                  const targetSlug = this.normalizeBoardSlug(decodeURIComponent(second));
                  const matchBoard = (this.activeCreatorBoards || []).find(b => 
                    this.normalizeBoardSlug(b.name) === targetSlug ||
                    (b.board_slug && b.board_slug === targetSlug) ||
                    (b.name || '').toLowerCase() === decodeURIComponent(second).replace(/-/g, ' ').toLowerCase()
                  ) || { name: decodeURIComponent(second).replace(/-/g, ' ') };
                  this.openBoardPage(matchBoard, this.activeCreator, false);
                });
              } else {
                this.openCreatorByHandle(first, 'overview');
              }
            }

            window.addEventListener('popstate', async (e) => {
              const pSegments = (window.location.pathname || '').split('/').filter(Boolean);
              const pFirst = pSegments[0] || '';
              const pSecond = pSegments[1] || '';
              const pThird = pSegments[2] || '';
              const cleanPFirst = pFirst.toLowerCase();

              if (cleanPFirst === 'pin' && pSecond) {
                this.openPinPage(pSecond, false);
              } else if (cleanPFirst === 'fleet') {
                if (this.activePinId) this.closePinPage(false);
                if (this.activeBoardName) this.closeBoardPage(false);
                if (this.activeCreator) this.closeCreatorProfile(false);
                this.currentTab = 'overview';
                if (typeof window !== 'undefined' && window.location.pathname !== '/') {
                  window.history.replaceState(null, '', '/');
                }
              } else if (cleanPFirst === 'accounts' || cleanPFirst === 'creators' || cleanPFirst === 'pinarchive') {
                if (this.activePinId) this.closePinPage(false);
                if (this.activeBoardName) this.closeBoardPage(false);
                if (this.activeCreator) this.closeCreatorProfile(false);
                this.currentTab = 'creators_archive';
              } else if (cleanPFirst === 'related-pins' || cleanPFirst === 'related_pins') {
                if (this.activePinId) this.closePinPage(false);
                if (this.activeBoardName) this.closeBoardPage(false);
                if (this.activeCreator) this.closeCreatorProfile(false);
                this.currentTab = 'related_pins';
              } else if (cleanPFirst === '' || cleanPFirst === 'overview' || cleanPFirst === 'home') {
                if (this.activePinId) this.closePinPage(false);
                if (this.activeBoardName) this.closeBoardPage(false);
                if (this.activeCreator) this.closeCreatorProfile(false);
                this.currentTab = 'overview';
              } else if (pFirst && !RESERVED_SYSTEM_SLUGS.has(cleanPFirst)) {
                if ((pSecond === 'pin' || pSecond === 'pins') && pThird) {
                  const cleanU = pFirst.replace(/^@+/, '').trim().toLowerCase();
                  window.location.href = '/pin/' + encodeURIComponent(pThird) + '?creator=' + encodeURIComponent(cleanU);
                  return;
                } else if (pSecond && CREATOR_SUB_TABS[pSecond.toLowerCase()]) {
                  if (this.activePinId) this.closePinPage(false);
                  if (this.activeBoardName) this.closeBoardPage(false);
                  const targetTab = CREATOR_SUB_TABS[pSecond.toLowerCase()];
                  if (pSecond.toLowerCase() === 'winning-pins' || pSecond.toLowerCase() === 'pins') {
                    this.creatorAllPinQualifiedOnly = true;
                  }
                  await this.openCreatorByHandle(pFirst, targetTab, false);
                } else if (pSecond) {
                  if (this.activePinId) this.closePinPage(false);
                  const targetSlug = this.normalizeBoardSlug(decodeURIComponent(pSecond));
                  if (!this.activeCreator || (this.activeCreator.username || '').toLowerCase() !== pFirst.toLowerCase()) {
                    await this.openCreatorByHandle(pFirst, 'overview', false);
                  }
                  if (!this.activeCreator) return;
                  const matchBoard = (this.activeCreatorBoards || []).find(b => 
                    this.normalizeBoardSlug(b.name) === targetSlug ||
                    (b.board_slug && b.board_slug === targetSlug) ||
                    (b.name || '').toLowerCase() === decodeURIComponent(pSecond).replace(/-/g, ' ').toLowerCase()
                  ) || { name: decodeURIComponent(pSecond).replace(/-/g, ' ') };
                  await this.openBoardPage(matchBoard, this.activeCreator, false);
                } else {
                  if (this.activePinId) this.closePinPage(false);
                  if (this.activeBoardName) this.closeBoardPage(false);
                  await this.openCreatorByHandle(pFirst, 'overview', false);
                }
              } else {
                if (this.activePinId) this.closePinPage(false);
                if (this.activeBoardName) this.closeBoardPage(false);
                this.closeCreatorProfile(false);
              }
            });
          }

          // Background fleet & telemetry refresh (does not block instant SPA hydration)
          this.refreshAll().catch((err) => console.error('refreshAll background error:', err));
          // [INVARIANT: SINGLE-OPERATOR-SCALE-TO-ZERO] Single-shot initial check; avoid 3s polling loop while idle
          this.pollCrawlStatus();

          if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
              if (document.hidden) {
                this.stopCrawlPolling();
              } else if (this.crawlStatus && this.crawlStatus.is_crawling) {
                this.startCrawlPolling();
              }
            });
          }

          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        async refreshAll() {
          this.isLoading = true;
          try {
            if (this.scopedFolderId) {
              await Promise.all([
                this.fetchCookieStatus(),
                this.loadFolderCreators(this.scopedFolderId)
              ]);
            } else {
              await Promise.all([
                this.fetchOverview(),
                this.fetchSeeds(),
                this.fetchIntersections(),
                this.fetchCookieStatus(),
                (this.scopedFolderId || this.folderFilter) ? this.loadFolderCreators(this.scopedFolderId || this.folderFilter) : this.fetchCompetitors(),
                this.fetchKeywords()
              ]);
            }
            if (this.currentTab === 'explorer') {
              await this.loadExplorerData();
            }
          } finally {
            this.isLoading = false;
            this.isOverviewLoaded = true;
            this.$nextTick(() => {
              if (window.lucide) window.lucide.createIcons();
            });
          }
        },

        getApiUrl(base) {
          return base;
        },

${getDashboardCreatorsFleetMethods()}

        async fetchKeywords() {
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords?limit=1000'));
            if (res.ok) {
              const data = await res.json();
              this.keywords = data.keywords || [];
            } else {
              this.keywords = [];
            }
          } catch (e) {
            this.keywords = [];
          }
        },

        async syncKeyword(keywordId) {
          try {
            this.showToast('Crawling Pinterest search SERP...');
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/sync'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keyword_id: keywordId })
            });
            if (res.ok) {
              await this.fetchKeywords();
              this.showToast('Keyword SERP updated with daily velocity!');
            }
          } catch (e) {
            this.showToast('Failed to crawl keyword: ' + e.message);
          }
        },

        async openKeywordPins(kw) {
          this.activeKeyword = kw;
          this.isKeywordPinsOpen = true;
          this.isLoadingKeywordPins = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords/pins?keyword_id=' + kw.id));
            if (res.ok) {
              const data = await res.json();
              this.activeKeywordPins = data.pins || [];
            }
          } catch (e) {
            this.activeKeywordPins = [];
          } finally {
            this.isLoadingKeywordPins = false;
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          }
        },

        async deleteKeyword(id) {
          if (!confirm('Are you sure you want to stop tracking this keyword?')) return;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords?id=' + id), { method: 'DELETE' });
            if (res.ok) {
              await this.fetchKeywords();
              this.showToast('Keyword removed.');
            }
          } catch (e) {}
        },

${getDashboardArchiveRulesMethods()}


        async fetchOverview() {
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/overview'));
            if (res.ok) {
              this.overview = await res.json();
            } else {
              this.overview = { total_seeds: 0, total_candidates: 0, commercial_gaps: 0, top_clusters: [] };
            }
          } catch (e) {
            this.overview = { total_seeds: 0, total_candidates: 0, commercial_gaps: 0, top_clusters: [] };
          } finally {
            this.isOverviewLoaded = true;
          }
        },

        async fetchSeeds() {
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/seeds'));
            if (res.ok) {
              this.seeds = await res.json();
            } else {
              this.seeds = [];
            }
          } catch (e) {
            this.seeds = [];
          }
        },

        async fetchIntersections() {
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/intersections?min_overlap=2&limit=1000'));
            if (res.ok) {
              this.intersections = await res.json();
            } else {
              this.intersections = [];
            }
          } catch (e) {
            this.intersections = [];
          }
        },

        async loadExplorerData() {
          let url = '/api/candidates?limit=1000&sort=' + this.explorerSort;
          if (this.explorerSeedId && this.explorerSeedId !== 'all') {
            url += '&seed_pin_id=' + this.explorerSeedId;
          }
          try {
            const res = await window.apiFetch(this.getApiUrl(url));
            if (res.ok) this.explorerCandidates = await res.json();
          } catch (e) {}
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },

        async triggerCrawl(seedPinId = null) {
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/crawl'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ seed_pin_id: seedPinId })
            });
            if (res.ok) {
              this.crawlStatus.is_crawling = true;
              this.crawlElapsed = 0;
              this.startElapsedTimer();
              this.startCrawlPolling();
              this.showToast('Background crawl started!');
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Failed to trigger crawl: ' + (err?.error || res.statusText || 'Failed'), 'error');
            }
          } catch (e) {
            this.showToast('Failed to trigger crawl: ' + e.message, 'error');
          }
        },

        startElapsedTimer() {
          if (this.crawlTimer) clearInterval(this.crawlTimer);
          this.crawlTimer = setInterval(() => {
            if (this.crawlStatus && this.crawlStatus.is_crawling) {
              this.crawlElapsed++;
            } else {
              clearInterval(this.crawlTimer);
              this.crawlTimer = null;
            }
          }, 1000);
        },

        startCrawlPolling() {
          // [INVARIANT: SINGLE-OPERATOR-SCALE-TO-ZERO] Only poll while crawl is actively executing
          this.stopCrawlPolling();
          this._crawlStatusInterval = setInterval(() => {
            if (typeof document === 'undefined' || !document.hidden) {
              if (this.crawlStatus && this.crawlStatus.is_crawling) {
                this.pollCrawlStatus();
              } else {
                this.stopCrawlPolling();
              }
            }
          }, 3000);
        },

        stopCrawlPolling() {
          if (this._crawlStatusInterval) {
            clearInterval(this._crawlStatusInterval);
            this._crawlStatusInterval = null;
          }
        },

        async pollCrawlStatus() {
          if (this._isPollingCrawl) return;
          this._isPollingCrawl = true;
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/crawl-status'));
            if (res.ok) {
              const prevCrawling = this.crawlStatus.is_crawling;
              this.crawlStatus = await res.json();
              if (this.crawlStatus && this.crawlStatus.is_crawling) {
                if (!this._crawlStatusInterval) this.startCrawlPolling();
                if (!this.crawlTimer) this.startElapsedTimer();
              } else if (prevCrawling && !this.crawlStatus.is_crawling) {
                this.stopCrawlPolling();
                await this.refreshAll();
                if (this.activeDossierSeed) {
                  await this.openSeedDossier(this.activeDossierSeed);
                }
                if (this.activeCreator) {
                  await this.openCreatorPage(this.activeCreator, this.activeCreatorTab);
                }
                this.showToast('Crawl completed! Data refreshed.');
              }
            }
          } catch (e) {
          } finally {
            this._isPollingCrawl = false;
          }
        },

        async fetchCookieStatus() {
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/settings/cookie'));
            if (res.ok) {
              const data = await res.json();
              this.cookieStatus = data;
              if (data.cookie && !this.cookieInput) {
                this.cookieInput = data.cookie;
              }
            }
          } catch (e) {}
        },

        async saveCookie() {
          if (!this.cookieInput || !this.cookieInput.trim()) {
            this.showToast('Please paste a valid Pinterest session cookie first.');
            return;
          }
          this.isSavingCookie = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/settings/cookie'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cookie: this.cookieInput.trim() })
            });
            if (res.ok) {
              const data = await res.json();
              this.cookieStatus = {
                has_cookie: data.has_cookie,
                preview: data.preview || (this.cookieInput.slice(0, 30) + '...'),
                cookie: data.cookie || this.cookieInput.trim()
              };
              this.isCookieModalOpen = false;
              this.showToast('Pinterest session cookie saved and activated across all crawlers!');
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Failed to save cookie: ' + (err.error || err.message || 'HTTP ' + res.status));
            }
          } catch (err) {
            this.showToast('Error saving cookie: ' + err.message);
          } finally {
            this.isSavingCookie = false;
          }
        },

        async openAutoPromoteSettingsModal() {
          this.isAutoPromoteModalOpen = true;
          this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/settings'));
            if (res.ok) {
              const data = await res.json();
              if (data?.settings) {
                this.autoPromoteForm = {
                  auto_promote_enabled: data.settings.auto_promote_enabled !== false,
                  auto_promote_delta_24h: Number(data.settings.auto_promote_delta_24h ?? 25000),
                  auto_promote_delta_7d: Number(data.settings.auto_promote_delta_7d ?? 100000),
                  auto_harvest_pins: data.settings.auto_harvest_pins !== false,
                  max_pins_harvest: Number(data.settings.max_pins_harvest ?? 100),
                  qualification_rules: {
                    min_saves: Number(data.settings.qualification_rules?.min_saves ?? 500),
                    min_velocity: Number(data.settings.qualification_rules?.min_velocity ?? 10.0)
                  }
                };
              }
            }
          } catch (_) {}
          this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
        },

        resetAutoPromoteFormDefaults() {
          this.autoPromoteForm = {
            auto_promote_enabled: true,
            auto_promote_delta_24h: 25000,
            auto_promote_delta_7d: 100000,
            auto_harvest_pins: true,
            max_pins_harvest: 100,
            qualification_rules: {
              min_saves: 500,
              min_velocity: 10.0
            }
          };
          this.showToast('Defaults restored. Click "Save Rules" to apply.');
        },

        async saveAutoPromoteSettings() {
          this.isSavingAutoPromote = true;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/settings'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.autoPromoteForm)
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              this.showToast('✅ Auto-promote breakout rules saved successfully!');
              this.isAutoPromoteModalOpen = false;
            } else {
              this.showToast('❌ Failed to save auto-promote rules: ' + (data?.error || res.statusText));
            }
          } catch (err) {
            this.showToast('❌ Network error: ' + err.message);
          } finally {
            this.isSavingAutoPromote = false;
          }
        },

        openRawJsonModal(pinId = null) {
          this.rawJsonTargetPin = pinId || (this.activeDossierSeed ? this.activeDossierSeed.pin_id : '');
          this.rawJsonInput = '';
          this.rawJsonStatusMsg = '';
          this.rawJsonIsError = false;
          this.isRawJsonModalOpen = true;
        },

        async submitRawJson() {
          if (!this.rawJsonTargetPin.trim()) {
            this.rawJsonStatusMsg = 'يرجى تحديد Target Seed Pin ID أولاً.';
            this.rawJsonIsError = true;
            return;
          }
          if (!this.rawJsonInput.trim()) {
            this.rawJsonStatusMsg = 'يرجى لصق الـ JSON الخام أولاً.';
            this.rawJsonIsError = true;
            return;
          }

          this.isSubmittingRawJson = true;
          this.rawJsonStatusMsg = 'جاري تحليل وهضم البيانات وتخزينها في قاعدة البيانات...';
          this.rawJsonIsError = false;

          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/seeds/import-raw-json'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                seed_pin_id: this.rawJsonTargetPin.trim(),
                raw_json: this.rawJsonInput.trim()
              })
            });

            const data = await res.json();
            if (res.ok && data.candidates_imported !== undefined) {
              this.rawJsonStatusMsg = '✅ تم بنجاح! تم استيراد ' + data.candidates_imported + ' كانديديت و ' + data.capsules_imported + ' كبسولة بحثية BUBBLE_ONE_COL وتثبيت كوتا الحصص في PostgreSQL.';
              this.rawJsonIsError = false;
              await this.refreshAll();
              if (this.activeDossierSeed && this.activeDossierSeed.pin_id === this.rawJsonTargetPin.trim()) {
                await this.openSeedDossier(this.activeDossierSeed);
              }
              setTimeout(() => {
                this.isRawJsonModalOpen = false;
              }, 2000);
            } else {
              this.rawJsonStatusMsg = '❌ خطأ: ' + (data.error || data.message || 'فشل استيراد البيانات');
              this.rawJsonIsError = true;
            }
          } catch (err) {
            this.rawJsonStatusMsg = '❌ خطأ في الاتصال: ' + err.message;
            this.rawJsonIsError = true;
          } finally {
            this.isSubmittingRawJson = false;
          }
        },

${getDashboardCreatorsDossierMethods()}

${getDashboardBoardsAndPinMethods()}

        async submitAddKeyword() {
          const kw = this.newKeywordText.trim();
          if (!kw) return;
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/keywords'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keyword: kw, category: this.newKeywordCategory })
            });
            if (res.ok) {
              const created = await res.json().catch(() => ({}));
              this.newKeywordText = '';
              this.isAddKeywordModalOpen = false;
              await this.fetchKeywords();
              this.showToast('Keyword "' + kw + '" tracked successfully!');
              if (created?.keyword?.id) {
                this.syncKeyword(created.keyword.id);
              }
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Failed to track keyword: ' + (err?.error || res.statusText || 'Error'));
            }
          } catch (e) {
            this.showToast('Failed to track keyword: ' + e.message);
          }
        },

${getDashboardSeedActionMethods()}


        safeUrl(url) {
          if (typeof window !== 'undefined' && window.PAEFormatters && typeof window.PAEFormatters.safeUrl === 'function') {
            return window.PAEFormatters.safeUrl(url);
          }
          // @deprecated VM fallback when shared-head formatters are absent
          if (!url) return '#';
          const s = String(url).trim();
          if (/^https?:\\/\\//i.test(s) || (s.startsWith('/') && !s.startsWith('//'))) return s;
          return '#';
        },

        safeColor(color, fallback = '#cbd5e1') {
          if (typeof window !== 'undefined' && window.PAEFormatters && typeof window.PAEFormatters.safeColor === 'function') {
            return window.PAEFormatters.safeColor(color, fallback);
          }
          // @deprecated VM fallback when shared-head formatters are absent
          if (!color) return fallback;
          const s = String(color).trim();
          if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return s;
          if (/^[a-zA-Z]{3,20}$/.test(s)) return s;
          return fallback;
        },

        sanitizeCsvCell(val) {
          let str = String(val == null ? '' : val);
          const code = str.charCodeAt(0);
          if (code === 61 || code === 43 || code === 45 || code === 64 || code === 9 || code === 10 || code === 13) {
            str = "'" + str;
          }
          return '"' + str.replace(/"/g, '""') + '"';
        },

        exportCsv(list, filename) {
          const fname = filename || 'arbitrage-candidates.csv';
          if (!list || list.length === 0) {
            this.showToast('No data to export.', 'error');
            return;
          }
          const headers = [
            'candidate_pin_id',
            'title',
            'saves',
            'save_rate',
            'daily_velocity',
            'provenance_engine',
            'sequence_role',
            'dominant_color',
            'aspect_ratio',
            'domain',
            'is_product',
            'pin_created_at',
            'seed_overlap_count'
          ];
          const csvRows = [headers.map(h => this.sanitizeCsvCell(h)).join(',')];

          for (const row of list) {
            const values = headers.map(header => {
              let val = row[header];
              if (header === 'saves' && val === undefined) val = row.total_saves;
              if (header === 'save_rate' && val === undefined) val = row.avg_save_rate;
              if (header === 'dominant_color' && !val) val = row.winning_color;
              if (header === 'provenance_engine' && !val) val = row.engine_source;
              return this.sanitizeCsvCell(val);
            });
            csvRows.push(values.join(','));
          }

          const blob = new Blob([csvRows.join(String.fromCharCode(10))], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', fname.endsWith('.csv') ? fname : (fname + '.csv'));
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          this.showToast('Exported ' + list.length + ' rows to ' + fname);
        }
      };
    }
    if (typeof document !== 'undefined') {
      const initLucide = () => {
        if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLucide);
      } else {
        initLucide();
      }
    }
  </script>`;
}
